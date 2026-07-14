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

class MemoryOpfs {
  readonly files = new Map<string, Uint8Array>();

  directory(path = ''): FileSystemDirectoryHandle {
    const storage = this;
    const prefix = path === '' ? '' : `${path}/`;
    return {
      kind: 'directory',
      name: path.split('/').at(-1) ?? '',
      async getDirectoryHandle(name, options) {
        const child = `${prefix}${name}`;
        const exists = [...storage.files].some(([file]) => file.startsWith(`${child}/`));
        if (!exists && !options?.create) throw new DOMException('missing', 'NotFoundError');
        if (options?.create && !exists) storage.files.set(`${child}/.directory`, new Uint8Array());
        return storage.directory(child);
      },
      async getFileHandle(name, options) {
        const filePath = `${prefix}${name}`;
        if (!storage.files.has(filePath) && !options?.create) {
          throw new DOMException('missing', 'NotFoundError');
        }
        if (!storage.files.has(filePath)) storage.files.set(filePath, new Uint8Array());
        return {
          kind: 'file',
          name,
          async getFile() {
            return new File([storage.files.get(filePath) ?? new Uint8Array()], name, {
              lastModified: 0,
            });
          },
          async createWritable() {
            let pending = new Uint8Array();
            return {
              async write(value) { pending = value.slice(); },
              async close() { storage.files.set(filePath, pending); },
              async abort() {},
            };
          },
        } as FileSystemFileHandle;
      },
      async removeEntry(name, options) {
        const target = `${prefix}${name}`;
        if (options?.recursive) {
          for (const key of [...storage.files.keys()]) {
            if (key === target || key.startsWith(`${target}/`)) storage.files.delete(key);
          }
          return;
        }
        if (!storage.files.delete(target)) throw new DOMException('missing', 'NotFoundError');
      },
      async *entries() {
        const yielded = new Set<string>();
        for (const key of [...storage.files.keys()].sort()) {
          if (!key.startsWith(prefix)) continue;
          const remainder = key.slice(prefix.length);
          const [name, ...tail] = remainder.split('/');
          if (name === undefined || name === '.directory' || yielded.has(name)) continue;
          yielded.add(name);
          yield tail.length > 0
            ? [name, storage.directory(`${prefix}${name}`)]
            : [name, await this.getFileHandle(name)];
        }
      },
    } as FileSystemDirectoryHandle;
  }

  put(path: string, value: string | Uint8Array): void {
    this.files.set(path, typeof value === 'string' ? new TextEncoder().encode(value) : value.slice());
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
  const root = `the-studio/${encodeURIComponent(name)}`;
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
});
