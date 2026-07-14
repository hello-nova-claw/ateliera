import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import { isPublicNotePath } from './vault-port';
import type {
  MoveCondition,
  VaultAtomicWriteBatch,
  VaultAtomicWriteResult,
  VaultChange,
  VaultEntry,
  VaultPort,
  WriteCondition,
} from './vault-port';

export interface StoredBrowserFile {
  bytes: Uint8Array;
  hash: string;
  modifiedAt: string;
}

export interface BrowserVaultStore {
  entries(): Promise<ReadonlyArray<readonly [string, StoredBrowserFile]>>;
  metadataEntries?(): Promise<ReadonlyArray<BrowserVaultStoreMetadata>>;
  read(path: string): Promise<StoredBrowserFile | undefined>;
  readBounded?(path: string, maximumBytes: number): Promise<StoredBrowserFile | undefined>;
  readManyBounded?(
    paths: readonly string[],
    limits: BrowserVaultMutationReadLimits,
  ): Promise<ReadonlyMap<string, StoredBrowserFile | undefined>>;
  getRevision(): Promise<string>;
  mutateAtomic(
    expectedRevision: string,
    mutations: readonly BrowserVaultStoreMutation[],
  ): Promise<string>;
}

export interface BrowserVaultMutationReadLimits {
  maximumFileBytes: number;
  maximumTotalBytes: number;
  reservedBytes: number;
}

export interface BrowserVaultStoreMetadata {
  path: string;
  size: number;
  modifiedAt: string;
  hash?: string;
}

export type BrowserVaultStoreExpectedFile =
  | { present: false }
  | { present: true; hash: string };

export type BrowserVaultStoreMutation =
  | {
      kind: 'write';
      path: string;
      file: StoredBrowserFile;
      expectedBefore?: BrowserVaultStoreExpectedFile;
    }
  | {
      kind: 'remove';
      path: string;
      expectedBefore?: BrowserVaultStoreExpectedFile;
    };

export interface BrowserVaultOptions {
  store?: BrowserVaultStore;
  storage?: 'auto' | 'opfs' | 'indexeddb';
  environment?: BrowserVaultEnvironment;
}

export type BrowserVaultBackend = 'opfs' | 'indexeddb';

export interface BrowserVaultEnvironment {
  opfsSupported: boolean;
  readSelection(name: string): Promise<BrowserVaultBackend | undefined>;
  writeSelection(name: string, backend: BrowserVaultBackend): Promise<void>;
  opfsVaultExists(name: string): Promise<boolean>;
  openOpfs(name: string): Promise<BrowserVaultStore>;
  openIndexedDb(name: string): Promise<BrowserVaultStore>;
}

interface FileSystemDirectoryHandleLike {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<
    readonly [string, FileSystemDirectoryHandleLike | FileSystemFileHandleLike]
  >;
  readonly kind: 'directory';
}

interface FileSystemFileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
  readonly kind: 'file';
}

type StorageManagerWithOpfs = Omit<StorageManager, 'getDirectory'> & {
  getDirectory?: () => Promise<FileSystemDirectoryHandleLike>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/;
const SHA256_HASH = /^[a-f0-9]{64}$/;
const OPFS_BATCH_JOURNAL = '.studio-opfs-batch';
const OPFS_BATCH_MANIFEST = `${OPFS_BATCH_JOURNAL}/manifest.json`;
const OPFS_BATCH_PROGRESS = `${OPFS_BATCH_JOURNAL}/progress`;
const OPFS_METADATA_DIRECTORY = '.studio-opfs-metadata';
const MAX_ATOMIC_BATCH_WRITES = 9_999;
const MAX_ATOMIC_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ATOMIC_JOURNAL_BYTES = 512 * 1024 * 1024;
const MAX_OPFS_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_OPFS_PROGRESS_BYTES = String(MAX_ATOMIC_BATCH_WRITES).length;
const MAX_OPFS_METADATA_BYTES = 4 * 1024;
const locks = new Map<string, Promise<void>>();
interface WatchHub {
  channel?: BroadcastChannel;
  listeners: Set<(event: VaultChange) => void>;
}
const watchHubs = new Map<string, WatchHub>();

function deliver(hub: WatchHub, event: VaultChange): void {
  for (const listener of [...hub.listeners]) {
    try {
      listener(event);
    } catch {
      // Durable writes are never rejected by observers.
    }
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === expected[index]);
}

function validEventPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return validatePath(value) === value;
  } catch {
    return false;
  }
}

function validBroadcastChange(value: unknown): value is VaultChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'removed') {
    return hasExactKeys(candidate, ['kind', 'path']) && validEventPath(candidate.path);
  }
  if (candidate.kind === 'created' || candidate.kind === 'modified') {
    return hasExactKeys(candidate, ['hash', 'kind', 'path']) &&
      validEventPath(candidate.path) &&
      typeof candidate.hash === 'string' && SHA256_HASH.test(candidate.hash);
  }
  if (candidate.kind === 'moved') {
    return hasExactKeys(candidate, ['hash', 'kind', 'path', 'previousPath']) &&
      validEventPath(candidate.path) && validEventPath(candidate.previousPath) &&
      typeof candidate.hash === 'string' && SHA256_HASH.test(candidate.hash);
  }
  return false;
}

function watchHub(name: string): WatchHub {
  const existing = watchHubs.get(name);
  if (existing !== undefined) return existing;
  const hub: WatchHub = { listeners: new Set() };
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    hub.channel = new BroadcastChannel(`the-studio:vault:${name}`);
    hub.channel.addEventListener('message', (message: MessageEvent<unknown>) => {
      if (validBroadcastChange(message.data)) {
        deliver(hub, message.data);
      }
    });
  }
  watchHubs.set(name, hub);
  return hub;
}

function validatePath(path: string): string {
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    WINDOWS_DRIVE_PATH.test(path) ||
    path === '.' ||
    path.endsWith('/')
  ) {
    throw new PathEscapeError();
  }
  if (
    path
      .split('/')
      .some((segment) =>
        segment === '' || segment === '.' || segment === '..' ||
        segment.slice(0, '.studio-'.length).toLocaleLowerCase('en') === '.studio-')
  ) {
    throw new PathEscapeError();
  }
  return path;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const input = bytes.slice().buffer;
  const hash = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cloneFile(file: StoredBrowserFile): StoredBrowserFile {
  return { ...file, bytes: file.bytes.slice() };
}

