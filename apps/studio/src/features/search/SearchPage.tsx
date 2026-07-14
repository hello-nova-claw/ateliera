import type {
  HighlightRange,
  SearchFacets,
  SearchFilters,
  SearchHit,
  SearchMatchField,
} from '@studio/index';
import { SemanticMark } from '@studio/ui';
import { useState } from 'react';

import './SearchPage.css';

export interface SearchPageModel {
  error?: string;
  facets: SearchFacets;
  filters: SearchFilters;
  query: string;
  repairCount: number;
  results: SearchHit[];
  state: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
}

export interface SearchPageProps {
  model: SearchPageModel;
  onFiltersChange?: (filters: SearchFilters) => void;
  onOpenRepairQueue?: () => void;
  onOpenResult?: (id: string, trigger: HTMLButtonElement) => void;
  onQueryChange?: (query: string) => void;
}

type ListFilterKey = Exclude<
  keyof SearchFilters,
  'dateFrom' | 'dateTo'
>;

const filterGroups: Array<{
  facet: keyof SearchFacets;
  filter: ListFilterKey;
  label: string;
}> = [
  { facet: 'rooms', filter: 'rooms', label: 'Rooms' },
  { facet: 'semanticTypes', filter: 'semanticTypes', label: 'Meaning' },
  { facet: 'lifeAreas', filter: 'lifeAreas', label: 'Life areas' },
  { facet: 'seasons', filter: 'seasons', label: 'Seasons' },
  { facet: 'statuses', filter: 'statuses', label: 'Status' },
  { facet: 'tags', filter: 'tags', label: 'Tags' },
  { facet: 'cardTypes', filter: 'cardTypes', label: 'Card type' },
];

const matchLabels: Record<SearchMatchField, string> = {
  title: 'Matched in the title',
  body: 'Matched in the note',
  tags: 'Matched a tag',
  source: 'Matched the source',
};

function label(value: string): string {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part[0]?.toLocaleUpperCase('en') + part.slice(1))
    .join(' ');
}

function cleanRanges(text: string, ranges: HighlightRange[]): HighlightRange[] {
  const sorted = ranges
    .filter(
      ({ start, end }) =>
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end > start &&
        end <= text.length,
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const output: HighlightRange[] = [];
  for (const range of sorted) {
    const previous = output.at(-1);
    if (previous && range.start < previous.end) continue;
    output.push(range);
  }
  return output;
}

function HighlightedText({ ranges, text }: { ranges: HighlightRange[]; text: string }) {
  const children: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, range] of cleanRanges(text, ranges).entries()) {
    if (range.start > cursor) children.push(text.slice(cursor, range.start));
    children.push(<mark key={`${range.start}:${range.end}:${index}`}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  }
  if (cursor < text.length) children.push(text.slice(cursor));
  return <>{children}</>;
}

function toggleFilter(
  filters: SearchFilters,
  key: ListFilterKey,
  value: string,
): SearchFilters {
  const current = (filters[key] ?? []) as readonly string[];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  if (next.length === 0) {
    const result = { ...filters };
    delete result[key];
    return result;
  }
  return { ...filters, [key]: next } as SearchFilters;
}

function setDateFilter(
  filters: SearchFilters,
  key: 'dateFrom' | 'dateTo',
  value: string,
): SearchFilters {
  if (value !== '') return { ...filters, [key]: value };
  const result = { ...filters };
  delete result[key];
  return result;
}

function SearchResult({
  hit,
  onOpen,
}: {
  hit: SearchHit;
  onOpen?: SearchPageProps['onOpenResult'];
}) {
  const reason = hit.matchReason.strategy === 'keyword'
    ? matchLabels[hit.matchReason.field]
    : `${matchLabels[hit.matchReason.field]} · close spelling`;
  return (
    <article
      aria-labelledby={`search-result-${hit.id}`}
      className="search-result"
    >
      <div className="search-result__meaning">
        <SemanticMark labelMode="visible" type={hit.semanticType} />
        <span>{label(hit.cardType)}</span>
      </div>
      <h2 id={`search-result-${hit.id}`}>
        {onOpen ? (
          <button onClick={(event) => onOpen(hit.id, event.currentTarget)} type="button">
            {hit.title || 'Untitled note'}
          </button>
        ) : hit.title || 'Untitled note'}
      </h2>
      <p className="search-result__snippet">
        <HighlightedText ranges={hit.highlightRanges} text={hit.snippet} />
      </p>
      <p className="search-result__reason">{reason}</p>
      {hit.matchContext && (
        <p className="search-result__context">
          {hit.matchContext.field === 'tags' ? 'Tag' : 'Source'} · {hit.matchContext.text}
        </p>
      )}
    </article>
  );
}

