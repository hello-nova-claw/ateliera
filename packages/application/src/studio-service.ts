import {
  createNoteId,
  extractLinks,
  markdownToPlainText,
  parseNote,
  serializeNote,
  suggestFilename,
} from '@studio/content';
import type {
  DecisionHorizon,
  IdentitySection,
  LandscapeAnchor,
  ParseError,
  SemanticType,
  StudioNote,
  WisdomKind,
} from '@studio/domain';
import {
  identitySectionDefinition,
  isDecisionHorizon,
  wisdomKinds,
  semanticTypeForWisdomKind,
  semanticTypeForLandscapeAnchor,
} from '@studio/domain';
import type { IndexEntry, IndexPort } from '@studio/index';
import {
  VaultConflictError,
  VaultUnavailableError,
  createRevisionStore,
  createStudioControlVault,
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
  type IdentityStudioProjection,
  type LandscapeBoardProjection,
  type LandscapeProjectionQuery,
  type LoadedNote,
  type ReflectionGardenProjection,
  type ReflectionEvidenceConnection,
  type ReflectionEvidenceTarget,
  type StudioCardProjection,
  type UnchartedProjection,
  type WisdomGardenProjection,
  projectCurrentSeason,
  projectFoyer,
  projectIdentityStudioRoom,
  projectLandscape,
  projectLandscapeBoard,
  projectReflectionGardenRoom,
  resolveReflectionEvidenceTarget,
  projectRoom,
  projectStream,
  projectUnchartedRoom,
  projectWisdomGardenRoom,
} from './projections';
import { createViewStateRepository } from './view-state';
import type { ViewStateRepository } from './view-state';
import { createLifeAreaRepository } from './life-area-repository';
import type { LifeAreaRepository } from './life-area-repository';
import {
  createWisdomThemeRepository,
  type WisdomThemeRepository,
} from './wisdom-theme-repository';
import {
  createRhythmProfileRepository,
  type RhythmProfileRepository,
} from './rhythm-profile-repository';
import {
  createStudioPreferencesRepository,
  type StudioPreferencesRepository,
} from './studio-preferences-repository';
import {
  createNoteLifecycleService,
  type RestoreNoteResult,
  type TrashedNoteResult,
} from './note-lifecycle';
import { resolveCoverMedia, type CoverMediaResult } from './cover-media';
import {
  createSeasonTransactionStore,
  type SeasonTransactionStore,
} from './season-transaction-store';
import {
  createSeasonCloseTransactionService,
  type PendingSeasonClose,
  type SeasonCloseRequest,
  type SeasonCloseResult,
} from './season-close-transaction';
import {
  createOnboardingSettingsRepository,
  type OnboardingSettingsRepository,
} from './onboarding-settings';

export {
  MAX_COVER_MEDIA_BYTES,
  type CoverMediaMimeType,
  type CoverMediaResult,
} from './cover-media';
import {
  capturePlacementMetadata,
  type CapturePlacement,
} from './capture-metadata';

export type StudioEvent =
  | { kind: 'note-saved'; noteId: string; path: string }
  | { kind: 'note-archived' | 'note-unarchived'; noteId: string; path: string }
  | { kind: 'note-trashed'; noteId: string }
  | { kind: 'note-restored'; noteId: string; path: string; relocated: boolean }
  | {
      kind: 'note-restore-conflict';
      noteId: string;
      conflictingPaths: string[];
    }
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
  landscape?: { lifeArea: string; anchor: LandscapeAnchor };
  decisionHorizon?: DecisionHorizon;
  unchartedHorizon?: 'near' | 'beyond';
  identitySection?: IdentitySection;
  wisdom?: {
    kind: WisdomKind;
    themes: string[];
    source?: StudioNote['source'];
    sourceNoteIds?: string[];
  };
}

