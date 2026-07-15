import { vaultContract } from './__contract__/vault-contract';
import {
  createBrowserVault,
  ensureBrowserPersistence,
  type BrowserVaultEnvironment,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from './browser-vault';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import * as browserApi from './browser-vault';
import * as storageApi from './index';
import { VaultConflictError, VaultUnavailableError } from './conflict';

describe('user-facing terminology', () => {
  it('describes the named workspace as a Studio', () => {
    expect(() => createBrowserVault('')).toThrow('A Studio name is required.');
  });
});

class MemoryOpfs {
  readonly files = new Map<string, Uint8Array>();
  readonly virtualSizes = new Map<string, number>();
  readonly modifiedAt = new Map<string, number>();
  readonly arrayBufferReads: string[] = [];
  afterWrite: ((path: string) => Promise<void> | void) | undefined;
  beforeFileLookup: ((path: string) => Promise<void> | void) | undefined;
  private clock = 0;

  directory(path = ''): FileSystemDirectoryHandle {
    const files = this.files;
    const makeDirectory = (child: string): FileSystemDirectoryHandle => this.directory(child);
    const notifyAfterWrite = (file: string): Promise<void> | void => this.afterWrite?.(file);
    const recordArrayBufferRead = (file: string): void => { this.arrayBufferReads.push(file); };
    const notifyBeforeFileLookup = (file: string): Promise<void> | void =>
      this.beforeFileLookup?.(file);
    const thisVirtualSizes = this.virtualSizes;
    const thisModifiedAt = this.modifiedAt;
    const clearVirtualSize = (file: string): void => { this.virtualSizes.delete(file); };
    const clearModifiedAt = (file: string): void => { this.modifiedAt.delete(file); };
    const touch = (file: string): void => { this.modifiedAt.set(file, ++this.clock); };
    const prefix = path === '' ? '' : `${path}/`;
    return {
      kind: 'directory',
      name: path.split('/').at(-1) ?? '',
      async getDirectoryHandle(name, options) {
        const child = `${prefix}${name}`;
        const exists = [...files].some(([file]) => file.startsWith(`${child}/`));
        if (!exists && !options?.create) throw new DOMException('missing', 'NotFoundError');
        if (options?.create && !exists) files.set(`${child}/.directory`, new Uint8Array());
        return makeDirectory(child);
      },
      async getFileHandle(name, options) {
        const filePath = `${prefix}${name}`;
        await notifyBeforeFileLookup(filePath);
        if (!files.has(filePath) && !options?.create) {
          throw new DOMException('missing', 'NotFoundError');
        }
        if (!files.has(filePath)) files.set(filePath, new Uint8Array());
        return {
          kind: 'file',
          name,
          async getFile() {
            const bytes = files.get(filePath) ?? new Uint8Array();
            return {
              size: thisVirtualSizes.get(filePath) ?? bytes.byteLength,
              lastModified: thisModifiedAt.get(filePath) ?? 0,
              async arrayBuffer() {
                recordArrayBufferRead(filePath);
                return Uint8Array.from(files.get(filePath) ?? new Uint8Array()).buffer;
              },
            } as File;
          },
          async createWritable() {
            let pending = new Uint8Array();
            return {
              async write(value: FileSystemWriteChunkType) {
                if (!(value instanceof Uint8Array)) throw new TypeError('Expected binary data.');
                pending = Uint8Array.from(value);
              },
              async close() {
                files.set(filePath, pending);
                clearVirtualSize(filePath);
                touch(filePath);
                await notifyAfterWrite(filePath);
              },
              async abort() {},
            } as FileSystemWritableFileStream;
          },
        } as FileSystemFileHandle;
      },
      async removeEntry(name, options) {
        const target = `${prefix}${name}`;
        if (options?.recursive) {
          for (const key of [...files.keys()]) {
            if (key === target || key.startsWith(`${target}/`)) {
              files.delete(key);
              clearVirtualSize(key);
              clearModifiedAt(key);
            }
          }
          return;
        }
        if (!files.delete(target)) throw new DOMException('missing', 'NotFoundError');
        clearVirtualSize(target);
        clearModifiedAt(target);
      },
      async *entries() {
        const yielded = new Set<string>();
        for (const key of [...files.keys()].sort()) {
          if (!key.startsWith(prefix)) continue;
          const remainder = key.slice(prefix.length);
          const [name, ...tail] = remainder.split('/');
          if (name === undefined || name === '.directory' || yielded.has(name)) continue;
          yielded.add(name);
          yield tail.length > 0
            ? [name, makeDirectory(`${prefix}${name}`)]
            : [name, await this.getFileHandle(name)];
        }
      },
    } as FileSystemDirectoryHandle;
  }

  put(path: string, value: string | Uint8Array): void {
    this.files.set(path, typeof value === 'string' ? new TextEncoder().encode(value) : value.slice());
    this.virtualSizes.delete(path);
    this.modifiedAt.set(path, ++this.clock);
  }

  putVirtual(path: string, size: number): void {
    this.files.set(path, new Uint8Array());
    this.virtualSizes.set(path, size);
    this.modifiedAt.set(path, ++this.clock);
  }

  text(path: string): string | undefined {
    const value = this.files.get(path);
    return value === undefined ? undefined : new TextDecoder().decode(value);
  }
}

async function checksum(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function seedInterruptedOpfsBatch(
  opfs: MemoryOpfs,
  name: string,
  revisionCommitted: boolean,
  published: number,
): Promise<void> {
  const root = `ateliera/${encodeURIComponent(name)}`;
  const entries = await Promise.all(['a', 'b'].map(async (key, index) => {
    const before = `old-${key}`;
    const after = `new-${key}`;
    opfs.put(`${root}/.studio-opfs-batch/before/${index}`, before);
    opfs.put(`${root}/.studio-opfs-batch/after/${index}`, after);
    opfs.put(`${root}/Inbox/${key}.md`, index < published ? after : before);
    return {
      path: `Inbox/${key}.md`,
      before: { present: true, hash: await checksum(before), size: before.length },
      after: { present: true, hash: await checksum(after), size: after.length },
    };
  }));
  opfs.put(`${root}/.studio-revision`, revisionCommitted ? '1' : '0');
  opfs.put(`${root}/.studio-opfs-batch/progress`, String(published));
  opfs.put(`${root}/.studio-opfs-batch/manifest.json`, `${JSON.stringify({
    version: 1,
    expectedRevision: '0',
    nextRevision: '1',
    entries,
  })}\n`);
}

function createTestStore(): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();
  let revision = 0n;

  return {
    async entries() {
      return [...files.entries()].map(([path, file]) => [
        path,
        { ...file, bytes: file.bytes.slice() },
      ] as const);
    },
    async read(path) {
      const file = files.get(path);
      return file === undefined
        ? undefined
        : { ...file, bytes: file.bytes.slice() };
    },
    async getRevision() {
      return revision.toString();
    },
    async mutateAtomic(expectedRevision, mutations) {
      if (expectedRevision !== revision.toString()) throw new Error('stale test revision');
      const next = new Map(files);
      for (const mutation of mutations) {
        if (mutation.kind === 'remove') next.delete(mutation.path);
        else next.set(mutation.path, { ...mutation.file, bytes: mutation.file.bytes.slice() });
      }
      files.clear();
      for (const [path, file] of next) files.set(path, file);
      revision += 1n;
      return revision.toString();
    },
  };
}

vaultContract('browser vault', async () =>
  createBrowserVault(`contract-${crypto.randomUUID()}`, {
    store: createTestStore(),
  }),
);

it('does not expose the obsolete browser-only archive format', () => {
  for (const name of [
    'exportBrowserVault',
    'prepareBrowserVaultImport',
    'applyBrowserVaultImport',
    'importBrowserVault',
    'VaultArchiveError',
  ]) {
    expect(browserApi).not.toHaveProperty(name);
    expect(storageApi).not.toHaveProperty(name);
  }
  expect(storageApi).toHaveProperty('exportVault');
  expect(storageApi).toHaveProperty('prepareVaultImport');
});

it('rolls back a partial browser move when source removal fails', async () => {
  const base = createTestStore();
  const store: BrowserVaultStore = {
    ...base,
    async mutateAtomic(expectedRevision, mutations) {
      if (mutations.some((mutation) =>
        mutation.kind === 'remove' && mutation.path === 'Inbox/a.md')) {
        throw new DOMException('remove failed', 'UnknownError');
      }
      return base.mutateAtomic(expectedRevision, mutations);
    },
  };
  const vault = createBrowserVault('move-rollback', { store });
  await vault.writeTextAtomic('Inbox/a.md', 'one');

  await expect(vault.move('Inbox/a.md', 'Archive/a.md')).rejects.toThrow(
    'remove failed',
  );
  await expect(vault.exists('Inbox/a.md')).resolves.toBe(true);
  await expect(vault.exists('Archive/a.md')).resolves.toBe(false);
});

describe('browser vault backend selection', () => {
  function environment(
    overrides: Partial<BrowserVaultEnvironment> = {},
  ): BrowserVaultEnvironment {
    return {
      opfsSupported: true,
      readSelection: vi.fn(async () => undefined),
      writeSelection: vi.fn(async () => undefined),
      opfsVaultExists: vi.fn(async () => false),
      openOpfs: vi.fn(async () => createTestStore()),
      openIndexedDb: vi.fn(async () => createTestStore()),
      ...overrides,
    };
  }

  it('pins IndexedDB when a brand-new vault cannot complete its initial OPFS open', async () => {
    const failure = new DOMException('temporarily unavailable', 'UnknownError');
    const fallback = vi.fn(async () => createTestStore());
    const writeSelection = vi.fn(async () => undefined);
    const vault = createBrowserVault('anna', {
      environment: environment({
        openOpfs: vi.fn(async () => Promise.reject(failure)),
        openIndexedDb: fallback,
        writeSelection,
      }),
    });

    await expect(vault.list()).resolves.toEqual([]);
    expect(fallback).toHaveBeenCalledOnce();
    expect(writeSelection).toHaveBeenCalledWith('anna', 'indexeddb');
  });

  it('surfaces an unpinned OPFS failure when an OPFS vault already exists', async () => {
    const failure = new DOMException('temporarily unavailable', 'UnknownError');
    const fallback = vi.fn(async () => createTestStore());
    const vault = createBrowserVault('anna', {
      environment: environment({
        opfsVaultExists: vi.fn(async () => true),
        openOpfs: vi.fn(async () => Promise.reject(failure)),
        openIndexedDb: fallback,
      }),
    });

    await expect(vault.list()).rejects.toBe(failure);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('pins IndexedDB when the initial OPFS existence probe itself is unusable', async () => {
    const fallback = vi.fn(async () => createTestStore());
    const writeSelection = vi.fn(async () => undefined);
    const vault = createBrowserVault('anna', {
      environment: environment({
        opfsVaultExists: vi.fn(async () =>
          Promise.reject(new DOMException('probe unavailable', 'UnknownError')),
        ),
        openIndexedDb: fallback,
        writeSelection,
      }),
    });

    await expect(vault.list()).resolves.toEqual([]);
    expect(fallback).toHaveBeenCalledOnce();
    expect(writeSelection).toHaveBeenCalledWith('anna', 'indexeddb');
  });

  it('persists the first backend choice and reopens only that backend', async () => {
    let selected: 'opfs' | 'indexeddb' | undefined;
    const first = environment({
      readSelection: vi.fn(async () => selected),
      writeSelection: vi.fn(async (_name, backend) => {
        selected = backend;
      }),
    });
    await createBrowserVault('anna', { environment: first }).list();
    expect(selected).toBe('opfs');

    const indexedDb = vi.fn(async () => createTestStore());
    const second = environment({
      opfsSupported: false,
      readSelection: vi.fn(async () => selected),
      openOpfs: vi.fn(async () =>
        Promise.reject(new DOMException('missing', 'NotFoundError')),
      ),
      openIndexedDb: indexedDb,
    });
    await expect(
      createBrowserVault('anna', { environment: second }).list(),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(indexedDb).not.toHaveBeenCalled();
  });

  it('selects and remembers IndexedDB only when OPFS is unsupported', async () => {
    const writeSelection = vi.fn(async () => undefined);
    const openIndexedDb = vi.fn(async () => createTestStore());
    const env = environment({
      opfsSupported: false,
      writeSelection,
      openIndexedDb,
    });

    await createBrowserVault('anna', { environment: env }).list();

    expect(openIndexedDb).toHaveBeenCalledOnce();
    expect(writeSelection).toHaveBeenCalledWith('anna', 'indexeddb');
  });
});

it('propagates watcher events between instances of the same named vault', async () => {
  const store = createTestStore();
  const first = createBrowserVault('shared', { store });
  const second = createBrowserVault('shared', { store });
  const listener = vi.fn();
  const stop = await second.watch(listener);

  const written = await first.writeTextAtomic('Inbox/hill.md', 'The hill');

  await vi.waitFor(() =>
    expect(listener).toHaveBeenCalledWith({
      kind: 'created',
      path: 'Inbox/hill.md',
      hash: written.hash,
    }),
  );
  stop();
});

it('filters reserved control components already present in its backing store', async () => {
  const store = createTestStore();
  const file: StoredBrowserFile = {
    bytes: new TextEncoder().encode('seeded'),
    hash: 'seeded-hash',
    modifiedAt: '2026-07-13T00:00:00.000Z',
  };
  await store.mutateAtomic(await store.getRevision(), [
    { kind: 'write', path: 'Inbox/visible.md', file },
    { kind: 'write', path: '.studio-write.lock', file },
    { kind: 'write', path: 'Hidden/.StUdIo-Stage/private.md', file },
  ]);
  const vault = createBrowserVault('seeded-reserved', { store });

  await expect(vault.list()).resolves.toEqual([
    { path: 'Inbox', kind: 'directory' },
    {
      path: 'Inbox/visible.md',
      kind: 'file',
      size: file.bytes.byteLength,
      modifiedAt: file.modifiedAt,
      contentHash: file.hash,
    },
  ]);
});

it('rejects malformed and reserved cross-tab watcher messages', async () => {
  type MessageListener = (event: MessageEvent<unknown>) => void;
  class FakeBroadcastChannel {
    static latest: FakeBroadcastChannel | undefined;
    readonly listeners = new Set<MessageListener>();
    constructor(readonly name: string) { FakeBroadcastChannel.latest = this; }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === 'message') this.listeners.add(listener as MessageListener);
    }
    postMessage() {}
    forge(data: unknown) {
      for (const listener of this.listeners) listener({ data } as MessageEvent<unknown>);
    }
    close() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  }
  vi.stubGlobal('window', {});
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  try {
    const vault = createBrowserVault('forged-watch', { store: createTestStore() });
    const listener = vi.fn();
    await vault.watch(listener);
    const channel = FakeBroadcastChannel.latest!;

    channel.forge({ kind: 'created', path: 'Inbox/no-hash.md' });
    channel.forge({ kind: 'created', path: 'Inbox/../escape.md', hash: 'a'.repeat(64) });
    channel.forge({ kind: 'removed', path: '.studio-write.lock' });
    channel.forge({
      kind: 'moved',
      path: 'Inbox/okay.md',
      previousPath: 'Hidden/.STUDIO-stage/a.md',
      hash: 'a'.repeat(64),
    });
    channel.forge({
      kind: 'created',
      path: 'Inbox/extra.md',
      hash: 'a'.repeat(64),
      unexpected: true,
    });
    expect(listener).not.toHaveBeenCalled();

    channel.forge({
      kind: 'moved',
      path: 'Archive/okay.md',
      previousPath: 'Inbox/okay.md',
      hash: 'a'.repeat(64),
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      kind: 'moved',
      path: 'Archive/okay.md',
      previousPath: 'Inbox/okay.md',
      hash: 'a'.repeat(64),
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('persistent browser storage', () => {
  it('does not prompt again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    await expect(
      ensureBrowserPersistence({
        persisted: async () => true,
        persist,
      }),
    ).resolves.toBe('persistent');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports a calm best-effort status when persistence is denied or unsupported', async () => {
    await expect(
      ensureBrowserPersistence({
        persisted: async () => false,
        persist: async () => false,
      }),
    ).resolves.toBe('best-effort');
    await expect(ensureBrowserPersistence({})).resolves.toBe('best-effort');
  });
});

describe('OPFS crash recovery', () => {
  it.each([
    ['after the journal is durable', false, 0],
    ['after the first file is published', false, 1],
    ['after every file is published but before revision commit', false, 2],
  ] as const)('restores the complete old state %s', async (_boundary, committed, published) => {
    const opfs = new MemoryOpfs();
    const name = `crash-old-${published}`;
    await seedInterruptedOpfsBatch(opfs, name, committed, published);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const reopened = createBrowserVault(name, { storage: 'opfs' });

      await expect(reopened.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'old-a' });
      await expect(reopened.readText('Inbox/b.md')).resolves.toMatchObject({ text: 'old-b' });
      await expect(reopened.getRevision()).resolves.toBe('0');
      expect([...opfs.files.keys()].some((path) => path.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('completes the new state when revision committed before journal cleanup', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-new';
    await seedInterruptedOpfsBatch(opfs, name, true, 1);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const reopened = createBrowserVault(name, { storage: 'opfs' });

      await expect(reopened.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'new-a' });
      await expect(reopened.readText('Inbox/b.md')).resolves.toMatchObject({ text: 'new-b' });
      await expect(reopened.getRevision()).resolves.toBe('1');
      expect([...opfs.files.keys()].some((path) => path.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is idempotent across repeated opens after rolling back an interrupted batch', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-idempotent';
    await seedInterruptedOpfsBatch(opfs, name, false, 1);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      await expect(createBrowserVault(name, { storage: 'opfs' }).list()).resolves.toBeDefined();
      const reopenedAgain = createBrowserVault(name, { storage: 'opfs' });
      await expect(reopenedAgain.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'old-a' });
      await expect(reopenedAgain.readText('Inbox/b.md')).resolves.toMatchObject({ text: 'old-b' });
      await expect(reopenedAgain.getRevision()).resolves.toBe('0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('removes an orphaned pre-manifest journal before exposing the vault', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-orphan';
    const root = `ateliera/${name}`;
    opfs.put(`${root}/Inbox/a.md`, 'old-a');
    opfs.put(`${root}/.studio-revision`, '0');
    opfs.put(`${root}/.studio-opfs-batch/before/0`, 'old-a');
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const reopened = createBrowserVault(name, { storage: 'opfs' });
      await expect(reopened.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'old-a' });
      expect([...opfs.files.keys()].some((path) => path.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['unsafe path', (manifest: Record<string, unknown>) => {
      const entries = manifest.entries as Array<Record<string, unknown>>;
      entries[0] = { ...entries[0], path: '../escape.md' };
    }],
    ['oversized entry', (manifest: Record<string, unknown>) => {
      const entries = manifest.entries as Array<Record<string, unknown>>;
      entries[0] = {
        ...entries[0],
        before: { present: true, hash: 'a'.repeat(64), size: 64 * 1024 * 1024 + 1 },
      };
    }],
    ['forged revision', (manifest: Record<string, unknown>) => {
      manifest.nextRevision = '99';
    }],
  ] as const)('fails closed on a journal with %s', async (_case, forge) => {
    const opfs = new MemoryOpfs();
    const name = `crash-forged-${_case.replaceAll(' ', '-')}`;
    await seedInterruptedOpfsBatch(opfs, name, false, 1);
    const path = `ateliera/${encodeURIComponent(name)}/.studio-opfs-batch/manifest.json`;
    const manifest = JSON.parse(opfs.text(path) ?? '{}') as Record<string, unknown>;
    forge(manifest);
    opfs.put(path, `${JSON.stringify(manifest)}\n`);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const reopened = createBrowserVault(name, { storage: 'opfs' });
      await expect(reopened.list()).rejects.toBeInstanceOf(VaultUnavailableError);
      expect(opfs.text(`ateliera/${encodeURIComponent(name)}/Inbox/a.md`)).toBe('new-a');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed when journal progress or payload checksums are corrupt', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-corrupt';
    await seedInterruptedOpfsBatch(opfs, name, false, 1);
    const root = `ateliera/${name}`;
    opfs.put(`${root}/.studio-opfs-batch/progress`, '3');
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      await expect(createBrowserVault(name, { storage: 'opfs' }).list())
        .rejects.toBeInstanceOf(VaultUnavailableError);
      opfs.put(`${root}/.studio-opfs-batch/progress`, '1');
      opfs.put(`${root}/.studio-opfs-batch/before/0`, 'corrupt');
      await expect(createBrowserVault(name, { storage: 'opfs' }).list())
        .rejects.toBeInstanceOf(VaultUnavailableError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['before', 'after'] as const)(
    'validates every %s recovery payload before mutating an earlier target',
    async (side) => {
      const opfs = new MemoryOpfs();
      const name = `crash-later-${side}-payload-corrupt`;
      await seedInterruptedOpfsBatch(opfs, name, false, 1);
      const root = `ateliera/${name}`;
      opfs.put(`${root}/.studio-opfs-batch/${side}/1`, 'corrupt');
      vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
      try {
        await expect(createBrowserVault(name, { storage: 'opfs' }).list())
          .rejects.toBeInstanceOf(VaultUnavailableError);
        expect(opfs.text(`${root}/Inbox/a.md`)).toBe('new-a');
        expect(opfs.text(`${root}/Inbox/b.md`)).toBe('old-b');
        expect([...opfs.files.keys()].some((file) =>
          file.includes('.studio-opfs-batch'))).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('preserves every target and journal when a later path was externally edited', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-external-edit';
    await seedInterruptedOpfsBatch(opfs, name, false, 1);
    const root = `ateliera/${name}`;
    opfs.put(`${root}/Inbox/b.md`, 'external-b');
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      await expect(createBrowserVault(name, { storage: 'opfs' }).list())
        .rejects.toBeInstanceOf(VaultConflictError);
      expect(opfs.text(`${root}/Inbox/a.md`)).toBe('new-a');
      expect(opfs.text(`${root}/Inbox/b.md`)).toBe('external-b');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an oversized external target before reading or restoring any payload', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-oversized-external-edit';
    await seedInterruptedOpfsBatch(opfs, name, false, 1);
    const root = `ateliera/${name}`;
    const oversizedPath = `${root}/Inbox/b.md`;
    opfs.putVirtual(oversizedPath, 64 * 1024 * 1024 + 1);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      await expect(createBrowserVault(name, { storage: 'opfs' }).list())
        .rejects.toBeInstanceOf(VaultUnavailableError);
      expect(opfs.text(`${root}/Inbox/a.md`)).toBe('new-a');
      expect(opfs.virtualSizes.get(oversizedPath)).toBe(64 * 1024 * 1024 + 1);
      expect(opfs.arrayBufferReads).not.toContain(oversizedPath);
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an oversized atomic overwrite before opening any target body or mutating peers', async () => {
    const opfs = new MemoryOpfs();
    const name = 'oversized-atomic-overwrite';
    const root = `ateliera/${name}`;
    const hugePath = `${root}/Attachments/huge.bin`;
    opfs.putVirtual(hugePath, 5 * 1024 * 1024 * 1024);
    opfs.put(`${root}/.studio-revision`, '0');
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      await expect(vault.writeBatchAtomic({
        expectedRevision: '0',
        writes: [
          {
            path: 'Inbox/new.md',
            bytes: new TextEncoder().encode('must not publish'),
            expectedMissing: true,
          },
          {
            path: 'Attachments/huge.bin',
            bytes: new Uint8Array([1, 2, 3]),
          },
        ],
      })).rejects.toBeInstanceOf(VaultUnavailableError);
      expect(opfs.arrayBufferReads).not.toContain(hugePath);
      expect(opfs.virtualSizes.get(hugePath)).toBe(5 * 1024 * 1024 * 1024);
      expect(opfs.files.has(`${root}/Inbox/new.md`)).toBe(false);
      expect(opfs.text(`${root}/.studio-revision`)).toBe('0');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an external replacement between condition validation and journal capture', async () => {
    const opfs = new MemoryOpfs();
    const name = 'atomic-condition-replacement-race';
    const root = `ateliera/${name}`;
    const target = `${root}/Inbox/existing.md`;
    opfs.put(target, 'original');
    opfs.put(`${root}/.studio-revision`, '0');
    let targetLookups = 0;
    opfs.beforeFileLookup = (path) => {
      if (path === target && ++targetLookups === 5) opfs.put(target, 'external replacement');
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      await expect(vault.writeBatchAtomic({
        expectedRevision: '0',
        writes: [{
          path: 'Inbox/existing.md',
          bytes: new TextEncoder().encode('application write'),
          expectedHash: await checksum('original'),
        }],
      })).rejects.toBeInstanceOf(VaultConflictError);
      expect(opfs.text(target)).toBe('external replacement');
      expect(opfs.text(`${root}/.studio-revision`)).toBe('0');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an external creation between expected-missing validation and journal capture', async () => {
    const opfs = new MemoryOpfs();
    const name = 'atomic-condition-creation-race';
    const root = `ateliera/${name}`;
    const target = `${root}/Inbox/new.md`;
    opfs.put(`${root}/Inbox/.keep`, 'directory sentinel');
    opfs.put(`${root}/.studio-revision`, '0');
    let targetLookups = 0;
    opfs.beforeFileLookup = (path) => {
      if (path === target && ++targetLookups === 3) opfs.put(target, 'external creation');
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      await expect(vault.writeBatchAtomic({
        expectedRevision: '0',
        writes: [{
          path: 'Inbox/new.md',
          bytes: new TextEncoder().encode('application write'),
          expectedMissing: true,
        }],
      })).rejects.toBeInstanceOf(VaultConflictError);
      expect(opfs.text(target)).toBe('external creation');
      expect(opfs.text(`${root}/.studio-revision`)).toBe('0');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('removes its unpublished journal when a target changes immediately before publication', async () => {
    const opfs = new MemoryOpfs();
    const name = 'atomic-prepublication-race';
    const root = `ateliera/${name}`;
    const target = `${root}/Inbox/existing.md`;
    opfs.put(target, 'original');
    opfs.put(`${root}/.studio-revision`, '0');
    let targetLookups = 0;
    opfs.beforeFileLookup = (path) => {
      if (path === target && ++targetLookups === 9) opfs.put(target, 'late external replacement');
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      await expect(vault.writeBatchAtomic({
        expectedRevision: '0',
        writes: [{
          path: 'Inbox/existing.md',
          bytes: new TextEncoder().encode('application write'),
          expectedHash: await checksum('original'),
        }],
      })).rejects.toBeInstanceOf(VaultConflictError);
      expect(opfs.text(target)).toBe('late external replacement');
      expect(opfs.text(`${root}/.studio-revision`)).toBe('0');
      expect([...opfs.files.keys()].some((file) => file.includes('.studio-opfs-batch'))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('holds the public vault lock for recovery so a live reader cannot observe a partial state', async () => {
    const opfs = new MemoryOpfs();
    const name = 'crash-live-reader';
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const live = createBrowserVault(name, { storage: 'opfs' });
      await live.getRevision();
      await seedInterruptedOpfsBatch(opfs, name, false, 1);

      let reachedFirstRestore: () => void = () => undefined;
      const firstRestore = new Promise<void>((resolve) => { reachedFirstRestore = resolve; });
      let resumeRecovery: () => void = () => undefined;
      const recoveryMayResume = new Promise<void>((resolve) => { resumeRecovery = resolve; });
      let paused = false;
      opfs.afterWrite = async (path) => {
        if (!paused && path.endsWith('/Inbox/a.md')) {
          paused = true;
          reachedFirstRestore();
          await recoveryMayResume;
        }
      };

      const recovering = createBrowserVault(name, { storage: 'opfs' });
      await firstRestore;
      let readerSettled = false;
      const reader = live.readText('Inbox/a.md').then((value) => {
        readerSettled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const settledDuringRecovery = readerSettled;

      resumeRecovery();
      await reader;
      await expect(recovering.getRevision()).resolves.toBe('0');
      expect(settledDuringRecovery).toBe(false);
      await expect(live.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'old-a' });
    } finally {
      opfs.afterWrite = undefined;
      vi.unstubAllGlobals();
    }
  });

  it('commits and cleans a real OPFS batch before a clean reopen', async () => {
    const opfs = new MemoryOpfs();
    const name = 'clean-batch';
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      await vault.writeBatchAtomic({
        expectedRevision: await vault.getRevision(),
        writes: [
          { path: 'Inbox/a.md', bytes: new TextEncoder().encode('new-a'), expectedMissing: true },
          { path: 'Inbox/b.md', bytes: new TextEncoder().encode('new-b'), expectedMissing: true },
        ],
      });
      expect([...opfs.files.keys()].some((path) => path.includes('.studio-opfs-batch'))).toBe(false);

      const reopened = createBrowserVault(name, { storage: 'opfs' });
      await expect(reopened.readText('Inbox/a.md')).resolves.toMatchObject({ text: 'new-a' });
      await expect(reopened.readText('Inbox/b.md')).resolves.toMatchObject({ text: 'new-b' });
      await expect(reopened.getRevision()).resolves.toBe('1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lists and previews from OPFS metadata without opening unrelated asset bodies', async () => {
    const opfs = new MemoryOpfs();
    const name = 'metadata-only-list';
    const root = `ateliera/${name}`;
    const hugeCache = `${root}/.studio/cache/unrelated.bin`;
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      const noteText = '---\nid: hill\n---\nRemember the hill.';
      const note = await vault.writeTextAtomic(
        'Inbox/hill.md',
        noteText,
        { expectedMissing: true },
      );
      opfs.putVirtual(hugeCache, 5 * 1024 * 1024 * 1024);
      opfs.arrayBufferReads.length = 0;

      await expect(vault.list()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: 'Inbox/hill.md',
          size: new TextEncoder().encode(noteText).byteLength,
          contentHash: note.hash,
        }),
        expect.objectContaining({
          path: '.studio/cache/unrelated.bin',
          size: 5 * 1024 * 1024 * 1024,
        }),
      ]));
      expect(opfs.arrayBufferReads).not.toContain(`${root}/Inbox/hill.md`);
      expect(opfs.arrayBufferReads).not.toContain(hugeCache);

      opfs.arrayBufferReads.length = 0;
      const source = storageApi.createInMemoryVault();
      const archive = await storageApi.exportVault(source);
      await expect(storageApi.prepareVaultImport(vault, archive)).resolves.toBeDefined();
      expect(opfs.arrayBufferReads).toContain(`${root}/Inbox/hill.md`);
      expect(opfs.arrayBufferReads).not.toContain(hugeCache);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not trust stale OPFS metadata after an external same-size replacement', async () => {
    const opfs = new MemoryOpfs();
    const name = 'stale-file-metadata';
    const root = `ateliera/${name}`;
    const path = 'Attachments/sample.bin';
    const physicalPath = `${root}/${path}`;
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      const original = await vault.writeBinaryAtomic(
        path,
        new TextEncoder().encode('original'),
        { expectedMissing: true },
      );
      await expect(vault.list()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ path, contentHash: original.hash }),
      ]));

      opfs.put(physicalPath, 'external');
      opfs.arrayBufferReads.length = 0;
      const reopened = createBrowserVault(name, { storage: 'opfs' });
      const entry = (await reopened.list()).find((candidate) => candidate.path === path);
      expect(entry).toMatchObject({ path, size: 8 });
      expect(entry).not.toHaveProperty('contentHash');
      expect(opfs.arrayBufferReads).not.toContain(physicalPath);

      const archive = await storageApi.exportVault(storageApi.createInMemoryVault());
      await expect(storageApi.prepareVaultImport(reopened, archive)).resolves.toBeDefined();
      expect(opfs.arrayBufferReads).toContain(physicalPath);
      await expect(reopened.list()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ path, contentHash: await checksum('external') }),
      ]));

      opfs.arrayBufferReads.length = 0;
      await expect(storageApi.prepareVaultImport(reopened, archive)).resolves.toBeDefined();
      expect(opfs.arrayBufferReads).not.toContain(physicalPath);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bounded-reads and backfills metadata for a legacy OPFS asset', async () => {
    const opfs = new MemoryOpfs();
    const name = 'legacy-file-metadata';
    const root = `ateliera/${name}`;
    const path = 'Attachments/legacy.bin';
    const physicalPath = `${root}/${path}`;
    opfs.put(physicalPath, 'legacy');
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => opfs.directory() } });
    try {
      const vault = createBrowserVault(name, { storage: 'opfs' });
      const listed = (await vault.list()).find((candidate) => candidate.path === path);
      expect(listed).toMatchObject({ path, size: 6 });
      expect(listed).not.toHaveProperty('contentHash');
      expect(opfs.arrayBufferReads).not.toContain(physicalPath);

      const archive = await storageApi.exportVault(storageApi.createInMemoryVault());
      await expect(storageApi.prepareVaultImport(vault, archive)).resolves.toBeDefined();
      expect(opfs.arrayBufferReads).toContain(physicalPath);
      await expect(vault.list()).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ path, contentHash: await checksum('legacy') }),
      ]));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
