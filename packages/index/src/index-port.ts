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
}

export interface SearchFilters {
  rooms?: string[];
  semanticTypes?: SemanticType[];
  lifeAreas?: string[];
  seasons?: string[];
  statuses?: NoteStatus[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface HighlightRange { start: number; end: number }

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  snippet: string;
  highlightRanges: HighlightRange[];
  score: number;
}

export interface IndexEntry {
  note: StudioNote;
  path: string;
  hash: string;
  links?: ParsedLink[];
}

export interface RepairItem {
  path: string;
  errors: ParseError[];
  rawBody: string;
}

export interface IndexPort {
  upsert(note: StudioNote, path: string, hash: string, links?: ParsedLink[]): Promise<void>;
  remove(id: string): Promise<void>;
  getById(id: string): Promise<{ note: StudioNote; path: string; hash: string } | null>;
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
  backlinks(id: string): Promise<string[]>;
  forwardLinks(id: string): Promise<IndexedLink[]>;
  rebuild(entries: IndexEntry[]): Promise<void>;
  clear(): Promise<void>;
}
