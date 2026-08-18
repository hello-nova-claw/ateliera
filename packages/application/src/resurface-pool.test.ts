import { describe, expect, it, vi } from 'vitest';
import type { IndexPort, SearchHit } from '@studio/index';

import { buildResurfacePool } from './resurface-pool';
import { RecordingIndex, note } from './test-helpers';

// RecordingIndex.search() is a stub that always resolves to []; it doesn't
// implement filtering. This mock stands in for the real sqlite index's
// `SearchFilters.rooms` behavior (it filters strictly on note.rooms) so
// buildResurfacePool's room-filtering can be exercised against RecordingIndex,
// matching the pattern search-service.test.ts uses for the same reason.
// (Spy through the IndexPort-typed alias: RecordingIndex.search() itself is
// declared with no parameters, since it's always a no-op stub.)
function withRoomFilteringSearch(index: RecordingIndex) {
  const port: IndexPort = index;
  return vi.spyOn(port, 'search').mockImplementation(async (_query, filters) => {
    const rooms = filters?.rooms ?? [];
    return [...index.entries.values()]
      .filter((entry) => entry.note.rooms.some((room) => rooms.includes(room)))
      .map((entry): SearchHit => ({
        id: entry.note.id,
        path: entry.path,
        title: entry.note.title ?? '',
        snippet: '',
        highlightRanges: [],
        score: 0,
        semanticType: entry.note.semanticType,
        cardType: entry.note.cardType,
        status: entry.note.status,
        updated: entry.note.updated,
        matchReason: { field: 'title', strategy: 'keyword', text: '' },
      }));
  });
}

describe('buildResurfacePool', () => {
  it('includes only cards with a resurface_kind set, from reflection-garden and uncharted', async () => {
    const index = new RecordingIndex();
    withRoomFilteringSearch(index);
    await index.upsert(
      note({
        id: 'evidence-1', rooms: ['reflection-garden'],
        resurfaceKind: 'evidence', resurfaceDue: '2026-08-20', resurfaceIntervalDays: 3,
      }),
      'Reflection Garden/evidence-1.md', 'hash1',
    );
    await index.upsert(
      note({ id: 'no-kind', rooms: ['reflection-garden'] }),
      'Reflection Garden/no-kind.md', 'hash2',
    );
    await index.upsert(
      note({
        id: 'dream-1', rooms: ['uncharted'],
        resurfaceKind: 'dream', resurfaceDue: '2026-08-21', resurfaceIntervalDays: 5,
      }),
      'Uncharted/dream-1.md', 'hash3',
    );
    await index.upsert(
      note({
        id: 'wrong-room', rooms: ['foyer'],
        resurfaceKind: 'wish', resurfaceDue: '2026-08-22', resurfaceIntervalDays: 6,
      }),
      'Foyer/wrong-room.md', 'hash4',
    );

    const pool = await buildResurfacePool(index);

    expect(pool).toHaveLength(2);
    expect(pool.find((c) => c.kind === 'dream')).toBeDefined();
    expect(pool.find((c) => c.kind === 'evidence')).toBeDefined();
  });

  it('maps sourcePath, dueDate, and intervalDays from the note frontmatter', async () => {
    const index = new RecordingIndex();
    withRoomFilteringSearch(index);
    await index.upsert(
      note({
        id: 'wish-1', rooms: ['reflection-garden'],
        resurfaceKind: 'wish', resurfaceDue: '2026-09-01', resurfaceIntervalDays: 6,
      }),
      'Reflection Garden/Reflections/wish-1.md', 'hash5',
    );

    const pool = await buildResurfacePool(index);

    expect(pool).toEqual([{
      sourcePath: 'Reflection Garden/Reflections/wish-1.md',
      kind: 'wish',
      dueDate: '2026-09-01',
      intervalDays: 6,
    }]);
  });

  it('excludes a resurface_kind card missing resurface_due or resurface_interval_days', async () => {
    const index = new RecordingIndex();
    withRoomFilteringSearch(index);
    await index.upsert(
      note({ id: 'no-due', rooms: ['reflection-garden'], resurfaceKind: 'reframe', resurfaceIntervalDays: 4 }),
      'Reflection Garden/no-due.md', 'hash6',
    );
    await index.upsert(
      note({ id: 'no-interval', rooms: ['uncharted'], resurfaceKind: 'dream', resurfaceDue: '2026-08-25' }),
      'Uncharted/no-interval.md', 'hash7',
    );

    const pool = await buildResurfacePool(index);

    expect(pool).toHaveLength(0);
  });

  it('queries the index for reflection-garden and uncharted rooms with an empty query', async () => {
    const index = new RecordingIndex();
    const port: IndexPort = index;
    const search = vi.spyOn(port, 'search').mockResolvedValue([]);

    const pool = await buildResurfacePool(index);

    expect(search).toHaveBeenCalledWith('', { rooms: ['reflection-garden', 'uncharted'] });
    expect(pool).toEqual([]);
  });
});