function expectedFile(
  file: StoredBrowserFile | undefined,
): BrowserVaultStoreExpectedFile {
  return file === undefined ? { present: false } : { present: true, hash: file.hash };
}

function matchesExpectedFile(
  file: StoredBrowserFile | undefined,
  expected: BrowserVaultStoreExpectedFile,
): boolean {
  return expected.present ? file?.hash === expected.hash : file === undefined;
}

interface OpfsJournalState {
  present: boolean;
  hash: string | null;
  size: number;
}

interface OpfsJournalEntry {
  path: string;
  before: OpfsJournalState;
  after: OpfsJournalState;
}

interface OpfsJournalManifest {
  version: 1;
  expectedRevision: string;
  nextRevision: string;
  entries: OpfsJournalEntry[];
}

function validDecimalRevision(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
}

function validJournalState(value: unknown): value is OpfsJournalState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (!hasExactKeys(state, ['hash', 'present', 'size']) ||
    typeof state.present !== 'boolean' || !Number.isSafeInteger(state.size) ||
    (state.size as number) < 0 || (state.size as number) > MAX_ATOMIC_FILE_BYTES) return false;
  return state.present
    ? typeof state.hash === 'string' && SHA256_HASH.test(state.hash)
    : state.hash === null && state.size === 0;
}

function parseJournalManifest(bytes: Uint8Array): OpfsJournalManifest {
  if (bytes.byteLength > MAX_OPFS_MANIFEST_BYTES) {
    throw new VaultUnavailableError('The OPFS recovery journal manifest is too large.');
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new VaultUnavailableError('The OPFS recovery journal is invalid.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new VaultUnavailableError('The OPFS recovery journal is invalid.');
  }
  const manifest = value as Record<string, unknown>;
  if (!hasExactKeys(manifest, ['entries', 'expectedRevision', 'nextRevision', 'version']) ||
    manifest.version !== 1 || !validDecimalRevision(manifest.expectedRevision) ||
    !validDecimalRevision(manifest.nextRevision) ||
    BigInt(manifest.nextRevision) !== BigInt(manifest.expectedRevision) + 1n ||
    !Array.isArray(manifest.entries) || manifest.entries.length === 0 ||
    manifest.entries.length > MAX_ATOMIC_BATCH_WRITES) {
    throw new VaultUnavailableError('The OPFS recovery journal is invalid.');
  }
  const paths = new Set<string>();
  let payloadBytes = 0;
  const entries = manifest.entries.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new VaultUnavailableError('The OPFS recovery journal is invalid.');
    }
    const entry = value as Record<string, unknown>;
    let validPath = false;
    if (typeof entry.path === 'string') {
      try {
        validPath = validatePath(entry.path) === entry.path;
      } catch {
        validPath = false;
      }
    }
    if (!hasExactKeys(entry, ['after', 'before', 'path']) || !validPath ||
      paths.has(entry.path as string) || !validJournalState(entry.before) ||
      !validJournalState(entry.after)) {
      throw new VaultUnavailableError('The OPFS recovery journal is invalid.');
    }
    paths.add(entry.path as string);
    payloadBytes += entry.before.size + entry.after.size;
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes > MAX_ATOMIC_JOURNAL_BYTES) {
      throw new VaultUnavailableError('The OPFS recovery journal exceeds its safety limit.');
    }
    return {
      path: entry.path as string,
      before: entry.before,
      after: entry.after,
    };
  });
  return {
    version: 1,
    expectedRevision: manifest.expectedRevision,
    nextRevision: manifest.nextRevision,
    entries,
  };
}

function parentDirectories(path: string): string[] {
  const segments = path.split('/');
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
}

function isValidPublicNotePath(path: string): boolean {
  try {
    validatePath(path);
  } catch {
    return false;
  }
  return isPublicNotePath(path);
}

