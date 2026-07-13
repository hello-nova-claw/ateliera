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
import {
  VaultConflictError,
  VaultUnavailableError,
} from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

import {
  type ActiveSeasonProjection,
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

export type StudioEventListener = (event: StudioEvent) => void;

export interface StudioTimers {
  setTimeout(callback: () => void | Promise<void>, delayMs: number): unknown;
  clearTimeout(token: unknown): void;
}

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
  publish?: StudioEventListener;
  reportListenerError?: (error: unknown, event: StudioEvent) => void;
  /** Compatibility hook; production recovery uses the safe timer-backed default. */
  scheduleIndexRebuild?: (rebuild: () => Promise<void>) => void;
  timers?: StudioTimers;
}

export interface StudioService {
  readonly views: ViewStateRepository;
  start(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: StudioEventListener): () => void;
  capture(input: CaptureNoteInput): Promise<SavedNote>;
  load(path: string): Promise<SavedNote>;
  save(input: SaveNoteInput): Promise<SavedNote>;
  repairs(): Promise<StudioRepairItem[]>;
  rebuildIndex(): Promise<void>;
  indexState(): 'ready' | 'stale' | 'rebuilding';
  projectRoom(room: string): Promise<StudioCardProjection[]>;
  projectLandscape(query: LandscapeProjectionQuery): Promise<StudioCardProjection[]>;
  projectCurrentSeason(): Promise<ActiveSeasonProjection>;
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

const RECOVERY_DELAYS = [100, 500, 2_000, 5_000] as const;
const CAPTURE_ATTEMPTS = 8;
const RECONCILE_DELAY = 50;

const defaultTimers: StudioTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(() => { void callback(); }, delayMs);
  },
  clearTimeout(token) {
    globalThis.clearTimeout(token as ReturnType<typeof globalThis.setTimeout>);
  },
};

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

function isInternalPath(path: string): boolean {
  return path.toLocaleLowerCase('en').startsWith('.studio/');
}