function validateStructuredCapture(input: CaptureNoteInput): void {
  const destinations = [
    input.placement,
    input.landscape,
    input.identitySection,
    input.wisdom,
  ].filter((value) => value !== undefined);
  if (destinations.length > 1)
    throw new Error('Choose one Studio destination for this thought.');
  if (input.wisdom === undefined) return;
  if (!wisdomKinds.includes(input.wisdom.kind))
    throw new Error('Choose a recognised kind of Wisdom note.');
  if (
    input.wisdom.themes.length > 40 ||
    input.wisdom.themes.some(
      (theme) =>
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(theme) || theme.length > 64,
    )
  )
    throw new Error('Wisdom themes must be short lowercase slugs.');
  if (new Set(input.wisdom.themes).size !== input.wisdom.themes.length)
    throw new Error('Wisdom themes cannot be repeated.');
  const source = input.wisdom.source;
  if (
    source !== undefined &&
    [source.title, source.creator].some(
      (value) => value !== undefined && Array.from(value).length > 200,
    )
  )
    throw new Error('Wisdom source details are too long.');
  if (source?.url !== undefined) {
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error('Wisdom source URL must be a valid web address.');
    }
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      source.url.length > 2048
    )
      throw new Error('Wisdom source URL must use http or https.');
  }
  if (
    input.wisdom.sourceNoteIds?.some(
      (id) => id.trim() === '' || id.length > 128,
    )
  )
    throw new Error('Wisdom source note IDs are invalid.');
}

function landscapeAnchorMetadata(anchor: LandscapeAnchor): {
  cardType: LandscapeAnchor;
  semanticType: SemanticType;
} {
  return {
    cardType: anchor,
    semanticType: semanticTypeForLandscapeAnchor(anchor),
  };
}

function removeDecisionOnlyFrontmatter(
  extraFrontmatter: StudioNote['extraFrontmatter'],
): StudioNote['extraFrontmatter'] {
  return Object.fromEntries(
    Object.entries(extraFrontmatter).filter(
      ([key]) => key !== 'decision_horizon',
    ),
  ) as StudioNote['extraFrontmatter'];
}

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
  lifeAreas?: LifeAreaRepository;
}

export interface StudioService {
  readonly views: ViewStateRepository;
  readonly lifeAreas: LifeAreaRepository;
  readonly wisdomThemes: WisdomThemeRepository;
  readonly rhythmProfile: RhythmProfileRepository;
  readonly preferences: StudioPreferencesRepository;
  readonly index: IndexPort;
  readonly onboarding: OnboardingSettingsRepository;
  readonly seasonTransactions: SeasonTransactionStore;
  start(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: StudioEventListener): () => void;
  capture(input: CaptureNoteInput): Promise<SavedNote>;
  load(path: string): Promise<SavedNote>;
  resolveCover(path: string): Promise<CoverMediaResult>;
  clearCover(path: string, expectedHash: string): Promise<SavedNote>;
  save(input: SaveNoteInput): Promise<SavedNote>;
  archive(id: string): Promise<SavedNote>;
  unarchive(id: string): Promise<SavedNote>;
  trash(id: string): Promise<TrashedNoteResult>;
  restore(id: string): Promise<RestoreNoteResult>;
  reconcileTrash(): Promise<string[]>;
  snapshot(reason: RevisionReason, paths: string[]): Promise<RevisionSnapshot>;
  prepareSeasonCloseTransaction(request: SeasonCloseRequest): Promise<void>;
  pendingSeasonCloseTransaction(): Promise<PendingSeasonClose | null>;
  closeSeasonTransaction(
    request: SeasonCloseRequest,
  ): Promise<SeasonCloseResult>;
  resumeSeasonCloseTransaction(): Promise<SeasonCloseResult | null>;
  repairs(): Promise<StudioRepairItem[]>;
  rebuildIndex(): Promise<void>;
  indexState(): 'ready' | 'stale' | 'rebuilding';
  projectRoom(room: string): Promise<StudioCardProjection[]>;
  projectLandscape(
    query: LandscapeProjectionQuery,
  ): Promise<StudioCardProjection[]>;
  projectLandscapeBoard(
    lifeAreas: readonly string[],
  ): Promise<LandscapeBoardProjection>;
  updateLandscapePlacement(input: {
    path: string;
    expectedHash: string;
    lifeAreas: string[];
    anchor: LandscapeAnchor;
  }): Promise<SavedNote>;
  projectUncharted(): Promise<UnchartedProjection>;
  inviteUnchartedToSeason(input: {
    path: string;
    expectedHash: string;
    seasonId: string;
  }): Promise<SavedNote>;
  projectReflectionGarden(): Promise<ReflectionGardenProjection>;
  resolveReflectionEvidenceTarget(
    target: ReflectionEvidenceTarget,
  ): Promise<ReflectionEvidenceConnection>;
  linkReflectionEvidence(input: {
    path: string;
    expectedHash: string;
    noteIds?: string[];
    lifeAreas?: string[];
    seasons?: string[];
  }): Promise<SavedNote>;
  projectCurrentSeason(): Promise<ActiveSeasonProjection>;
  projectStream(
    type: 'reflection' | 'celebration',
  ): Promise<StudioCardProjection[]>;
  projectFoyer(): Promise<FoyerProjection>;
  projectIdentityStudio(): Promise<IdentityStudioProjection>;
  promoteIdentity(noteId: string): Promise<void>;
  reorderIdentity(section: IdentitySection, noteIds: string[]): Promise<void>;
  projectWisdomGarden(): Promise<WisdomGardenProjection>;
}

