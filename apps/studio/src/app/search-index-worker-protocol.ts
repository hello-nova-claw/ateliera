import type { IndexRebuildProgress } from '@studio/index';

export const SEARCH_INDEX_MAX_QUERY_LENGTH = 512;
export const SEARCH_INDEX_MAX_REQUEST_BYTES = 16 * 1024 * 1024;
export const SEARCH_INDEX_MAX_IN_FLIGHT = 64;

export const searchIndexMethods = [
  'upsert', 'remove', 'getById', 'getManyById', 'search', 'facets',
  'backlinks', 'forwardLinks', 'rebuild', 'clear', 'close',
] as const;

export type SearchIndexMethod = (typeof searchIndexMethods)[number];

export interface SearchIndexRequest {
  id: number;
  method: SearchIndexMethod;
  args: unknown[];
}

export type SearchIndexResponse =
  | { type: 'result'; id: number; value: unknown }
  | { type: 'progress'; id: number; progress: IndexRebuildProgress }
  | { type: 'error'; id: number; error: { name: string; message: string } };

function serializedBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Search index requests must be serializable.');
  return new TextEncoder().encode(json).byteLength;
}

export function assertBoundedSearchIndexRequest(request: SearchIndexRequest): void {
  if (!Number.isSafeInteger(request.id) || request.id < 1) throw new TypeError('Invalid search index request ID.');
  if (!searchIndexMethods.includes(request.method)) throw new TypeError('Unknown search index method.');
  if (!Array.isArray(request.args)) throw new TypeError('Search index request arguments must be an array.');
  if ((request.method === 'search' || request.method === 'facets')) {
    const query = request.args[0];
    if (typeof query !== 'string') throw new TypeError('Search query must be text.');
    if (query.length > SEARCH_INDEX_MAX_QUERY_LENGTH) {
      throw new RangeError(`Search queries must be ${SEARCH_INDEX_MAX_QUERY_LENGTH} characters or fewer.`);
    }
  }
  if (request.method === 'getManyById') {
    const ids = request.args[0];
    if (!Array.isArray(ids) || ids.length > 10_000 || ids.some((id) => typeof id !== 'string')) {
      throw new RangeError('Inspector requests may contain at most 10,000 text IDs.');
    }
  }
  if (request.method === 'rebuild') {
    const entries = request.args[0];
    if (!Array.isArray(entries) || entries.length > 20_000) {
      throw new RangeError('Index rebuilds may contain at most 20,000 entries.');
    }
  }
  if (serializedBytes(request) > SEARCH_INDEX_MAX_REQUEST_BYTES) {
    throw new RangeError('Search index request is too large.');
  }
}

export function isSearchIndexResponse(value: unknown): value is SearchIndexResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Number.isSafeInteger(candidate.id) || typeof candidate.type !== 'string') return false;
  if (candidate.type === 'result') return 'value' in candidate;
  if (candidate.type === 'error') {
    const error = candidate.error;
    return typeof error === 'object' && error !== null &&
      typeof (error as Record<string, unknown>).name === 'string' &&
      typeof (error as Record<string, unknown>).message === 'string';
  }
  if (candidate.type === 'progress') {
    const progress = candidate.progress;
    if (typeof progress !== 'object' || progress === null) return false;
    const record = progress as Record<string, unknown>;
    return (record.phase === 'indexing' || record.phase === 'committing') &&
      Number.isSafeInteger(record.processed) && Number.isSafeInteger(record.total);
  }
  return false;
}

export function parseSearchIndexRequest(value: unknown): SearchIndexRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid search index request.');
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(candidate.id) ||
    typeof candidate.method !== 'string' ||
    !searchIndexMethods.includes(candidate.method as SearchIndexMethod) ||
    !Array.isArray(candidate.args)
  ) {
    throw new TypeError('Invalid search index request.');
  }
  const request: SearchIndexRequest = {
    id: candidate.id as number,
    method: candidate.method as SearchIndexMethod,
    args: candidate.args,
  };
  assertBoundedSearchIndexRequest(request);
  return request;
}
