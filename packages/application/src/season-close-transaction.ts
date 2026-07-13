import { parseNote, serializeNote, suggestFilename } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import {
  VaultConflictError,
  type RevisionSnapshot,
  type RevisionStore,
  type StudioControlVault,
  type VaultPort,
} from '@studio/storage/portable';

import type { SavedNote } from './studio-service';

const JOURNAL_PATH = '.studio/season/close-journal.json';

export type SeasonDisposition =
  'celebrate' | 'archive' | 'return-landscape' | 'invite-forward' | 'release';

export interface SeasonCloseRequest {
  transactionId: string;
  season: SavedNote;
  closedSeasonNote: StudioNote;
  priorityIds: string[];
  reflection: {
    celebration: string;
    learning: string;
    identity: string;
  };
  dispositions: Array<{
    noteId: string;
    disposition: SeasonDisposition;
    expectedHash: string;
  }>;
  letter: StudioNote;
}

export interface SeasonCloseResult {
  season: SavedNote;
  snapshot: RevisionSnapshot;
}

export type SeasonCloseJournalStage =
  | 'prepared'
  | 'snapshotted'
  | 'letter-written'
  | 'applying-targets'
  | 'season-archived'
  | 'completed';

export interface PendingSeasonClose {
  transactionId: string;
  seasonNoteId: string;
  seasonPath: string;
  stage: SeasonCloseJournalStage;
}

export interface SeasonCloseTransactionService {
  prepare(request: SeasonCloseRequest): Promise<void>;
  pending(): Promise<PendingSeasonClose | null>;
  close(request: SeasonCloseRequest): Promise<SeasonCloseResult>;
  resume(): Promise<SeasonCloseResult | null>;
}

export interface SeasonCloseTransactionDependencies {
  vault: VaultPort;
  control: StudioControlVault;
  revisions: RevisionStore;
  clock?: () => Date;
}

