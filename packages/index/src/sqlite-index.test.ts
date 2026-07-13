import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IndexPort, SqliteIndex } from './index';
import { createNodeSqliteIndex } from './node-sqlite';
import { note } from './test-helpers';

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

  it('searches FTS content with deterministic filters and plain-text highlight ranges', async () => {
    await index.upsert(note(), 'Foyer/calm.md', 'hash-calm');
    await index.upsert(note({ id: '01H00000000000000000000001', title: '<script>calm work</script>', body: 'Calm work without urgency.', semanticType: 'reflection', rooms: ['reflection-garden'], lifeAreas: ['work'], tags: ['practice'] }), 'Reflection/work.md', 'hash-work');
    const hits = await index.search('calm', { semanticTypes: ['reflection'], lifeAreas: ['work'], statuses: ['active'], tags: ['practice'], dateFrom: '2026-01-01T00:00:00.000Z' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: '01H00000000000000000000001', path: 'Reflection/work.md', title: '<script>calm work</script>' });
    expect(hits[0]!.snippet).not.toContain('<script>');
    expect(hits[0]!.highlightRanges.length).toBeGreaterThan(0);
  });

  it('resolves forward links and backlinks by title, path, and stable ID', async () => {
    const target = note({ id: '01H00000000000000000000009', title: 'Future Anna' });
    const source = note({ id: '01H00000000000000000000008', title: 'Evidence', body: 'See the future.' });
    await index.upsert(target, 'Identity/Future Anna.md', 'target');
    await index.upsert(source, 'Reflection/Evidence.md', 'source', [
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
    await index.upsert(original, 'Foyer/old.md', 'one');
    await index.upsert({ ...original, title: 'Renamed' }, 'Foyer/new.md', 'two');
    expect(await index.getById(original.id)).toMatchObject({ path: 'Foyer/new.md' });
    await index.remove(original.id);
    expect(await index.getById(original.id)).toBeNull();
    expect(await index.search('Renamed')).toEqual([]);
  });

  it('keeps the previous index visible when a rebuild transaction fails', async () => {
    const existing = note();
    await index.upsert(existing, 'Foyer/existing.md', 'existing');
    await expect(index.rebuild([
      { note: note({ id: 'one' }), path: 'duplicate.md', hash: 'one' },
      { note: note({ id: 'two' }), path: 'duplicate.md', hash: 'two' },
    ])).rejects.toThrow();
    expect(await index.getById(existing.id)).toMatchObject({ path: 'Foyer/existing.md' });
  });

  it('returns identical results after clear and deterministic rebuild', async () => {
    const entry = { note: note({ rooms: ['foyer'], seasons: ['winter'], updated: '2026-07-10T00:00:00.000Z' }), path: 'Foyer/calm.md', hash: 'calm' };
    await index.rebuild([entry]);
    const before = await index.search('calm', { rooms: ['foyer'], seasons: ['winter'], dateTo: '2026-07-11T00:00:00.000Z' });
    await index.clear();
    expect(await index.search('calm')).toEqual([]);
    await index.rebuild([entry]);
    expect(await index.search('calm', { rooms: ['foyer'], seasons: ['winter'], dateTo: '2026-07-11T00:00:00.000Z' })).toEqual(before);
  });

  it('re-resolves an existing broken link when its target is indexed later', async () => {
    const source = note({ id: 'source', title: 'Source' });
    await index.upsert(source, 'Reflection/source.md', 'source', [{ kind: 'wiki', target: 'Later', label: 'Later' }]);
    expect((await index.forwardLinks(source.id))[0]?.targetId).toBeUndefined();
    const target = note({ id: 'target', title: 'Later' });
    await index.upsert(target, 'Identity/later.md', 'target');
    expect(await index.backlinks(target.id)).toEqual([source.id]);
  });

  it('keeps paths that traverse above the vault root unresolved', async () => {
    const target = note({ id: 'target', title: 'Calm' });
    const source = note({ id: 'source', title: 'Source' });
    await index.upsert(target, 'Foyer/calm.md', 'target');
    await index.upsert(source, 'Reflection/source.md', 'source', [
      { kind: 'path', target: '../../Foyer/calm.md', label: 'unsafe' },
    ]);
    expect((await index.forwardLinks(source.id))[0]).not.toHaveProperty('targetId');
  });

  it('keeps duplicate wiki titles unresolved and exposes every deterministic candidate', async () => {
    await index.upsert(note({ id: 'candidate-b', title: 'Shared' }), 'B/shared.md', 'b');
    await index.upsert(note({ id: 'candidate-a', title: 'Shared' }), 'A/shared.md', 'a');
    await index.upsert(note({ id: 'source', title: 'Source' }), 'source.md', 'source', [
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
    await index.upsert(disposable, 'disposable.md', 'hash');
    await index.remove(disposable.id);
    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    try {
      for (const table of ['tags', 'life_areas', 'rooms', 'seasons']) {
        expect(inspection.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toMatchObject({ count: 0 });
      }
    } finally { inspection.close(); }
  });

  it('omits misleading highlights when diacritic-folded FTS has no exact source offset', async () => {
    await index.upsert(note({ title: 'A café ritual', body: 'Peaceful tea.' }), 'cafe.md', 'cafe');
    const [hit] = await index.search('cafe');
    expect(hit?.title).toBe('A café ritual');
    expect(hit?.highlightRanges).toEqual([]);
  });
});
