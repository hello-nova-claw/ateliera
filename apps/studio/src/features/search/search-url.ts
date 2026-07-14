import { semanticTypes, type NoteStatus, type SemanticType } from '@studio/domain';
import type { SearchFilters } from '@studio/index';

export interface SearchLocationState {
  query: string;
  filters: SearchFilters;
}

const SEARCH_QUERY_LIMIT = 512;
const FILTER_VALUE_LIMIT = 128;
const visibleStatuses: NoteStatus[] = ['draft', 'active', 'resting', 'archived'];
const defaultStatusKey = [...visibleStatuses].sort().join('\u0000');

type StringListFilter = Exclude<keyof SearchFilters, 'dateFrom' | 'dateTo'>;

const dimensions: Array<{
  key: StringListFilter;
  parameter: string;
}> = [
  { key: 'rooms', parameter: 'room' },
  { key: 'semanticTypes', parameter: 'type' },
  { key: 'lifeAreas', parameter: 'area' },
  { key: 'seasons', parameter: 'season' },
  { key: 'statuses', parameter: 'status' },
  { key: 'tags', parameter: 'tag' },
  { key: 'cardTypes', parameter: 'card' },
];

function safeValue(value: string): string | undefined {
  const normalized = value.normalize('NFC').trim();
  return normalized !== '' &&
    normalized.length <= FILTER_VALUE_LIMIT &&
    !Array.from(normalized).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
    ? normalized
    : undefined;
}

function validDate(value: string | null): string | undefined {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

function validValues(key: StringListFilter, values: string[]): string[] {
  const safe = values.flatMap((value) => {
    const candidate = safeValue(value);
    if (candidate === undefined) return [];
    if (key === 'semanticTypes' && !semanticTypes.includes(candidate as SemanticType)) return [];
    if (key === 'statuses' && !visibleStatuses.includes(candidate as NoteStatus)) return [];
    return [candidate];
  });
  return [...new Set(safe)].sort((left, right) => left.localeCompare(right, 'en'));
}

export function parseSearchLocation(search: string): SearchLocationState {
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filters: SearchFilters = {};
  for (const dimension of dimensions) {
    const values = validValues(dimension.key, parameters.getAll(dimension.parameter));
    if (values.length > 0) Object.assign(filters, { [dimension.key]: values });
  }
  const dateFrom = validDate(parameters.get('from'));
  const dateTo = validDate(parameters.get('to'));
  if (dateFrom !== undefined) filters.dateFrom = dateFrom;
  if (dateTo !== undefined) filters.dateTo = dateTo;
  return {
    query: (parameters.get('q') ?? '').slice(0, SEARCH_QUERY_LIMIT),
    filters,
  };
}

export function serializeSearchLocation(query: string, filters: SearchFilters): string {
  const parameters = new URLSearchParams();
  const boundedQuery = query.slice(0, SEARCH_QUERY_LIMIT);
  if (boundedQuery !== '') parameters.set('q', boundedQuery);
  for (const dimension of dimensions) {
    const values = validValues(
      dimension.key,
      [...((filters[dimension.key] ?? []) as readonly string[])],
    );
    if (dimension.key === 'statuses' && values.join('\u0000') === defaultStatusKey) continue;
    for (const value of values) parameters.append(dimension.parameter, value);
  }
  const dateFrom = validDate(filters.dateFrom ?? null);
  const dateTo = validDate(filters.dateTo ?? null);
  if (dateFrom !== undefined) parameters.set('from', dateFrom);
  if (dateTo !== undefined) parameters.set('to', dateTo);
  const serialized = parameters.toString();
  return serialized === '' ? '' : `?${serialized}`;
}
