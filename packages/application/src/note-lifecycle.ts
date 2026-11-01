import { extractLinks, markdownToPlainText, parseNote, serializeNote } from '@studio/content';
import { localTimestamp, type NoteStatus, type StudioNote } from '@studio/domain';
import type { IndexPort } from '@studio/index';
import {
  VaultConflictError,
  VaultUnavailableError,
  createStudioControlVault,
} from '@studio/storage/portable';
import type { StudioControlVault, VaultPort } from '@studio/storage/portable';

const MANIFEST_PATH = '.studio/Trash/manifest.json';
const MAX_SUFFIX_ATTEMPTS = 100;
const SHA256 = /^[a-f0-9]{64}$/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;
const UNSAFE_IDENTIFIER_CHARACTER = new RegExp(
  String.raw`[\u0000-\u001f\u007f-\u009f/\\]`,
  'u',
);

export interface TrashAttachmentRecord {
  path: string;
  availability: 'available' | 'missing' | 'unknown';
}

export interface TrashEntry {
  id: string;
  originalPath: string;
  trashPath: string;
  originalHash: string;
  originalStatus: NoteStatus;
  deletedAt: string;
  attachments: TrashAttachmentRecord[];
  state: 'prepared' | 'trashed' | 'restoring';
  restorePath?: string;
}

interface TrashManifest {
  version: 1;
  entries: TrashEntry[];
}

interface LoadedManifest {
  manifest: TrashManifest;
  hash?: string;
}

export interface NoteLifecycleDependencies {
  vault: VaultPort;
  index: IndexPort;
  controlVault?: StudioControlVault;
  clock?: () => Date;
  /** The writer's IANA time zone for note timestamps; UTC without one. */
  timeZone?: string;
}

export interface TrashedNoteResult {
  id: string;
  trashPath: string;
  attachments: TrashAttachmentRecord[];
}

export interface RestoredNoteResult {
  kind: 'restored';
  note: StudioNote;
  path: string;
  hash: string;
  relocated: boolean;
  missingAttachments: string[];
  unknownAttachments: string[];
}

export interface RestoreIdentityConflictResult {
  kind: 'identity-conflict';
  noteId: string;
  trashPath: string;
  conflictingPaths: string[];
  repair: {
    required: true;
    options: ['change-existing-id', 'restore-with-new-id'];
  };
}

export type RestoreNoteResult = RestoredNoteResult | RestoreIdentityConflictResult;

export interface NoteLifecycleService {
  archive(id: string): Promise<{ note: StudioNote; path: string; hash: string }>;
  unarchive(id: string): Promise<{ note: StudioNote; path: string; hash: string }>;
  trash(id: string): Promise<TrashedNoteResult>;
  restore(id: string): Promise<RestoreNoteResult>;
  reconcile(): Promise<string[]>;
}

export class TrashManifestError extends Error {
  override readonly name = 'TrashManifestError';
}

export class LifecyclePartialFailureError extends Error {
  override readonly name = 'LifecyclePartialFailureError';

