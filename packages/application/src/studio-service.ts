import {
  createNoteId,
  extractLinks,
  markdownToPlainText,
  parseNote,
  serializeNote,
  suggestFilename,
} from '@studio/content';
import type { ParseError, StudioNote } from '@studio/domain';
import type { IndexEntry, IndexPort } from '@studio/index';
import { VaultConflictError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

import {
  type FoyerProjection,
  type LandscapeProjectionQuery,
  type LoadedNote,
  type StudioCardProjection,
  projectCurrentSeason,
  projectFoyer,
  projectLandscape,
  projectRoom,
  projectStream,
} from './projections';
import { createViewStateRepository } from './view-state';
import type { ViewStateRepository } from './view-state';

export type StudioEvent =
  | { kind: 'note-saved'; noteId: string; path: string }
  | { kind: 'index-stale' }
  | { kind: 'index-rebuilt' };

export interface StudioRepairItem {
  path: string;
  errors: ParseError[];
  rawBody: string;
}

export interface SavedNote {
  note: StudioNote;
  path: string;
  hash: string;
}

export interface SaveNoteInput {
  note: StudioNote;
  path: string;
  expectedHash?: string;
  expectedMissing?: true;
}

export interface CaptureNoteInput {
  body: string;
  title?: string;
}

export interface StudioServiceDependencies {
  vault: VaultPort;
  index: IndexPort;
  clock?: () => Date;
  generateId?: () => string;
  publish?: (event: StudioEvent) => void;
  scheduleIndexRebuild?: (rebuild: () => Promise<void>) => void;
}

export interface StudioService {
  readonly views: ViewStateRepository;
  capture(input: CaptureNoteInput): Promise<SavedNote>;
  load(path: string): Promise<SavedNote>;
  save(input: SaveNoteInput): Promise<SavedNote>;
  repairs(): Promise<StudioRepairItem[]>;
  rebuildIndex(): Promise<void>;
  indexState(): 'ready' | 'stale' | 'rebuilding';
  projectRoom(room: string): Promise<StudioCardProjection[]>;
  projectLandscape(query: LandscapeProjectionQuery): Promise<StudioCardProjection[]>;
  projectCurrentSeason(): Promise<StudioCardProjection | null>;
  projectStream(type: 'reflection' | 'celebration'): Promise<StudioCardProjection[]>;
  projectFoyer(): Promise<FoyerProjection>;
}

export class StudioSaveConflictError extends Error {
  override readonly name = 'StudioSaveConflictError';

  constructor(
    readonly attemptedNote: StudioNote,
    readonly durableText: string,
    options?: ErrorOptions,
  ) {
    super('This note changed elsewhere. Both versions have been preserved for review.', options);
  }
}

function indexedContent(note: StudioNote) {
  return {
    links: extractLinks(note.body),
    searchText: markdownToPlainText(note.body),
  };
}

function validateAndSerialize(note: StudioNote): string {
  const serialized = serializeNote(note);
  if (!parseNote(serialized).ok) throw new Error('The note is invalid and was not written.');
  return serialized;
}

function iso(clock: () => Date): string {
  return clock().toISOString();
}

export function createStudioService(dependencies: StudioServiceDependencies): StudioService {
  const clock = dependencies.clock ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => createNoteId(clock().valueOf()));
  const publish = dependencies.publish ?? (() => undefined);
  const views = createViewStateRepository(dependencies.vault);
  let state: 'ready' | 'stale' | 'rebuilding' = 'ready';
  let rebuildScheduled = false;

  async function scan(): Promise<{ notes: LoadedNote[]; repairs: StudioRepairItem[] }> {
    const entries = (await dependencies.vault.list())
      .filter((entry) =>
        entry.kind === 'file' &&
        entry.path.toLowerCase().endsWith('.md') &&
        !entry.path.startsWith('.studio/'))
      .sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const notes: LoadedNote[] = [];
    const repairs: StudioRepairItem[] = [];
    const ids = new Set<string>();
    for (const entry of entries) {
      const file = await dependencies.vault.readText(entry.path);
      const parsed = parseNote(file.text);
      if (!parsed.ok) {
        repairs.push({ path: entry.path, errors: parsed.errors, rawBody: parsed.rawBody });
      } else if (ids.has(parsed.note.id)) {
        repairs.push({
          path: entry.path,
          errors: [{ code: 'invalid-frontmatter', message: `Duplicate note id: ${parsed.note.id}`, path: 'id' }],
          rawBody: parsed.note.body,
        });
      } else {
        ids.add(parsed.note.id);
        notes.push({ note: parsed.note, path: entry.path, hash: file.hash });
      }
    }
    return { notes, repairs };
  }

  async function rebuildIndex(): Promise<void> {
    state = 'rebuilding';
    const { notes } = await scan();
    const entries: IndexEntry[] = notes.map((item) => ({
      ...item,
      content: indexedContent(item.note),
    }));
    try {
      await dependencies.index.rebuild(entries);
      state = 'ready';
      publish({ kind: 'index-rebuilt' });
    } catch (error) {
      state = 'stale';
      throw error;
    } finally {
      rebuildScheduled = false;
    }
  }

  function markIndexStale(): void {
    state = 'stale';
    publish({ kind: 'index-stale' });
    if (dependencies.scheduleIndexRebuild !== undefined && !rebuildScheduled) {
      rebuildScheduled = true;
      dependencies.scheduleIndexRebuild(rebuildIndex);
    }
  }

  async function save(input: SaveNoteInput): Promise<SavedNote> {
    const savedNote: StudioNote = { ...input.note, updated: iso(clock) };
    const serialized = validateAndSerialize(savedNote);
    let written: { hash: string };
    try {
      written = await dependencies.vault.writeTextAtomic(input.path, serialized, {
        ...(input.expectedHash === undefined ? {} : { expectedHash: input.expectedHash }),
        ...(input.expectedMissing === undefined ? {} : { expectedMissing: input.expectedMissing }),
      });
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      let durableText = '';
      try {
        durableText = (await dependencies.vault.readText(input.path)).text;
      } catch {
        // The attempted note remains attached to the conflict even if the other writer removed it.
      }
      throw new StudioSaveConflictError(savedNote, durableText, { cause: error });
    }

    try {
      await dependencies.index.upsert(
        savedNote,
        input.path,
        written.hash,
        indexedContent(savedNote),
      );
      state = 'ready';
    } catch {
      markIndexStale();
    }
    publish({ kind: 'note-saved', noteId: savedNote.id, path: input.path });
    return { note: savedNote, path: input.path, hash: written.hash };
  }

  const service: StudioService = {
    views,

    async capture(input) {
      const body = input.body.trim();
      if (body === '') throw new Error('Write something to remember first.');
      const now = iso(clock);
      const note: StudioNote = {
        schemaVersion: 1,
        id: generateId(),
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        body,
        cardType: 'capture',
        semanticType: 'reflection',
        status: 'draft',
        rooms: ['inbox'],
        lifeAreas: [],
        seasons: [],
        tags: [],
        created: now,
        updated: now,
        attachments: [],
        display: { featured: false },
        privacy: { sensitivity: 'private', aiAccess: 'ask' },
        extraFrontmatter: {},
        lineEnding: '\n',
      };
      return save({
        note,
        path: `Inbox/${suggestFilename(note)}`,
        expectedMissing: true,
      });
    },

    async load(path) {
      const file = await dependencies.vault.readText(path);
      const parsed = parseNote(file.text);
      if (!parsed.ok) throw new Error(`The note at ${path} needs metadata repair.`);
      return { note: parsed.note, path, hash: file.hash };
    },

    save,
    async repairs() { return (await scan()).repairs; },
    rebuildIndex,
    indexState() { return state; },
    async projectRoom(room) { return projectRoom((await scan()).notes, room, views); },
    async projectLandscape(query) { return projectLandscape((await scan()).notes, query, views); },
    async projectCurrentSeason() { return projectCurrentSeason((await scan()).notes, views); },
    async projectStream(type) { return projectStream((await scan()).notes, type, views); },
    async projectFoyer() { return projectFoyer((await scan()).notes, views); },
  };
  return service;
}