async function sameUserState(
  store: BrowserVaultStore,
  expected: NonNullable<MoveCondition['expectedUserState']>,
): Promise<boolean> {
  const current = (await store.entries())
    .filter(([path]) => isValidPublicNotePath(path))
    .map(([path, file]) => ({ path, hash: file.hash }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const observed = [...expected].sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return current.length === observed.length && current.every((entry, index) =>
    entry.path === observed[index]?.path && entry.hash === observed[index]?.hash);
}

async function withModuleLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

async function withVaultLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const lockManager =
    typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (lockManager !== undefined) {
    return lockManager.request(`the-studio:${name}`, { mode: 'exclusive' }, action);
  }
  return withModuleLock(name, action);
}

class BrowserVault implements VaultPort {
  constructor(
    private readonly name: string,
    private readonly storePromise: Promise<BrowserVaultStore>,
  ) {}

  async getRevision(): Promise<string> {
    return withVaultLock(this.name, async () => (await this.storePromise).getRevision());
  }

  async list(prefix?: string): Promise<VaultEntry[]> {
    if (prefix !== undefined) validatePath(prefix);
    return withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const entries = new Map<string, VaultEntry>();
      const metadata = store.metadataEntries === undefined
        ? (await store.entries()).map(([path, file]) => ({
            path,
            size: file.bytes.byteLength,
            modifiedAt: file.modifiedAt,
            hash: file.hash,
          }))
        : await store.metadataEntries();
      for (const file of metadata) {
        const { path } = file;
        try {
          validatePath(path);
        } catch {
          continue;
        }
        for (const directory of parentDirectories(path)) {
          entries.set(directory, { path: directory, kind: 'directory' });
        }
        entries.set(path, {
          path,
          kind: 'file',
          size: file.size,
          modifiedAt: file.modifiedAt,
          ...(file.hash === undefined ? {} : { contentHash: file.hash }),
        });
      }
      return [...entries.values()]
        .filter(
          (entry) =>
            prefix === undefined ||
            entry.path === prefix ||
            entry.path.startsWith(`${prefix}/`),
        )
        .sort((left, right) => left.path.localeCompare(right.path, 'en'));
    });
  }

  async readText(path: string): Promise<{ text: string; hash: string }> {
    const validPath = validatePath(path);
    const file = await withVaultLock(this.name, () => this.#requiredFile(validPath));
    try {
      return { text: decoder.decode(file.bytes), hash: file.hash };
    } catch {
      throw new VaultUnavailableError(
        'The requested vault entry is not valid UTF-8 text.',
      );
    }
  }

  async writeTextAtomic(
    path: string,
    text: string,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    return this.#write(validatePath(path), encoder.encode(text), condition);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const validPath = validatePath(path);
    return withVaultLock(this.name, async () =>
      (await this.#requiredFile(validPath)).bytes.slice());
  }

  async readBinaryBounded(
    path: string,
    maximumBytes: number,
  ): Promise<{ bytes: Uint8Array; hash: string }> {
    const validPath = validatePath(path);
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
      throw new VaultUnavailableError('The bounded read limit is invalid.');
    }
    return withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const file = store.readBounded === undefined
        ? await store.read(validPath)
        : await store.readBounded(validPath, maximumBytes);
      if (file === undefined) throw new VaultUnavailableError();
      if (file.bytes.byteLength > maximumBytes) {
        throw new VaultUnavailableError('The vault entry exceeds the bounded read limit.');
      }
      return { bytes: file.bytes.slice(), hash: file.hash };
    });
  }

  async writeBinaryAtomic(
    path: string,
    bytes: Uint8Array,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    return this.#write(validatePath(path), bytes, condition);
  }

  async move(from: string, to: string, condition?: MoveCondition): Promise<void> {
    const sourcePath = validatePath(from);
    const destinationPath = validatePath(to);
    await withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const file = await store.read(sourcePath);
      if (file === undefined) throw new VaultUnavailableError();
      if (condition?.expectedHash !== undefined && file.hash !== condition.expectedHash) {
        throw new VaultConflictError();
      }
      if (condition?.expectedUserState !== undefined &&
        !(await sameUserState(store, condition.expectedUserState))) {
        throw new VaultConflictError();
      }
      if ((await store.read(destinationPath)) !== undefined) {
        throw new VaultConflictError();
      }
      await store.mutateAtomic(await store.getRevision(), [
        {
          kind: 'write',
          path: destinationPath,
          file,
          expectedBefore: { present: false },
        },
        {
          kind: 'remove',
          path: sourcePath,
          expectedBefore: expectedFile(file),
        },
      ]);
      this.#emit({
        kind: 'moved',
        path: destinationPath,
        previousPath: sourcePath,
        hash: file.hash,
      });
    });
  }

  async remove(path: string, condition?: WriteCondition): Promise<void> {
    const validPath = validatePath(path);
    await withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const previous = await store.read(validPath);
      if (previous === undefined) {
        throw new VaultUnavailableError();
      }
      if (condition?.expectedMissing) {
        throw new VaultConflictError();
      }
      if (
        condition?.expectedHash !== undefined &&
        previous.hash !== condition.expectedHash
      ) {
        throw new VaultConflictError();
      }
      if (condition?.expectedUserState !== undefined &&
        !(await sameUserState(store, condition.expectedUserState))) {
        throw new VaultConflictError();
      }
      await store.mutateAtomic(await store.getRevision(), [{
        kind: 'remove',
        path: validPath,
        expectedBefore: expectedFile(previous),
      }]);
      this.#emit({ kind: 'removed', path: validPath });
    });
  }

  async exists(path: string): Promise<boolean> {
    const validPath = validatePath(path);
    return withVaultLock(this.name, async () =>
      (await (await this.storePromise).read(validPath)) !== undefined);
  }

  async writeBatchAtomic(input: VaultAtomicWriteBatch): Promise<VaultAtomicWriteResult> {
    const snapshot: VaultAtomicWriteBatch = {
      expectedRevision: input.expectedRevision,
      writes: input.writes.map((write) => ({ ...write, bytes: write.bytes.slice() })),
    };
    return withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      if (await store.getRevision() !== snapshot.expectedRevision) throw new VaultConflictError();
      const paths = new Set<string>();
      const drafts = [] as Array<{
        path: string;
        bytes: Uint8Array;
        expectedHash?: string;
        expectedMissing?: boolean;
      }>;
      let reservedBytes = 0;
      for (const write of snapshot.writes) {
        const path = validatePath(write.path);
        if (paths.has(path)) throw new VaultConflictError('A batch cannot write the same path twice.');
        paths.add(path);
        if (write.expectedHash !== undefined && write.expectedMissing) {
          throw new VaultConflictError('A batch write condition is invalid.');
        }
        const bytes = write.bytes.slice();
        if (store.readManyBounded !== undefined) {
          if (bytes.byteLength > MAX_ATOMIC_FILE_BYTES) {
            throw new VaultUnavailableError('An OPFS batch file exceeds 64 MiB.');
          }
          reservedBytes += bytes.byteLength;
          if (!Number.isSafeInteger(reservedBytes) || reservedBytes > MAX_ATOMIC_JOURNAL_BYTES) {
            throw new VaultUnavailableError('The OPFS batch journal exceeds 512 MiB.');
          }
        }
        drafts.push({
          path,
          bytes,
          ...(write.expectedHash === undefined ? {} : { expectedHash: write.expectedHash }),
          ...(write.expectedMissing === undefined ? {} : { expectedMissing: write.expectedMissing }),
        });
      }
      const previousFiles = store.readManyBounded === undefined
        ? new Map(await Promise.all(drafts.map(async ({ path }) => [path, await store.read(path)] as const)))
        : await store.readManyBounded([...paths], {
            maximumFileBytes: MAX_ATOMIC_FILE_BYTES,
            maximumTotalBytes: MAX_ATOMIC_JOURNAL_BYTES,
            reservedBytes,
          });
      const prepared = [] as Array<{
        path: string;
        hash: string;
        previous: StoredBrowserFile | undefined;
        file: StoredBrowserFile;
      }>;
      for (const write of drafts) {
        const previous = previousFiles.get(write.path);
        if (write.expectedMissing && previous !== undefined) throw new VaultConflictError();
        if (write.expectedHash !== undefined && previous?.hash !== write.expectedHash) {
          throw new VaultConflictError();
        }
        const bytes = write.bytes;
        const hash = await digest(bytes);
        prepared.push({
          path: write.path,
          hash,
          previous,
          file: { bytes, hash, modifiedAt: new Date().toISOString() },
        });
      }
      const revision = prepared.length === 0
        ? snapshot.expectedRevision
        : await store.mutateAtomic(
            snapshot.expectedRevision,
            prepared.map(({ path, file, previous }) => ({
              kind: 'write' as const,
              path,
              file,
              expectedBefore: expectedFile(previous),
            })),
          );
      for (const write of prepared) {
        this.#emit({
          kind: write.previous === undefined ? 'created' : 'modified',
          path: write.path,
          hash: write.hash,
        });
      }
      return {
        revision,
        results: prepared.map(({ path, hash }) => ({ path, hash })),
      };
    });
  }

  async watch(listener: (event: VaultChange) => void): Promise<() => void> {
    const hub = watchHub(this.name);
    hub.listeners.add(listener);
    return () => hub.listeners.delete(listener);
  }

  async #requiredFile(path: string): Promise<StoredBrowserFile> {
    const file = await (await this.storePromise).read(path);
    if (file === undefined) throw new VaultUnavailableError();
    return cloneFile(file);
  }

  async #write(
    path: string,
    sourceBytes: Uint8Array,
    condition?: WriteCondition,
  ): Promise<{ hash: string }> {
    return withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const previous = await store.read(path);
      if (condition?.expectedMissing && previous !== undefined) {
        throw new VaultConflictError();
      }
      if (
        condition?.expectedHash !== undefined &&
        previous?.hash !== condition.expectedHash
      ) {
        throw new VaultConflictError();
      }
      if (condition?.expectedUserState !== undefined &&
        !(await sameUserState(store, condition.expectedUserState))) {
        throw new VaultConflictError();
      }
      const bytes = sourceBytes.slice();
      const hash = await digest(bytes);
      await store.mutateAtomic(await store.getRevision(), [{
        kind: 'write',
        path,
        file: { bytes, hash, modifiedAt: new Date().toISOString() },
        expectedBefore: expectedFile(previous),
      }]);
      this.#emit({
        kind: previous === undefined ? 'created' : 'modified',
        path,
        hash,
      });
      return { hash };
    });
  }

  #emit(event: VaultChange): void {
    const hub = watchHub(this.name);
    deliver(hub, event);
    hub.channel?.postMessage(event);
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new VaultUnavailableError()),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new VaultUnavailableError()),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new VaultUnavailableError()),
      { once: true },
    );
  });
}