export function SearchPage({
  model,
  onFiltersChange,
  onOpenRepairQueue,
  onOpenResult,
  onQueryChange,
}: SearchPageProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = Object.entries(model.filters).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '',
  ).length;
  return (
    <div className="search-page">
      <header className="search-page__header">
        <p className="search-page__eyebrow">Find what you remember</p>
        <h1>Search</h1>
        <p>Look across your Studio. Everything stays on this device.</p>
      </header>

      <div className="search-page__search" role="search">
        <label htmlFor="studio-search-query">Search your Studio</label>
        <input
          autoComplete="off"
          id="studio-search-query"
          maxLength={512}
          onChange={(event) => onQueryChange?.(event.target.value.slice(0, 512))}
          placeholder="A feeling, place, person, or idea…"
          type="search"
          value={model.query}
        />
      </div>

      <div className="search-page__tools">
        <button
          aria-label="Filters"
          aria-expanded={filtersOpen}
          className="search-page__filter-trigger"
          onClick={() => setFiltersOpen((open) => !open)}
          type="button"
        >
          Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </button>
        {model.repairCount > 0 && onOpenRepairQueue && (
          <button
            className="search-page__repair-trigger"
            onClick={onOpenRepairQueue}
            type="button"
          >
            Review {model.repairCount} repair {model.repairCount === 1 ? 'item' : 'items'}
          </button>
        )}
      </div>

      {filtersOpen && (
        <section aria-label="Search filters" className="search-filters">
          {filterGroups.map((group) => (
            <fieldset className="search-filters__group" key={group.filter}>
              <legend>{group.label}</legend>
              {model.facets[group.facet].map((option) => {
                const selected = ((model.filters[group.filter] ?? []) as readonly string[])
                  .includes(option.value);
                return (
                  <label key={option.value}>
                    <input
                      checked={selected}
                      onChange={() =>
                        onFiltersChange?.(
                          toggleFilter(model.filters, group.filter, option.value),
                        )
                      }
                      type="checkbox"
                    />
                    <span>{label(option.value)}</span>
                    <small>{option.count}</small>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <fieldset className="search-filters__group search-filters__group--dates">
            <legend>Updated between</legend>
            <label>
              <span>Updated from</span>
              <input
                aria-label="Updated from"
                onChange={(event) => onFiltersChange?.(
                  setDateFilter(model.filters, 'dateFrom', event.target.value),
                )}
                type="date"
                value={model.filters.dateFrom?.slice(0, 10) ?? ''}
              />
            </label>
            <label>
              <span>Updated to</span>
              <input
                aria-label="Updated to"
                onChange={(event) => onFiltersChange?.(
                  setDateFilter(model.filters, 'dateTo', event.target.value),
                )}
                type="date"
                value={model.filters.dateTo?.slice(0, 10) ?? ''}
              />
            </label>
          </fieldset>
        </section>
      )}

      {model.state === 'offline' && (
        <p className="search-page__notice" role="status">
          Stored locally · Search is still available offline.
        </p>
      )}
      {model.state === 'stale' && (
        <p className="search-page__notice" role="status">
          Showing what is ready while the local index catches up.
        </p>
      )}
      {model.state === 'error' && (
        <p className="search-page__error" role="alert">
          {model.error ?? 'Search needs a moment. Your notes remain untouched.'}
        </p>
      )}
      {model.state === 'loading' ? (
        <div className="search-page__loading" role="status">
          <span aria-hidden="true" />
          Gathering your Studio…
        </div>
      ) : (
        <section aria-label="Search results" className="search-page__results">
          <p className="search-page__count">
            {model.results.length === 0 && model.state === 'stale'
              ? 'Search is still gathering your notes.'
              : model.results.length === 0
              ? 'No notes match this search.'
              : `${model.results.length} ${model.results.length === 1 ? 'note' : 'notes'} found`}
          </p>
          {model.results.map((hit) => (
            <SearchResult hit={hit} key={hit.id} onOpen={onOpenResult} />
          ))}
        </section>
      )}
    </div>
  );
}
