import { vaultContract } from './__contract__/vault-contract';
import {
  createBrowserVault,
  ensureBrowserPersistence,
  exportBrowserVault,
  importBrowserVault,
  type BrowserVaultEnvironment,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from './browser-vault';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

function createTestStore(): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();

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
    async write(path, file) {
      files.set(path, { ...file, bytes: file.bytes.slice() });
    },
    async remove(path) {
      files.delete(path);
    },
  };
}

vaultContract('browser vault', async () =>
  createBrowserVault(`contract-${crypto.randomUUID()}`, {
    store: createTestStore(),
  }),
);

describe('browser vault ZIP portability boundary', () => {
  it('round trips Markdown and binary assets through a standard ZIP', async () => {
    const source = createBrowserVault('export-source', {
      store: createTestStore(),
    });
    await source.writeTextAtomic('Inbox/hill.md', '# The hill\n');
    await source.writeBinaryAtomic(
      'Attachments/garden.bin',
      new Uint8Array([0, 1, 255]),
    );

    const archive = await exportBrowserVault(source);
    expect(new Uint8Array(await archive.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );

    const target = createBrowserVault('export-target', {
      store: createTestStore(),
    });
    await expect(importBrowserVault(target, archive)).resolves.toEqual({
      imported: 2,
    });
    await expect(target.readText('Inbox/hill.md')).resolves.toMatchObject({
      text: '# The hill\n',
    });
    await expect(target.readBinary('Attachments/garden.bin')).resolves.toEqual(
      new Uint8Array([0, 1, 255]),
    );
  });

  it('validates every checksum before mutating the target', async () => {
    const source = createBrowserVault('checksum-source', {
      store: createTestStore(),
    });
    await source.writeTextAtomic('Inbox/a.md', 'safe');
    const archive = new Uint8Array(
      await (await exportBrowserVault(source)).arrayBuffer(),
    );
    const marker = new TextEncoder().encode('safe');
    const index = archive.findIndex((value, offset) =>
      marker.every((byte, markerOffset) => archive[offset + markerOffset] === byte),
    );
    expect(index).toBeGreaterThan(-1);
    archive[index] = 'x'.charCodeAt(0);

    const target = createBrowserVault('checksum-target', {
      store: createTestStore(),
    });
    await target.writeTextAtomic('Inbox/existing.md', 'keep');
    await expect(importBrowserVault(target, archive)).rejects.toThrow(
      'checksum',
    );
    await expect(target.list()).resolves.toEqual([
      expect.objectContaining({ path: 'Inbox', kind: 'directory' }),
      expect.objectContaining({ path: 'Inbox/existing.md', kind: 'file' }),
    ]);
  });
});

describe('browser vault backend selection', () => {
  function environment(
    overrides: Partial<BrowserVaultEnvironment> = {},
  ): BrowserVaultEnvironment {
    return {
      opfsSupported: true,
      readSelection: vi.fn(async () => undefined),
      writeSelection: vi.fn(async () => undefined),
      openOpfs: vi.fn(async () => createTestStore()),
      openIndexedDb: vi.fn(async () => createTestStore()),
      ...overrides,
    };
  }

  it('surfaces OPFS runtime failures without silently opening an empty IndexedDB vault', async () => {
    const failure = new DOMException('temporarily unavailable', 'UnknownError');
    const fallback = vi.fn(async () => createTestStore());
    const vault = createBrowserVault('anna', {
      environment: environment({
        openOpfs: vi.fn(async () => Promise.reject(failure)),
        openIndexedDb: fallback,
      }),
    });

    await expect(vault.list()).rejects.toBe(failure);
    expect(fallback).not.toHaveBeenCalled();
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