export class StudioSaveConflictError extends Error {
  override readonly name = 'StudioSaveConflictError';

  constructor(
    readonly attemptedNote: StudioNote,
    readonly durableText: string,
    options?: ErrorOptions,
  ) {
    super(
      'This note changed elsewhere. Both versions have been preserved for review.',
      options,
    );
  }
}

const RECOVERY_DELAYS = [100, 500, 2_000, 5_000] as const;
const CAPTURE_ATTEMPTS = 8;
const RECONCILE_DELAY = 50;
const SELF_EVENT_TTL = 5_000;

const defaultTimers: StudioTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(() => {
      void callback();
    }, delayMs);
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
  if (!parseNote(serialized).ok)
    throw new Error('The note is invalid and was not written.');
  return serialized;
}

function iso(clock: () => Date): string {
  return clock().toISOString();
}

function isInternalPath(path: string): boolean {
  return path.toLocaleLowerCase('en').startsWith('.studio/');
}

function portableLifeAreaFolder(lifeArea: string): string {
  const segment = Array.from(
    Array.from(lifeArea.normalize('NFC'))
      .map((character) => {
        const codePoint = character.codePointAt(0)!;
        return codePoint < 32 || codePoint === 127 ? '-' : character;
      })
      .join('')
      .replace(/[<>:"/\\|?*]/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^[ .-]+|[ .-]+$/gu, ''),
  )
    .slice(0, 64)
    .join('');
  return segment === '' ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(segment)
    ? 'Area'
    : segment;
}

export function createStudioService(
  dependencies: StudioServiceDependencies,
): StudioService {
  const clock = dependencies.clock ?? (() => new Date());
  const generateId =
    dependencies.generateId ?? (() => createNoteId(clock().valueOf()));
  const timers = dependencies.timers ?? defaultTimers;
  const views = createViewStateRepository(dependencies.vault);
  const lifeAreas =
    dependencies.lifeAreas ?? createLifeAreaRepository(dependencies.vault);
  const wisdomThemes = createWisdomThemeRepository(dependencies.vault);
  const rhythmProfile = createRhythmProfileRepository(dependencies.vault);
  const preferences = createStudioPreferencesRepository(dependencies.vault);
  const onboarding = createOnboardingSettingsRepository(dependencies.vault);
  const revisions =
    dependencies.revisions ??
    createRevisionStore(dependencies.vault, { clock });
  const seasonTransactions = createSeasonTransactionStore(dependencies.vault);
  const seasonCloseTransactions = createSeasonCloseTransactionService({
    vault: dependencies.vault,
    control: createStudioControlVault(dependencies.vault),
    revisions,
    clock,
  });
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
  const pendingWatchEvents: Array<{
    event: VaultChange;
    writeGeneration?: number;
  }> = [];
  const selfPublications = new Map<
    string,
    { hash: string; generation: number; expiresAt: number }
  >();
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
    indexMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function enqueueDurableMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = durableMutationTail.then(mutation);
    durableMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function scan(): Promise<{
    notes: LoadedNote[];
    repairs: StudioRepairItem[];
  }> {
    const entries = (await dependencies.vault.list())
      .filter(
        (entry) =>
          entry.kind === 'file' &&
          entry.path.toLocaleLowerCase('en').endsWith('.md') &&
          !isInternalPath(entry.path),
      )
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
        repairs.push({
          path: entry.path,
          errors: parsed.errors,
          rawBody: parsed.rawBody,
        });
      } else if (ids.has(parsed.note.id)) {
        repairs.push({
          path: entry.path,
          errors: [
            {
              code: 'invalid-frontmatter',
              message: `Duplicate note id: ${parsed.note.id}`,
              path: 'id',
            },
          ],
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
    if (
      disposed ||
      recoveryScheduled ||
      recoveryAttempt >= RECOVERY_DELAYS.length
    )
      return;
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
    if (disposed)
      return Promise.reject(
        new Error('This Studio service has been disposed.'),
      );
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

  function recordSelfPublication(
    path: string,
    hash: string,
    generation: number,
  ): void {
    selfPublications.set(path, {
      hash,
      generation,
      expiresAt: Date.now() + SELF_EVENT_TTL,
    });
  }

  function consumeSelfPublication(
    event: VaultChange,
    generation?: number,
  ): boolean {
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
    )
      return false;
    selfPublications.delete(event.path);
    return true;
  }

  function canReturnToReady(): boolean {
    return (
      !rebuildRequired &&
      pendingWatchEvents.length === 0 &&
      indexedGeneration === durableGeneration &&
      reconciledExternalGeneration === externalGeneration
    );
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
          if (
            activeWriteGenerations
              .get(item.event.path)
              ?.has(item.writeGeneration)
          ) {
            pendingWatchEvents.push(item);
            hasDeferredEvent = true;
            continue;
          }
          if (consumeSelfPublication(item.event, item.writeGeneration))
            continue;
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
    const savedNote: StudioNote = {
      ...input.note,
      ...(input.note.landscapeAnchor === undefined
        ? {}
        : {
            semanticType: semanticTypeForLandscapeAnchor(
              input.note.landscapeAnchor,
            ),
          }),
      updated: iso(clock),
    };
    const serialized = validateAndSerialize(savedNote);
    const writeGeneration = (pathWriteGenerations.get(input.path) ?? 0) + 1;
    pathWriteGenerations.set(input.path, writeGeneration);
    selfPublications.delete(input.path);
    const active = activeWriteGenerations.get(input.path) ?? new Set<number>();
    active.add(writeGeneration);
    activeWriteGenerations.set(input.path, active);
    let written: { hash: string };
    try {
      written = await dependencies.vault.writeTextAtomic(
        input.path,
        serialized,
        {
          ...(input.expectedHash === undefined
            ? {}
            : { expectedHash: input.expectedHash }),
          ...(input.expectedMissing === undefined
            ? {}
            : { expectedMissing: input.expectedMissing }),
        },
      );
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      let durableText = '';
      try {
        durableText = (await dependencies.vault.readText(input.path)).text;
      } catch {
        // The attempted note remains attached to the conflict even if the other writer removed it.
      }
      throw new StudioSaveConflictError(savedNote, durableText, {
        cause: error,
      });
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
    if (disposed)
      return Promise.reject(
        new Error('This Studio service has been disposed.'),
      );
    return enqueueDurableMutation(() => performSave(input));
  }

  async function readNote(path: string): Promise<SavedNote & { text: string }> {
    const file = await dependencies.vault.readText(path);
    const parsed = parseNote(file.text);
    if (!parsed.ok)
      throw new Error(`The note at ${path} needs metadata repair.`);
    return { note: parsed.note, path, hash: file.hash, text: file.text };
  }

  async function loadNote(path: string): Promise<SavedNote> {
    const loaded = await readNote(path);
    return { note: loaded.note, path: loaded.path, hash: loaded.hash };
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

  function finishSeasonClose<T>(operation: () => Promise<T>): Promise<T> {
    assertActive();
    return enqueueDurableMutation(async () => {
      try {
        return await operation();
      } finally {
        durableGeneration += 1;
        markIndexStale();
        try {
          await rebuildIndex();
        } catch {
          scheduleRecovery();
        }
      }
    });
  }

  const service: StudioService = {
    views,
    lifeAreas,
    wisdomThemes,
    rhythmProfile,
    preferences,
    index: dependencies.index,
    onboarding,
    seasonTransactions,

    start() {
      if (disposed)
        return Promise.reject(
          new Error('This Studio service has been disposed.'),
        );
      if (stopWatching !== undefined) return Promise.resolve();
      if (startPromise !== undefined) return startPromise;
      const generation = lifecycleGeneration;
      const pending = dependencies.vault
        .watch((event) => {
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
        })
        .then((stop) => {
          if (generation !== lifecycleGeneration) {
            stop();
            return;
          }
          stopWatching = stop;
        });
      startPromise = pending;
      void pending.then(
        () => {
          if (startPromise === pending) startPromise = undefined;
        },
        () => {
          if (startPromise === pending) startPromise = undefined;
        },
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
      return () => {
        listeners.delete(listener);
      };
    },

    async capture(input) {
      assertActive();
      const body = input.body.trim();
      if (body === '') throw new Error('Write something to remember first.');
      validateStructuredCapture(input);
      if (
        input.decisionHorizon !== undefined &&
        (!isDecisionHorizon(input.decisionHorizon) ||
          input.landscape?.anchor !== 'decisions')
      ) {
        throw new Error(
          'Decision horizons can only be used with the Decisions anchor.',
        );
      }
      if (
        input.unchartedHorizon !== undefined &&
        (input.placement !== 'uncharted' ||
          (input.unchartedHorizon !== 'near' &&
            input.unchartedHorizon !== 'beyond'))
      ) {
        throw new Error(
          'An Uncharted horizon can only classify an Uncharted capture.',
        );
      }
      const created = iso(clock);
      const placement =
        input.placement === undefined
          ? undefined
          : capturePlacementMetadata(input.placement);
      const landscapeMetadata =
        input.landscape === undefined
          ? undefined
          : landscapeAnchorMetadata(input.landscape.anchor);
      const identityMetadata =
        input.identitySection === undefined
          ? undefined
          : identitySectionDefinition(input.identitySection);
      const wisdomMetadata =
        input.wisdom === undefined
          ? undefined
          : {
              cardType: input.wisdom.kind,
              semanticType: semanticTypeForWisdomKind(input.wisdom.kind),
            };
      let lastConflict: StudioSaveConflictError | undefined;
      for (let attempt = 0; attempt < CAPTURE_ATTEMPTS; attempt += 1) {
        const note: StudioNote = {
          schemaVersion: 1,
          id: generateId(),
          ...(input.title?.trim() ? { title: input.title.trim() } : {}),
          body,
          cardType:
            placement?.cardType ??
            landscapeMetadata?.cardType ??
            identityMetadata?.cardType ??
            wisdomMetadata?.cardType ??
            'capture',
          semanticType:
            placement?.semanticType ??
            landscapeMetadata?.semanticType ??
            identityMetadata?.semanticType ??
            wisdomMetadata?.semanticType ??
            input.semanticType ??
            'reflection',
          status:
            placement === undefined &&
            input.landscape === undefined &&
            input.identitySection === undefined &&
            input.wisdom === undefined
              ? 'draft'
              : 'active',
          rooms:
            placement === undefined
              ? input.landscape
                ? ['life-landscape']
                : input.identitySection
                  ? ['identity-studio']
                  : input.wisdom
                    ? ['wisdom-garden']
                    : ['inbox']
              : [...placement.rooms],
          lifeAreas: input.landscape ? [input.landscape.lifeArea] : [],
          ...(input.landscape
            ? { landscapeAnchor: input.landscape.anchor }
            : {}),
          seasons: [],
          tags: input.wisdom?.themes ?? [],
          created,
          updated: created,
          attachments: [],
          display: { featured: placement !== undefined },
          privacy: { sensitivity: 'private', aiAccess: 'ask' },
          extraFrontmatter: {
            ...(input.decisionHorizon === undefined
              ? {}
              : { decision_horizon: input.decisionHorizon }),
            ...(input.unchartedHorizon === 'beyond'
              ? { beyond_gate: true }
              : {}),
          },
          lineEnding: '\n',
        };
        if (input.wisdom?.source !== undefined)
          note.source = input.wisdom.source;
        if (input.wisdom?.sourceNoteIds !== undefined)
          note.sourceNoteIds = [...new Set(input.wisdom.sourceNoteIds)];
        try {
          return await save({
            note,
            path:
              input.landscape === undefined
                ? `${
                    placement?.folder ??
                    (input.identitySection
                      ? 'Identity Studio'
                      : input.wisdom
                        ? 'Wisdom Garden'
                        : 'Inbox')
                  }/${suggestFilename(note)}`
                : `Life Landscape/${portableLifeAreaFolder(input.landscape.lifeArea)}/${suggestFilename(note)}`,
            expectedMissing: true,
          });
        } catch (error) {
          if (!(error instanceof StudioSaveConflictError)) throw error;
          lastConflict = error;
        }
      }
      throw new Error(
        'A unique capture path could not be reserved. Please try again.',
        {
          cause: lastConflict,
        },
      );
    },

    async load(path) {
      assertActive();
      return loadNote(path);
    },
    async resolveCover(path) {
      assertActive();
      const loaded = await loadNote(path);
      return resolveCoverMedia(
        dependencies.vault,
        path,
        loaded.note.display.cover,
      );
    },
    clearCover(path, expectedHash) {
      if (disposed)
        return Promise.reject(
          new Error('This Studio service has been disposed.'),
        );
      return enqueueDurableMutation(async () => {
        const loaded = await readNote(path);
        const clearedNote: StudioNote = {
          ...loaded.note,
          display: { featured: loaded.note.display.featured },
        };
        if (loaded.hash !== expectedHash) {
          throw new StudioSaveConflictError(clearedNote, loaded.text, {
            cause: new VaultConflictError(),
          });
        }
        if (loaded.note.display.cover === undefined) {
          return { note: loaded.note, path: loaded.path, hash: loaded.hash };
        }
        return performSave({ note: clearedNote, path, expectedHash });
      });
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
        (result) => ({
          kind: 'note-unarchived',
          noteId: id,
          path: result.path,
        }),
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
        (result) =>
          result.kind === 'restored'
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
    prepareSeasonCloseTransaction(request) {
      assertActive();
      return enqueueDurableMutation(() =>
        seasonCloseTransactions.prepare(request),
      );
    },
    pendingSeasonCloseTransaction() {
      assertActive();
      return seasonCloseTransactions.pending();
    },
    closeSeasonTransaction(request) {
      return finishSeasonClose(() => seasonCloseTransactions.close(request));
    },
    resumeSeasonCloseTransaction() {
      return finishSeasonClose(() => seasonCloseTransactions.resume());
    },
    async repairs() {
      assertActive();
      return (await scan()).repairs;
    },
    rebuildIndex,
    indexState() {
      return state;
    },
    async projectRoom(room) {
      assertActive();
      return projectRoom((await scan()).notes, room, views);
    },
    async projectLandscape(query) {
      assertActive();
      return projectLandscape((await scan()).notes, query, views);
    },
    async projectLandscapeBoard(lifeAreas) {
      assertActive();
      return projectLandscapeBoard((await scan()).notes, lifeAreas, views);
    },
    async updateLandscapePlacement(input) {
      assertActive();
      const loaded = await loadNote(input.path);
      const metadata = landscapeAnchorMetadata(input.anchor);
      const extraFrontmatter =
        input.anchor === 'decisions'
          ? loaded.note.extraFrontmatter
          : removeDecisionOnlyFrontmatter(loaded.note.extraFrontmatter);
      return save({
        path: loaded.path,
        expectedHash: input.expectedHash,
        note: {
          ...loaded.note,
          ...metadata,
          extraFrontmatter,
          lifeAreas: [...new Set(input.lifeAreas)],
          landscapeAnchor: input.anchor,
          updated: clock().toISOString(),
        },
      });
    },
    async projectUncharted() {
      assertActive();
      return projectUnchartedRoom((await scan()).notes, views);
    },
    async inviteUnchartedToSeason(input) {
      assertActive();
      const seasonId = input.seasonId.trim();
      if (seasonId === '')
        throw new Error('Choose a season to invite this into.');
      const loaded = await loadNote(input.path);
      if (loaded.note.semanticType !== 'uncharted') {
        throw new Error(
          'Only an Uncharted possibility can be invited into a season.',
        );
      }
      return save({
        path: loaded.path,
        expectedHash: input.expectedHash,
        note: {
          ...loaded.note,
          seasons: [...new Set([...loaded.note.seasons, seasonId])],
        },
      });
    },
    async projectReflectionGarden() {
      assertActive();
      const [scanned, lifeAreaSnapshot] = await Promise.all([
        scan(),
        lifeAreas.load(),
      ]);
      return projectReflectionGardenRoom(
        scanned.notes,
        views,
        lifeAreaSnapshot.areas,
      );
    },
    async resolveReflectionEvidenceTarget(target) {
      assertActive();
      const [scanned, lifeAreaSnapshot] = await Promise.all([
        scan(),
        lifeAreas.load(),
      ]);
      return resolveReflectionEvidenceTarget(
        target,
        scanned.notes,
        lifeAreaSnapshot.areas,
      );
    },
    async linkReflectionEvidence(input) {
      assertActive();
      const loaded = await loadNote(input.path);
      if (
        loaded.note.semanticType !== 'reflection' &&
        loaded.note.semanticType !== 'celebration'
      ) {
        throw new Error(
          'Evidence links belong to a reflection or celebration.',
        );
      }
      const existingRelated = Array.isArray(
        loaded.note.extraFrontmatter.related_notes,
      )
        ? loaded.note.extraFrontmatter.related_notes.filter(
            (item): item is string =>
              typeof item === 'string' && item.trim() !== '',
          )
        : [];
      const unique = (items: readonly string[]) => [
        ...new Set(items.map((item) => item.trim()).filter(Boolean)),
      ];
      return save({
        path: loaded.path,
        expectedHash: input.expectedHash,
        note: {
          ...loaded.note,
          lifeAreas: unique([
            ...loaded.note.lifeAreas,
            ...(input.lifeAreas ?? []),
          ]),
          seasons: unique([...loaded.note.seasons, ...(input.seasons ?? [])]),
          extraFrontmatter: {
            ...loaded.note.extraFrontmatter,
            related_notes: unique([
              ...existingRelated,
              ...(input.noteIds ?? []),
            ]),
          },
        },
      });
    },
    async projectCurrentSeason() {
      assertActive();
      return projectCurrentSeason((await scan()).notes);
    },
    async projectStream(type) {
      assertActive();
      return projectStream((await scan()).notes, type, views);
    },
    async projectFoyer() {
      assertActive();
      return projectFoyer((await scan()).notes, views);
    },
    async projectIdentityStudio() {
      assertActive();
      return projectIdentityStudioRoom((await scan()).notes, views);
    },
    async promoteIdentity(noteId) {
      assertActive();
      const projection = await projectIdentityStudioRoom(
        (await scan()).notes,
        views,
      );
      const eligible = projection.sections['practicing-now'].some(
        (card) => card.noteId === noteId,
      );
      if (!eligible)
        throw new Error('Choose an identity you are currently practicing.');
      const existing = await views.load('identity:currently-becoming');
      const ordered = [noteId, ...existing.filter((id) => id !== noteId)];
      await views.save('identity:currently-becoming', ordered);
    },
    async reorderIdentity(section, noteIds) {
      assertActive();
      const projection = await projectIdentityStudioRoom(
        (await scan()).notes,
        views,
      );
      const eligible = new Set(
        projection.sections[section].map((card) => card.noteId),
      );
      if (noteIds.some((id) => !eligible.has(id)))
        throw new Error(
          'Identity order may only include cards from this section.',
        );
      await views.save(`identity:${section}`, noteIds);
    },
    async projectWisdomGarden() {
      assertActive();
      return projectWisdomGardenRoom((await scan()).notes, views);
    },
  };
  return service;
}
