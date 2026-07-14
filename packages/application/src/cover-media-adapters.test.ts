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
  let revision = 0n;
  const decodeBatch = (body: Uint8Array) => {
    let offset = 8;
    const readU32 = () => {
      const value = new DataView(body.buffer, body.byteOffset + offset, 4).getUint32(0, true);
      offset += 4;
      return value;
    };
    const readString = () => {
      const length = readU32();
      const value = decoder.decode(body.slice(offset, offset + length));
      offset += length;
      return value;
    };
    readString();
    offset += 1;
    const stateCount = readU32();
    for (let index = 0; index < stateCount; index += 1) {
      readString();
      readString();
    }
    const writeCount = readU32();
    return Array.from({ length: writeCount }, () => {
      const path = readString();
      const flags = body[offset++] ?? 0;
      if ((flags & 2) !== 0) readString();
      const length = readU32();
      const bytes = body.slice(offset, offset + length);
      offset += length;
      return { path, bytes };
    });
  };
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
          revision += 1n;
          return { hash: hash(bytes) };
        }
        case 'vault_get_revision':
          return revision.toString();
        case 'vault_write_batch_atomic': {
          const writes = decodeBatch(args as unknown as Uint8Array);
          for (const write of writes) files.set(write.path, write.bytes);
          revision += 1n;
          return {
            revision: revision.toString(),
            results: writes.map((write) => ({ path: write.path, hash: 'a'.repeat(64) })),
          };
        }
        case 'vault_read_text': {
          const bytes = files.get(path);
          if (bytes === undefined) throw new Error('unavailable');
          return { text: decoder.decode(bytes), hash: hash(bytes) };
        }
        case 'vault_read_binary':
          return files.get(path)?.slice() ?? new Uint8Array();
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
