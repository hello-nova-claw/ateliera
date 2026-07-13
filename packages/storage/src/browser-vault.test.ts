import { vaultContract } from './__contract__/vault-contract';
import {
  createBrowserVault,
  ensureBrowserPersistence,
  exportBrowserVault,
  applyBrowserVaultImport,
  prepareBrowserVaultImport,
  type BrowserVaultEnvironment,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from './browser-vault';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

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

function testZipNumber(value: number, width: 2 | 4): Uint8Array {
  const bytes = new Uint8Array(width);
  const view = new DataView(bytes.buffer);
  if (width === 2) view.setUint16(0, value, true);
  else view.setUint32(0, value, true);
  return bytes;
}

function testZipJoin(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function testCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createDeflatedTestZip(
  files: ReadonlyArray<readonly [string, Uint8Array]>,
): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const compressed = new Uint8Array(deflateRawSync(content));
    const checksum = testCrc32(content);
    const local = testZipJoin([
      testZipNumber(0x04034b50, 4), testZipNumber(20, 2),
      testZipNumber(0x0800, 2), testZipNumber(8, 2),
      testZipNumber(0, 2), testZipNumber(0, 2), testZipNumber(checksum, 4),
      testZipNumber(compressed.byteLength, 4), testZipNumber(content.byteLength, 4),
      testZipNumber(name.byteLength, 2), testZipNumber(0, 2), name, compressed,
    ]);
    locals.push(local);
    centrals.push(testZipJoin([
      testZipNumber(0x02014b50, 4), testZipNumber(20, 2), testZipNumber(20, 2),
      testZipNumber(0x0800, 2), testZipNumber(8, 2), testZipNumber(0, 2),
      testZipNumber(0, 2), testZipNumber(checksum, 4),
      testZipNumber(compressed.byteLength, 4), testZipNumber(content.byteLength, 4),
      testZipNumber(name.byteLength, 2), testZipNumber(0, 2), testZipNumber(0, 2),
      testZipNumber(0, 2), testZipNumber(0, 2), testZipNumber(0, 4),
      testZipNumber(localOffset, 4), name,
    ]));
    localOffset += local.byteLength;
  }
  const central = testZipJoin(centrals);
  return testZipJoin([
    ...locals, central, testZipNumber(0x06054b50, 4), testZipNumber(0, 2),
    testZipNumber(0, 2), testZipNumber(files.length, 2),
    testZipNumber(files.length, 2), testZipNumber(central.byteLength, 4),
    testZipNumber(localOffset, 4), testZipNumber(0, 2),
  ]);
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
    const plan = await prepareBrowserVaultImport(target, archive);
    expect(plan.items).toEqual([
      expect.objectContaining({ action: 'create', path: 'Attachments/garden.bin' }),
      expect.objectContaining({ action: 'create', path: 'Inbox/hill.md' }),
    ]);
    await expect(
      applyBrowserVaultImport(target, plan, { confirm: true }),
    ).resolves.toEqual({
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
    await expect(prepareBrowserVaultImport(target, archive)).rejects.toThrow(
      'checksum',
    );
    await expect(target.list()).resolves.toEqual([
      expect.objectContaining({ path: 'Inbox', kind: 'directory' }),
      expect.objectContaining({ path: 'Inbox/existing.md', kind: 'file' }),
    ]);
  });

  it('requires explicit confirmation and previews replacement collisions', async () => {
    const source = createBrowserVault('collision-source', {
      store: createTestStore(),
    });
    await source.writeTextAtomic('Inbox/hill.md', 'new');
    const target = createBrowserVault('collision-target', {
      store: createTestStore(),
    });
    await target.writeTextAtomic('Inbox/hill.md', 'old');

    const plan = await prepareBrowserVaultImport(
      target,
      await exportBrowserVault(source),
    );
    expect(plan.items).toEqual([
      expect.objectContaining({ action: 'replace', path: 'Inbox/hill.md' }),
    ]);
    await expect(
      applyBrowserVaultImport(target, plan, { confirm: false }),
    ).rejects.toThrow('confirmation');
    await expect(target.readText('Inbox/hill.md')).resolves.toMatchObject({
      text: 'old',
    });
  });

  it('rolls back every target when an import write fails', async () => {
    const base = createTestStore();
    let targetWrites = 0;
    const failingStore: BrowserVaultStore = {
      ...base,
      async write(path, file) {
        if (!path.startsWith('.studio/import-') && ++targetWrites === 2) {
          throw new DOMException('quota reached', 'QuotaExceededError');
        }
        await base.write(path, file);
      },
    };
    const source = createBrowserVault('rollback-source', {
      store: createTestStore(),
    });
    await source.writeTextAtomic('Inbox/a.md', 'new a');
    await source.writeTextAtomic('Inbox/b.md', 'new b');
    const target = createBrowserVault('rollback-target', { store: failingStore });
    await base.write('Inbox/a.md', {
      bytes: new TextEncoder().encode('old a'),
      hash: 'old',
      modifiedAt: new Date().toISOString(),
    });

    const plan = await prepareBrowserVaultImport(
      target,
      await exportBrowserVault(source),
    );
    await expect(
      applyBrowserVaultImport(target, plan, { confirm: true }),
    ).rejects.toThrow('quota reached');
    await expect(target.readText('Inbox/a.md')).resolves.toMatchObject({
      text: 'old a',
    });
    await expect(target.exists('Inbox/b.md')).resolves.toBe(false);
  });

  it('accepts standard deflate-compressed ZIP exports', async () => {
    const content = new TextEncoder().encode('# Compressed hill\n');
    const sha256 = createHash('sha256').update(content).digest('hex');
    const manifest = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      files: [{ path: 'Inbox/hill.md', sha256, size: content.byteLength }],
    }));
    const archive = createDeflatedTestZip([
      ['Inbox/hill.md', content],
      ['.studio/export-manifest.json', manifest],
    ]);
    const target = createBrowserVault('compressed-target', {
      store: createTestStore(),
    });

    const plan = await prepareBrowserVaultImport(target, archive);
    await applyBrowserVaultImport(target, plan, { confirm: true });

    await expect(target.readText('Inbox/hill.md')).resolves.toMatchObject({
      text: '# Compressed hill\n',
    });
  });

  it('returns typed failures for truncated and oversized archives', async () => {
    const source = createBrowserVault('limits-source', { store: createTestStore() });
    await source.writeTextAtomic('Inbox/hill.md', 'hill');
    const archive = new Uint8Array(
      await (await exportBrowserVault(source)).arrayBuffer(),
    );
    const target = createBrowserVault('limits-target', { store: createTestStore() });

    await expect(
      prepareBrowserVaultImport(target, archive.slice(0, -5)),
    ).rejects.toMatchObject({ code: 'invalid-archive' });

    const oversized = archive.slice();
    const view = new DataView(oversized.buffer);
    const central = oversized.findIndex((value, index) =>
      value === 0x50 && view.getUint32(index, true) === 0x02014b50,
    );
    view.setUint32(central + 24, 65 * 1024 * 1024, true);
    await expect(
      prepareBrowserVaultImport(target, oversized),
    ).rejects.toMatchObject({ code: 'archive-too-large' });
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
