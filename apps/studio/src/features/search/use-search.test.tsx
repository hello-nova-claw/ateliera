import type { StudioSearchService } from '@studio/application';
import type { SearchHit } from '@studio/index';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearch } from './use-search';

const facets = {
  rooms: [], semanticTypes: [], lifeAreas: [], seasons: [], statuses: [],
  tags: [], cardTypes: [],
};

function service(): StudioSearchService {
  const calmHit: SearchHit = {
    id: 'calm', path: 'calm.md', title: 'Calm', snippet: 'Calm',
    highlightRanges: [{ start: 0, end: 4 }], score: 1,
    semanticType: 'reflection', cardType: 'text', status: 'active',
    updated: '2026-07-14T00:00:00.000Z',
    matchReason: { field: 'title', strategy: 'keyword', text: 'calm' },
  };
  return {
    search: vi.fn(async (query) => query === 'calm' ? [calmHit] : []),
    searchFacets: vi.fn(async () => facets),
    inspect: vi.fn(async () => null),
    repairQueue: vi.fn(async () => []),
    repairMetadata: vi.fn(),
    repairLink: vi.fn(),
  };
}

describe('useSearch', () => {
  beforeEach(() => history.replaceState(null, '', '/search?q=calm&type=reflection'));

  it('loads URL-backed results, facets, and repair count', async () => {
    const searchService = service();
    const { result } = renderHook(() => useSearch(searchService, true, 0));

    await waitFor(() => expect(result.current.model.state).toBe('ready'));
    expect(result.current.model.query).toBe('calm');
    expect(result.current.model.filters).toEqual({ semanticTypes: ['reflection'] });
    expect(result.current.model.results.map((hit) => hit.id)).toEqual(['calm']);
    expect(searchService.search).toHaveBeenCalledWith('calm', { semanticTypes: ['reflection'] });
  });

  it('replaces rather than pushes URL state and ignores stale responses', async () => {
    let resolveFirst: ((value: []) => void) | undefined;
    const searchService = service();
    vi.mocked(searchService.search)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([]);
    const replace = vi.spyOn(history, 'replaceState');
    const { result } = renderHook(() => useSearch(searchService, true, 0));

    act(() => result.current.setQuery('newest'));
    await waitFor(() => expect(searchService.search).toHaveBeenLastCalledWith('newest', { semanticTypes: ['reflection'] }));
    act(() => resolveFirst?.([]));
    await waitFor(() => expect(result.current.model.query).toBe('newest'));
    expect(location.search).toContain('q=newest');
    expect(replace).toHaveBeenCalled();
  });

  it('stays writable and clearly local while offline', async () => {
    const searchService = service();
    const { result } = renderHook(() => useSearch(searchService, false, 0));
    await waitFor(() => expect(result.current.model.state).toBe('offline'));
    act(() => result.current.setFilters({ semanticTypes: ['celebration'] }));
    await waitFor(() => expect(result.current.model.filters).toEqual({ semanticTypes: ['celebration'] }));
  });

  it('returns a calm empty model when no searchable Studio is open', () => {
    const { result } = renderHook(() => useSearch(undefined, true, 0));
    expect(result.current.model).toMatchObject({
      facets,
      repairCount: 0,
      results: [],
      state: 'ready',
    });
  });
});
