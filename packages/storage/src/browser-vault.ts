import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import type {
  MoveCondition,
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
  read(path: string): Promise<StoredBrowserFile | undefined>;
  write(path: string, file: StoredBrowserFile): Promise<void>;
  remove(path: string): Promise<void>;
}

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

function parentDirectories(path: string): string[] {
  const segments = path.split('/');
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
}

function isUserNotePath(path: string): boolean {
  try {
    validatePath(path);
  } catch {
    return false;
  }
  if (path.toLocaleLowerCase('en').startsWith('.studio/')) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.toLocaleLowerCase('en').endsWith('.md') || !name.includes('.');
}

async function sameUserState(
  store: BrowserVaultStore,
  expected: NonNullable<MoveCondition['expectedUserState']>,
): Promise<boolean> {
  const current = (await store.entries())
    .filter(([path]) => isUserNotePath(path))
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

  async list(prefix?: string): Promise<VaultEntry[]> {
    if (prefix !== undefined) validatePath(prefix);
    const store = await this.storePromise;
    const entries = new Map<string, VaultEntry>();
    for (const [path, file] of await store.entries()) {
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
        size: file.bytes.byteLength,
        modifiedAt: file.modifiedAt,
        contentHash: file.hash,
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
  }

  async readText(path: string): Promise<{ text: string; hash: string }> {
    const file = await this.#requiredFile(validatePath(path));
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
    return (await this.#requiredFile(validatePath(path))).bytes.slice();
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
      await store.write(destinationPath, file);
      try {
        await store.remove(sourcePath);
      } catch (error) {
        await store.remove(destinationPath);
        throw error;
      }
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
      await store.remove(validPath);
      this.#emit({ kind: 'removed', path: validPath });
    });
  }

  async exists(path: string): Promise<boolean> {
    return (await (await this.storePromise).read(validatePath(path))) !== undefined;
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
      const bytes = sourceBytes.slice();
      const hash = await digest(bytes);
      await store.write(path, {
        bytes,
        hash,
        modifiedAt: new Date().toISOString(),
      });
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

async function openVaultDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open('the-studio-browser-vaults', 2);
  request.addEventListener('upgradeneeded', () => {
    if (!request.result.objectStoreNames.contains('files')) {
      const store = request.result.createObjectStore('files', { keyPath: 'key' });
      store.createIndex('vault', 'vault', { unique: false });
    }
    if (!request.result.objectStoreNames.contains('backends')) {
      request.result.createObjectStore('backends');
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
      )) as IndexedDbRecord[];
      await complete;
      return records.map(
        (record) =>
          [
            record.path,
            {
              bytes: new Uint8Array(record.bytes.slice(0)),
              hash: record.hash,
              modifiedAt: record.modifiedAt,
            },
          ] as const,
      );
    },
    async read(path) {
      const db = await database;
      const transaction = db.transaction('files', 'readonly');
      const complete = transactionComplete(transaction);
      const record = (await requestResult(
        transaction.objectStore('files').get(key(path)),
      )) as IndexedDbRecord | undefined;
      await complete;
      return record === undefined
        ? undefined
        : {
            bytes: new Uint8Array(record.bytes.slice(0)),
            hash: record.hash,
            modifiedAt: record.modifiedAt,
          };
    },
    async write(path, file) {
      const db = await database;
      const transaction = db.transaction('files', 'readwrite');
      const complete = transactionComplete(transaction);
      transaction.objectStore('files').put({
        key: key(path),
        vault: name,
        path,
        bytes: file.bytes.slice().buffer,
        hash: file.hash,
        modifiedAt: file.modifiedAt,
      } satisfies IndexedDbRecord);
      await complete;
    },
    async remove(path) {
      const db = await database;
      const transaction = db.transaction('files', 'readwrite');
      const complete = transactionComplete(transaction);
      transaction.objectStore('files').delete(key(path));
      await complete;
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

  return {
    entries: () => walk(root),
    async read(path) {
      try {
        const { directory, name: filename } = await directoryForPath(
          root,
          path,
          false,
        );
        const file = await (await directory.getFileHandle(filename)).getFile();
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
    },
    async write(path, file) {
      const { directory, name: filename } = await directoryForPath(
        root,
        path,
        true,
      );
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
    },
    async remove(path) {
      const { directory, name: filename } = await directoryForPath(
        root,
        path,
        false,
      );
      await directory.removeEntry(filename);
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
      ? selectStore(
          name,
          options.storage ?? 'auto',
          options.environment ?? defaultEnvironment(),
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