export function createStudioService(dependencies: StudioServiceDependencies): StudioService {
  const clock = dependencies.clock ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => createNoteId(clock().valueOf()));
  const timers = dependencies.timers ?? defaultTimers;
  const views = createViewStateRepository(dependencies.vault);
  const listeners = new Set<StudioEventListener>();
  if (dependencies.publish !== undefined) listeners.add(dependencies.publish);

  let state: 'ready' | 'stale' | 'rebuilding' = 'ready';
  let durableGeneration = 0;
  let indexedGeneration = 0;
  let externalGeneration = 0;
  let reconciledExternalGeneration = 0;
  let rebuildRequired = false;
  let mutationTail: Promise<void> = Promise.resolve();
  let recoveryAttempt = 0;
  let recoveryScheduled = false;
  let recoveryTimer: unknown;
  let reconcileTimer: unknown;
  let stopWatching: (() => void) | undefined;
  let startPromise: Promise<void> | undefined;
  let lifecycleGeneration = 0;

  function emit(event: StudioEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        try {
          dependencies.reportListenerError?.(error, event);
        } catch {
          // Diagnostics are observational and can never enter the data path.
        }
      }
    }
  }

  function enqueueIndexMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = mutationTail.then(mutation);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function scan(): Promise<{ notes: LoadedNote[]; repairs: StudioRepairItem[] }> {
    const entries = (await dependencies.vault.list())
      .filter((entry) =>
        entry.kind === 'file' &&
        entry.path.toLocaleLowerCase('en').endsWith('.md') &&
        !isInternalPath(entry.path))
      .sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const notes: LoadedNote[] = [];
    const repairs: StudioRepairItem[] = [];
    const ids = new Set<string>();
    for (const entry of entries) {
      let file: Awaited<ReturnType<VaultPort['readText']>>;
      try {
        file = await dependencies.vault.readText(entry.path);
      } catch (error) {
        if (error instanceof VaultUnavailableError) {
          let stillExists: boolean;
          try {
            stillExists = await dependencies.vault.exists(entry.path);
          } catch {
            throw error;
          }
          if (!stillExists) continue;
        }
        throw error;
      }
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

  function cancelRecovery(): void {
    if (recoveryTimer !== undefined) timers.clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
    recoveryScheduled = false;
  }

  function scheduleRecovery(): void {
    if (recoveryScheduled || recoveryAttempt >= RECOVERY_DELAYS.length) return;
    recoveryScheduled = true;
    const run = async () => {
      recoveryScheduled = false;
      recoveryTimer = undefined;
      try {
        await rebuildIndex();
        recoveryAttempt = 0;
      } catch {
        recoveryAttempt += 1;
        scheduleRecovery();
      }
    };
    if (dependencies.scheduleIndexRebuild !== undefined) {
      dependencies.scheduleIndexRebuild(run);
    } else {
      recoveryTimer = timers.setTimeout(run, RECOVERY_DELAYS[recoveryAttempt]!);
    }
  }

  function markIndexStale(): void {
    state = 'stale';
    rebuildRequired = true;
    emit({ kind: 'index-stale' });
    scheduleRecovery();
  }

  function rebuildIndex(): Promise<void> {
    return enqueueIndexMutation(async () => {
      const targetGeneration = durableGeneration;
      const targetExternalGeneration = externalGeneration;
      state = 'rebuilding';
      try {
        const { notes } = await scan();
        const entries: IndexEntry[] = notes.map((item) => ({
          ...item,
          content: indexedContent(item.note),
        }));
        await dependencies.index.rebuild(entries);
        indexedGeneration = targetGeneration;
        reconciledExternalGeneration = targetExternalGeneration;
        rebuildRequired = false;
        recoveryAttempt = 0;
        cancelRecovery();
        state =
          indexedGeneration === durableGeneration &&
          reconciledExternalGeneration === externalGeneration
            ? 'ready'
            : 'stale';
        emit({ kind: 'index-rebuilt' });
      } catch (error) {
        state = 'stale';
        rebuildRequired = true;
        throw error;
      }
    });
  }

  function scheduleReconciliation(): void {
    if (reconcileTimer !== undefined) return;
    reconcileTimer = timers.setTimeout(async () => {
      reconcileTimer = undefined;
      try {
        await rebuildIndex();
      } catch {
        scheduleRecovery();
      }
    }, RECONCILE_DELAY);
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

    durableGeneration += 1;
    const generation = durableGeneration;
    state = 'stale';
    await enqueueIndexMutation(async () => {
      try {
        await dependencies.index.upsert(
          savedNote,
          input.path,
          written.hash,
          indexedContent(savedNote),
        );
        indexedGeneration = Math.max(indexedGeneration, generation);
        if (
          !rebuildRequired &&
          indexedGeneration === durableGeneration &&
          reconciledExternalGeneration === externalGeneration
        ) state = 'ready';
      } catch {
        markIndexStale();
      }
    });
    emit({ kind: 'note-saved', noteId: savedNote.id, path: input.path });
    return { note: savedNote, path: input.path, hash: written.hash };
  }

  const service: StudioService = {
    views,

    start() {
      if (stopWatching !== undefined) return Promise.resolve();
      if (startPromise !== undefined) return startPromise;
      const generation = lifecycleGeneration;
      const pending = dependencies.vault.watch((event) => {
        if (generation !== lifecycleGeneration) return;
        const touchesUserContent =
          !isInternalPath(event.path) ||
          (event.kind === 'moved' && !isInternalPath(event.previousPath));
        if (touchesUserContent) {
          externalGeneration += 1;
          state = 'stale';
          scheduleReconciliation();
        }
      }).then((stop) => {
        if (generation !== lifecycleGeneration) {
          stop();
          return;
        }
        stopWatching = stop;
      });
      startPromise = pending;
      void pending.then(
        () => { if (startPromise === pending) startPromise = undefined; },
        () => { if (startPromise === pending) startPromise = undefined; },
      );
      return pending;
    },

    async dispose() {
      lifecycleGeneration += 1;
      const pendingStart = startPromise;
      stopWatching?.();
      stopWatching = undefined;
      if (reconcileTimer !== undefined) timers.clearTimeout(reconcileTimer);
      reconcileTimer = undefined;
      cancelRecovery();
      listeners.clear();
      await pendingStart?.catch(() => undefined);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async capture(input) {
      const body = input.body.trim();
      if (body === '') throw new Error('Write something to remember first.');
      const created = iso(clock);
      let lastConflict: StudioSaveConflictError | undefined;
      for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
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
          created,
          updated: created,
          attachments: [],
          display: { featured: false },
          privacy: { sensitivity: 'private', aiAccess: 'ask' },
          extraFrontmatter: {},
          lineEnding: '\n',
        };
        try {
          return await save({
            note,
            path: `Inbox/${suggestFilename(note)}`,
            expectedMissing: true,
          });
        } catch (error) {
          if (!(error instanceof StudioSaveConflictError)) throw error;
          lastConflict = error;
        }
      }
      throw new Error('A unique capture path could not be reserved. Please try again.', {
        cause: lastConflict,
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
    async projectCurrentSeason() { return projectCurrentSeason((await scan()).notes); },
    async projectStream(type) { return projectStream((await scan()).notes, type, views); },
    async projectFoyer() { return projectFoyer((await scan()).notes, views); },
  };
  return service;
}
