import {
  createNoteId,
  extractLinks,
  markdownToPlainText,
  parseNote,
  serializeNote,
  suggestFilename,
} from '@studio/content';
import type { ParseError, SemanticType, StudioNote } from '@studio/domain';
import type { IndexEntry, IndexPort } from '@studio/index';
import {
  VaultConflictError,
  VaultUnavailableError,
  createRevisionStore,
} from '@studio/storage/portable';
import type {
  RevisionReason,
  RevisionSnapshot,
  RevisionStore,
  VaultChange,
  VaultPort,
} from '@studio/storage/portable';

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
import {
  createNoteLifecycleService,
  type RestoreNoteResult,
  type TrashedNoteResult,
} from './note-lifecycle';

export type StudioEvent =
  | { kind: 'note-saved'; noteId: string; path: string }
  | { kind: 'note-archived' | 'note-unarchived'; noteId: string; path: string }
  | { kind: 'note-trashed'; noteId: string }
  | { kind: 'note-restored'; noteId: string; path: string; relocated: boolean }
  | { kind: 'note-restore-conflict'; noteId: string; conflictingPaths: string[] }
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
  semanticType?: SemanticType;
  title?: string;
  placement?: CapturePlacement;
}

export type CapturePlacement =
  | 'foyer-becoming'
  | 'foyer-feeling'
  | 'foyer-principle';

const capturePlacements = {
  'foyer-becoming': {
    cardType: 'identity', semanticType: 'foundations', rooms: ['foyer', 'identity-studio'], folder: 'Foyer',
  },
  'foyer-feeling': {
    cardType: 'feeling', semanticType: 'vision', rooms: ['foyer', 'identity-studio'], folder: 'Foyer',
  },
  'foyer-principle': {
    cardType: 'principle', semanticType: 'foundations', rooms: ['foyer', 'identity-studio'], folder: 'Foyer',
  },
} as const satisfies Record<CapturePlacement, {
  cardType: string;
  semanticType: SemanticType;
  rooms: readonly string[];
  folder: string;
}>;

export interface StudioServiceDependencies {
  vault: VaultPort;
  index: IndexPort;
  clock?: () => Date;
  generateId?: () => string;
  publish?: StudioEventListener;
  reportListenerError?: (error: unknown, event: StudioEvent) => void;
  reportDiagnostic?: (error: unknown, context: 'recovery-scheduler') => void;
  /** Compatibility hook; production recovery uses the safe timer-backed default. */
  scheduleIndexRebuild?: (rebuild: () => Promise<void>) => void;
  timers?: StudioTimers;
  revisions?: RevisionStore;
}

export interface StudioService {
  readonly views: ViewStateRepository;
  start(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: StudioEventListener): () => void;
  capture(input: CaptureNoteInput): Promise<SavedNote>;
  load(path: string): Promise<SavedNote>;
  save(input: SaveNoteInput): Promise<SavedNote>;
  archive(id: string): Promise<SavedNote>;
  unarchive(id: string): Promise<SavedNote>;
  trash(id: string): Promise<TrashedNoteResult>;
  restore(id: string): Promise<RestoreNoteResult>;
  reconcileTrash(): Promise<string[]>;
  snapshot(reason: RevisionReason, paths: string[]): Promise<RevisionSnapshot>;
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
const SELF_EVENT_TTL = 5_000;

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
  const revisions = dependencies.revisions ?? createRevisionStore(dependencies.vault, { clock });
  const noteLifecycle = createNoteLifecycleService({
    vault: dependencies.vault,
    index: dependencies.index,
    clock,
  });
  const listeners = new Set<StudioEventListener>();
  if (dependencies.publish !== undefined) listeners.add(dependencies.publish);

  let state: 'ready' | 'stale' | 'rebuilding' = 'ready';
  let durableGeneration = 0;
  let indexedGeneration = 0;
  let externalGeneration = 0;
  let reconciledExternalGeneration = 0;
  let rebuildRequired = false;
  let indexMutationTail: Promise<void> = Promise.resolve();
  let durableMutationTail: Promise<void> = Promise.resolve();
  let recoveryAttempt = 0;
  let recoveryScheduled = false;
  let recoveryTimer: unknown;
  let reconcileTimer: unknown;
  let stopWatching: (() => void) | undefined;
  let startPromise: Promise<void> | undefined;
  let disposePromise: Promise<void> | undefined;
  let lifecycleGeneration = 0;
  let disposed = false;
  const pendingWatchEvents: Array<{ event: VaultChange; writeGeneration?: number }> = [];
  const selfPublications = new Map<string, { hash: string; generation: number; expiresAt: number }>();
  const pathWriteGenerations = new Map<string, number>();
  const activeWriteGenerations = new Map<string, Set<number>>();

  function assertActive(): void {
    if (disposed) throw new Error('This Studio service has been disposed.');
  }

