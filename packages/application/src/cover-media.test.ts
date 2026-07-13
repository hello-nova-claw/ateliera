import { serializeNote } from '@studio/content';
import { VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import type { VaultPort } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  MAX_COVER_MEDIA_BYTES,
  StudioSaveConflictError,
  createStudioService,
} from './studio-service';
import { RecordingIndex, note } from './test-helpers';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function setupCover(
  cover: string | undefined,
  bytes?: Uint8Array,
  attachmentPath = 'Attachments/morning.jpg',
) {
  const vault = createInMemoryVault();
  const source = note({
    id: 'cover-note',
    title: 'Morning light',
    body: 'A body that must survive.',
    source: { title: 'Family archive', creator: 'Anna' },
    attachments: [attachmentPath, 'Attachments/kept.pdf'],
    display: { featured: true, ...(cover === undefined ? {} : { cover }) },
    extraFrontmatter: { custom_nested: { keep: ['all', 'of', 'this'] } },
  });
  const written = await vault.writeTextAtomic('Foyer/cover.md', serializeNote(source));
  if (bytes !== undefined) await vault.writeBinaryAtomic(attachmentPath, bytes);
  const index = new RecordingIndex();
  const service = createStudioService({
    vault,
    index,
    clock: () => new Date('2026-07-14T00:00:00.000Z'),
  });
  return { vault, service, source, index, hash: written.hash };
}

