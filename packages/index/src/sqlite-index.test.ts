import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IndexPort, SqliteIndex } from './index';
import { createNodeSqliteIndex } from './node-sqlite';
import { note } from './test-helpers';

describe('SQLite IndexPort', () => {
  let directory: string;
  let index: IndexPort & { close(): void };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'studio-index-'));
    index = createNodeSqliteIndex(join(directory, 'index.sqlite')) as SqliteIndex;
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
});
