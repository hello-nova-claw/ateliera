import {
  PathEscapeError,
  VaultConflictError,
  VaultUnavailableError,
} from './conflict';
import type {
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

function watchHub(name: string): WatchHub {
  const existing = watchHubs.get(name);
  if (existing !== undefined) return existing;
  const hub: WatchHub = { listeners: new Set() };
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    hub.channel = new BroadcastChannel(`the-studio:vault:${name}`);
    hub.channel.addEventListener('message', (message: MessageEvent<VaultChange>) => {
      if (message.data !== null && typeof message.data === 'object') {
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
      .some((segment) => segment === '' || segment === '.' || segment === '..')
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
  ): Promise<{ hash: string }> {
    return this.#write(validatePath(path), bytes);
  }

  async move(from: string, to: string): Promise<void> {
    const sourcePath = validatePath(from);
    const destinationPath = validatePath(to);
    await withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      const file = await store.read(sourcePath);
      if (file === undefined) throw new VaultUnavailableError();
      if ((await store.read(destinationPath)) !== undefined) {
        throw new VaultConflictError();
      }
      await store.write(destinationPath, file);
      await store.remove(sourcePath);
      this.#emit({
        kind: 'moved',
        path: destinationPath,
        previousPath: sourcePath,
        hash: file.hash,
      });
    });
  }

  async remove(path: string): Promise<void> {
    const validPath = validatePath(path);
    await withVaultLock(this.name, async () => {
      const store = await this.storePromise;
      if ((await store.read(validPath)) === undefined) {
        throw new VaultUnavailableError();
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
  const result = (await requestResult(
    transaction.objectStore('backends').get(name),
  )) as BrowserVaultBackend | undefined;
  await transactionComplete(transaction);
  return result;
}

async function writeBackendSelection(
  name: string,
  backend: BrowserVaultBackend,
): Promise<void> {
  const db = await openVaultDatabase();
  const transaction = db.transaction('backends', 'readwrite');
  transaction.objectStore('backends').put(backend, name);
  await transactionComplete(transaction);
}

function createIndexedDbStore(name: string): BrowserVaultStore {
  const database = openVaultDatabase();
  const key = (path: string) => `${name}\u0000${path}`;
  return {
    async entries() {
      const db = await database;
      const transaction = db.transaction('files', 'readonly');
      const records = (await requestResult(
        transaction.objectStore('files').index('vault').getAll(name),
      )) as IndexedDbRecord[];
      await transactionComplete(transaction);
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
      const record = (await requestResult(
        transaction.objectStore('files').get(key(path)),
      )) as IndexedDbRecord | undefined;
      await transactionComplete(transaction);
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
      transaction.objectStore('files').put({
        key: key(path),
        vault: name,
        path,
        bytes: file.bytes.slice().buffer,
        hash: file.hash,
        modifiedAt: file.modifiedAt,
      } satisfies IndexedDbRecord);
      await transactionComplete(transaction);
    },
    async remove(path) {
      const db = await database;
      const transaction = db.transaction('files', 'readwrite');
      transaction.objectStore('files').delete(key(path));
      await transactionComplete(transaction);
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

function defaultEnvironment(): BrowserVaultEnvironment {
  const storage =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator.storage as unknown as StorageManagerWithOpfs | undefined);
  return {
    opfsSupported: storage?.getDirectory !== undefined,
    readSelection: readBackendSelection,
    writeSelection: writeBackendSelection,
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
  const selected = await environment.readSelection(name);
  if (selected !== undefined) {
    return selected === 'opfs'
      ? environment.openOpfs(name)
      : environment.openIndexedDb(name);
  }
  const backend: BrowserVaultBackend = environment.opfsSupported
    ? 'opfs'
    : 'indexeddb';
  const store =
    backend === 'opfs'
      ? await environment.openOpfs(name)
      : await environment.openIndexedDb(name);
  await environment.writeSelection(name, backend);
  return store;
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
    typeof navigator === 'undefined' ? {} : navigator.storage,
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

interface PortableManifest {
  schemaVersion: 1;
  exportedAt: string;
  files: Array<{ path: string; sha256: string; size: number }>;
}

export type VaultArchiveErrorCode =
  | 'invalid-archive'
  | 'unsupported-archive'
  | 'archive-too-large'
  | 'invalid-manifest'
  | 'checksum-failed'
  | 'confirmation-required'
  | 'target-changed';

export class VaultArchiveError extends VaultUnavailableError {
  constructor(
    readonly code: VaultArchiveErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function createZip(files: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  for (const [path, bytes] of files) {
    const name = encoder.encode(path);
    const checksum = crc32(bytes);
    const local = joinBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(bytes.byteLength),
      uint32(bytes.byteLength),
      uint16(name.byteLength),
      uint16(0),
      name,
      bytes,
    ]);
    localChunks.push(local);
    centralChunks.push(
      joinBytes([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(checksum),
        uint32(bytes.byteLength),
        uint32(bytes.byteLength),
        uint16(name.byteLength),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name,
      ]),
    );
    offset += local.byteLength;
  }
  const central = joinBytes(centralChunks);
  return joinBytes([
    ...localChunks,
    central,
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(central.byteLength),
    uint32(offset),
    uint16(0),
  ]);
}

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_COUNT = 10_000;

function requireRange(
  bytes: Uint8Array,
  offset: number,
  length: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.byteLength
  ) {
    throw new VaultArchiveError('invalid-archive', `${label} is outside the ZIP archive.`);
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new VaultArchiveError(
      'unsupported-archive',
      'Compressed ZIP entries are not supported by this browser.',
    );
  }
  try {
    const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(
      new DecompressionStream('deflate-raw' as CompressionFormat),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new VaultArchiveError('invalid-archive', 'A compressed ZIP entry is invalid.');
  }
}

async function parseZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new VaultArchiveError('archive-too-large', 'The ZIP archive is too large.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = bytes.byteLength - 22;
  const searchFloor = Math.max(0, bytes.byteLength - 65_557);
  while (endOffset >= searchFloor && view.getUint32(endOffset, true) !== 0x06054b50) {
    endOffset -= 1;
  }
  if (endOffset < searchFloor) {
    throw new VaultArchiveError('invalid-archive', 'The ZIP archive is invalid.');
  }
  requireRange(bytes, endOffset, 22, 'The ZIP end record');
  const commentLength = view.getUint16(endOffset + 20, true);
  if (endOffset + 22 + commentLength !== bytes.byteLength) {
    throw new VaultArchiveError('invalid-archive', 'The ZIP end record is invalid.');
  }
  const count = view.getUint16(endOffset + 10, true);
  if (count > MAX_ENTRY_COUNT || view.getUint16(endOffset + 8, true) !== count) {
    throw new VaultArchiveError('archive-too-large', 'The ZIP contains too many entries.');
  }
  const centralSize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  const centralEnd = offset + centralSize;
  requireRange(bytes, offset, centralSize, 'The ZIP directory');
  if (centralEnd !== endOffset) {
    throw new VaultArchiveError('invalid-archive', 'The ZIP directory length is invalid.');
  }
  const files = new Map<string, Uint8Array>();
  let totalSize = 0;
  for (let index = 0; index < count; index += 1) {
    requireRange(bytes, offset, 46, 'A ZIP directory entry');
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new VaultArchiveError('invalid-archive', 'The ZIP directory is invalid.');
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const entryLength = 46 + nameLength + extraLength + entryCommentLength;
    requireRange(bytes, offset, entryLength, 'A ZIP directory entry');
    if ((flags & 0x0001) !== 0 || (flags & ~0x0808) !== 0 || ![0, 8].includes(method)) {
      throw new VaultArchiveError(
        'unsupported-archive',
        'The ZIP uses unsupported encryption, flags, or compression.',
      );
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      throw new VaultArchiveError('archive-too-large', 'A ZIP entry is too large.');
    }
    const path = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    validatePath(path);
    requireRange(bytes, localOffset, 30, 'A ZIP local entry');
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new VaultArchiveError('invalid-archive', 'A ZIP local entry is invalid.');
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(bytes, localOffset + 30, localNameLength + localExtraLength, 'A ZIP local header');
    requireRange(bytes, dataOffset, compressedSize, 'ZIP entry data');
    const localName = decoder.decode(
      bytes.slice(localOffset + 30, localOffset + 30 + localNameLength),
    );
    if (localName !== path || localFlags !== flags || localMethod !== method) {
      throw new VaultArchiveError('invalid-archive', 'ZIP headers do not agree.');
    }
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? compressed : await inflateRaw(compressed);
    if (content.byteLength !== uncompressedSize) {
      throw new VaultArchiveError('invalid-archive', `ZIP size validation failed for ${path}.`);
    }
    if (crc32(content) !== expectedCrc) {
      throw new VaultArchiveError('checksum-failed', `ZIP checksum failed for ${path}.`);
    }
    if (files.has(path)) {
      throw new VaultArchiveError('invalid-archive', 'The ZIP contains duplicate paths.');
    }
    files.set(path, content);
    totalSize += content.byteLength;
    if (totalSize > MAX_TOTAL_BYTES) {
      throw new VaultArchiveError('archive-too-large', 'The expanded ZIP is too large.');
    }
    offset += entryLength;
  }
  if (offset !== centralEnd) {
    throw new VaultArchiveError('invalid-archive', 'The ZIP directory is malformed.');
  }
  return files;
}

const MANIFEST_PATH = '.studio/export-manifest.json';

export async function exportBrowserVault(vault: VaultPort): Promise<Blob> {
  const entries = (await vault.list()).filter(
    (entry) =>
      entry.kind === 'file' &&
      entry.path !== MANIFEST_PATH &&
      !entry.path.startsWith('.studio/index/'),
  );
  const files: Array<readonly [string, Uint8Array]> = [];
  const manifest: PortableManifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    files: [],
  };
  for (const entry of entries) {
    const bytes = await vault.readBinary(entry.path);
    const sha256 = await digest(bytes);
    files.push([entry.path, bytes]);
    manifest.files.push({ path: entry.path, sha256, size: bytes.byteLength });
  }
  files.push([MANIFEST_PATH, encoder.encode(JSON.stringify(manifest, null, 2))]);
  const archive = createZip(files);
  return new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' });
}

export interface BrowserVaultImportItem {
  action: 'create' | 'replace';
  path: string;
  size: number;
  sha256: string;
  expectedHash?: string;
}

export interface BrowserVaultImportPlan {
  id: string;
  archiveHash: string;
  items: readonly BrowserVaultImportItem[];
  readonly files: ReadonlyMap<string, Uint8Array>;
}

function validManifest(value: unknown): value is PortableManifest {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.exportedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.exportedAt)) &&
    Array.isArray(candidate.files) &&
    candidate.files.every((descriptor) => {
      if (descriptor === null || typeof descriptor !== 'object') return false;
      const file = descriptor as Record<string, unknown>;
      return (
        typeof file.path === 'string' &&
        typeof file.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(file.sha256) &&
        typeof file.size === 'number' &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0 &&
        file.size <= MAX_ENTRY_BYTES
      );
    })
  );
}

export async function prepareBrowserVaultImport(
  vault: VaultPort,
  source: Blob | Uint8Array,
): Promise<BrowserVaultImportPlan> {
  const bytes =
    source instanceof Blob
      ? new Uint8Array(await source.arrayBuffer())
      : source.slice();
  const files = await parseZip(bytes);
  const manifestBytes = files.get(MANIFEST_PATH);
  if (manifestBytes === undefined) {
    throw new VaultArchiveError('invalid-manifest', 'The ZIP export manifest is missing.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    throw new VaultArchiveError('invalid-manifest', 'The ZIP export manifest is invalid.');
  }
  if (!validManifest(parsed)) {
    throw new VaultArchiveError('invalid-manifest', 'The ZIP export schema is unsupported.');
  }
  const manifest = parsed;
  const validated = new Map<string, Uint8Array>();
  const items: BrowserVaultImportItem[] = [];
  const manifestPaths = new Set<string>();
  for (const descriptor of manifest.files) {
    validatePath(descriptor.path);
    if (descriptor.path === MANIFEST_PATH || manifestPaths.has(descriptor.path)) {
      throw new VaultArchiveError('invalid-manifest', 'The manifest contains duplicate paths.');
    }
    manifestPaths.add(descriptor.path);
    const content = files.get(descriptor.path);
    if (
      content === undefined ||
      content.byteLength !== descriptor.size ||
      (await digest(content)) !== descriptor.sha256
    ) {
      throw new VaultArchiveError(
        'checksum-failed',
        `Archive checksum validation failed for ${descriptor.path}.`,
      );
    }
    validated.set(descriptor.path, content.slice());
    const existing = (await vault.list(descriptor.path)).find(
      (entry) => entry.kind === 'file' && entry.path === descriptor.path,
    );
    items.push({
      action: existing === undefined ? 'create' : 'replace',
      path: descriptor.path,
      size: descriptor.size,
      sha256: descriptor.sha256,
      ...(existing?.contentHash === undefined
        ? {}
        : { expectedHash: existing.contentHash }),
    });
  }
  if (files.size !== validated.size + 1) {
    throw new VaultArchiveError('invalid-manifest', 'The ZIP contains files outside its manifest.');
  }
  items.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return {
    id: crypto.randomUUID(),
    archiveHash: await digest(bytes),
    items,
    files: validated,
  };
}

export async function applyBrowserVaultImport(
  vault: VaultPort,
  plan: BrowserVaultImportPlan,
  options: { confirm: boolean },
): Promise<{ imported: number }> {
  if (!options.confirm) {
    throw new VaultArchiveError(
      'confirmation-required',
      'Import confirmation is required before the vault can change.',
    );
  }
  for (const item of plan.items) {
    const current = (await vault.list(item.path)).find(
      (entry) => entry.kind === 'file' && entry.path === item.path,
    );
    if (
      (item.action === 'create' && current !== undefined) ||
      (item.action === 'replace' && current?.contentHash !== item.expectedHash)
    ) {
      throw new VaultArchiveError(
        'target-changed',
        `The import target changed after preview: ${item.path}.`,
      );
    }
  }

  const stageRoot = `.studio/import-stage/${plan.id}`;
  const backupRoot = `.studio/import-backup/${plan.id}`;
  const staged: string[] = [];
  const backups = new Map<string, Uint8Array>();
  const applied: BrowserVaultImportItem[] = [];
  const cleanup = async () => {
    for (const path of [...staged].reverse()) {
      if (await vault.exists(path)) await vault.remove(path);
    }
  };
  try {
    for (const item of plan.items) {
      const content = plan.files.get(item.path);
      if (content === undefined || (await digest(content)) !== item.sha256) {
        throw new VaultArchiveError('checksum-failed', `Import plan checksum failed for ${item.path}.`);
      }
      const stagePath = `${stageRoot}/${item.path}`;
      await vault.writeBinaryAtomic(stagePath, content);
      staged.push(stagePath);
      if (item.action === 'replace') {
        const oldBytes = await vault.readBinary(item.path);
        backups.set(item.path, oldBytes);
        const backupPath = `${backupRoot}/${item.path}`;
        await vault.writeBinaryAtomic(backupPath, oldBytes);
        staged.push(backupPath);
      }
    }
    for (const item of plan.items) {
      await vault.writeBinaryAtomic(item.path, await vault.readBinary(`${stageRoot}/${item.path}`));
      applied.push(item);
    }
  } catch (error) {
    for (const item of [...applied].reverse()) {
      const previous = backups.get(item.path);
      try {
        if (previous === undefined) {
          if (await vault.exists(item.path)) await vault.remove(item.path);
        } else {
          await vault.writeBinaryAtomic(item.path, previous);
        }
      } catch {
        throw new VaultUnavailableError(
          `Import failed and rollback could not restore ${item.path}. Backups remain in ${backupRoot}.`,
        );
      }
    }
    await cleanup();
    throw error;
  }
  await cleanup();
  return { imported: plan.items.length };
}

export async function importBrowserVault(
  vault: VaultPort,
  source: Blob | Uint8Array,
  options: { confirm: boolean },
): Promise<{ imported: number }> {
  const plan = await prepareBrowserVaultImport(vault, source);
  return applyBrowserVaultImport(vault, plan, options);
}