describe('cover media resolution', () => {
  it('reads a relative vault image and returns bytes with its sniffed MIME type', async () => {
    const { service } = await setupCover('../Attachments/morning.jpg', jpeg);

    await expect(service.resolveCover('Foyer/cover.md')).resolves.toEqual({
      kind: 'available',
      path: 'Attachments/morning.jpg',
      mimeType: 'image/jpeg',
      bytes: jpeg,
    });
  });

  it('normalizes dot segments within the vault without treating the reference as a URL', async () => {
    const { service } = await setupCover('./../Attachments/./morning.png', png, 'Attachments/morning.png');

    await expect(service.resolveCover('Foyer/cover.md')).resolves.toMatchObject({
      kind: 'available',
      path: 'Attachments/morning.png',
      mimeType: 'image/png',
    });
  });

  it('returns a quiet no-cover state without reading binary data', async () => {
    const { service, vault } = await setupCover(undefined);
    const read = vi.spyOn(vault, 'readBinary');

    await expect(service.resolveCover('Foyer/cover.md')).resolves.toEqual({ kind: 'none' });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['https://example.com/private.jpg', 'unsafe-reference'],
    ['//example.com/private.jpg', 'unsafe-reference'],
    ['data:image/png;base64,AAAA', 'unsafe-reference'],
    ['blob:https://example.com/id', 'unsafe-reference'],
    ['file:///Users/anna/private.jpg', 'unsafe-reference'],
    ['/Attachments/private.jpg', 'unsafe-reference'],
    ['C:/Attachments/private.jpg', 'unsafe-reference'],
    ['..\\Attachments\\private.jpg', 'unsafe-reference'],
    ['../../outside.jpg', 'unsafe-reference'],
    ['../.studio/private.jpg', 'unsafe-reference'],
    ['../Attachments/private.jpg?token=secret', 'unsafe-reference'],
    ['../Attachments/private.jpg#fragment', 'unsafe-reference'],
    ['../Attachments/private.svg', 'unsupported-format'],
    ['../Attachments/private', 'unsupported-format'],
  ] as const)('rejects %s before any binary read', async (cover, reason) => {
    const { service, vault } = await setupCover(cover);
    const read = vi.spyOn(vault, 'readBinary');

    await expect(service.resolveCover('Foyer/cover.md')).resolves.toEqual({
      kind: 'unavailable',
      reason,
      reference: cover,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('requires the extension and byte signature to agree', async () => {
    const { service } = await setupCover('../Attachments/morning.jpg', png);

    await expect(service.resolveCover('Foyer/cover.md')).resolves.toEqual({
      kind: 'unavailable',
      reason: 'unsupported-format',
      reference: '../Attachments/morning.jpg',
    });
  });

  it('reports confirmed missing media without swallowing vault outages', async () => {
    const missing = await setupCover('../Attachments/morning.jpg');
    await expect(missing.service.resolveCover('Foyer/cover.md')).resolves.toEqual({
      kind: 'unavailable',
      reason: 'missing',
      reference: '../Attachments/morning.jpg',
    });

    const unavailable = await setupCover('../Attachments/morning.jpg', jpeg);
    unavailable.vault.readBinary = async () => {
      throw new VaultUnavailableError('attachment store unavailable');
    };
    await expect(unavailable.service.resolveCover('Foyer/cover.md')).rejects.toThrow(
      'attachment store unavailable',
    );
  });

  it('enforces the media limit both before and after the binary read', async () => {
    const preflight = await setupCover('../Attachments/morning.jpg', jpeg);
    const originalList = preflight.vault.list.bind(preflight.vault);
    preflight.vault.list = async (prefix) => (await originalList(prefix)).map((entry) =>
      entry.path === 'Attachments/morning.jpg'
        ? { ...entry, size: MAX_COVER_MEDIA_BYTES + 1 }
        : entry);
    const preflightRead = vi.spyOn(preflight.vault, 'readBinary');
    await expect(preflight.service.resolveCover('Foyer/cover.md')).resolves.toMatchObject({
      kind: 'unavailable', reason: 'too-large',
    });
    expect(preflightRead).not.toHaveBeenCalled();

    const postRead = await setupCover('../Attachments/morning.jpg', jpeg);
    postRead.vault.readBinary = async () => new Uint8Array(MAX_COVER_MEDIA_BYTES + 1);
    await expect(postRead.service.resolveCover('Foyer/cover.md')).resolves.toMatchObject({
      kind: 'unavailable', reason: 'too-large',
    });
  });
});

describe('clear cover lifecycle', () => {
  it('clears only display.cover under the exact observed hash', async () => {
    const { service, source, vault, hash } = await setupCover('../Attachments/morning.jpg', jpeg);

    const cleared = await service.clearCover('Foyer/cover.md', hash);

    expect(cleared.note).toEqual({
      ...source,
      updated: '2026-07-14T00:00:00.000Z',
      display: { featured: true },
    });
    expect((await service.load('Foyer/cover.md')).note).toEqual(cleared.note);
    expect(await vault.readBinary('Attachments/morning.jpg')).toEqual(jpeg);
  });

  it('does not rewrite a coverless note when the exact hash still matches', async () => {
    const { service, vault, index, hash } = await setupCover(undefined);
    const write = vi.spyOn(vault, 'writeTextAtomic');

    await expect(service.clearCover('Foyer/cover.md', hash)).resolves.toMatchObject({ hash });
    expect(write).not.toHaveBeenCalled();
    expect(index.upserts).toEqual([]);
  });

  it('preserves the concurrent durable version when the expected hash is stale', async () => {
    const { service, vault, hash } = await setupCover('../Attachments/morning.jpg', jpeg);
    const external = note({
      id: 'cover-note',
      body: 'Changed elsewhere',
      display: { featured: true, cover: '../Attachments/morning.jpg' },
      extraFrontmatter: { external_key: 'preserve me' },
    });
    await vault.writeTextAtomic('Foyer/cover.md', serializeNote(external), { expectedHash: hash });
    const durableText = (await vault.readText('Foyer/cover.md')).text;

    await expect(service.clearCover('Foyer/cover.md', hash)).rejects.toBeInstanceOf(
      StudioSaveConflictError,
    );
    expect((await vault.readText('Foyer/cover.md')).text).toBe(durableText);
  });

  it('leaves the entire note unchanged when the atomic write fails', async () => {
    const { service, vault, index, hash } = await setupCover('../Attachments/morning.jpg', jpeg);
    const durableText = (await vault.readText('Foyer/cover.md')).text;
    const originalWrite = vault.writeTextAtomic.bind(vault);
    vault.writeTextAtomic = async (path, text, condition) => {
      if (path === 'Foyer/cover.md') throw new Error('disk unavailable');
      return originalWrite(path, text, condition);
    };

    await expect(service.clearCover('Foyer/cover.md', hash)).rejects.toThrow('disk unavailable');
    expect((await vault.readText('Foyer/cover.md')).text).toBe(durableText);
    expect(index.upserts).toEqual([]);
  });

  it('rejects malformed note content and disposed services without mutation', async () => {
    const vault = createInMemoryVault();
    const malformed = await vault.writeTextAtomic('Foyer/broken.md', 'not a Studio note');
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await expect(service.clearCover('Foyer/broken.md', malformed.hash)).rejects.toThrow(
      'metadata repair',
    );
    await service.dispose();
    await expect(service.clearCover('Foyer/broken.md', malformed.hash)).rejects.toThrow('disposed');
  });
});

// The resolver depends only on VaultPort. This assertion keeps accidental backend-specific
// requirements out of its public contract while browser and native adapters retain their shared
// binary conformance coverage.
const _vaultPortCompatibility: VaultPort = createInMemoryVault();
void _vaultPortCompatibility;
