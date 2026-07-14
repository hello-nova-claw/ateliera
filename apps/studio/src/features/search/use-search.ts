import type { StudioSearchService } from '@studio/application';
import type { SearchFacets, SearchFilters } from '@studio/index';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SearchPageModel } from './SearchPage';
import { parseSearchLocation, serializeSearchLocation } from './search-url';

const emptyFacets: SearchFacets = {
  rooms: [], semanticTypes: [], lifeAreas: [], seasons: [], statuses: [],
  tags: [], cardTypes: [],
};

export interface SearchView {
  model: SearchPageModel;
  refresh(): void;
  setFilters(filters: SearchFilters): void;
  setQuery(query: string): void;
}

function initialState() {
  return parseSearchLocation(location.search);
}

export function useSearch(
  service: StudioSearchService | undefined,
  online: boolean,
  revision: number,
): SearchView {
  const [locationState, setLocationState] = useState(initialState);
  const [localRevision, setLocalRevision] = useState(0);
  const [facets, setFacets] = useState<SearchFacets>(emptyFacets);
  const [results, setResults] = useState<SearchPageModel['results']>([]);
  const [repairCount, setRepairCount] = useState(0);
  const [state, setState] = useState<SearchPageModel['state']>(
    service ? 'loading' : 'ready',
  );
  const [error, setError] = useState<string>();
  const request = useRef(0);

  const replaceLocation = useCallback((query: string, filters: SearchFilters) => {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${serializeSearchLocation(query, filters)}`,
    );
  }, []);

  const setQuery = useCallback((query: string) => {
    const bounded = query.slice(0, 512);
    setLocationState((current) => {
      replaceLocation(bounded, current.filters);
      return { ...current, query: bounded };
    });
  }, [replaceLocation]);

  const setFilters = useCallback((filters: SearchFilters) => {
    setLocationState((current) => {
      replaceLocation(current.query, filters);
      return { ...current, filters };
    });
  }, [replaceLocation]);

  useEffect(() => {
    const onPopState = () => setLocationState(parseSearchLocation(location.search));
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const currentRequest = request.current + 1;
    request.current = currentRequest;
    if (!service) {
      setFacets(emptyFacets);
      setResults([]);
      setRepairCount(0);
      setState('ready');
      setError(undefined);
      return undefined;
    }
    let current = true;
    setState('loading');
    setError(undefined);
    void Promise.all([
      service.search(locationState.query, locationState.filters),
      service.searchFacets(locationState.query, locationState.filters),
      service.repairQueue(),
    ]).then(([nextResults, nextFacets, repairs]) => {
      if (!current || request.current !== currentRequest) return;
      setResults(nextResults);
      setFacets(nextFacets);
      setRepairCount(repairs.length);
      setState(online ? 'ready' : 'offline');
    }, (reason: unknown) => {
      if (!current || request.current !== currentRequest) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'Search needs a moment. Your notes remain untouched.',
      );
      setState('error');
    });
    return () => { current = false; };
  }, [localRevision, locationState, online, revision, service]);

  return {
    model: {
      facets,
      filters: locationState.filters,
      query: locationState.query,
      repairCount,
      results,
      state,
      ...(error === undefined ? {} : { error }),
    },
    refresh: () => setLocalRevision((value) => value + 1),
    setFilters,
    setQuery,
  };
}
