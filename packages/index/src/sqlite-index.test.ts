import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IndexPort } from './index';
import { createNodeSqliteIndex } from './node-sqlite';
import type { SqliteIndex } from './sqlite-index';
import { note } from './test-helpers';

async function upsert(index: IndexPort, indexedNote: ReturnType<typeof note>, path: string, hash: string, links: Parameters<IndexPort['upsert']>[3]['links'] = []) {
  await index.upsert(indexedNote, path, hash, { links, searchText: indexedNote.body });
}

describe('SQLite IndexPort', () => {
  let directory: string;
  let databasePath: string;
  let index: IndexPort & { close(): void };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'studio-index-'));
    databasePath = join(directory, 'index.sqlite');
    index = createNodeSqliteIndex(databasePath) as SqliteIndex;
  });

  afterEach(async () => {
    index.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('refuses to instantiate synchronous SQLite on a UI thread', () => {
    index.close();
    Reflect.defineProperty(globalThis, 'document', { configurable: true, value: {} });
    try {
      expect(() => createNodeSqliteIndex(join(directory, 'ui.sqlite'))).toThrow('never on the UI thread');
    } finally {
      Reflect.deleteProperty(globalThis, 'document');
    }
    index = createNodeSqliteIndex(databasePath) as SqliteIndex;
  });

  it('searches FTS content with deterministic filters and plain-text highlight ranges', async () => {
    await upsert(index, note(), 'Foyer/calm.md', 'hash-calm');
    await upsert(index, note({ id: '01H00000000000000000000001', title: '<script>calm work</script>', body: 'Calm work without urgency.', semanticType: 'reflection', rooms: ['reflection-garden'], lifeAreas: ['work'], tags: ['practice'] }), 'Reflection/work.md', 'hash-work');
    const hits = await index.search('calm', { semanticTypes: ['reflection'], lifeAreas: ['work'], statuses: ['active'], tags: ['practice'], dateFrom: '2026-01-01T00:00:00.000Z' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: '01H00000000000000000000001', path: 'Reflection/work.md', title: '<script>calm work</script>' });
    expect(hits[0]!.snippet).not.toContain('<script>');
    expect(hits[0]!.highlightRanges.length).toBeGreaterThan(0);
  });

  it('resolves forward links and backlinks by title, path, and stable ID', async () => {
    const target = note({ id: '01H00000000000000000000009', title: 'Future Anna' });
    const source = note({ id: '01H00000000000000000000008', title: 'Evidence', body: 'See the future.' });
    await upsert(index, target, 'Identity/Future Anna.md', 'target');
    await upsert(index, source, 'Reflection/Evidence.md', 'source', [
      { kind: 'wiki', target: 'Future Anna', label: 'future' },
      { kind: 'path', target: '../Identity/Future Anna.md', label: 'identity' },
      { kind: 'id', target: target.id, label: 'stable' },
    ]);
    expect(await index.backlinks(target.id)).toEqual([source.id]);
    expect(await index.forwardLinks(source.id)).toHaveLength(3);
    expect((await index.forwardLinks(source.id)).every((link) => link.targetId === target.id)).toBe(true);
  });

  it('replaces paths without changing stable identity and removes all derived rows', async () => {
    const original = note();
    await upsert(index, original, 'Foyer/old.md', 'one');
    await upsert(index, { ...original, title: 'Renamed' }, 'Foyer/new.md', 'two');
    expect(await index.getById(original.id)).toMatchObject({ path: 'Foyer/new.md' });
    await index.remove(original.id);
    expect(await index.getById(original.id)).toBeNull();
    expect(await index.search('Renamed')).toEqual([]);
  });

  it('keeps the previous index visible when a rebuild transaction fails', async () => {
    const existing = note();
    await upsert(index, existing, 'Foyer/existing.md', 'existing');
    await expect(index.rebuild([
      { note: note({ id: 'one' }), path: 'duplicate.md', hash: 'one', content: { links: [], searchText: 'one' } },
      { note: note({ id: 'two' }), path: 'duplicate.md', hash: 'two', content: { links: [], searchText: 'two' } },
    ])).rejects.toThrow();
    expect(await index.getById(existing.id)).toMatchObject({ path: 'Foyer/existing.md' });
  });

  it('rejects duplicate stable IDs supplied directly to the index rebuild', async () => {
    const existing = note({ id: 'existing' });
    await upsert(index, existing, 'existing.md', 'existing');
    await expect(index.rebuild([
      { note: note({ id: 'duplicate' }), path: 'A.md', hash: 'a', content: { links: [], searchText: 'a' } },
      { note: note({ id: 'duplicate' }), path: 'B.md', hash: 'b', content: { links: [], searchText: 'b' } },
    ])).rejects.toThrow('duplicate');
    expect(await index.getById(existing.id)).not.toBeNull();
  });

  it('returns identical results after clear and deterministic rebuild', async () => {
    const entry = { note: note({ rooms: ['foyer'], seasons: ['winter'], updated: '2026-07-10T00:00:00.000Z' }), path: 'Foyer/calm.md', hash: 'calm', content: { links: [], searchText: 'A calm and spacious home.' } };
    await index.rebuild([entry]);
    const before = await index.search('calm', { rooms: ['foyer'], seasons: ['winter'], dateTo: '2026-07-11T00:00:00.000Z' });
    await index.clear();
    expect(await index.search('calm')).toEqual([]);
    await index.rebuild([entry]);
    expect(await index.search('calm', { rooms: ['foyer'], seasons: ['winter'], dateTo: '2026-07-11T00:00:00.000Z' })).toEqual(before);
  });

  it('re-resolves an existing broken link when its target is indexed later', async () => {
    const source = note({ id: 'source', title: 'Source' });
    await upsert(index, source, 'Reflection/source.md', 'source', [{ kind: 'wiki', target: 'Later', label: 'Later' }]);
    expect((await index.forwardLinks(source.id))[0]?.targetId).toBeUndefined();
    const target = note({ id: 'target', title: 'Later' });
    await upsert(index, target, 'Identity/later.md', 'target');
    expect(await index.backlinks(target.id)).toEqual([source.id]);
  });

  it('keeps paths that traverse above the vault root unresolved', async () => {
    const target = note({ id: 'target', title: 'Calm' });
    const source = note({ id: 'source', title: 'Source' });
    await upsert(index, target, 'Foyer/calm.md', 'target');
    await upsert(index, source, 'Reflection/source.md', 'source', [
      { kind: 'path', target: '../../Foyer/calm.md', label: 'unsafe' },
      { kind: 'path', target: '/Foyer/calm.md', label: 'absolute' },
    ]);
    expect((await index.forwardLinks(source.id)).every((link) => link.targetId === undefined)).toBe(true);
  });

  it('keeps duplicate wiki titles unresolved and exposes every deterministic candidate', async () => {
    await upsert(index, note({ id: 'candidate-b', title: 'Shared' }), 'B/shared.md', 'b');
    await upsert(index, note({ id: 'candidate-a', title: 'Shared' }), 'A/shared.md', 'a');
    await upsert(index, note({ id: 'source', title: 'Source' }), 'source.md', 'source', [
      { kind: 'wiki', target: 'Shared', label: 'Shared' },
    ]);
    expect(await index.forwardLinks('source')).toEqual([{
      sourceId: 'source', kind: 'wiki', target: 'Shared', label: 'Shared', candidateIds: ['candidate-a', 'candidate-b'],
    }]);
    expect(await index.backlinks('candidate-a')).toEqual([]);
    expect(await index.backlinks('candidate-b')).toEqual([]);
  });

  it('cleans orphan dictionaries after note deletion', async () => {
    const disposable = note({ id: 'disposable', tags: ['orphan-tag'], lifeAreas: ['orphan-area'], rooms: ['orphan-room'], seasons: ['orphan-season'] });
    await upsert(index, disposable, 'disposable.md', 'hash');
    await index.remove(disposable.id);
    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    try {
      for (const table of ['tags', 'life_areas', 'rooms', 'seasons']) {
        expect(inspection.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toMatchObject({ count: 0 });
      }
    } finally { inspection.close(); }
  });

  it('omits misleading highlights when diacritic-folded FTS has no exact source offset', async () => {
    await upsert(index, note({ title: 'A café ritual', body: 'Peaceful tea.' }), 'cafe.md', 'cafe');
    const [hit] = await index.search('cafe');
    expect(hit?.title).toBe('A café ritual');
    expect(hit?.highlightRanges).toEqual([]);
  });

  it('returns no notes for punctuation or emoji-only queries', async () => {
    await upsert(index, note(), 'calm.md', 'calm');
    expect(await index.search('✨?!')).toEqual([]);
  });

  it('normalizes canonical Unicode when resolving titles and relative paths', async () => {
    const composed = 'Café';
    const decomposed = composed.normalize('NFD');
    await upsert(index, note({ id: 'target', title: composed }), `Identity/${composed}.md`, 'target');
    await upsert(index, note({ id: 'source' }), 'Reflection/source.md', 'source', [
      { kind: 'wiki', target: decomposed, label: decomposed },
      { kind: 'path', target: `../Identity/${decomposed}.md`, label: decomposed },
    ]);
    expect((await index.forwardLinks('source')).map((link) => link.targetId)).toEqual(['target', 'target']);
  });

  it('reports every NFC-equivalent ambiguous title candidate', async () => {
    await upsert(index, note({ id: 'composed', title: 'Café' }), 'composed.md', 'composed');
    await upsert(index, note({ id: 'decomposed', title: 'Café'.normalize('NFD') }), 'decomposed.md', 'decomposed');
    await upsert(index, note({ id: 'source' }), 'source.md', 'source', [
      { kind: 'wiki', target: 'Café', label: 'Café' },
    ]);
    expect((await index.forwardLinks('source'))[0]?.candidateIds).toEqual(['composed', 'decomposed']);
  });

  it('supports card-type filters', async () => {
    await upsert(index, note({ id: 'quote', cardType: 'quote' }), 'quote.md', 'quote');
    await upsert(index, note({ id: 'text', cardType: 'text' }), 'text.md', 'text');
    expect((await index.search('calm', { cardTypes: ['quote'] })).map((hit) => hit.id)).toEqual(['quote']);
  });

  it('returns explicit match context for tag-only hits', async () => {
    await upsert(index, note({ title: 'Morning', body: 'Tea.', tags: ['spaciousness'] }), 'tag.md', 'tag');
    const [hit] = await index.search('spaciousness');
    expect(hit?.highlightRanges).toEqual([]);
    expect(hit?.matchContext).toEqual({ field: 'tags', text: 'spaciousness' });
  });

  it('returns explicit match context for source-only hits', async () => {
    await upsert(index, note({ title: 'Reading note', body: 'A useful idea.', source: { creator: 'Octavia Butler' } }), 'source-context.md', 'source-context');
    const [hit] = await index.search('Octavia');
    expect(hit?.highlightRanges).toEqual([]);
    expect(hit?.matchContext).toEqual({ field: 'source', text: 'Octavia Butler' });
  });

  it('indexes only the supplied CommonMark-derived search text', async () => {
    const markdownNote = note({ title: 'Visible note', body: '[calm label](https://hidden.example/invisible-secret)' });
    await index.upsert(markdownNote, 'markdown.md', 'markdown', { links: [], searchText: 'calm label' });
    expect(await index.search('invisible-secret')).toEqual([]);
    expect(await index.search('calm')).toHaveLength(1);
  });
});
