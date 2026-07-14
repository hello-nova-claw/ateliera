import { createInMemoryVault } from '@studio/storage';
import type {
  IndexEntry,
  IndexedLink,
  IndexPort,
  SearchFacets,
  SearchHit,
} from '@studio/index';
import { describe, expect, it, vi } from 'vitest';

import { createAppStudioService } from './studio-service-factory';

function index(): IndexPort & {
  close: ReturnType<typeof vi.fn>;
  entries: Map<string, IndexEntry>;
} {
  const entries = new Map<string, IndexEntry>();
  return {
    entries,
    upsert: vi.fn(async (note, path, hash, content) => { entries.set(note.id, { note, path, hash, content }); }),
    remove: vi.fn(async (id) => { entries.delete(id); }),
    getById: vi.fn(async (id) => entries.get(id) ?? null),
    getManyById: vi.fn(async (ids: string[]) => ids.flatMap((id) => entries.get(id) ?? [])),
    search: vi.fn(async (): Promise<SearchHit[]> => []),
    facets: vi.fn(async (): Promise<SearchFacets> => ({
      rooms: [], semanticTypes: [], lifeAreas: [], seasons: [], statuses: [], tags: [], cardTypes: [],
    })),
    backlinks: vi.fn(async () => []),
    forwardLinks: vi.fn(async (): Promise<IndexedLink[]> => []),
    rebuild: vi.fn(async (next) => {
      entries.clear();
      for (const entry of next) entries.set(entry.note.id, entry);
    }),
    clear: vi.fn(async () => entries.clear()),
    close: vi.fn(async () => undefined),
  } as IndexPort & { entries: Map<string, IndexEntry>; close: ReturnType<typeof vi.fn> };
}

describe('createAppStudioService', () => {
  it('rebuilds the disposable worker index from canonical Markdown on start', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Reflection Garden/existing.md', `---
schema_version: 1
id: existing-note
card_type: text
semantic_type: reflection
status: active
rooms: [reflection-garden]
life_areas: []
seasons: []
tags: []
created: 2026-07-13T00:00:00.000Z
updated: 2026-07-14T00:00:00.000Z
attachments: []
display: { featured: false }
privacy: { sensitivity: private, ai_access: ask }
---
Already here.
`, { expectedMissing: true });
    const workerIndex = index();
    const service = createAppStudioService(vault, () => workerIndex);

    await service.start();

    expect(workerIndex.rebuild).toHaveBeenCalledOnce();
    expect([...workerIndex.entries]).toEqual([
      ['existing-note', expect.objectContaining({ path: 'Reflection Garden/existing.md' })],
    ]);
    await service.dispose();
  });

  it('shares one disposable index between lifecycle and search and closes it once', async () => {
    const workerIndex = index();
    const service = createAppStudioService(createInMemoryVault(), () => workerIndex);

    await service.capture({ body: 'A calm thought' });
    await service.search('calm');
    expect(workerIndex.upsert).toHaveBeenCalledTimes(1);
    expect(workerIndex.search).toHaveBeenCalledWith('calm', undefined);

    await Promise.all([service.dispose(), service.dispose()]);
    expect(workerIndex.close).toHaveBeenCalledTimes(1);
  });
});