  function emit(event: StudioEvent): void {
    if (disposed) return;
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
    const result = indexMutationTail.then(mutation);
    indexMutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  function enqueueDurableMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = durableMutationTail.then(mutation);
    durableMutationTail = result.then(() => undefined, () => undefined);
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
    if (disposed || recoveryScheduled || recoveryAttempt >= RECOVERY_DELAYS.length) return;
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
      try {
        dependencies.scheduleIndexRebuild(run);
        return;
      } catch (error) {
        try {
          dependencies.reportDiagnostic?.(error, 'recovery-scheduler');
        } catch {
          // Diagnostics never replace the safe timer fallback.
        }
      }
    }
    recoveryTimer = timers.setTimeout(run, RECOVERY_DELAYS[recoveryAttempt]!);
  }

  function markIndexStale(): void {
    state = 'stale';
    rebuildRequired = true;
    emit({ kind: 'index-stale' });
    scheduleRecovery();
  }

  function rebuildIndex(): Promise<void> {
    if (disposed) return Promise.reject(new Error('This Studio service has been disposed.'));
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

  function recordSelfPublication(path: string, hash: string, generation: number): void {
    selfPublications.set(path, { hash, generation, expiresAt: Date.now() + SELF_EVENT_TTL });
  }

  function consumeSelfPublication(event: VaultChange, generation?: number): boolean {
    if (event.kind !== 'created' && event.kind !== 'modified') return false;
    const publication = selfPublications.get(event.path);
    if (publication === undefined) return false;
    if (publication.expiresAt < Date.now()) {
      selfPublications.delete(event.path);
      return false;
    }
    if (
      publication.hash !== event.hash ||
      publication.generation !== pathWriteGenerations.get(event.path) ||
      (generation !== undefined && publication.generation !== generation)
    ) return false;
    selfPublications.delete(event.path);
    return true;
  }

  function canReturnToReady(): boolean {
    return !rebuildRequired &&
      pendingWatchEvents.length === 0 &&
      indexedGeneration === durableGeneration &&
      reconciledExternalGeneration === externalGeneration;
  }

  function scheduleReconciliation(): void {
    if (disposed || reconcileTimer !== undefined) return;
    reconcileTimer = timers.setTimeout(async () => {
      reconcileTimer = undefined;
      if (disposed) return;
      const pending = pendingWatchEvents.splice(0);
      let hasExternalEvent = false;
      let hasDeferredEvent = false;
      for (const item of pending) {
        if (item.writeGeneration !== undefined) {
          if (activeWriteGenerations.get(item.event.path)?.has(item.writeGeneration)) {
            pendingWatchEvents.push(item);
            hasDeferredEvent = true;
            continue;
          }
          if (consumeSelfPublication(item.event, item.writeGeneration)) continue;
          externalGeneration += 1;
          state = 'stale';
        }
        hasExternalEvent = true;
      }
      if (hasDeferredEvent) scheduleReconciliation();
      if (!hasExternalEvent) {
        if (canReturnToReady()) state = 'ready';
        return;
      }
      try {
        await rebuildIndex();
      } catch {
        scheduleRecovery();
      }
    }, RECONCILE_DELAY);
  }

  async function performSave(input: SaveNoteInput): Promise<SavedNote> {
    const savedNote: StudioNote = { ...input.note, updated: iso(clock) };
    const serialized = validateAndSerialize(savedNote);
    const writeGeneration = (pathWriteGenerations.get(input.path) ?? 0) + 1;
    pathWriteGenerations.set(input.path, writeGeneration);
    selfPublications.delete(input.path);
    const active = activeWriteGenerations.get(input.path) ?? new Set<number>();
    active.add(writeGeneration);
    activeWriteGenerations.set(input.path, active);
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
    } finally {
      active.delete(writeGeneration);
      if (active.size === 0) activeWriteGenerations.delete(input.path);
    }

    recordSelfPublication(input.path, written.hash, writeGeneration);
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
        if (canReturnToReady()) state = 'ready';
      } catch {
        markIndexStale();
      }
    });
    emit({ kind: 'note-saved', noteId: savedNote.id, path: input.path });
    return { note: savedNote, path: input.path, hash: written.hash };
  }

  function save(input: SaveNoteInput): Promise<SavedNote> {
    if (disposed) return Promise.reject(new Error('This Studio service has been disposed.'));
    return enqueueDurableMutation(() => performSave(input));
  }

  async function finishLifecycle<T>(
    operation: () => Promise<T>,
    event: (result: T) => StudioEvent,
    didMutate: (result: T) => boolean = () => true,
  ): Promise<T> {
    assertActive();
    return enqueueDurableMutation(async () => {
      const result = await operation();
      if (!didMutate(result)) {
        emit(event(result));
        return result;
      }
      durableGeneration += 1;
      markIndexStale();
      try {
        await rebuildIndex();
      } catch {
        scheduleRecovery();
      }
      emit(event(result));
      return result;
    });
  }

  const service: StudioService = {
    views,

    start() {
      if (disposed) return Promise.reject(new Error('This Studio service has been disposed.'));
      if (stopWatching !== undefined) return Promise.resolve();
      if (startPromise !== undefined) return startPromise;
      const generation = lifecycleGeneration;
      const pending = dependencies.vault.watch((event) => {
        if (generation !== lifecycleGeneration) return;
        const touchesUserContent =
          !isInternalPath(event.path) ||
          (event.kind === 'moved' && !isInternalPath(event.previousPath));
        if (touchesUserContent) {
          const canBeSelfPublished =
            (event.kind === 'created' || event.kind === 'modified') &&
            (activeWriteGenerations.get(event.path)?.size ?? 0) > 0;
          if (!canBeSelfPublished && consumeSelfPublication(event)) return;
          const writeGeneration = canBeSelfPublished
            ? pathWriteGenerations.get(event.path)
            : undefined;
          if (canBeSelfPublished) {
            state = 'stale';
          } else {
            externalGeneration += 1;
            state = 'stale';
          }
          pendingWatchEvents.push({
            event,
            ...(writeGeneration === undefined ? {} : { writeGeneration }),
          });
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

    dispose() {
      if (disposePromise !== undefined) return disposePromise;
      disposed = true;
      lifecycleGeneration += 1;
      const pendingStart = startPromise;
      stopWatching?.();
      stopWatching = undefined;
      if (reconcileTimer !== undefined) timers.clearTimeout(reconcileTimer);
      reconcileTimer = undefined;
      pendingWatchEvents.length = 0;
      selfPublications.clear();
      pathWriteGenerations.clear();
      activeWriteGenerations.clear();
      cancelRecovery();
      listeners.clear();
      disposePromise = (async () => {
        await pendingStart?.catch(() => undefined);
        await durableMutationTail;
        await indexMutationTail;
        selfPublications.clear();
        pathWriteGenerations.clear();
        activeWriteGenerations.clear();
      })();
      return disposePromise;
    },

    subscribe(listener) {
      assertActive();
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async capture(input) {
      assertActive();
      const body = input.body.trim();
      if (body === '') throw new Error('Write something to remember first.');
      const created = iso(clock);
      const placement = input.placement === undefined
        ? undefined
        : capturePlacements[input.placement];
      let lastConflict: StudioSaveConflictError | undefined;
      for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
        const note: StudioNote = {
          schemaVersion: 1,
          id: generateId(),
          ...(input.title?.trim() ? { title: input.title.trim() } : {}),
          body,
          cardType: placement?.cardType ?? 'capture',
          semanticType: placement?.semanticType ?? input.semanticType ?? 'reflection',
          status: placement === undefined ? 'draft' : 'active',
          rooms: placement === undefined ? ['inbox'] : [...placement.rooms],
          lifeAreas: [],
          seasons: [],
          tags: [],
          created,
          updated: created,
          attachments: [],
          display: { featured: placement !== undefined },
          privacy: { sensitivity: 'private', aiAccess: 'ask' },
          extraFrontmatter: {},
          lineEnding: '\n',
        };
        try {
          return await save({
            note,
            path: `${placement?.folder ?? 'Inbox'}/${suggestFilename(note)}`,
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
      assertActive();
      const file = await dependencies.vault.readText(path);
      const parsed = parseNote(file.text);
      if (!parsed.ok) throw new Error(`The note at ${path} needs metadata repair.`);
      return { note: parsed.note, path, hash: file.hash };
    },

    save,
    archive(id) {
      return finishLifecycle(
        () => noteLifecycle.archive(id),
        (result) => ({ kind: 'note-archived', noteId: id, path: result.path }),
      );
    },
    unarchive(id) {
      return finishLifecycle(
        () => noteLifecycle.unarchive(id),
        (result) => ({ kind: 'note-unarchived', noteId: id, path: result.path }),
      );
    },
    trash(id) {
      return finishLifecycle(
        () => noteLifecycle.trash(id),
        () => ({ kind: 'note-trashed', noteId: id }),
      );
    },
    restore(id) {
      return finishLifecycle(
        () => noteLifecycle.restore(id),
        (result) => result.kind === 'restored'
          ? {
              kind: 'note-restored',
              noteId: id,
              path: result.path,
              relocated: result.relocated,
            }
          : {
              kind: 'note-restore-conflict',
              noteId: id,
              conflictingPaths: result.conflictingPaths,
            },
        (result) => result.kind === 'restored',
      );
    },
    reconcileTrash() {
      assertActive();
      return enqueueDurableMutation(() => noteLifecycle.reconcile());
    },
    snapshot(reason, paths) {
      assertActive();
      return enqueueDurableMutation(() => revisions.create(reason, paths));
    },
    async repairs() { assertActive(); return (await scan()).repairs; },
    rebuildIndex,
    indexState() { return state; },
    async projectRoom(room) { assertActive(); return projectRoom((await scan()).notes, room, views); },
    async projectLandscape(query) { assertActive(); return projectLandscape((await scan()).notes, query, views); },
    async projectCurrentSeason() { assertActive(); return projectCurrentSeason((await scan()).notes); },
    async projectStream(type) { assertActive(); return projectStream((await scan()).notes, type, views); },
    async projectFoyer() { assertActive(); return projectFoyer((await scan()).notes, views); },
  };
  return service;
}
