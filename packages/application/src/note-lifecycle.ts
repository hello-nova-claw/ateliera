import { extractLinks, markdownToPlainText, parseNote, serializeNote } from '@studio/content';
import type { NoteStatus, StudioNote } from '@studio/domain';
import type { IndexPort } from '@studio/index';
import {
  VaultConflictError,
  VaultUnavailableError,
  createStudioControlVault,
} from '@studio/storage/portable';
import type { StudioControlVault, VaultPort } from '@studio/storage/portable';

const MANIFEST_PATH = '.studio/Trash/manifest.json';
const MAX_SUFFIX_ATTEMPTS = 100;

export interface TrashAttachmentRecord {
  path: string;
  available: boolean;
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
}

export interface TrashedNoteResult {
  id: string;
  trashPath: string;
  attachments: TrashAttachmentRecord[];
}

export interface RestoredNoteResult {
  note: StudioNote;
  path: string;
  hash: string;
  relocated: boolean;
  missingAttachments: string[];
}

export interface NoteLifecycleService {
  archive(id: string): Promise<{ note: StudioNote; path: string; hash: string }>;
  unarchive(id: string): Promise<{ note: StudioNote; path: string; hash: string }>;
  trash(id: string): Promise<TrashedNoteResult>;
  restore(id: string): Promise<RestoredNoteResult>;
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

function manifestText(manifest: TrashManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isStatus(value: unknown): value is NoteStatus {
  return ['draft', 'active', 'resting', 'archived', 'trashed'].includes(String(value));
}

function isTrashEntry(value: unknown): value is TrashEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TrashEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.originalPath === 'string' &&
    typeof candidate.trashPath === 'string' &&
    candidate.trashPath.startsWith('.studio/Trash/items/') &&
    typeof candidate.originalHash === 'string' &&
    isStatus(candidate.originalStatus) &&
    typeof candidate.deletedAt === 'string' &&
    ['prepared', 'trashed', 'restoring'].includes(String(candidate.state)) &&
    Array.isArray(candidate.attachments) &&
    candidate.attachments.every((item) =>
      typeof item === 'object' && item !== null &&
      typeof (item as Partial<TrashAttachmentRecord>).path === 'string' &&
      typeof (item as Partial<TrashAttachmentRecord>).available === 'boolean') &&
    (candidate.restorePath === undefined || typeof candidate.restorePath === 'string')
  );
}

function parseManifest(text: string): TrashManifest {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' && value !== null &&
      (value as Partial<TrashManifest>).version === 1 &&
      Array.isArray((value as Partial<TrashManifest>).entries) &&
      (value as TrashManifest).entries.every(isTrashEntry)
    ) return value as TrashManifest;
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
    if (error instanceof VaultUnavailableError) return { manifest: { version: 1, entries: [] } };
    throw error;
  }
}

async function writeManifest(vault: StudioControlVault, loaded: LoadedManifest): Promise<LoadedManifest> {
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

async function available(vault: Pick<VaultPort, 'exists'>, path: string): Promise<boolean> {
  try {
    return await vault.exists(path);
  } catch {
    return false;
  }
}

function indexedContent(note: StudioNote) {
  return { links: extractLinks(note.body), searchText: markdownToPlainText(note.body) };
}

export function createNoteLifecycleService({
  vault,
  index,
  controlVault = createStudioControlVault(vault),
  clock = () => new Date(),
}: NoteLifecycleDependencies): NoteLifecycleService {
  let tail: Promise<void> = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function indexedNote(id: string) {
    const entry = await index.getById(id);
    if (entry === null) throw new VaultUnavailableError(`No active note with id ${id} was found.`);
    return entry;
  }

  async function setArchiveStatus(id: string, status: 'archived' | 'active') {
    const current = await indexedNote(id);
    if (status === 'active' && current.note.status !== 'archived') {
      throw new Error('Only an archived note can be returned to active views.');
    }
    const changed: StudioNote = {
      ...current.note,
      status,
      updated: clock().toISOString(),
    };
    const written = await vault.writeTextAtomic(current.path, serializeNote(changed), {
      expectedHash: current.hash,
    });
    await index.upsert(changed, current.path, written.hash, indexedContent(changed));
    return { note: changed, path: current.path, hash: written.hash };
  }

  async function reconcileInternal(): Promise<string[]> {
    let loaded = await loadManifest(controlVault);
    const issues: string[] = [];
    const entries: TrashEntry[] = [];
    let changed = false;
    for (const entry of loaded.manifest.entries) {
      const sourceExists = await available(vault, entry.originalPath);
      const trashExists = await available(controlVault, entry.trashPath);
      if (entry.state === 'prepared') {
        if (trashExists && !sourceExists) {
          entries.push({ ...entry, state: 'trashed' });
          changed = true;
        } else if (sourceExists && !trashExists) {
          changed = true;
        } else {
          entries.push(entry);
          issues.push(`Trash transaction for ${entry.id} needs review.`);
        }
      } else if (entry.state === 'restoring') {
        const destination = entry.restorePath ?? entry.originalPath;
        const destinationExists = await available(vault, destination);
        if (destinationExists && !trashExists) {
          changed = true;
        } else {
          entries.push(entry);
          issues.push(`Restore transaction for ${entry.id} needs review.`);
        }
      } else {
        entries.push(entry);
      }
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
      await reconcileInternal();
      const current = await indexedNote(id);
      let loaded = await loadManifest(controlVault);
      if (loaded.manifest.entries.some((entry) => entry.id === id)) {
        throw new VaultConflictError('This note is already represented in Trash.');
      }
      const trashPath = `.studio/Trash/items/${encodeURIComponent(id)}/${basename(current.path)}`;
      if (await available(controlVault, trashPath)) {
        throw new VaultConflictError('The reserved Trash destination is occupied.');
      }
      const attachments = await Promise.all(current.note.attachments.map(async (path) => ({
        path,
        available: await available(vault, path),
      })));
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
      const beforeMove = await vault.readText(current.path);
      if (beforeMove.hash !== current.hash) {
        throw new VaultConflictError('The note changed before it could be moved to Trash.');
      }
      await controlVault.moveInto(current.path, trashPath);
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
        if (!(await available(vault, current.path)) && await available(controlVault, trashPath)) {
          await controlVault.moveOut(trashPath, current.path).catch(() => undefined);
        }
        throw new LifecyclePartialFailureError(
          'Trash was interrupted. The note was preserved and its journal can be reconciled.',
          id,
          { cause: error },
        );
      }
      await index.remove(id);
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
      let destination = entry.originalPath;
      let relocated = false;
      if (await available(vault, destination)) {
        relocated = true;
        let found = false;
        for (let attempt = 1; attempt <= MAX_SUFFIX_ATTEMPTS; attempt += 1) {
          const candidate = restoredCandidate(entry.originalPath, attempt);
          if (!(await available(vault, candidate))) {
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
      await controlVault.moveOut(entry.trashPath, destination);
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
      await index.upsert(parsed.note, destination, restored.hash, indexedContent(parsed.note));
      const missingAttachments: string[] = [];
      for (const attachment of entry.attachments) {
        if (!(await available(vault, attachment.path))) missingAttachments.push(attachment.path);
      }
      return {
        note: parsed.note,
        path: destination,
        hash: restored.hash,
        relocated,
        missingAttachments,
      };
    }),

    reconcile: () => serialized(reconcileInternal),
  };
}
