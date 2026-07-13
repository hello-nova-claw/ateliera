import { vaultContract } from './__contract__/vault-contract';
import {
  createBrowserVault,
  exportBrowserVault,
  importBrowserVault,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from './browser-vault';
import { describe, expect, it } from 'vitest';

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
