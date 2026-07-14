import { serializeNote } from '@studio/content';
import {
  createBrowserVault,
  type BrowserVaultStore,
  type StoredBrowserFile,
} from '@studio/storage/browser';
import { selectTauriVault, type TauriVaultBridge } from '@studio/storage/tauri';
import type { VaultPort } from '@studio/storage/portable';
import { describe, expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function browserStore(): BrowserVaultStore {
  const files = new Map<string, StoredBrowserFile>();
  let revision = 0n;
  return {
    async entries() {
      return [...files].map(([path, file]) =>
        [path, { ...file, bytes: file.bytes.slice() }] as const);
    },
    async read(path) {
      const file = files.get(path);
      return file === undefined ? undefined : { ...file, bytes: file.bytes.slice() };
    },
    async getRevision() { return revision.toString(); },
    async mutateAtomic(expectedRevision, mutations) {
      if (expectedRevision !== revision.toString()) throw new Error('conflict');
      const next = new Map(files);
      for (const mutation of mutations) {
        if (mutation.kind === 'remove') next.delete(mutation.path);
        else next.set(mutation.path, { ...mutation.file, bytes: mutation.file.bytes.slice() });
      }
      files.clear();
      for (const entry of next) files.set(...entry);
      revision += 1n;
      return revision.toString();
    },
  };
}

function nativeBridge(): TauriVaultBridge {
  const files = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const hash = (bytes: Uint8Array) => `native-${bytes.byteLength}-${bytes[0] ?? 0}`;
  return {
    async listen() { return () => undefined; },
    async invoke(command, args) {
      const path = args.path as string;
      switch (command) {
        case 'vault_select':
          return {
            vaultToken: '0123456789abcdef0123456789abcdef',
            recoveryIdentity: 'fedcba9876544abc8edcba9876543210',
          };
        case 'vault_write_text_atomic': {
          const bytes = encoder.encode(args.text as string);
          files.set(path, bytes);
          return { hash: hash(bytes) };
        }
        case 'vault_write_binary_atomic': {
          const bytes = new Uint8Array(args.bytes as number[]);
          files.set(path, bytes);
          return { hash: hash(bytes) };
        }
        case 'vault_read_text': {
          const bytes = files.get(path);
          if (bytes === undefined) throw new Error('unavailable');
          return { text: decoder.decode(bytes), hash: hash(bytes) };
        }
        case 'vault_read_binary':
          return [...(files.get(path) ?? [])];
        case 'vault_list':
          return [...files].map(([filePath, bytes]) => ({
            path: filePath, kind: 'file', size: bytes.byteLength, contentHash: hash(bytes),
          }));
        case 'vault_exists':
          return files.has(path);
        default:
          throw new Error(`Unexpected native command: ${command}`);
      }
    },
  };
}

async function expectRealAttachmentRoundTrip(vault: VaultPort) {
  const source = note({
    id: 'native-cover',
    display: { featured: true, cover: '../Attachments/morning.png' },
  });
  await vault.writeTextAtomic('Foyer/cover.md', serializeNote(source), { expectedMissing: true });
  await vault.writeBinaryAtomic('Attachments/morning.png', png, { expectedMissing: true });
  const service = createStudioService({ vault, index: new RecordingIndex() });
  await expect(service.resolveCover('Foyer/cover.md')).resolves.toEqual({
    kind: 'available',
    path: 'Attachments/morning.png',
    mimeType: 'image/png',
    bytes: png,
  });
}

describe('cover media adapter integration', () => {
  it('round trips real cover bytes through the browser vault adapter', async () => {
    const vault = createBrowserVault('cover-browser', { store: browserStore() });
    await expectRealAttachmentRoundTrip(vault);
  });

  it('round trips real cover bytes through the native IPC vault adapter', async () => {
    const vault = await selectTauriVault(nativeBridge());
    expect(vault).not.toBeNull();
    await expectRealAttachmentRoundTrip(vault!);
  });
});
