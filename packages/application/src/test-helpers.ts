import { extractLinks, markdownToPlainText, serializeNote } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import type {
  IndexPort,
  IndexedContent,
  IndexedLink,
  SearchFilters,
  SearchHit,
} from '@studio/index';
import { createInMemoryVault } from '@studio/storage';

export function note(overrides: Partial<StudioNote> = {}): StudioNote {
  return {
    schemaVersion: 1,
    id: 'n1',
    title: 'A note',
    body: 'Body',
    cardType: 'note',
    semanticType: 'reflection',
    status: 'active',
    rooms: [],
    lifeAreas: [],
    seasons: [],
    tags: [],
    created: '2026-07-13T10:00:00+10:00',
    updated: '2026-07-13T10:00:00+10:00',
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: {},
    lineEnding: '\n',
    ...overrides,
  };
}

export function contentFor(value: StudioNote): IndexedContent {
  return {
    links: extractLinks(value.body),
    searchText: markdownToPlainText(value.body),
  };
}

export class RecordingIndex implements IndexPort {
  readonly entries = new Map<string, { note: StudioNote; path: string; hash: string }>();
  readonly upserts: string[] = [];
  failUpsert = false;

  async upsert(value: StudioNote, path: string, hash: string): Promise<void> {
    this.upserts.push(value.id);
    if (this.failUpsert) throw new Error('index unavailable');
    this.entries.set(value.id, { note: value, path, hash });
  }
  async remove(id: string): Promise<void> { this.entries.delete(id); }
  async getById(id: string) { return this.entries.get(id) ?? null; }
  async search(_query: string, _filters?: SearchFilters): Promise<SearchHit[]> { return []; }
  async backlinks(_id: string): Promise<string[]> { return []; }
  async forwardLinks(_id: string): Promise<IndexedLink[]> { return []; }
  async rebuild(entries: Parameters<IndexPort['rebuild']>[0]): Promise<void> {
    this.entries.clear();
    for (const entry of entries) this.entries.set(entry.note.id, entry);
  }
  async clear(): Promise<void> { this.entries.clear(); }
}

export async function seed(notes: Array<{ path: string; note: StudioNote }>) {
  const vault = createInMemoryVault();
  for (const item of notes) await vault.writeTextAtomic(item.path, serializeNote(item.note));
  return vault;
}
