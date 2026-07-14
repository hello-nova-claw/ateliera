import { describe, expect, it } from 'vitest';

import { rebuildIndex } from './rebuild';
import type { IndexPort, ParsedLink } from './index-port';
import { note } from './test-helpers';

function createVault(files: Record<string, { text: string; hash: string }>) {
  return {
    async list() {
      return Object.entries(files).map(([path, value]) => ({ path, kind: 'file' as const, contentHash: value.hash })).reverse();
    },
    async readText(path: string) {
      const file = files[path];
      if (!file) throw new Error('missing');
      return file;
    },
  };
}

function createRecordingIndex(): IndexPort & { snapshot: () => string[] } {
  let rows: string[] = ['old'];
  return {
    async upsert() {}, async remove() {}, async getById() { return null; }, async getManyById() { return []; }, async search() { return []; },
    async facets() { return { rooms: [], semanticTypes: [], lifeAreas: [], seasons: [], statuses: [], tags: [], cardTypes: [] }; },
    async backlinks() { return []; }, async forwardLinks() { return []; },
    async rebuild(entries, onProgress) {
      onProgress?.({ phase: 'indexing', processed: 0, total: entries.length });
      rows = entries.map((entry) => entry.path);
      entries.forEach((_, index) => onProgress?.({ phase: 'indexing', processed: index + 1, total: entries.length }));
      onProgress?.({ phase: 'committing', processed: entries.length, total: entries.length });
    }, async clear() { rows = []; },
    snapshot: () => rows,
  };
}

describe('rebuildIndex', () => {
  it('sorts input deterministically, isolates corrupt notes, and reports monotonic progress', async () => {
    const index = createRecordingIndex();
    const progress: string[] = [];
    const result = await rebuildIndex({
      index,
      vault: createVault({ 'z.md': { text: 'valid-z', hash: 'z' }, 'bad.md': { text: 'bad', hash: 'bad' }, 'a.md': { text: 'valid-a', hash: 'a' }, 'asset.jpg': { text: 'ignore', hash: 'asset' } }),
      parse(text) { return text === 'bad' ? { ok: false, rawBody: text, recoverable: true, errors: [{ code: 'invalid-frontmatter', message: 'broken' }] } : { ok: true, note: note({ id: text.endsWith('a') ? 'a' : 'z' }), warnings: [] }; },
      extractLinks: () => [] as ParsedLink[],
      toSearchText: (body) => body,
      onProgress(event) { progress.push(`${event.phase}:${event.processed}/${event.total}`); },
    });
    expect(index.snapshot()).toEqual(['a.md', 'z.md']);
    expect(result).toEqual({ indexed: 2, repairs: [{ path: 'bad.md', errors: [{ code: 'invalid-frontmatter', message: 'broken' }], rawBody: 'bad' }] });
    expect(progress).toEqual([
      'scanning:0/3', 'scanning:1/3', 'scanning:2/3', 'scanning:3/3',
      'indexing:0/2', 'indexing:1/2', 'indexing:2/2', 'committing:2/2', 'complete:3/3',
    ]);
  });

  it('does not publish a partial rebuild when reading unexpectedly fails', async () => {
    const index = createRecordingIndex();
    const vault = createVault({ 'a.md': { text: 'valid', hash: 'a' } });
    vault.readText = async () => { throw new Error('offline'); };
    await expect(rebuildIndex({ index, vault, parse: () => ({ ok: true, note: note(), warnings: [] }), toSearchText: (body) => body })).rejects.toThrow('offline');
    expect(index.snapshot()).toEqual(['old']);
  });

  it('produces equivalent state after deletion and rebuild', async () => {
    const index = createRecordingIndex();
    const vault = createVault({ 'a.md': { text: 'valid', hash: 'a' } });
    const options = { index, vault, parse: () => ({ ok: true as const, note: note(), warnings: [] }), toSearchText: (body: string) => body };
    await rebuildIndex(options);
    const before = index.snapshot();
    await index.clear();
    await rebuildIndex(options);
    expect(index.snapshot()).toEqual(before);
  });

  it('indexes the first canonical path and reports later duplicate stable IDs for repair', async () => {
    const index = createRecordingIndex();
    const result = await rebuildIndex({
      index,
      vault: createVault({
        'B/second.md': { text: 'second', hash: 'second' },
        'A/first.md': { text: 'first', hash: 'first' },
      }),
      parse: (text) => ({ ok: true, note: note({ id: 'same', title: text }), warnings: [] }),
      toSearchText: (body) => body,
    });

    expect(index.snapshot()).toEqual(['A/first.md']);
    expect(result.repairs).toEqual([{
      path: 'B/second.md',
      errors: [{ code: 'invalid-frontmatter', path: 'id', message: 'Duplicate stable note ID "same"; the canonical note is A/first.md.' }],
      rawBody: 'second',
    }]);
  });
});
