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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertText(value: unknown, label: string, maximum: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be text no longer than ${maximum.toLocaleString('en')} characters.`);
  }
}

function assertTextId(value: unknown): asserts value is string {
  assertText(value, 'Search index text ID', 1_024);
}

function assertFilters(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new TypeError('Search filters must be an object.');
  const listKeys = ['rooms', 'semanticTypes', 'lifeAreas', 'seasons', 'statuses', 'tags', 'cardTypes'];
  for (const key of listKeys) {
    const items = value[key];
    if (items === undefined) continue;
    if (!Array.isArray(items) || items.length > 100 || items.some((item) => typeof item !== 'string' || item.length > 256)) {
      throw new RangeError(`Search filter ${key} may contain at most 100 short text values.`);
    }
  }
  for (const key of ['dateFrom', 'dateTo']) {
    const date = value[key];
    if (date !== undefined) assertText(date, `Search filter ${key}`, 100);
  }
}

function assertIndexedContent(value: unknown): void {
  if (!isRecord(value)) throw new TypeError('Indexed note content must be an object.');
  assertText(value.searchText, 'Indexed search text', 4 * 1024 * 1024, true);
  if (!Array.isArray(value.links) || value.links.length > 10_000) {
    throw new RangeError('Indexed note content may contain at most 10,000 links.');
  }
  for (const link of value.links) {
    if (!isRecord(link) || !['wiki', 'path', 'id'].includes(link.kind as string)) {
      throw new TypeError('Indexed links must have a supported kind.');
    }
    assertText(link.target, 'Indexed link target', 4_096);
    assertText(link.label, 'Indexed link label', 4_096, true);
  }
}

function assertStudioNote(value: unknown): void {
  if (!isRecord(value)) throw new TypeError('Indexed note must be an object.');
  assertText(value.id, 'Indexed note ID', 1_024);
  assertText(value.body, 'Indexed note body', 4 * 1024 * 1024, true);
  for (const key of ['cardType', 'semanticType', 'status', 'created', 'updated']) {
    assertText(value[key], `Indexed note ${key}`, 256);
  }
  for (const key of ['rooms', 'lifeAreas', 'seasons', 'tags', 'attachments']) {
    const items = value[key];
    if (!Array.isArray(items) || items.length > 10_000 || items.some((item) => typeof item !== 'string')) {
      throw new TypeError(`Indexed note ${key} must be a bounded text array.`);
    }
  }
}

function assertIndexEntry(value: unknown): void {
  if (!isRecord(value)) throw new TypeError('Index rebuild entry must be an object.');
  assertStudioNote(value.note);
  assertText(value.path, 'Indexed note path', 4_096);
  assertText(value.hash, 'Indexed note hash', 1_024);
  assertIndexedContent(value.content);
}

function assertMethodArguments(request: SearchIndexRequest): void {
  const { args, method } = request;
  if (method === 'clear' || method === 'close') {
    if (args.length !== 0) throw new TypeError(`${method} does not accept arguments.`);
    return;
  }
  if (method === 'search' || method === 'facets') {
    if (args.length < 1 || args.length > 2) throw new TypeError(`${method} requires a query and optional filters.`);
    assertText(args[0], 'Search query', SEARCH_INDEX_MAX_QUERY_LENGTH, true);
    assertFilters(args[1]);
    return;
  }
  if (method === 'getManyById') {
    const ids = args[0];
    if (args.length !== 1 || !Array.isArray(ids) || ids.length > 10_000 || ids.some((id) => typeof id !== 'string' || id.length > 1_024)) {
      throw new RangeError('Inspector requests may contain at most 10,000 text IDs.');
    }
    return;
  }
  if (method === 'rebuild') {
    const entries = args[0];
    if (args.length !== 1 || !Array.isArray(entries) || entries.length > 20_000) {
      throw new RangeError('Index rebuilds may contain at most 20,000 entries.');
    }
    entries.forEach(assertIndexEntry);
    return;
  }
  if (method === 'upsert') {
    if (args.length !== 4) throw new TypeError('upsert requires a note, path, hash, and indexed content.');
    assertStudioNote(args[0]);
    assertText(args[1], 'Indexed note path', 4_096);
    assertText(args[2], 'Indexed note hash', 1_024);
    assertIndexedContent(args[3]);
    return;
  }
  if (args.length !== 1) throw new TypeError(`${method} requires one text ID.`);
  assertTextId(args[0]);
}

export function assertBoundedSearchIndexRequest(request: SearchIndexRequest): void {
  if (!Number.isSafeInteger(request.id) || request.id < 1) throw new TypeError('Invalid search index request ID.');
  if (!searchIndexMethods.includes(request.method)) throw new TypeError('Unknown search index method.');
  if (!Array.isArray(request.args)) throw new TypeError('Search index request arguments must be an array.');
  assertMethodArguments(request);
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