interface IndexedDbRecord {
  key: string;
  vault: string;
  path: string;
  bytes: ArrayBuffer;
  hash: string;
  modifiedAt: string;
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

async function verifiedIndexedDbRecord(
  value: unknown,
  expectedVault: string,
  expectedKey?: string,
): Promise<readonly [string, StoredBrowserFile]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new VaultUnavailableError('The IndexedDB vault contains an invalid file record.');
  }
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ['bytes', 'hash', 'key', 'modifiedAt', 'path', 'vault']) ||
    typeof record.key !== 'string' ||
    typeof record.vault !== 'string' ||
    typeof record.path !== 'string' ||
    !(record.bytes instanceof ArrayBuffer) ||
    typeof record.hash !== 'string' ||
    !SHA256_HASH.test(record.hash) ||
    !isCanonicalIsoTimestamp(record.modifiedAt) ||
    record.vault !== expectedVault ||
    record.key !== `${expectedVault}\u0000${record.path}` ||
    (expectedKey !== undefined && record.key !== expectedKey)) {
    throw new VaultUnavailableError('The IndexedDB vault contains an invalid file record.');
  }
  try {
    if (validatePath(record.path) !== record.path) {
      throw new VaultUnavailableError('The IndexedDB vault contains an invalid file record.');
    }
  } catch (error) {
    if (error instanceof VaultUnavailableError) throw error;
    throw new VaultUnavailableError('The IndexedDB vault contains an invalid file record.');
  }
  const bytes = new Uint8Array(record.bytes.slice(0));
  if (await digest(bytes) !== record.hash) {
    throw new VaultUnavailableError('The IndexedDB vault contains a corrupt file record.');
  }
  return [
    record.path,
    {
      bytes,
      hash: record.hash,
      modifiedAt: record.modifiedAt,
    },
  ];
}

async function openVaultDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open('the-studio-browser-vaults', 3);
  request.addEventListener('upgradeneeded', () => {
    if (!request.result.objectStoreNames.contains('files')) {
      const store = request.result.createObjectStore('files', { keyPath: 'key' });
      store.createIndex('vault', 'vault', { unique: false });
    }
    if (!request.result.objectStoreNames.contains('backends')) {
      request.result.createObjectStore('backends');
    }
    if (!request.result.objectStoreNames.contains('vault-revisions')) {
      request.result.createObjectStore('vault-revisions');
    }
  });
  return requestResult(request);
}

async function readBackendSelection(
  name: string,
): Promise<BrowserVaultBackend | undefined> {
  const db = await openVaultDatabase();
  const transaction = db.transaction('backends', 'readonly');
  const complete = transactionComplete(transaction);
  const result = (await requestResult(
    transaction.objectStore('backends').get(name),
  )) as BrowserVaultBackend | undefined;
  await complete;
  return result;
}

async function writeBackendSelection(
  name: string,
  backend: BrowserVaultBackend,
): Promise<void> {
  const db = await openVaultDatabase();
  const transaction = db.transaction('backends', 'readwrite');
  const complete = transactionComplete(transaction);
  transaction.objectStore('backends').put(backend, name);
  await complete;
}