export class SeasonClosePreflightError extends Error {
  override readonly name = 'SeasonClosePreflightError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class SeasonCloseTransactionConflictError extends Error {
  override readonly name = 'SeasonCloseTransactionConflictError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

interface CloseTarget {
  noteId: string;
  path: string;
  hash: string;
  note: StudioNote;
  disposition: SeasonDisposition;
  state: 'pending' | 'complete';
  outputPath?: string;
  outputHash?: string;
}

interface CloseJournal {
  version: 1;
  transactionId: string;
  stage: SeasonCloseJournalStage;
  preparedAt: string;
  season: SavedNote;
  closedSeasonNote: StudioNote;
  reflection: SeasonCloseRequest['reflection'];
  priorityIds: string[];
  snapshotBaseline: string[];
  targets: CloseTarget[];
  letter: { note: StudioNote; path: string; hash?: string };
  snapshot?: RevisionSnapshot;
  archivedSeasonHash?: string;
}

interface LoadedJournal {
  journal: CloseJournal;
  hash: string;
}

function normalizedReflection(
  reflection: SeasonCloseRequest['reflection'],
): SeasonCloseRequest['reflection'] {
  const normalized = {
    celebration: reflection.celebration.trim(),
    learning: reflection.learning.trim(),
    identity: reflection.identity.trim(),
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (value === '')
      throw new SeasonClosePreflightError(
        `The ${field} reflection is required before closing this season.`,
      );
  }
  return normalized;
}

function isPotentialNotePath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

function assertRequestShape(request: SeasonCloseRequest): void {
  const priorities = new Set(request.priorityIds);
  const dispositionIds = request.dispositions.map((item) => item.noteId);
  if (
    priorities.size !== request.priorityIds.length ||
    dispositionIds.length !== request.priorityIds.length ||
    new Set(dispositionIds).size !== dispositionIds.length ||
    dispositionIds.some((id) => !priorities.has(id))
  ) {
    throw new SeasonClosePreflightError(
      'Choose exactly one disposition for every priority before closing the season.',
    );
  }
  if (request.season.note.status !== 'active')
    throw new SeasonClosePreflightError(
      'Only the active season can be closed.',
    );
  if (
    request.closedSeasonNote.id !== request.season.note.id ||
    request.closedSeasonNote.status !== 'archived'
  ) {
    throw new SeasonClosePreflightError(
      'The archived season result does not match the active season.',
    );
  }
  normalizedReflection(request.reflection);
}

function canonicalPriorityIds(note: StudioNote): string[] {
  const value = note.extraFrontmatter.priorities;
  if (
    !Array.isArray(value) ||
    !value.every((id) => typeof id === 'string' && id !== '') ||
    new Set(value).size !== value.length
  ) {
    throw new SeasonClosePreflightError(
      'The canonical season priorities are missing or malformed. Repair the season before closing it.',
    );
  }
  return value as string[];
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

async function canonicalNotes(vault: VaultPort): Promise<{
  byId: Map<string, SavedNote[]>;
  corrupt: string[];
}> {
  const byId = new Map<string, SavedNote[]>();
  const corrupt: string[] = [];
  const entries = (await vault.list()).filter(
    (entry) =>
      entry.kind === 'file' &&
      !entry.path.toLocaleLowerCase('en').startsWith('.studio/') &&
      isPotentialNotePath(entry.path),
  );
  for (const entry of entries) {
    const file = await vault.readText(entry.path);
    const parsed = parseNote(file.text);
    if (!parsed.ok) {
      corrupt.push(entry.path);
      continue;
    }
    const matches = byId.get(parsed.note.id) ?? [];
    matches.push({ note: parsed.note, path: entry.path, hash: file.hash });
    byId.set(parsed.note.id, matches);
  }
  return { byId, corrupt };
}

function exactCanonical(
  canonical: Awaited<ReturnType<typeof canonicalNotes>>,
  id: string,
): SavedNote {
  const matches = canonical.byId.get(id) ?? [];
  if (matches.length === 0)
    throw new SeasonClosePreflightError(
      `The priority ${id} is missing. Repair it before closing the season.`,
    );
  if (matches.length > 1)
    throw new SeasonClosePreflightError(
      `Multiple canonical notes use priority id ${id}. Repair the duplicate before closing.`,
    );
  return matches[0]!;
}

function journalText(journal: CloseJournal): string {
  return `${JSON.stringify(journal, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeUserPath(path: unknown): path is string {
  if (
    typeof path !== 'string' ||
    path === '' ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    /^[A-Za-z]:/u.test(path)
  ) {
    return false;
  }
  return path.split('/').every((segment) => {
    const folded = segment.toLocaleLowerCase('en');
    return (
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      folded !== '.studio' &&
      !folded.startsWith('.studio-')
    );
  });
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function snapshotRoot(createdAt: string, id: string): string {
  return `.studio/backups/${createdAt.slice(0, 10)}/${createdAt
    .replaceAll(':', '-')
    .replace('.', '-')}--${encodeURIComponent(id)}`;
}

function expectedSnapshotFiles(journal: CloseJournal): Map<string, string> {
  return new Map([
    [journal.season.path, journal.season.hash],
    ...journal.targets.map(
      (target) => [target.path, target.hash] as const,
    ),
  ]);
}

function parseRevisionSnapshot(value: unknown): RevisionSnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !isRecord(value.manifest) ||
    Object.keys(value.manifest).length !== 6 ||
    value.manifest.version !== 1 ||
    typeof value.manifest.id !== 'string' ||
    value.manifest.id === '' ||
    value.manifest.reason !== 'season-close' ||
    !isTimestamp(value.manifest.createdAt) ||
    value.manifest.state !== 'complete' ||
    !Array.isArray(value.manifest.files) ||
    typeof value.manifestPath !== 'string'
  ) {
    return null;
  }
  const root = snapshotRoot(value.manifest.createdAt, value.manifest.id);
  if (value.manifestPath !== `${root}/manifest.json`) return null;
  const originals = new Set<string>();
  const snapshots = new Set<string>();
  for (const file of value.manifest.files) {
    if (
      !isRecord(file) ||
      Object.keys(file).length !== 3 ||
      !isSafeUserPath(file.originalPath) ||
      file.snapshotPath !== `${root}/files/${file.originalPath}` ||
      !isHash(file.hash) ||
      originals.has(file.originalPath) ||
      snapshots.has(file.snapshotPath as string)
    ) {
      return null;
    }
    originals.add(file.originalPath);
    snapshots.add(file.snapshotPath as string);
  }
  return value as unknown as RevisionSnapshot;
}

async function verifyRevisionSnapshot(
  control: StudioControlVault,
  candidate: unknown,
  journal: CloseJournal,
): Promise<RevisionSnapshot | null> {
  const returned = parseRevisionSnapshot(candidate);
  if (returned === null) return null;
  const expected = expectedSnapshotFiles(journal);
  if (
    returned.manifest.files.length !== expected.size ||
    returned.manifest.files.some(
      (file) => expected.get(file.originalPath) !== file.hash,
    )
  ) {
    return null;
  }
  let manifestFile: Awaited<ReturnType<StudioControlVault['readText']>>;
  try {
    manifestFile = await control.readText(returned.manifestPath);
  } catch {
    return null;
  }
  let durable: RevisionSnapshot | null = null;
  try {
    durable = parseRevisionSnapshot({
      manifest: JSON.parse(manifestFile.text) as unknown,
      manifestPath: returned.manifestPath,
    });
  } catch {
    return null;
  }
  if (
    durable === null ||
    JSON.stringify(durable.manifest) !== JSON.stringify(returned.manifest)
  ) {
    return null;
  }
  const root = returned.manifestPath.slice(0, -'/manifest.json'.length);
  const expectedControlPaths = new Set([
    returned.manifestPath,
    ...returned.manifest.files.map((file) => file.snapshotPath),
  ]);
  let entries: Awaited<ReturnType<StudioControlVault['list']>>;
  try {
    entries = (await control.list(root)).filter(
      (entry) => entry.kind === 'file',
    );
  } catch {
    return null;
  }
  if (
    entries.length !== expectedControlPaths.size ||
    entries.some((entry) => !expectedControlPaths.has(entry.path))
  ) {
    return null;
  }
  for (const file of returned.manifest.files) {
    try {
      const bytes = await control.readBinary(file.snapshotPath);
      if ((await sha256(bytes)) !== file.hash) return null;
    } catch {
      return null;
    }
  }
  return returned;
}

async function discoverRevisionSnapshot(
  control: StudioControlVault,
  journal: CloseJournal,
): Promise<RevisionSnapshot | null> {
  const entries = await control.list('.studio/backups');
  const matches: RevisionSnapshot[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.path.endsWith('/manifest.json'))
      continue;
    try {
      const manifest = JSON.parse((await control.readText(entry.path)).text) as unknown;
      const verified = await verifyRevisionSnapshot(
        control,
        { manifest, manifestPath: entry.path },
        journal,
      );
      if (
        verified !== null &&
        !journal.snapshotBaseline.includes(entry.path)
      )
        matches.push(verified);
    } catch {
      // A malformed or transient snapshot is never selected for recovery.
    }
  }
  if (matches.length > 1) {
    throw new SeasonCloseTransactionConflictError(
      'More than one matching season-close snapshot exists. Preserve them for explicit repair.',
    );
  }
  return matches[0] ?? null;
}

function isStudioNote(value: unknown): value is StudioNote {
  if (!isRecord(value)) return false;
  try {
    return parseNote(serializeNote(value as unknown as StudioNote)).ok;
  } catch {
    return false;
  }
}

function validJournal(value: unknown): value is CloseJournal {
  if (!isRecord(value)) return false;
  const stages = new Set<CloseJournal['stage']>([
    'prepared',
    'snapshotted',
    'letter-written',
    'applying-targets',
    'season-archived',
    'completed',
  ]);
  const dispositions = new Set<SeasonDisposition>([
    'celebrate',
    'archive',
    'return-landscape',
    'invite-forward',
    'release',
  ]);
  if (
    value.version !== 1 ||
    typeof value.transactionId !== 'string' ||
    value.transactionId === '' ||
    !stages.has(value.stage as CloseJournal['stage']) ||
    !isTimestamp(value.preparedAt) ||
    !isRecord(value.season) ||
    !isStudioNote(value.season.note) ||
    !isSafeUserPath(value.season.path) ||
    !isHash(value.season.hash) ||
    !isStudioNote(value.closedSeasonNote) ||
    value.closedSeasonNote.id !== value.season.note.id ||
    value.closedSeasonNote.status !== 'archived' ||
    !isRecord(value.reflection) ||
    typeof value.reflection.celebration !== 'string' ||
    typeof value.reflection.learning !== 'string' ||
    typeof value.reflection.identity !== 'string' ||
    !Array.isArray(value.priorityIds) ||
    !value.priorityIds.every((id) => typeof id === 'string' && id !== '') ||
    new Set(value.priorityIds).size !== value.priorityIds.length ||
    !Array.isArray(value.snapshotBaseline) ||
    !value.snapshotBaseline.every(
      (path) =>
        typeof path === 'string' &&
        path.toLocaleLowerCase('en').startsWith('.studio/backups/') &&
        path.endsWith('/manifest.json'),
    ) ||
    new Set(value.snapshotBaseline).size !== value.snapshotBaseline.length ||
    !Array.isArray(value.targets) ||
    !isRecord(value.letter) ||
    !isStudioNote(value.letter.note) ||
    !isSafeUserPath(value.letter.path)
  ) {
    return false;
  }
  const journal = value as unknown as CloseJournal;
  if (
    journal.targets.length !== journal.priorityIds.length ||
    journal.targets.some(
      (target) =>
        !isRecord(target) ||
        typeof target.noteId !== 'string' ||
        target.noteId === '' ||
        !isSafeUserPath(target.path) ||
        !isHash(target.hash) ||
        !isStudioNote(target.note) ||
        target.note.id !== target.noteId ||
        !dispositions.has(target.disposition) ||
        (target.state !== 'pending' && target.state !== 'complete') ||
        (target.state === 'complete' &&
          (!isSafeUserPath(target.outputPath) || !isHash(target.outputHash))),
    ) ||
    new Set(journal.targets.map((target) => target.noteId)).size !==
      journal.targets.length ||
    journal.targets.some(
      (target) => !journal.priorityIds.includes(target.noteId),
    )
  ) {
    return false;
  }
  const afterSnapshot = journal.stage !== 'prepared';
  const afterLetter = !['prepared', 'snapshotted'].includes(journal.stage);
  const afterTargets = ['season-archived', 'completed'].includes(journal.stage);
  const afterSeason = journal.stage === 'completed';
  return (
    (!afterSnapshot ||
      (isRecord(journal.snapshot) &&
        isRecord(journal.snapshot.manifest) &&
        typeof journal.snapshot.manifestPath === 'string' &&
        journal.snapshot.manifestPath
          .toLocaleLowerCase('en')
          .startsWith('.studio/backups/'))) &&
    (!afterLetter || isHash(journal.letter.hash)) &&
    (!afterTargets ||
      (journal.targets.every((target) => target.state === 'complete') &&
        isHash(journal.archivedSeasonHash))) &&
    (!afterSeason || isHash(journal.archivedSeasonHash))
  );
}

function parseJournal(text: string): CloseJournal {
  try {
    const value: unknown = JSON.parse(text);
    if (!validJournal(value)) throw new Error('invalid shape');
    return value;
  } catch (error) {
    throw new SeasonCloseTransactionConflictError(
      'The season-close checkpoint is unreadable. Preserve it for explicit repair.',
      { cause: error },
    );
  }
}

async function loadJournal(
  control: StudioControlVault,
): Promise<LoadedJournal | null> {
  if (!(await control.exists(JOURNAL_PATH))) return null;
  const file = await control.readText(JOURNAL_PATH);
  return { journal: parseJournal(file.text), hash: file.hash };
}

function outcomeMetadata(
  note: StudioNote,
  journal: CloseJournal,
  disposition: SeasonDisposition,
): Record<string, unknown> {
  return {
    ...note.extraFrontmatter,
    season_outcome: {
      season_id: journal.season.note.id,
      transaction_id: journal.transactionId,
      disposition,
      closed_at: journal.preparedAt,
    },
  };
}

function outcomeNote(journal: CloseJournal, target: CloseTarget): StudioNote {
  const common = {
    ...target.note,
    updated: journal.preparedAt,
    extraFrontmatter: outcomeMetadata(target.note, journal, target.disposition),
  };
  if (target.disposition === 'archive')
    return { ...common, status: 'archived' };
  if (target.disposition === 'release') {
    return {
      ...common,
      status: 'resting',
      rooms: common.rooms.filter(
        (room) => room !== 'current-season' && room !== 'foyer',
      ),
      seasons: common.seasons.filter(
        (season) => season !== journal.season.note.id,
      ),
    };
  }
  return {
    ...common,
    status: 'active',
    rooms: [...new Set([...common.rooms, 'life-landscape'])],
  };
}

function artifactNote(journal: CloseJournal, target: CloseTarget): StudioNote {
  const celebration = target.disposition === 'celebrate';
  const id = `${journal.transactionId}-${target.noteId}-${celebration ? 'celebration' : 'invitation'}`;
  return {
    schemaVersion: 1,
    id,
    title: celebration
      ? `Celebrating ${target.note.title ?? 'this season thread'}`
      : `Invitation: ${target.note.title ?? 'season thread'}`,
    body: celebration
      ? `[[${target.noteId}]]\n\n${journal.reflection.celebration}\n`
      : `[[${target.noteId}]]\n\nThis thread is invited to be considered for a future season. It has not been carried forward automatically.\n`,
    cardType: celebration ? 'season-celebration' : 'season-invitation',
    semanticType: celebration ? 'celebration' : 'growth',
    status: celebration ? 'active' : 'resting',
    rooms: celebration ? ['reflection-garden'] : ['current-season'],
    lifeAreas: [],
    seasons: [journal.season.note.id],
    tags: [celebration ? 'season-celebration' : 'season-invitation'],
    created: journal.preparedAt,
    updated: journal.preparedAt,
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: {
      season_id: journal.season.note.id,
      target_note_id: target.noteId,
      transaction_id: journal.transactionId,
      disposition: target.disposition,
    },
    lineEnding: '\n',
  };
}

async function writeNoteIdempotently(
  vault: VaultPort,
  path: string,
  note: StudioNote,
  condition: { expectedHash?: string; expectedMissing?: true },
): Promise<string> {
  const text = serializeNote(note);
  try {
    return (await vault.writeTextAtomic(path, text, condition)).hash;
  } catch (error) {
    if (!(error instanceof VaultConflictError)) throw error;
    const current = await vault.readText(path).catch(() => null);
    if (current?.text === text) return current.hash;
    throw new SeasonCloseTransactionConflictError(
      `The pinned note at ${path} changed during season close. The journal remains available for repair.`,
      { cause: error },
    );
  }
}

async function assertPinnedOutput(
  vault: VaultPort,
  path: string,
  hash: string,
  note: StudioNote,
  label: string,
): Promise<void> {
  const current = await vault.readText(path).catch(() => null);
  if (
    current === null ||
    current.hash !== hash ||
    current.text !== serializeNote(note)
  ) {
    throw new SeasonCloseTransactionConflictError(
      `The completed ${label} no longer matches its pinned checkpoint. Preserve both versions for repair.`,
    );
  }
}

async function verifyCompletedOutputs(
  vault: VaultPort,
  journal: CloseJournal,
): Promise<void> {
  if (
    !['prepared', 'snapshotted'].includes(journal.stage)
  ) {
    await assertPinnedOutput(
      vault,
      journal.letter.path,
      journal.letter.hash!,
      journal.letter.note,
      'season letter',
    );
  }
  for (const target of journal.targets) {
    if (target.state !== 'complete') continue;
    const artifact =
      target.disposition === 'celebrate' ||
      target.disposition === 'invite-forward';
    await assertPinnedOutput(
      vault,
      target.outputPath!,
      target.outputHash!,
      artifact ? artifactNote(journal, target) : outcomeNote(journal, target),
      `priority output ${target.noteId}`,
    );
  }
  if (journal.stage === 'season-archived' || journal.stage === 'completed') {
    await assertPinnedOutput(
      vault,
      journal.season.path,
      journal.archivedSeasonHash!,
      journal.closedSeasonNote,
      'archived season',
    );
  }
}

export function createSeasonCloseTransactionService({
  vault,
  control,
  revisions,
  clock = () => new Date(),
}: SeasonCloseTransactionDependencies): SeasonCloseTransactionService {
  async function checkpoint(
    loaded: LoadedJournal,
    journal: CloseJournal,
  ): Promise<LoadedJournal> {
    const written = await control.writeTextAtomic(
      JOURNAL_PATH,
      journalText(journal),
      { expectedHash: loaded.hash },
    );
    return { journal, hash: written.hash };
  }

  async function prepareJournal(
    request: SeasonCloseRequest,
    existing: LoadedJournal | null,
  ): Promise<LoadedJournal> {
    assertRequestShape(request);
    const canonical = await canonicalNotes(vault);
    if (canonical.corrupt.length > 0) {
      throw new SeasonClosePreflightError(
        `Unreadable canonical note metadata at: ${canonical.corrupt.join(', ')}. Repair it before closing.`,
      );
    }
    const durableSeason = exactCanonical(canonical, request.season.note.id);
    if (
      durableSeason.path !== request.season.path ||
      durableSeason.hash !== request.season.hash
    ) {
      throw new SeasonClosePreflightError(
        'The active season changed before close began. Refresh and review it again.',
      );
    }
    const durablePriorities = canonicalPriorityIds(durableSeason.note);
    if (!sameStringSet(durablePriorities, request.priorityIds)) {
      throw new SeasonClosePreflightError(
        'The requested priorities do not exactly match the canonical season priorities. Refresh and review the season before closing it.',
      );
    }
    const targets = request.dispositions.map((item): CloseTarget => {
      const target = exactCanonical(canonical, item.noteId);
      if (target.hash !== item.expectedHash) {
        throw new SeasonClosePreflightError(
          `The priority ${target.note.title ?? item.noteId} changed before close began. Refresh and review it again.`,
        );
      }
      return {
        noteId: item.noteId,
        path: target.path,
        hash: target.hash,
        note: target.note,
        disposition: item.disposition,
        state: 'pending',
      };
    });
    const preparedAt = clock().toISOString();
    const snapshotBaseline = (await control.list('.studio/backups'))
      .filter(
        (entry) =>
          entry.kind === 'file' && entry.path.endsWith('/manifest.json'),
      )
      .map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right, 'en'));
    const journal: CloseJournal = {
      version: 1,
      transactionId: request.transactionId,
      stage: 'prepared',
      preparedAt,
      season: request.season,
      closedSeasonNote: {
        ...request.closedSeasonNote,
        updated: preparedAt,
      },
      reflection: normalizedReflection(request.reflection),
      priorityIds: [...request.priorityIds],
      snapshotBaseline,
      targets,
      letter: {
        note: {
          ...request.letter,
          body: request.letter.body.trim() + '\n',
          created: preparedAt,
          updated: preparedAt,
        },
        path: `Reflection Garden/${suggestFilename({ ...request.letter, created: preparedAt })}`,
      },
    };
    const condition =
      existing === null
        ? { expectedMissing: true as const }
        : { expectedHash: existing.hash };
    const written = await control.writeTextAtomic(
      JOURNAL_PATH,
      journalText(journal),
      condition,
    );
    return { journal, hash: written.hash };
  }

  async function ensurePrepared(
    request: SeasonCloseRequest,
  ): Promise<LoadedJournal> {
    assertRequestShape(request);
    let loaded = await loadJournal(control);
    if (
      loaded !== null &&
      loaded.journal.transactionId !== request.transactionId &&
      loaded.journal.stage !== 'completed'
    ) {
      throw new SeasonCloseTransactionConflictError(
        'Another season close is already in progress. Resume or repair it before starting another.',
      );
    }
    if (
      loaded === null ||
      loaded.journal.transactionId !== request.transactionId
    ) {
      loaded = await prepareJournal(request, loaded);
    }
    return loaded;
  }

  async function run(initial: LoadedJournal): Promise<SeasonCloseResult> {
    let loaded = initial;
    let journal = loaded.journal;

    if (journal.stage === 'prepared') {
      const discovered = await discoverRevisionSnapshot(control, journal);
      const created =
        discovered ??
        (await revisions.create('season-close', [
          journal.season.path,
          ...journal.targets.map((target) => target.path),
        ]));
      const snapshot = await verifyRevisionSnapshot(control, created, journal);
      if (snapshot === null) {
        throw new SeasonCloseTransactionConflictError(
          'The revision snapshot could not be verified. No season notes were changed.',
        );
      }
      journal = { ...journal, stage: 'snapshotted', snapshot };
      loaded = await checkpoint(loaded, journal);
    }

    if (journal.snapshot !== undefined) {
      const verified = await verifyRevisionSnapshot(
        control,
        journal.snapshot,
        journal,
      );
      if (verified === null) {
        throw new SeasonCloseTransactionConflictError(
          'The revision snapshot could not be verified. No further season notes were changed.',
        );
      }
    }
    await verifyCompletedOutputs(vault, journal);

    if (journal.stage === 'snapshotted') {
      const hash = await writeNoteIdempotently(
        vault,
        journal.letter.path,
        journal.letter.note,
        { expectedMissing: true },
      );
      journal = {
        ...journal,
        stage: 'letter-written',
        letter: { ...journal.letter, hash },
      };
      loaded = await checkpoint(loaded, journal);
    }

    if (
      journal.stage === 'letter-written' ||
      journal.stage === 'applying-targets'
    ) {
      if (journal.stage === 'letter-written' && journal.targets.length === 0) {
        journal = { ...journal, stage: 'applying-targets' };
        loaded = await checkpoint(loaded, journal);
      }
      for (let index = 0; index < journal.targets.length; index += 1) {
        const target = journal.targets[index]!;
        if (target.state === 'complete') continue;
        let path = target.path;
        let hash: string;
        if (
          target.disposition === 'celebrate' ||
          target.disposition === 'invite-forward'
        ) {
          const artifact = artifactNote(journal, target);
          path = `${target.disposition === 'celebrate' ? 'Reflection Garden/Season Outcomes' : 'Current Season/Invitations'}/${suggestFilename(artifact)}`;
          hash = await writeNoteIdempotently(vault, path, artifact, {
            expectedMissing: true,
          });
        } else {
          hash = await writeNoteIdempotently(
            vault,
            path,
            outcomeNote(journal, target),
            { expectedHash: target.hash },
          );
        }
        const targets = journal.targets.map((candidate, candidateIndex) =>
          candidateIndex === index
            ? {
                ...candidate,
                state: 'complete' as const,
                outputPath: path,
                outputHash: hash,
              }
            : candidate,
        );
        journal = { ...journal, stage: 'applying-targets', targets };
        loaded = await checkpoint(loaded, journal);
      }
    }

    if (journal.stage === 'applying-targets') {
      const archivedSeasonHash = await writeNoteIdempotently(
        vault,
        journal.season.path,
        journal.closedSeasonNote,
        { expectedHash: journal.season.hash },
      );
      journal = {
        ...journal,
        stage: 'season-archived',
        archivedSeasonHash,
      };
      loaded = await checkpoint(loaded, journal);
    }

    if (journal.stage === 'season-archived') {
      journal = { ...journal, stage: 'completed' };
      loaded = await checkpoint(loaded, journal);
    }

    await verifyCompletedOutputs(vault, journal);
    const season = await vault.readText(journal.season.path);
    return {
      season: {
        note: journal.closedSeasonNote,
        path: journal.season.path,
        hash: season.hash,
      },
      snapshot: journal.snapshot!,
    };
  }

  return {
    async prepare(request) {
      await ensurePrepared(request);
    },

    async pending() {
      const loaded = await loadJournal(control);
      if (loaded === null) return null;
      return {
        transactionId: loaded.journal.transactionId,
        seasonNoteId: loaded.journal.season.note.id,
        seasonPath: loaded.journal.season.path,
        stage: loaded.journal.stage,
      };
    },

    async close(request) {
      const loaded = await ensurePrepared(request);
      return run(loaded);
    },

    async resume() {
      const loaded = await loadJournal(control);
      return loaded === null ? null : run(loaded);
    },
  };
}
