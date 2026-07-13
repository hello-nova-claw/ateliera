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
  readonly #listeners = new Set<(event: VaultChange) => void>();

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
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
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
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A durable mutation cannot be rejected by an observer failure.
      }
    }
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
  const request = indexedDB.open('the-studio-browser-vaults', 1);
  request.addEventListener('upgradeneeded', () => {
    if (!request.result.objectStoreNames.contains('files')) {
      const store = request.result.createObjectStore('files', { keyPath: 'key' });
      store.createIndex('vault', 'vault', { unique: false });
    }
  });
  return requestResult(request);
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

async function selectStore(
  name: string,
  storage: BrowserVaultOptions['storage'],
): Promise<BrowserVaultStore> {
  if (storage === 'indexeddb') return createIndexedDbStore(name);
  const opfsAvailable =
    (navigator.storage as unknown as StorageManagerWithOpfs).getDirectory !==
    undefined;
  if (storage === 'opfs' || opfsAvailable) {
    try {
      return await createOpfsStore(name);
    } catch (error) {
      if (storage === 'opfs') throw error;
    }
  }
  return createIndexedDbStore(name);
}

export function createBrowserVault(
  name: string,
  options: BrowserVaultOptions = {},
): VaultPort {
  if (name.trim() === '') throw new VaultUnavailableError('A vault name is required.');
  const storePromise =
    options.store === undefined
      ? selectStore(name, options.storage ?? 'auto')
      : Promise.resolve(options.store);
  return new BrowserVault(name, storePromise);
}

interface PortableManifest {
  schemaVersion: 1;
  exportedAt: string;
  files: Array<{ path: string; sha256: string; size: number }>;
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

function parseZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = bytes.byteLength - 22;
  while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) {
    endOffset -= 1;
  }
  if (endOffset < 0) throw new VaultUnavailableError('The ZIP archive is invalid.');
  const count = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new VaultUnavailableError('The ZIP directory is invalid.');
    }
    const method = view.getUint16(offset + 10, true);
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (method !== 0) {
      throw new VaultUnavailableError('Only uncompressed portable ZIP entries are supported.');
    }
    const path = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    validatePath(path);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const content = bytes.slice(dataOffset, dataOffset + compressedSize);
    if (crc32(content) !== expectedCrc) {
      throw new VaultUnavailableError(`ZIP checksum failed for ${path}.`);
    }
    if (files.has(path)) throw new VaultUnavailableError('The ZIP contains duplicate paths.');
    files.set(path, content);
    offset += 46 + nameLength + extraLength + commentLength;
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

export async function importBrowserVault(
  vault: VaultPort,
  source: Blob | Uint8Array,
): Promise<{ imported: number }> {
  const bytes =
    source instanceof Blob
      ? new Uint8Array(await source.arrayBuffer())
      : source.slice();
  const files = parseZip(bytes);
  const manifestBytes = files.get(MANIFEST_PATH);
  if (manifestBytes === undefined) {
    throw new VaultUnavailableError('The ZIP export manifest is missing.');
  }
  let manifest: PortableManifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes)) as PortableManifest;
  } catch {
    throw new VaultUnavailableError('The ZIP export manifest is invalid.');
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new VaultUnavailableError('The ZIP export schema is unsupported.');
  }
  const validated: Array<readonly [string, Uint8Array]> = [];
  for (const descriptor of manifest.files) {
    validatePath(descriptor.path);
    const content = files.get(descriptor.path);
    if (
      content === undefined ||
      content.byteLength !== descriptor.size ||
      (await digest(content)) !== descriptor.sha256
    ) {
      throw new VaultUnavailableError(
        `Archive checksum validation failed for ${descriptor.path}.`,
      );
    }
    validated.push([descriptor.path, content]);
  }
  if (files.size !== validated.length + 1) {
    throw new VaultUnavailableError('The ZIP contains files outside its manifest.');
  }
  for (const [path, content] of validated) {
    await vault.writeBinaryAtomic(path, content);
  }
  return { imported: validated.length };
}