function createIndexedDbStore(name: string): BrowserVaultStore {
  const database = openVaultDatabase();
  const key = (path: string) => `${name}\u0000${path}`;
  return {
    async entries() {
      const db = await database;
      const transaction = db.transaction('files', 'readonly');
      const complete = transactionComplete(transaction);
      const records = (await requestResult(
        transaction.objectStore('files').index('vault').getAll(name),
      )) as unknown[];
      await complete;
      return Promise.all(records.map((record) => verifiedIndexedDbRecord(record, name)));
    },
    async read(path) {
      const db = await database;
      const transaction = db.transaction('files', 'readonly');
      const complete = transactionComplete(transaction);
      const record = (await requestResult(
        transaction.objectStore('files').get(key(path)),
      )) as unknown;
      await complete;
      if (record === undefined) return undefined;
      const [, file] = await verifiedIndexedDbRecord(record, name, key(path));
      return file;
    },
    async getRevision() {
      const db = await database;
      const transaction = db.transaction('vault-revisions', 'readonly');
      const complete = transactionComplete(transaction);
      const revision = await requestResult(transaction.objectStore('vault-revisions').get(name));
      await complete;
      return typeof revision === 'string' ? revision : '0';
    },
    async mutateAtomic(expectedRevision, mutations) {
      const db = await database;
      const transaction = db.transaction(['files', 'vault-revisions'], 'readwrite');
      const complete = transactionComplete(transaction);
      const revisions = transaction.objectStore('vault-revisions');
      const current = await requestResult(revisions.get(name));
      const revision = typeof current === 'string' ? current : '0';
      if (revision !== expectedRevision) {
        transaction.abort();
        await complete.catch(() => undefined);
        throw new VaultConflictError();
      }
      const files = transaction.objectStore('files');
      for (const mutation of mutations) {
        if (mutation.expectedBefore === undefined) continue;
        const record = (await requestResult(
          files.get(key(mutation.path)),
        )) as IndexedDbRecord | undefined;
        const matches = mutation.expectedBefore.present
          ? record?.hash === mutation.expectedBefore.hash
          : record === undefined;
        if (!matches) {
          transaction.abort();
          await complete.catch(() => undefined);
          throw new VaultConflictError();
        }
      }
      for (const mutation of mutations) {
        if (mutation.kind === 'remove') {
          files.delete(key(mutation.path));
        } else {
          files.put({
            key: key(mutation.path),
            vault: name,
            path: mutation.path,
            bytes: mutation.file.bytes.slice().buffer,
            hash: mutation.file.hash,
            modifiedAt: mutation.file.modifiedAt,
          } satisfies IndexedDbRecord);
        }
      }
      const next = (BigInt(revision) + 1n).toString();
      revisions.put(next, name);
      try {
        await complete;
      } catch (error) {
        if (transaction.error?.name === 'AbortError') throw new VaultConflictError();
        throw error;
      }
      return next;
    },
  };
}

