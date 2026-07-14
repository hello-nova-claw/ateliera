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

function index(): IndexPort & { close: ReturnType<typeof vi.fn> } {
  const entries = new Map<string, IndexEntry>();
  return {
    entries,
    upsert: vi.fn(async (note, path, hash, content) => { entries.set(note.id, { note, path, hash, content }); }),
    remove: vi.fn(async (id) => { entries.delete(id); }),
    getById: vi.fn(async (id) => entries.get(id) ?? null),
    getManyById: vi.fn(async (ids) => ids.flatMap((id) => entries.get(id) ?? [])),
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
