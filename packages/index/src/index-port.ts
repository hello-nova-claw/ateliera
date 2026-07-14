import type { NoteStatus, ParseError, SemanticType, StudioNote } from '@studio/domain';

export type ParsedLinkKind = 'wiki' | 'path' | 'id';

export interface ParsedLink {
  kind: ParsedLinkKind;
  target: string;
  label: string;
}

export interface IndexedLink extends ParsedLink {
  sourceId: string;
  targetId?: string;
  candidateIds?: string[];
}

export interface IndexedContent {
  links: ParsedLink[];
  searchText: string;
}

export interface SearchFilters {
  rooms?: string[];
  semanticTypes?: SemanticType[];
  lifeAreas?: string[];
  seasons?: string[];
  statuses?: NoteStatus[];
  tags?: string[];
  cardTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export type SearchMatchField = 'title' | 'body' | 'tags' | 'source';
export type SearchMatchStrategy = 'keyword' | 'fuzzy-title' | 'fuzzy-tag';

export interface SearchMatchReason {
  field: SearchMatchField;
  strategy: SearchMatchStrategy;
  text: string;
  distance?: 1 | 2;
}

export interface HighlightRange { start: number; end: number }

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  snippet: string;
  highlightRanges: HighlightRange[];
  score: number;
  semanticType: SemanticType;
  cardType: string;
  status: NoteStatus;
  updated: string;
  matchReason: SearchMatchReason;
  matchContext?: { field: 'tags' | 'source'; text: string };
}

export interface SearchFacetValue { value: string; count: number }

export interface SearchFacets {
  rooms: SearchFacetValue[];
  semanticTypes: SearchFacetValue[];
  lifeAreas: SearchFacetValue[];
  seasons: SearchFacetValue[];
  statuses: SearchFacetValue[];
  tags: SearchFacetValue[];
  cardTypes: SearchFacetValue[];
}

export interface IndexedNoteRecord {
  note: StudioNote;
  path: string;
  hash: string;
}

export interface IndexEntry {
  note: StudioNote;
  path: string;
  hash: string;
  content: IndexedContent;
}

export interface IndexRebuildProgress {
  phase: 'indexing' | 'committing';
  processed: number;
  total: number;
}

export interface RepairItem {
  path: string;
  errors: ParseError[];
  rawBody: string;
}

export interface IndexPort {
  upsert(note: StudioNote, path: string, hash: string, content: IndexedContent): Promise<void>;
  remove(id: string): Promise<void>;
  getById(id: string): Promise<IndexedNoteRecord | null>;
  getManyById(ids: string[]): Promise<IndexedNoteRecord[]>;
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
  facets(query: string, filters?: SearchFilters): Promise<SearchFacets>;
  backlinks(id: string): Promise<string[]>;
  forwardLinks(id: string): Promise<IndexedLink[]>;
  rebuild(entries: IndexEntry[], onProgress?: (progress: IndexRebuildProgress) => void): Promise<void>;
  clear(): Promise<void>;
}
