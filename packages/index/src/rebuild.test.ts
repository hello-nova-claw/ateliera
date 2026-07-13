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
    async upsert() {}, async remove() {}, async getById() { return null; }, async search() { return []; },
    async backlinks() { return []; }, async forwardLinks() { return []; },
    async rebuild(entries) { rows = entries.map((entry) => entry.path); }, async clear() { rows = []; },
    snapshot: () => rows,
  };
}

describe('rebuildIndex', () => {
  it('sorts input deterministically, isolates corrupt notes, and reports monotonic progress', async () => {
    const index = createRecordingIndex();
    const progress: number[] = [];
    const result = await rebuildIndex({
      index,
      vault: createVault({ 'z.md': { text: 'valid-z', hash: 'z' }, 'bad.md': { text: 'bad', hash: 'bad' }, 'a.md': { text: 'valid-a', hash: 'a' }, 'asset.jpg': { text: 'ignore', hash: 'asset' } }),
      parse(text) { return text === 'bad' ? { ok: false, rawBody: text, recoverable: true, errors: [{ code: 'invalid-frontmatter', message: 'broken' }] } : { ok: true, note: note({ id: text.endsWith('a') ? 'a' : 'z' }), warnings: [] }; },
      extractLinks: () => [] as ParsedLink[],
      onProgress(event) { progress.push(event.processed); },
    });
    expect(index.snapshot()).toEqual(['a.md', 'z.md']);
    expect(result).toEqual({ indexed: 2, repairs: [{ path: 'bad.md', errors: [{ code: 'invalid-frontmatter', message: 'broken' }], rawBody: 'bad' }] });
    expect(progress).toEqual([0, 1, 2, 3, 3]);
  });

  it('does not publish a partial rebuild when reading unexpectedly fails', async () => {
    const index = createRecordingIndex();
    const vault = createVault({ 'a.md': { text: 'valid', hash: 'a' } });
    vault.readText = async () => { throw new Error('offline'); };
    await expect(rebuildIndex({ index, vault, parse: () => ({ ok: true, note: note(), warnings: [] }) })).rejects.toThrow('offline');
    expect(index.snapshot()).toEqual(['old']);
  });

  it('produces equivalent state after deletion and rebuild', async () => {
    const index = createRecordingIndex();
    const vault = createVault({ 'a.md': { text: 'valid', hash: 'a' } });
    const options = { index, vault, parse: () => ({ ok: true as const, note: note(), warnings: [] }) };
    await rebuildIndex(options);
    const before = index.snapshot();
    await index.clear();
    await rebuildIndex(options);
    expect(index.snapshot()).toEqual(before);
  });
});