  constructor(message: string, readonly noteId: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class LifecycleStorageUnavailableError extends Error {
  override readonly name = 'LifecycleStorageUnavailableError';

  constructor(readonly paths: string[], options?: ErrorOptions) {
    super(`Storage availability could not be confirmed for: ${paths.join(', ')}`);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

function manifestText(manifest: TrashManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isStatus(value: unknown): value is NoteStatus {
  return ['draft', 'active', 'resting', 'archived', 'trashed'].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isWellFormedUnicode(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

// Note ids predate a UUID/ULID-only domain contract. Keep compatible ids such as
// `n1` and `01JTEST`, while requiring a single canonical, path-safe scalar.
function isCanonicalNoteId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value === value.trim() && value === value.normalize('NFC') &&
    value !== '.' && value !== '..' && !UNSAFE_IDENTIFIER_CHARACTER.test(value) &&
    isWellFormedUnicode(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function isCanonicalUserPath(value: unknown): value is string {
  if (
    typeof value !== 'string' || value.length === 0 || value !== value.normalize('NFC') ||
    value !== value.trim() || value.includes('\0') || value.includes('\\') ||
    value.startsWith('/') || value.endsWith('/') || WINDOWS_DRIVE_PATH.test(value) ||
    !isWellFormedUnicode(value)
  ) return false;
  return value.split('/').every((segment) => {
    const folded = segment.toLocaleLowerCase('en');
    return segment.length > 0 && segment === segment.trim() && segment !== '.' && segment !== '..' &&
      folded !== '.studio' && !folded.startsWith('.studio-');
  });
}

function expectedTrashPath(id: string, originalPath: string): string {
  return `.studio/Trash/items/${encodeURIComponent(id)}/${basename(originalPath)}`;
}

function isTrashEntry(value: unknown): value is TrashEntry {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'originalPath',
    'trashPath',
    'originalHash',
    'originalStatus',
    'deletedAt',
    'attachments',
    'state',
  ], ['restorePath'])) return false;
  if (
    !isCanonicalNoteId(value.id) || !isCanonicalUserPath(value.originalPath) ||
    typeof value.trashPath !== 'string' ||
    value.trashPath !== expectedTrashPath(value.id, value.originalPath) ||
    typeof value.originalHash !== 'string' || !SHA256.test(value.originalHash) ||
    !isStatus(value.originalStatus) || value.originalStatus === 'trashed' ||
    !isCanonicalTimestamp(value.deletedAt) ||
    !['prepared', 'trashed', 'restoring'].includes(String(value.state)) ||
    !Array.isArray(value.attachments) ||
    (value.restorePath !== undefined && !isCanonicalUserPath(value.restorePath))
  ) return false;

  const attachmentPaths = new Set<string>();
  for (const item of value.attachments) {
    if (
      !isRecord(item) || !hasExactKeys(item, ['path', 'availability']) ||
      !isCanonicalUserPath(item.path) ||
      !['available', 'missing', 'unknown'].includes(String(item.availability)) ||
      attachmentPaths.has(item.path)
    ) return false;
    attachmentPaths.add(item.path);
  }
  return true;
}

function isTrashManifest(value: unknown): value is TrashManifest {
  if (
    !isRecord(value) || !hasExactKeys(value, ['version', 'entries']) ||
    value.version !== 1 || !Array.isArray(value.entries) ||
    !value.entries.every(isTrashEntry)
  ) return false;

  const ids = new Set<string>();
  const trashPaths = new Set<string>();
  const userPathOwners = new Map<string, number>();
  for (const [index, entry] of value.entries.entries()) {
    if (ids.has(entry.id) || trashPaths.has(entry.trashPath)) return false;
    ids.add(entry.id);
    trashPaths.add(entry.trashPath);

    for (const path of [entry.originalPath, entry.restorePath].filter(
      (candidate): candidate is string => candidate !== undefined,
    )) {
      const owner = userPathOwners.get(path);
      if (owner !== undefined && owner !== index) return false;
      userPathOwners.set(path, index);
    }
  }
  return true;
}

function parseManifest(text: string): TrashManifest {
  try {
    const value: unknown = JSON.parse(text);
    if (isTrashManifest(value)) return value;
  } catch {
    // Fall through to the recoverable typed error below.
  }
  throw new TrashManifestError(
    'Trash metadata is damaged. Nothing was changed; repair or restore its manifest first.',
  );
}

async function loadManifest(vault: StudioControlVault): Promise<LoadedManifest> {
  try {
    const file = await vault.readText(MANIFEST_PATH);
    return { manifest: parseManifest(file.text), hash: file.hash };
  } catch (error) {
    if (error instanceof VaultUnavailableError) {
      const manifestPresence = await presence(vault, MANIFEST_PATH);
      if (manifestPresence.state === 'absent') return { manifest: { version: 1, entries: [] } };
      throw new LifecycleStorageUnavailableError(
        [MANIFEST_PATH],
        { cause: manifestPresence.state === 'unavailable' ? manifestPresence.error : error },
      );
    }
    throw error;
  }
}

async function writeManifest(vault: StudioControlVault, loaded: LoadedManifest): Promise<LoadedManifest> {
  if (!isTrashManifest(loaded.manifest)) {
    throw new TrashManifestError(
      'Trash metadata is unsafe. Nothing was changed; repair its manifest first.',
    );
  }
  const written = await vault.writeTextAtomic(MANIFEST_PATH, manifestText(loaded.manifest),
    loaded.hash === undefined ? { expectedMissing: true } : { expectedHash: loaded.hash });
  return { manifest: loaded.manifest, hash: written.hash };
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function restoredCandidate(path: string, attempt: number): string {
  const slash = path.lastIndexOf('/');
  const folder = slash < 0 ? '' : path.slice(0, slash + 1);
  const name = slash < 0 ? path : path.slice(slash + 1);
  const extension = name.toLocaleLowerCase('en').endsWith('.md') ? '.md' : '';
  const stem = extension === '' ? name : name.slice(0, -extension.length);
  return `${folder}${stem}--restored${attempt === 1 ? '' : `-${attempt}`}${extension}`;
}

type Presence =
  | { state: 'present' }
  | { state: 'absent' }
  | { state: 'unavailable'; error: unknown };

async function presence(vault: Pick<VaultPort, 'exists'>, path: string): Promise<Presence> {
  try {
    return await vault.exists(path) ? { state: 'present' } : { state: 'absent' };
  } catch (error) {
    return { state: 'unavailable', error };
  }
}

function requirePresence(result: Presence, path: string): 'present' | 'absent' {
  if (result.state === 'unavailable') {
    throw new LifecycleStorageUnavailableError([path], { cause: result.error });
  }
  return result.state;
}

async function contentMatches(
  vault: Pick<VaultPort, 'readText'>,
  path: string,
  expectedHash: string,
): Promise<'matches' | 'mismatch' | 'unavailable'> {
  try {
    return (await vault.readText(path)).hash === expectedHash ? 'matches' : 'mismatch';
  } catch {
    return 'unavailable';
  }
}

function indexedContent(note: StudioNote) {
  return { links: extractLinks(note.body), searchText: markdownToPlainText(note.body) };
}

function isPotentialNotePath(path: string): boolean {
  const name = basename(path);
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

async function updateDisposableIndex(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Markdown is authoritative. StudioService immediately rebuilds this disposable projection.
  }
}

export function createNoteLifecycleService({
  vault,
  index,
  controlVault = createStudioControlVault(vault),
  clock = () => new Date(),
  timeZone,
}: NoteLifecycleDependencies): NoteLifecycleService {
  let tail: Promise<void> = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function canonicalNote(id: string) {
    const matches: Array<{ note: StudioNote; path: string; hash: string }> = [];
    const entries = await vault.list();
    for (const entry of entries) {
      if (
        entry.kind !== 'file' ||
        entry.path.toLocaleLowerCase('en').startsWith('.studio/') ||
        !isPotentialNotePath(entry.path)
      ) continue;
      let file: Awaited<ReturnType<VaultPort['readText']>>;
      try {
        file = await vault.readText(entry.path);
      } catch (error) {
        throw new LifecycleStorageUnavailableError([entry.path], { cause: error });
      }
      const parsed = parseNote(file.text);
      if (parsed.ok && parsed.note.id === id) {
        matches.push({ note: parsed.note, path: entry.path, hash: file.hash });
      }
    }
    if (matches.length === 0) {
      throw new VaultUnavailableError(`No active note with id ${id} was found.`);
    }
    if (matches.length > 1) {
      throw new VaultConflictError(
        `Multiple Markdown notes use id ${id}; repair the duplicate identity before continuing.`,
      );
    }
    return matches[0]!;
  }

  async function setArchiveStatus(id: string, status: 'archived' | 'active') {
    const current = await canonicalNote(id);
    if (status === 'active' && current.note.status !== 'archived') {
      throw new Error('Only an archived note can be returned to active views.');
    }
    const changed: StudioNote = {
      ...current.note,
      status,
      updated:
        timeZone === undefined
          ? clock().toISOString()
          : localTimestamp(clock(), timeZone),
    };
    const written = await vault.writeTextAtomic(current.path, serializeNote(changed), {
      expectedHash: current.hash,
    });
    await updateDisposableIndex(() =>
      index.upsert(changed, current.path, written.hash, indexedContent(changed)));
    return { note: changed, path: current.path, hash: written.hash };
  }

  async function stableIdState(id: string): Promise<{
    conflicts: string[];
    userState: Array<{ path: string; hash: string }>;
  }> {
    const entries = await vault.list();
    const conflicts: string[] = [];
    const userState: Array<{ path: string; hash: string }> = [];
    for (const entry of entries) {
      if (
        entry.kind !== 'file' ||
        entry.path.toLocaleLowerCase('en').startsWith('.studio/') ||
        !isPotentialNotePath(entry.path)
      ) continue;
      let file: Awaited<ReturnType<VaultPort['readText']>>;
      try {
        file = await vault.readText(entry.path);
      } catch (error) {
        throw new LifecycleStorageUnavailableError([entry.path], { cause: error });
      }
      userState.push({ path: entry.path, hash: file.hash });
      const parsed = parseNote(file.text);
      if (parsed.ok && parsed.note.id === id) conflicts.push(entry.path);
    }
    return {
      conflicts: conflicts.sort((left, right) => left.localeCompare(right, 'en')),
      userState: userState.sort((left, right) => left.path.localeCompare(right.path, 'en')),
    };
  }

  function identityConflict(entry: TrashEntry, conflictingPaths: string[]): RestoreIdentityConflictResult {
    return {
      kind: 'identity-conflict',
      noteId: entry.id,
      trashPath: entry.trashPath,
      conflictingPaths,
      repair: {
        required: true,
        options: ['change-existing-id', 'restore-with-new-id'],
      },
    };
  }

  async function reconcileInternal(): Promise<string[]> {
    let loaded = await loadManifest(controlVault);
    const issues: string[] = [];
    const entries: TrashEntry[] = [];
    let changed = false;
    const unavailablePaths: string[] = [];
    for (const entry of loaded.manifest.entries) {
      const sourcePresence = await presence(vault, entry.originalPath);
      const trashPresence = await presence(controlVault, entry.trashPath);
      if (sourcePresence.state === 'unavailable' || trashPresence.state === 'unavailable') {
        entries.push(entry);
        if (sourcePresence.state === 'unavailable') unavailablePaths.push(entry.originalPath);
        if (trashPresence.state === 'unavailable') unavailablePaths.push(entry.trashPath);
        continue;
      }
      const sourceExists = sourcePresence.state === 'present';
      const trashExists = trashPresence.state === 'present';
      if (entry.state === 'prepared') {
        if (trashExists && !sourceExists) {
          const match = await contentMatches(controlVault, entry.trashPath, entry.originalHash);
          if (match === 'matches') {
            entries.push({ ...entry, state: 'trashed' });
            changed = true;
          } else {
            entries.push(entry);
            if (match === 'unavailable') unavailablePaths.push(entry.trashPath);
            else issues.push(`Trash transaction for ${entry.id} has unexpected content and needs review.`);
          }
        } else if (sourceExists && !trashExists) {
          const match = await contentMatches(vault, entry.originalPath, entry.originalHash);
          if (match === 'matches') changed = true;
          else {
            entries.push(entry);
            if (match === 'unavailable') unavailablePaths.push(entry.originalPath);
            else issues.push(`Trash transaction for ${entry.id} has unexpected content and needs review.`);
          }
        } else {
          entries.push(entry);
          issues.push(`Trash transaction for ${entry.id} needs review.`);
        }
      } else if (entry.state === 'restoring') {
        const destination = entry.restorePath ?? entry.originalPath;
        const destinationPresence = await presence(vault, destination);
        if (destinationPresence.state === 'unavailable') {
          entries.push(entry);
          unavailablePaths.push(destination);
          continue;
        }
        const destinationExists = destinationPresence.state === 'present';
        if (destinationExists && !trashExists) {
          const match = await contentMatches(vault, destination, entry.originalHash);
          if (match === 'matches') changed = true;
          else {
            entries.push(entry);
            if (match === 'unavailable') unavailablePaths.push(destination);
            else issues.push(`Restore transaction for ${entry.id} has unexpected content and needs review.`);
          }
        } else {
          entries.push(entry);
          issues.push(`Restore transaction for ${entry.id} needs review.`);
        }
      } else {
        entries.push(entry);
      }
    }
    if (unavailablePaths.length > 0) {
      throw new LifecycleStorageUnavailableError([...new Set(unavailablePaths)]);
    }
    if (changed) {
      loaded = await writeManifest(controlVault, {
        ...loaded,
        manifest: { version: 1, entries },
      });
      void loaded;
    }
    return issues;
  }

  return {
    archive: (id) => serialized(() => setArchiveStatus(id, 'archived')),
    unarchive: (id) => serialized(() => setArchiveStatus(id, 'active')),

    trash: (id) => serialized(async () => {
      if (!isCanonicalNoteId(id)) {
        throw new TrashManifestError('The note id cannot be represented safely in Trash.');
      }
      await reconcileInternal();
      let loaded = await loadManifest(controlVault);
      if (loaded.manifest.entries.some((entry) => entry.id === id)) {
        throw new VaultConflictError('This note is already represented in Trash.');
      }
      const current = await canonicalNote(id);
      const trashPath = `.studio/Trash/items/${encodeURIComponent(id)}/${basename(current.path)}`;
      const trashDestination = requirePresence(await presence(controlVault, trashPath), trashPath);
      if (trashDestination === 'present') {
        throw new VaultConflictError('The reserved Trash destination is occupied.');
      }
      const attachments = await Promise.all(current.note.attachments.map(async (path) => {
        const result = await presence(vault, path);
        return {
          path,
          availability: result.state === 'present' ? 'available' as const
            : result.state === 'absent' ? 'missing' as const : 'unknown' as const,
        };
      }));
      const entry: TrashEntry = {
        id,
        originalPath: current.path,
        trashPath,
        originalHash: current.hash,
        originalStatus: current.note.status,
        deletedAt: clock().toISOString(),
        attachments,
        state: 'prepared',
      };
      loaded = await writeManifest(controlVault, {
        ...loaded,
        manifest: { version: 1, entries: [...loaded.manifest.entries, entry] },
      });
      await controlVault.moveInto(current.path, trashPath, { expectedHash: current.hash });
      try {
        loaded = await writeManifest(controlVault, {
          ...loaded,
          manifest: {
            version: 1,
            entries: loaded.manifest.entries.map((item) =>
              item.id === id ? { ...item, state: 'trashed' } : item),
          },
        });
        void loaded;
      } catch (error) {
        const sourcePresence = await presence(vault, current.path);
        const trashPresence = await presence(controlVault, trashPath);
        if (sourcePresence.state === 'absent' && trashPresence.state === 'present') {
          await controlVault.moveOut(trashPath, current.path, {
            expectedHash: current.hash,
          }).catch(() => undefined);
        }
        throw new LifecyclePartialFailureError(
          'Trash was interrupted. The note was preserved and its journal can be reconciled.',
          id,
          { cause: error },
        );
      }
      await updateDisposableIndex(() => index.remove(id));
      return { id, trashPath, attachments };
    }),

    restore: (id) => serialized(async () => {
      await reconcileInternal();
      let loaded = await loadManifest(controlVault);
      const entry = loaded.manifest.entries.find((item) => item.id === id);
      if (entry === undefined || entry.state !== 'trashed') {
        throw new VaultUnavailableError(`No recoverable Trash entry with id ${id} was found.`);
      }
      const trashed = await controlVault.readText(entry.trashPath);
      if (trashed.hash !== entry.originalHash) {
        throw new TrashManifestError('The trashed note no longer matches its deletion record.');
      }
      const parsed = parseNote(trashed.text);
      if (!parsed.ok) throw new TrashManifestError('The trashed note metadata is damaged.');
      const initialIdentityState = await stableIdState(parsed.note.id);
      if (initialIdentityState.conflicts.length > 0) {
        return identityConflict(entry, initialIdentityState.conflicts);
      }
      let destination = entry.originalPath;
      let relocated = false;
      if (requirePresence(await presence(vault, destination), destination) === 'present') {
        relocated = true;
        let found = false;
        for (let attempt = 1; attempt <= MAX_SUFFIX_ATTEMPTS; attempt += 1) {
          const candidate = restoredCandidate(entry.originalPath, attempt);
          if (requirePresence(await presence(vault, candidate), candidate) === 'absent') {
            destination = candidate;
            found = true;
            break;
          }
        }
        if (!found) throw new VaultConflictError('A safe restore path could not be reserved.');
      }
      loaded = await writeManifest(controlVault, {
        ...loaded,
        manifest: {
          version: 1,
          entries: loaded.manifest.entries.map((item) =>
            item.id === id ? { ...item, state: 'restoring', restorePath: destination } : item),
        },
      });
      const resetRestoreJournal = async () => {
        loaded = await writeManifest(controlVault, {
          ...loaded,
          manifest: {
            version: 1,
            entries: loaded.manifest.entries.map((item) =>
              item.id === id ? { ...item, state: 'trashed' } : item),
          },
        });
      };
      const guardedIdentityState = await stableIdState(parsed.note.id);
      if (guardedIdentityState.conflicts.length > 0) {
        await resetRestoreJournal();
        return identityConflict(entry, guardedIdentityState.conflicts);
      }
      try {
        await controlVault.moveOut(entry.trashPath, destination, {
          expectedHash: entry.originalHash,
          expectedUserState: guardedIdentityState.userState,
        });
      } catch (error) {
        await resetRestoreJournal();
        if (error instanceof VaultConflictError) {
          const latestIdentityState = await stableIdState(parsed.note.id);
          if (latestIdentityState.conflicts.length > 0) {
            return identityConflict(entry, latestIdentityState.conflicts);
          }
        }
        throw error;
      }
      const restored = await vault.readText(destination);
      try {
        await writeManifest(controlVault, {
          ...loaded,
          manifest: { version: 1, entries: loaded.manifest.entries.filter((item) => item.id !== id) },
        });
      } catch (error) {
        throw new LifecyclePartialFailureError(
          'The note was restored, but Trash cleanup needs reconciliation.',
          id,
          { cause: error },
        );
      }
      await updateDisposableIndex(() =>
        index.upsert(parsed.note, destination, restored.hash, indexedContent(parsed.note)));
      const missingAttachments: string[] = [];
      const unknownAttachments: string[] = [];
      for (const attachment of entry.attachments) {
        const result = await presence(vault, attachment.path);
        if (result.state === 'absent') missingAttachments.push(attachment.path);
        if (result.state === 'unavailable') unknownAttachments.push(attachment.path);
      }
      return {
        kind: 'restored',
        note: parsed.note,
        path: destination,
        hash: restored.hash,
        relocated,
        missingAttachments,
        unknownAttachments,
      };
    }),

    reconcile: () => serialized(reconcileInternal),
  };
}
