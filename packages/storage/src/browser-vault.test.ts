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