async function directoryForPath(
  root: FileSystemDirectoryHandleLike,
  path: string,
  create: boolean,
): Promise<{ directory: FileSystemDirectoryHandleLike; name: string }> {
  const segments = path.split('/');
  const name = segments.pop();
  if (name === undefined) throw new PathEscapeError();
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }
  return { directory, name };
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function createOpfsStore(name: string): Promise<BrowserVaultStore> {
  const storage = navigator.storage as unknown as StorageManagerWithOpfs;
  if (storage.getDirectory === undefined) {
    throw new VaultUnavailableError('OPFS is unavailable in this browser.');
  }
  const originRoot = await storage.getDirectory();
  const studioRoot = await originRoot.getDirectoryHandle('the-studio', {
    create: true,
  });
  const root = await studioRoot.getDirectoryHandle(encodeURIComponent(name), {
    create: true,
  });
  const probeName = `.studio-opfs-probe-${crypto.randomUUID()}`;
  let probeCreated = false;
  try {
    const probe = await root.getFileHandle(probeName, { create: true });
    probeCreated = true;
    const writable = await probe.createWritable();
    try {
      await writable.write(new Uint8Array([0]));
      await writable.close();
    } catch (error) {
      await writable.abort?.();
      throw error;
    }
  } finally {
    if (probeCreated) await root.removeEntry(probeName);
  }

  async function walk(
    directory: FileSystemDirectoryHandleLike,
    prefix = '',
  ): Promise<Array<readonly [string, StoredBrowserFile]>> {
    const results: Array<readonly [string, StoredBrowserFile]> = [];
    for await (const [entryName, handle] of directory.entries()) {
      const path = prefix === '' ? entryName : `${prefix}/${entryName}`;
      if (handle.kind === 'directory') {
        results.push(...(await walk(handle, path)));
      } else {
        const file = await handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        results.push([
          path,
          {
            bytes,
            hash: await digest(bytes),
            modifiedAt: new Date(file.lastModified).toISOString(),
          },
        ]);
      }
    }
    return results;
  }

  async function readFile(
    path: string,
    maximumBytes?: number,
  ): Promise<StoredBrowserFile | undefined> {
    try {
      const { directory, name: filename } = await directoryForPath(root, path, false);
      const file = await (await directory.getFileHandle(filename)).getFile();
      if (maximumBytes !== undefined && file.size > maximumBytes) {
        throw new VaultUnavailableError('An OPFS recovery journal file is too large.');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      return {
        bytes,
        hash: await digest(bytes),
        modifiedAt: new Date(file.lastModified).toISOString(),
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async function writeFile(path: string, file: StoredBrowserFile): Promise<void> {
    const { directory, name: filename } = await directoryForPath(root, path, true);
    const writable = await (
      await directory.getFileHandle(filename, { create: true })
    ).createWritable();
    try {
      await writable.write(file.bytes.slice());
      await writable.close();
    } catch (error) {
      await writable.abort?.();
      throw error;
    }
  }

  async function removeFile(path: string): Promise<void> {
    const { directory, name: filename } = await directoryForPath(root, path, false);
    await directory.removeEntry(filename);
  }

  async function removeFileIfPresent(path: string): Promise<void> {
    try {
      await removeFile(path);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async function journalExists(): Promise<boolean> {
    try {
      await root.getDirectoryHandle(OPFS_BATCH_JOURNAL);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async function removeJournal(): Promise<void> {
    try {
      await root.removeEntry(OPFS_BATCH_JOURNAL, { recursive: true });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async function fileMetadata(path: string): Promise<{ size: number; lastModified: number }> {
    const { directory, name: filename } = await directoryForPath(root, path, false);
    const file = await (await directory.getFileHandle(filename)).getFile();
    return { size: file.size, lastModified: file.lastModified };
  }

  async function optionalFileMetadata(
    path: string,
  ): Promise<{ size: number; lastModified: number } | undefined> {
    try {
      return await fileMetadata(path);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async function metadataPath(path: string): Promise<string> {
    return `${OPFS_METADATA_DIRECTORY}/${await digest(encoder.encode(path))}.json`;
  }

  async function writeObservedFileMetadata(
    path: string,
    file: StoredBrowserFile,
    observed: { size: number; lastModified: number },
  ): Promise<void> {
    const bytes = encoder.encode(`${JSON.stringify({
      version: 1,
      path,
      hash: file.hash,
      size: observed.size,
      lastModified: observed.lastModified,
    })}\n`);
    if (bytes.byteLength > MAX_OPFS_METADATA_BYTES) {
      throw new VaultUnavailableError('The OPFS file metadata is too large.');
    }
    await writeFile(await metadataPath(path), {
      bytes,
      hash: await digest(bytes),
      modifiedAt: new Date().toISOString(),
    });
  }

  async function writeFileMetadata(path: string, file: StoredBrowserFile): Promise<void> {
    await writeObservedFileMetadata(path, file, await fileMetadata(path));
  }

  async function removeFileMetadata(path: string): Promise<void> {
    await removeFileIfPresent(await metadataPath(path));
  }

  async function publishFile(path: string, file: StoredBrowserFile): Promise<void> {
    await writeFile(path, file);
    await writeFileMetadata(path, file);
  }

  async function removePublishedFile(path: string): Promise<void> {
    await removeFileIfPresent(path);
    await removeFileMetadata(path);
  }

  function sameFileMetadata(
    left: { size: number; lastModified: number },
    right: { size: number; lastModified: number },
  ): boolean {
    return left.size === right.size && left.lastModified === right.lastModified;
  }

  async function readManyBounded(
    paths: readonly string[],
    limits: BrowserVaultMutationReadLimits,
  ): Promise<ReadonlyMap<string, StoredBrowserFile | undefined>> {
    const { maximumFileBytes, maximumTotalBytes, reservedBytes } = limits;
    if (!Number.isSafeInteger(maximumFileBytes) || maximumFileBytes < 0 ||
      !Number.isSafeInteger(maximumTotalBytes) || maximumTotalBytes < 0 ||
      !Number.isSafeInteger(reservedBytes) || reservedBytes < 0) {
      throw new VaultUnavailableError('The bounded mutation read limit is invalid.');
    }
    const observed = new Map<
      string,
      { size: number; lastModified: number } | undefined
    >();
    let totalBytes = reservedBytes;
    if (totalBytes > maximumTotalBytes) {
      throw new VaultUnavailableError('The OPFS batch journal exceeds 512 MiB.');
    }
    for (const path of paths) {
      const metadata = await optionalFileMetadata(path);
      if (metadata !== undefined) {
        if (metadata.size > maximumFileBytes) {
          throw new VaultUnavailableError('An OPFS batch file exceeds 64 MiB.');
        }
        totalBytes += metadata.size;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > maximumTotalBytes) {
          throw new VaultUnavailableError('The OPFS batch journal exceeds 512 MiB.');
        }
      }
      observed.set(path, metadata);
    }

    const files = new Map<string, StoredBrowserFile | undefined>();
    for (const path of paths) {
      const before = observed.get(path);
      if (before === undefined) {
        files.set(path, undefined);
        continue;
      }
      const file = await readFile(path, maximumFileBytes);
      const after = await optionalFileMetadata(path);
      if (file === undefined || after === undefined ||
        !sameFileMetadata(before, after) || file.bytes.byteLength !== after.size) {
        throw new VaultConflictError('A vault entry changed during atomic preflight.');
      }
      files.set(path, file);
    }
    for (const path of paths) {
      const before = observed.get(path);
      const after = await optionalFileMetadata(path);
      if (before === undefined ? after !== undefined :
        after === undefined || !sameFileMetadata(before, after)) {
        throw new VaultConflictError('A vault entry changed during atomic preflight.');
      }
    }
    return files;
  }

  async function readBoundedAndHeal(
    path: string,
    maximumBytes: number,
  ): Promise<StoredBrowserFile | undefined> {
    const revision = await getRevision();
    let before: { size: number; lastModified: number };
    try {
      before = await fileMetadata(path);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    if (before.size > maximumBytes) {
      throw new VaultUnavailableError('The vault entry exceeds the bounded read limit.');
    }
    const file = await readFile(path, maximumBytes);
    if (file === undefined) return undefined;
    const after = await fileMetadata(path);
    if (!sameFileMetadata(before, after) || file.bytes.byteLength !== after.size ||
      await getRevision() !== revision) {
      throw new VaultConflictError('The vault entry changed during its bounded read.');
    }
    await writeObservedFileMetadata(path, file, after);
    const verified = await fileMetadata(path);
    if (!sameFileMetadata(after, verified) || await getRevision() !== revision) {
      await removeFileMetadata(path);
      throw new VaultConflictError('The vault entry changed while healing its metadata.');
    }
    return file;
  }

  async function readFileMetadata(
    path: string,
    observed: { size: number; lastModified: number },
  ): Promise<string | undefined> {
    const sidecar = await readFile(await metadataPath(path), MAX_OPFS_METADATA_BYTES);
    if (sidecar === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(decoder.decode(sidecar.bytes));
    } catch {
      return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const metadata = value as Record<string, unknown>;
    if (!hasExactKeys(metadata, ['hash', 'lastModified', 'path', 'size', 'version']) ||
      metadata.version !== 1 || metadata.path !== path ||
      metadata.size !== observed.size || metadata.lastModified !== observed.lastModified ||
      typeof metadata.hash !== 'string' || !SHA256_HASH.test(metadata.hash)) return undefined;
    return metadata.hash;
  }

  async function walkMetadata(
    directory: FileSystemDirectoryHandleLike,
    prefix = '',
  ): Promise<BrowserVaultStoreMetadata[]> {
    const results: BrowserVaultStoreMetadata[] = [];
    for await (const [entryName, handle] of directory.entries()) {
      if (entryName.slice(0, '.studio-'.length).toLocaleLowerCase('en') === '.studio-') continue;
      const path = prefix === '' ? entryName : `${prefix}/${entryName}`;
      if (handle.kind === 'directory') {
        results.push(...await walkMetadata(handle, path));
        continue;
      }
      const file = await handle.getFile();
      const observed = { size: file.size, lastModified: file.lastModified };
      const hash = await readFileMetadata(path, observed);
      results.push({
        path,
        size: observed.size,
        modifiedAt: new Date(observed.lastModified).toISOString(),
        ...(hash === undefined ? {} : { hash }),
      });
    }
    return results;
  }

  const revisionPath = '.studio-revision';
  async function getRevision(): Promise<string> {
    const revision = await readFile(revisionPath);
    if (revision === undefined) return '0';
    const value = decoder.decode(revision.bytes);
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
      throw new VaultUnavailableError('The browser vault revision is invalid.');
    }
    return value;
  }

  async function readJournalPayload(
    index: number,
    side: 'before' | 'after',
    state: OpfsJournalState,
  ): Promise<StoredBrowserFile | undefined> {
    const file = await readFile(
      `${OPFS_BATCH_JOURNAL}/${side}/${index}`,
      MAX_ATOMIC_FILE_BYTES,
    );
    if (!state.present) {
      if (file !== undefined) {
        throw new VaultUnavailableError('The OPFS recovery journal has an unexpected payload.');
      }
      return undefined;
    }
    if (file === undefined || file.bytes.byteLength !== state.size || file.hash !== state.hash) {
      throw new VaultUnavailableError('The OPFS recovery journal checksum failed.');
    }
    return file;
  }

  function matchesJournalState(
    file: StoredBrowserFile | undefined,
    state: OpfsJournalState,
  ): boolean {
    return state.present
      ? file !== undefined && file.hash === state.hash && file.bytes.byteLength === state.size
      : file === undefined;
  }

  async function preflightJournal(manifest: OpfsJournalManifest): Promise<ReadonlyArray<{
    before: StoredBrowserFile | undefined;
    after: StoredBrowserFile | undefined;
  }>> {
    const payloads = [] as Array<{
      before: StoredBrowserFile | undefined;
      after: StoredBrowserFile | undefined;
    }>;
    for (const [index, entry] of manifest.entries.entries()) {
      payloads.push({
        before: await readJournalPayload(index, 'before', entry.before),
        after: await readJournalPayload(index, 'after', entry.after),
      });
    }
    for (const entry of manifest.entries) {
      const current = await readFile(entry.path, MAX_ATOMIC_FILE_BYTES);
      if (!matchesJournalState(current, entry.before) &&
        !matchesJournalState(current, entry.after)) {
        throw new VaultConflictError(
          'A vault entry changed outside the interrupted OPFS batch.',
        );
      }
    }
    return payloads;
  }

  async function restoreJournalSide(
    manifest: OpfsJournalManifest,
    side: 'before' | 'after',
    payloads: ReadonlyArray<{
      before: StoredBrowserFile | undefined;
      after: StoredBrowserFile | undefined;
    }>,
  ): Promise<void> {
    for (const [index, entry] of manifest.entries.entries()) {
      const file = payloads[index]?.[side];
      if (file === undefined) await removePublishedFile(entry.path);
      else await publishFile(entry.path, file);
    }
  }

  async function recoverJournal(): Promise<void> {
    if (!await journalExists()) return;
    const manifestFile = await readFile(OPFS_BATCH_MANIFEST, MAX_OPFS_MANIFEST_BYTES);
    if (manifestFile === undefined) {
      await removeJournal();
      return;
    }
    const manifest = parseJournalManifest(manifestFile.bytes);
    const progressFile = await readFile(OPFS_BATCH_PROGRESS, MAX_OPFS_PROGRESS_BYTES);
    if (progressFile === undefined) {
      throw new VaultUnavailableError('The OPFS recovery journal progress is missing.');
    }
    if (progressFile.bytes.byteLength > MAX_OPFS_PROGRESS_BYTES) {
      throw new VaultUnavailableError('The OPFS recovery journal progress is invalid.');
    }
    const progress = decoder.decode(progressFile.bytes);
    if (!/^(?:0|[1-9][0-9]*)$/.test(progress) || Number(progress) > manifest.entries.length) {
      throw new VaultUnavailableError('The OPFS recovery journal progress is invalid.');
    }
    const revision = await getRevision();
    if (revision !== manifest.expectedRevision && revision !== manifest.nextRevision) {
      throw new VaultUnavailableError('The OPFS recovery journal revision is inconsistent.');
    }
    const payloads = await preflightJournal(manifest);
    if (revision === manifest.expectedRevision) {
      await restoreJournalSide(manifest, 'before', payloads);
    } else {
      await restoreJournalSide(manifest, 'after', payloads);
    }
    await removeJournal();
  }

  await recoverJournal();

  return {
    entries: () => walk(root),
    metadataEntries: () => walkMetadata(root),
    read: readFile,
    readBounded: readBoundedAndHeal,
    readManyBounded,
    getRevision,
    async mutateAtomic(expectedRevision, mutations) {
      await recoverJournal();
      if (await getRevision() !== expectedRevision) throw new VaultConflictError();
      if (mutations.length === 0 || mutations.length > MAX_ATOMIC_BATCH_WRITES) {
        throw new VaultUnavailableError('The OPFS batch size is invalid.');
      }
      const paths = new Set<string>();
      let reservedBytes = 0;
      for (const mutation of mutations) {
        if (paths.has(mutation.path)) throw new VaultConflictError();
        paths.add(mutation.path);
        const afterBytes = mutation.kind === 'write' ? mutation.file.bytes.byteLength : 0;
        if (afterBytes > MAX_ATOMIC_FILE_BYTES) {
          throw new VaultUnavailableError('An OPFS batch file exceeds 64 MiB.');
        }
        reservedBytes += afterBytes;
        if (!Number.isSafeInteger(reservedBytes) || reservedBytes > MAX_ATOMIC_JOURNAL_BYTES) {
          throw new VaultUnavailableError('The OPFS batch journal exceeds 512 MiB.');
        }
      }
      const previousFiles = await readManyBounded([...paths], {
        maximumFileBytes: MAX_ATOMIC_FILE_BYTES,
        maximumTotalBytes: MAX_ATOMIC_JOURNAL_BYTES,
        reservedBytes,
      });
      const prepared: Array<{
        mutation: BrowserVaultStoreMutation;
        before: StoredBrowserFile | undefined;
        after: StoredBrowserFile | undefined;
      }> = [];
      let journalBytes = 0;
      for (const mutation of mutations) {
        const before = previousFiles.get(mutation.path);
        if (mutation.expectedBefore !== undefined &&
          !matchesExpectedFile(before, mutation.expectedBefore)) {
          throw new VaultConflictError(
            'A vault entry changed after its write condition was validated.',
          );
        }
        const after = mutation.kind === 'write' ? cloneFile(mutation.file) : undefined;
        journalBytes += (before?.bytes.byteLength ?? 0) + (after?.bytes.byteLength ?? 0);
        if (!Number.isSafeInteger(journalBytes) || journalBytes > MAX_ATOMIC_JOURNAL_BYTES) {
          throw new VaultUnavailableError('The OPFS batch journal exceeds 512 MiB.');
        }
        prepared.push({ mutation, before, after });
      }
      const nextRevision = (BigInt(expectedRevision) + 1n).toString();
      const manifest: OpfsJournalManifest = {
        version: 1,
        expectedRevision,
        nextRevision,
        entries: prepared.map(({ mutation, before, after }) => ({
          path: mutation.path,
          before: {
            present: before !== undefined,
            hash: before?.hash ?? null,
            size: before?.bytes.byteLength ?? 0,
          },
          after: {
            present: after !== undefined,
            hash: after?.hash ?? null,
            size: after?.bytes.byteLength ?? 0,
          },
        })),
      };
      let manifestDurable = false;
      let publicationStarted = false;
      try {
        await removeJournal();
        for (const [index, entry] of prepared.entries()) {
          if (entry.before !== undefined) {
            await writeFile(`${OPFS_BATCH_JOURNAL}/before/${index}`, entry.before);
          }
          if (entry.after !== undefined) {
            await writeFile(`${OPFS_BATCH_JOURNAL}/after/${index}`, entry.after);
          }
        }
        const progress = encoder.encode('0');
        await writeFile(OPFS_BATCH_PROGRESS, {
          bytes: progress,
          hash: await digest(progress),
          modifiedAt: new Date().toISOString(),
        });
        const manifestBytes = encoder.encode(`${JSON.stringify(manifest)}\n`);
        if (manifestBytes.byteLength > MAX_OPFS_MANIFEST_BYTES) {
          throw new VaultUnavailableError('The OPFS batch manifest is too large.');
        }
        await writeFile(OPFS_BATCH_MANIFEST, {
          bytes: manifestBytes,
          hash: await digest(manifestBytes),
          modifiedAt: new Date().toISOString(),
        });
        manifestDurable = true;
        const publicationSnapshot = await readManyBounded([...paths], {
          maximumFileBytes: MAX_ATOMIC_FILE_BYTES,
          maximumTotalBytes: MAX_ATOMIC_JOURNAL_BYTES,
          reservedBytes: 0,
        });
        for (const entry of prepared) {
          if (!matchesExpectedFile(
            publicationSnapshot.get(entry.mutation.path),
            expectedFile(entry.before),
          )) {
            throw new VaultConflictError(
              'A vault entry changed before atomic publication.',
            );
          }
        }
        publicationStarted = true;
        for (const [index, entry] of prepared.entries()) {
          if (entry.after === undefined) await removePublishedFile(entry.mutation.path);
          else await publishFile(entry.mutation.path, entry.after);
          const progressBytes = encoder.encode(String(index + 1));
          await writeFile(OPFS_BATCH_PROGRESS, {
            bytes: progressBytes,
            hash: await digest(progressBytes),
            modifiedAt: new Date().toISOString(),
          });
        }
        const bytes = encoder.encode(nextRevision);
        await writeFile(revisionPath, {
          bytes,
          hash: await digest(bytes),
          modifiedAt: new Date().toISOString(),
        });
        await removeJournal();
        return nextRevision;
      } catch (error) {
        try {
          if (manifestDurable && publicationStarted) await recoverJournal();
          else await removeJournal();
        } catch {
          throw new VaultUnavailableError(
            'The browser vault batch failed and its recovery journal was preserved.',
          );
        }
        throw error;
      }
    },
  };
}

async function opfsVaultExists(name: string): Promise<boolean> {
  const storage = navigator.storage as unknown as StorageManagerWithOpfs;
  if (storage.getDirectory === undefined) return false;
  try {
    const originRoot = await storage.getDirectory();
    const studioRoot = await originRoot.getDirectoryHandle('the-studio');
    await studioRoot.getDirectoryHandle(encodeURIComponent(name));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function defaultEnvironment(): BrowserVaultEnvironment {
  const storage =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator.storage as unknown as StorageManagerWithOpfs | undefined);
  return {
    opfsSupported: storage?.getDirectory !== undefined,
    readSelection: readBackendSelection,
    writeSelection: writeBackendSelection,
    opfsVaultExists,
    openOpfs: createOpfsStore,
    openIndexedDb: async (name) => createIndexedDbStore(name),
  };
}

async function selectStore(
  name: string,
  storage: BrowserVaultOptions['storage'],
  environment: BrowserVaultEnvironment,
): Promise<BrowserVaultStore> {
  if (storage === 'indexeddb') return environment.openIndexedDb(name);
  if (storage === 'opfs') return environment.openOpfs(name);
  return withVaultLock(`backend:${name}`, async () => {
    const selected = await environment.readSelection(name);
    if (selected !== undefined) {
      return selected === 'opfs'
        ? environment.openOpfs(name)
        : environment.openIndexedDb(name);
    }
    if (!environment.opfsSupported) {
      const indexedDb = await environment.openIndexedDb(name);
      await environment.writeSelection(name, 'indexeddb');
      return indexedDb;
    }

    let existingOpfsVault = false;
    try {
      existingOpfsVault = await environment.opfsVaultExists(name);
      const opfs = await environment.openOpfs(name);
      await environment.writeSelection(name, 'opfs');
      return opfs;
    } catch (error) {
      if (existingOpfsVault) throw error;
      // With no persisted backend authority, a failed capability probe/open
      // cannot expose an authoritative OPFS vault. Pin the compatibility
      // backend before returning it; future opens never probe OPFS again.
      const indexedDb = await environment.openIndexedDb(name);
      await environment.writeSelection(name, 'indexeddb');
      return indexedDb;
    }
  });
}

export function createBrowserVault(
  name: string,
  options: BrowserVaultOptions = {},
): VaultPort {
  if (name.trim() === '') throw new VaultUnavailableError('A vault name is required.');
  const storePromise =
    options.store === undefined
      ? withVaultLock(
          name,
          () => selectStore(
            name,
            options.storage ?? 'auto',
            options.environment ?? defaultEnvironment(),
          ),
        )
      : Promise.resolve(options.store);
  return new BrowserVault(name, storePromise);
}

export type BrowserPersistenceStatus = 'persistent' | 'best-effort';

type PersistenceManager = Pick<StorageManager, 'persist' | 'persisted'> | {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

export async function ensureBrowserPersistence(
  manager: PersistenceManager =
    typeof navigator === 'undefined' ? {} : (navigator.storage ?? {}),
): Promise<BrowserPersistenceStatus> {
  if (manager.persisted === undefined || manager.persist === undefined) {
    return 'best-effort';
  }
  try {
    if (await manager.persisted()) return 'persistent';
    return (await manager.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
