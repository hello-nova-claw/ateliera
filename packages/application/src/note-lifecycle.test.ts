import { parseNote, serializeNote } from '@studio/content';
import { VaultConflictError, VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import {
  LifecycleStorageUnavailableError,
  createNoteLifecycleService,
} from './note-lifecycle';
import { RecordingIndex, note } from './test-helpers';

const NOW = new Date('2026-07-13T01:02:03.000Z');

async function setup() {
  const vault = createInMemoryVault();
  const index = new RecordingIndex();
  const original = note({
    id: 'n1',
    body: 'Exact body\r\n',
    attachments: ['Attachments/present.jpg', 'Attachments/missing.jpg'],
    extraFrontmatter: { mystery: { retained: true } },
    lineEnding: '\r\n',
  });
  const written = await vault.writeTextAtomic('Reflection Garden/n1.md', serializeNote(original));
  await vault.writeBinaryAtomic('Attachments/present.jpg', new Uint8Array([1, 2, 3]));
  await index.upsert(original, 'Reflection Garden/n1.md', written.hash);
  const service = createNoteLifecycleService({ vault, index, clock: () => NOW });
  return { vault, index, original, service };
}

describe('note lifecycle', () => {
  it('archives in place without changing user content and can reverse it', async () => {
    const { service, vault } = await setup();
    const archived = await service.archive('n1');
    expect(archived.path).toBe('Reflection Garden/n1.md');
    expect(archived.note).toMatchObject({ status: 'archived', extraFrontmatter: { mystery: { retained: true } } });
    expect(archived.note.lineEnding).toBe('\r\n');

    const restored = await service.unarchive('n1');
    expect(restored.note.status).toBe('active');
    expect(parseNote((await vault.readText(restored.path)).text)).toMatchObject({ ok: true });
  });

  it('moves an unchanged note to controlled Trash and restores its previous path and metadata', async () => {
    const { service, vault, original, index } = await setup();
    const before = await vault.readText('Reflection Garden/n1.md');

    const trashed = await service.trash('n1');
    expect(await vault.exists('Reflection Garden/n1.md')).toBe(false);
    expect((await vault.readText(trashed.trashPath)).text).toBe(before.text);
    expect(await index.getById('n1')).toBeNull();
    expect(trashed.attachments).toEqual([
      { path: 'Attachments/present.jpg', availability: 'available' },
      { path: 'Attachments/missing.jpg', availability: 'missing' },
    ]);

    const restored = await service.restore('n1');
    expect(restored.kind).toBe('restored');
    if (restored.kind !== 'restored') throw new Error('Expected a restored note.');
    expect(restored.path).toBe('Reflection Garden/n1.md');
    expect(restored.relocated).toBe(false);
    expect(restored.missingAttachments).toEqual(['Attachments/missing.jpg']);
    expect(restored.note).toEqual(original);
    expect(await vault.exists(trashed.trashPath)).toBe(false);
  });

  it('preserves a note changed immediately before the Trash move commits', async () => {
    const { service, vault } = await setup();
    const originalMove = vault.move.bind(vault);
    vault.move = async (from, to, condition) => {
      if (from === 'Reflection Garden/n1.md') {
        await vault.writeTextAtomic(from, 'concurrent winner');
      }
      return originalMove(from, to, condition);
    };

    await expect(service.trash('n1')).rejects.toBeInstanceOf(VaultConflictError);
    await expect(vault.readText('Reflection Garden/n1.md')).resolves.toMatchObject({
      text: 'concurrent winner',
    });
    await expect(vault.exists('.studio/Trash/items/n1/n1.md')).resolves.toBe(false);
  });

  it('uses a deterministic safe suffix when the original path is occupied', async () => {
    const { service, vault } = await setup();
    await service.trash('n1');
    await vault.writeTextAtomic('Reflection Garden/n1.md', 'someone else');
    await vault.writeTextAtomic('Reflection Garden/n1--restored.md', 'also occupied');

    const restored = await service.restore('n1');
    expect(restored.kind).toBe('restored');
    if (restored.kind !== 'restored') throw new Error('Expected a restored note.');
    expect(restored).toMatchObject({ path: 'Reflection Garden/n1--restored-2.md', relocated: true });
    expect((await vault.readText('Reflection Garden/n1.md')).text).toBe('someone else');
  });

  it('recovers an interrupted prepared trash transaction without losing the note', async () => {
    const { service, vault } = await setup();
    const originalWrite = vault.writeTextAtomic.bind(vault);
    let manifestWrites = 0;
    vault.writeTextAtomic = async (path, text, condition) => {
      if (path === '.studio/Trash/manifest.json' && ++manifestWrites === 2) {
        throw new Error('manifest unavailable');
      }
      return originalWrite(path, text, condition);
    };

    await expect(service.trash('n1')).rejects.toMatchObject({ name: 'LifecyclePartialFailureError' });
    vault.writeTextAtomic = originalWrite;
    await expect(service.reconcile()).resolves.toEqual([]);
    expect(parseNote((await vault.readText('Reflection Garden/n1.md')).text)).toMatchObject({
      ok: true,
      note: { id: 'n1' },
    });
  });

  it('does not overwrite a corrupt manifest or concurrent manifest change', async () => {
    const { vault, index } = await setup();
    await vault.writeTextAtomic('.studio/Trash/manifest.json', '{broken');
    const service = createNoteLifecycleService({ vault, index, clock: () => NOW });
    await expect(service.trash('n1')).rejects.toMatchObject({ name: 'TrashManifestError' });
    expect(await vault.exists('Reflection Garden/n1.md')).toBe(true);

    const clean = await setup();
    const originalWrite = clean.vault.writeTextAtomic.bind(clean.vault);
    clean.vault.writeTextAtomic = async (path, text, condition) => {
      if (path === '.studio/Trash/manifest.json' && condition?.expectedHash !== undefined) {
        throw new VaultConflictError();
      }
      return originalWrite(path, text, condition);
    };
    await expect(clean.service.trash('n1')).rejects.toMatchObject({
      name: 'LifecyclePartialFailureError',
      cause: expect.any(VaultConflictError),
    });
    expect(await clean.vault.exists('Reflection Garden/n1.md')).toBe(true);
  });

  it('rejects missing notes, invalid unarchive requests, duplicate Trash entries, and occupied Trash paths', async () => {
    const { service, vault } = await setup();
    await expect(service.archive('missing')).rejects.toThrow('No active note');
    await expect(service.unarchive('n1')).rejects.toThrow('Only an archived note');
    await vault.writeTextAtomic('.studio/Trash/items/n1/n1.md', 'occupied');
    await expect(service.trash('n1')).rejects.toThrow('reserved Trash destination');

    const fresh = await setup();
    await fresh.service.trash('n1');
    await fresh.index.upsert(fresh.original, 'Reflection Garden/n1.md', 'hash');
    await expect(fresh.service.trash('n1')).rejects.toThrow('already represented');
    await expect(fresh.service.restore('missing')).rejects.toThrow('No recoverable Trash');
  });

  it('rejects every malformed manifest shape without mutating the note', async () => {
    const invalidEntries: unknown[] = [
      null,
      {},
      { version: 2, entries: [] },
      { version: 1, entries: null },
      { version: 1, entries: [null] },
      { version: 1, entries: [{}] },
      { version: 1, entries: [{ id: 'n1' }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 2 }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: 'outside' }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 1 }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'wrong' }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 1 }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'wrong' }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'trashed', attachments: null }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'trashed', attachments: [null] }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'trashed', attachments: [{}] }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'trashed', attachments: [{ path: 'a' }] }] },
      { version: 1, entries: [{ id: 'n1', originalPath: 'a', trashPath: '.studio/Trash/items/n/a', originalHash: 'h', originalStatus: 'active', deletedAt: 'd', state: 'trashed', attachments: [], restorePath: 1 }] },
    ];
    for (const value of invalidEntries) {
      const { service, vault } = await setup();
      await vault.writeTextAtomic('.studio/Trash/manifest.json', JSON.stringify(value));
      await expect(service.reconcile()).rejects.toBeInstanceOf(Error);
      expect(await vault.exists('Reflection Garden/n1.md')).toBe(true);
    }
  });

  it('reconciles journal states and reports ambiguous transactions for review', async () => {
    const { service, vault } = await setup();
    const deleted = await service.trash('n1');
    const file = await vault.readText('.studio/Trash/manifest.json');
    const manifest = JSON.parse(file.text) as { entries: Array<Record<string, unknown>>; version: 1 };
    manifest.entries[0]!.state = 'prepared';
    await vault.writeTextAtomic('.studio/Trash/manifest.json', `${JSON.stringify(manifest)}\n`, { expectedHash: file.hash });
    await expect(service.reconcile()).resolves.toEqual([]);

    const prepared = await vault.readText('.studio/Trash/manifest.json');
    const both = JSON.parse(prepared.text) as typeof manifest;
    both.entries[0]!.state = 'prepared';
    await vault.writeTextAtomic('Reflection Garden/n1.md', 'ambiguous');
    await vault.writeTextAtomic('.studio/Trash/manifest.json', `${JSON.stringify(both)}\n`, { expectedHash: prepared.hash });
    await expect(service.reconcile()).resolves.toEqual(['Trash transaction for n1 needs review.']);
    await vault.remove('Reflection Garden/n1.md');

    const restoringFile = await vault.readText('.studio/Trash/manifest.json');
    const restoring = JSON.parse(restoringFile.text) as typeof manifest;
    restoring.entries[0]!.state = 'restoring';
    restoring.entries[0]!.restorePath = 'Reflection Garden/recovered.md';
    await vault.writeTextAtomic('.studio/Trash/manifest.json', `${JSON.stringify(restoring)}\n`, { expectedHash: restoringFile.hash });
    await expect(service.reconcile()).resolves.toEqual(['Restore transaction for n1 needs review.']);
    await vault.move(deleted.trashPath, 'Reflection Garden/recovered.md');
    await expect(service.reconcile()).resolves.toEqual([]);
  });

  it('rejects changed and malformed trashed content and bounds occupied restore suffixes', async () => {
    const changed = await setup();
    const deleted = await changed.service.trash('n1');
    const trash = await changed.vault.readText(deleted.trashPath);
    await changed.vault.writeTextAtomic(deleted.trashPath, 'changed', { expectedHash: trash.hash });
    await expect(changed.service.restore('n1')).rejects.toThrow('no longer matches');

    const malformed = await setup();
    const malformedDeleted = await malformed.service.trash('n1');
    const malformedTrash = await malformed.vault.readText(malformedDeleted.trashPath);
    await malformed.vault.writeTextAtomic(malformedDeleted.trashPath, 'not frontmatter', { expectedHash: malformedTrash.hash });
    const manifestFile = await malformed.vault.readText('.studio/Trash/manifest.json');
    const manifest = JSON.parse(manifestFile.text) as { entries: Array<{ originalHash: string }> };
    manifest.entries[0]!.originalHash = (await malformed.vault.readText(malformedDeleted.trashPath)).hash;
    await malformed.vault.writeTextAtomic('.studio/Trash/manifest.json', `${JSON.stringify(manifest)}\n`, { expectedHash: manifestFile.hash });
    await expect(malformed.service.restore('n1')).rejects.toThrow('metadata is damaged');

    const full = await setup();
    await full.service.trash('n1');
    await full.vault.writeTextAtomic('Reflection Garden/n1.md', 'occupied');
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      await full.vault.writeTextAtomic(
        `Reflection Garden/n1--restored${attempt === 1 ? '' : `-${attempt}`}.md`,
        'occupied',
      );
    }
    await expect(full.service.restore('n1')).rejects.toThrow('safe restore path');
  });

  it('reports a restored note whose final manifest cleanup is interrupted', async () => {
    const { service, vault } = await setup();
    await service.trash('n1');
    const originalWrite = vault.writeTextAtomic.bind(vault);
    let writes = 0;
    vault.writeTextAtomic = async (path, text, condition) => {
      if (path === '.studio/Trash/manifest.json' && ++writes === 2) throw new Error('cleanup failed');
      return originalWrite(path, text, condition);
    };
    await expect(service.restore('n1')).rejects.toMatchObject({ name: 'LifecyclePartialFailureError' });
    expect(await vault.exists('Reflection Garden/n1.md')).toBe(true);
    vault.writeTextAtomic = originalWrite;
    await expect(service.reconcile()).resolves.toEqual([]);
  });

  it('keeps attachment lookup failures distinct from confirmed missing attachments', async () => {
    const { service, vault } = await setup();
    const exists = vault.exists.bind(vault);
    vault.exists = async (path) => {
      if (path === 'Attachments/present.jpg') throw new Error('attachment store unavailable');
      return exists(path);
    };
    const trashed = await service.trash('n1');
    expect(trashed.attachments[0]).toEqual({
      path: 'Attachments/present.jpg',
      availability: 'unknown',
    });
  });

  it('reports attachment availability that remains unknown during restore', async () => {
    const { service, vault } = await setup();
    await service.trash('n1');
    const exists = vault.exists.bind(vault);
    vault.exists = async (path) => {
      if (path === 'Attachments/present.jpg') throw new Error('attachment store unavailable');
      return exists(path);
    };

    await expect(service.restore('n1')).resolves.toMatchObject({
      missingAttachments: ['Attachments/missing.jpg'],
      unknownAttachments: ['Attachments/present.jpg'],
    });
  });

  it('rejects Trash when its destination availability cannot be confirmed', async () => {
    const { service, vault } = await setup();
    const exists = vault.exists.bind(vault);
    vault.exists = async (path) => {
      if (path === '.studio/Trash/items/n1/n1.md') throw new Error('Trash store unavailable');
      return exists(path);
    };

    await expect(service.trash('n1')).rejects.toMatchObject({
      name: 'LifecycleStorageUnavailableError',
      paths: ['.studio/Trash/items/n1/n1.md'],
      cause: expect.any(Error),
    });
    await expect(vault.exists('Reflection Garden/n1.md')).resolves.toBe(true);
  });

  it('leaves the Trash journal unchanged when storage presence is unavailable', async () => {
    const { service, vault } = await setup();
    await service.trash('n1');
    const manifestFile = await vault.readText('.studio/Trash/manifest.json');
    const manifest = JSON.parse(manifestFile.text) as { entries: Array<{ state: string }> };
    manifest.entries[0]!.state = 'prepared';
    const prepared = await vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(manifest)}\n`,
      { expectedHash: manifestFile.hash },
    );
    const before = await vault.readText('.studio/Trash/manifest.json');
    const exists = vault.exists.bind(vault);
    vault.exists = async (path) => {
      if (path === 'Reflection Garden/n1.md' || path === '.studio/Trash/items/n1/n1.md') {
        throw new Error('device unavailable');
      }
      return exists(path);
    };

    await expect(service.reconcile()).rejects.toBeInstanceOf(LifecycleStorageUnavailableError);
    await expect(vault.readText('.studio/Trash/manifest.json')).resolves.toEqual({
      text: before.text,
      hash: prepared.hash,
    });
  });

  it('does not treat an unreadable existing Trash manifest as an empty manifest', async () => {
    const { service, vault } = await setup();
    await service.trash('n1');
    const before = await vault.readText('.studio/Trash/manifest.json');
    const read = vault.readText.bind(vault);
    vault.readText = async (path) => {
      if (path === '.studio/Trash/manifest.json') {
        throw new VaultUnavailableError('manifest storage offline');
      }
      return read(path);
    };

    await expect(service.reconcile()).rejects.toMatchObject({
      name: 'LifecycleStorageUnavailableError',
      paths: ['.studio/Trash/manifest.json'],
    });
    vault.readText = read;
    await expect(vault.readText('.studio/Trash/manifest.json')).resolves.toEqual(before);

    const unknown = await setup();
    await unknown.service.trash('n1');
    const unknownRead = unknown.vault.readText.bind(unknown.vault);
    const unknownExists = unknown.vault.exists.bind(unknown.vault);
    unknown.vault.readText = async (path) => {
      if (path === '.studio/Trash/manifest.json') throw new VaultUnavailableError('read offline');
      return unknownRead(path);
    };
    unknown.vault.exists = async (path) => {
      if (path === '.studio/Trash/manifest.json') throw new VaultUnavailableError('existence offline');
      return unknownExists(path);
    };
    await expect(unknown.service.reconcile()).rejects.toMatchObject({
      name: 'LifecycleStorageUnavailableError',
      cause: expect.any(VaultUnavailableError),
    });
  });

  it('leaves prepared and restoring transactions retryable when content reads or destinations fail', async () => {
    const prepared = await setup();
    const preparedDeleted = await prepared.service.trash('n1');
    await prepared.vault.move(preparedDeleted.trashPath, 'Reflection Garden/n1.md');
    const source = await prepared.vault.readText('Reflection Garden/n1.md');
    await prepared.vault.writeTextAtomic('Reflection Garden/n1.md', 'unexpected source', {
      expectedHash: source.hash,
    });
    const preparedFile = await prepared.vault.readText('.studio/Trash/manifest.json');
    const preparedManifest = JSON.parse(preparedFile.text) as { entries: Array<{ state: string }> };
    preparedManifest.entries[0]!.state = 'prepared';
    await prepared.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(preparedManifest)}\n`,
      { expectedHash: preparedFile.hash },
    );
    await expect(prepared.service.reconcile()).resolves.toEqual([
      'Trash transaction for n1 has unexpected content and needs review.',
    ]);

    const unreadableSource = await setup();
    const unreadableDeleted = await unreadableSource.service.trash('n1');
    await unreadableSource.vault.move(unreadableDeleted.trashPath, 'Reflection Garden/n1.md');
    const unreadableFile = await unreadableSource.vault.readText('.studio/Trash/manifest.json');
    const unreadableManifest = JSON.parse(unreadableFile.text) as { entries: Array<{ state: string }> };
    unreadableManifest.entries[0]!.state = 'prepared';
    await unreadableSource.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(unreadableManifest)}\n`,
      { expectedHash: unreadableFile.hash },
    );
    const readText = unreadableSource.vault.readText.bind(unreadableSource.vault);
    unreadableSource.vault.readText = async (path) => {
      if (path === 'Reflection Garden/n1.md') throw new Error('source temporarily unreadable');
      return readText(path);
    };
    await expect(unreadableSource.service.reconcile()).rejects.toBeInstanceOf(
      LifecycleStorageUnavailableError,
    );

    const restoring = await setup();
    await restoring.service.trash('n1');
    const restoringFile = await restoring.vault.readText('.studio/Trash/manifest.json');
    const restoringManifest = JSON.parse(restoringFile.text) as {
      entries: Array<{ state: string; restorePath?: string }>;
    };
    restoringManifest.entries[0]!.state = 'restoring';
    restoringManifest.entries[0]!.restorePath = 'Reflection Garden/recovered.md';
    await restoring.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(restoringManifest)}\n`,
      { expectedHash: restoringFile.hash },
    );
    const restoringExists = restoring.vault.exists.bind(restoring.vault);
    restoring.vault.exists = async (path) => {
      if (path === 'Reflection Garden/recovered.md') throw new Error('destination unavailable');
      return restoringExists(path);
    };
    await expect(restoring.service.reconcile()).rejects.toBeInstanceOf(
      LifecycleStorageUnavailableError,
    );

    const unreadableTrash = await setup();
    const unreadableTrashDeleted = await unreadableTrash.service.trash('n1');
    const unreadableTrashFile = await unreadableTrash.vault.readText('.studio/Trash/manifest.json');
    const unreadableTrashManifest = JSON.parse(unreadableTrashFile.text) as {
      entries: Array<{ state: string }>;
    };
    unreadableTrashManifest.entries[0]!.state = 'prepared';
    await unreadableTrash.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(unreadableTrashManifest)}\n`,
      { expectedHash: unreadableTrashFile.hash },
    );
    const trashRead = unreadableTrash.vault.readText.bind(unreadableTrash.vault);
    unreadableTrash.vault.readText = async (path) => {
      if (path === unreadableTrashDeleted.trashPath) throw new Error('Trash bytes unavailable');
      return trashRead(path);
    };
    await expect(unreadableTrash.service.reconcile()).rejects.toBeInstanceOf(
      LifecycleStorageUnavailableError,
    );

    const unreadableRestore = await setup();
    const unreadableRestoreDeleted = await unreadableRestore.service.trash('n1');
    const unreadableRestoreFile = await unreadableRestore.vault.readText('.studio/Trash/manifest.json');
    const unreadableRestoreManifest = JSON.parse(unreadableRestoreFile.text) as {
      entries: Array<{ state: string; restorePath?: string }>;
    };
    unreadableRestoreManifest.entries[0]!.state = 'restoring';
    unreadableRestoreManifest.entries[0]!.restorePath = 'Reflection Garden/recovered.md';
    await unreadableRestore.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(unreadableRestoreManifest)}\n`,
      { expectedHash: unreadableRestoreFile.hash },
    );
    await unreadableRestore.vault.move(
      unreadableRestoreDeleted.trashPath,
      'Reflection Garden/recovered.md',
    );
    const restoreRead = unreadableRestore.vault.readText.bind(unreadableRestore.vault);
    unreadableRestore.vault.readText = async (path) => {
      if (path === 'Reflection Garden/recovered.md') throw new Error('restored bytes unavailable');
      return restoreRead(path);
    };
    await expect(unreadableRestore.service.reconcile()).rejects.toBeInstanceOf(
      LifecycleStorageUnavailableError,
    );
  });

  it('does not reconcile prepared or restoring entries whose surviving bytes have the wrong hash', async () => {
    const preparedCase = await setup();
    const deleted = await preparedCase.service.trash('n1');
    const trash = await preparedCase.vault.readText(deleted.trashPath);
    await preparedCase.vault.writeTextAtomic(deleted.trashPath, 'wrong bytes', {
      expectedHash: trash.hash,
    });
    const preparedFile = await preparedCase.vault.readText('.studio/Trash/manifest.json');
    const preparedManifest = JSON.parse(preparedFile.text) as { entries: Array<{ state: string }> };
    preparedManifest.entries[0]!.state = 'prepared';
    await preparedCase.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(preparedManifest)}\n`,
      { expectedHash: preparedFile.hash },
    );
    const preparedBefore = await preparedCase.vault.readText('.studio/Trash/manifest.json');

    await expect(preparedCase.service.reconcile()).resolves.toEqual([
      'Trash transaction for n1 has unexpected content and needs review.',
    ]);
    await expect(preparedCase.vault.readText('.studio/Trash/manifest.json')).resolves.toEqual(
      preparedBefore,
    );

    const restoringCase = await setup();
    const restoringDeleted = await restoringCase.service.trash('n1');
    const restoringFile = await restoringCase.vault.readText('.studio/Trash/manifest.json');
    const restoringManifest = JSON.parse(restoringFile.text) as {
      entries: Array<{ state: string; restorePath?: string }>;
    };
    restoringManifest.entries[0]!.state = 'restoring';
    restoringManifest.entries[0]!.restorePath = 'Reflection Garden/recovered.md';
    await restoringCase.vault.writeTextAtomic(
      '.studio/Trash/manifest.json',
      `${JSON.stringify(restoringManifest)}\n`,
      { expectedHash: restoringFile.hash },
    );
    await restoringCase.vault.move(
      restoringDeleted.trashPath,
      'Reflection Garden/recovered.md',
    );
    const destination = await restoringCase.vault.readText('Reflection Garden/recovered.md');
    await restoringCase.vault.writeTextAtomic('Reflection Garden/recovered.md', 'wrong bytes', {
      expectedHash: destination.hash,
    });
    const restoringBefore = await restoringCase.vault.readText('.studio/Trash/manifest.json');

    await expect(restoringCase.service.reconcile()).resolves.toEqual([
      'Restore transaction for n1 has unexpected content and needs review.',
    ]);
    await expect(restoringCase.vault.readText('.studio/Trash/manifest.json')).resolves.toEqual(
      restoringBefore,
    );
  });

  it('keeps independent Trash entries intact while another entry changes state', async () => {
    const { service, vault, index } = await setup();
    await service.trash('n1');
    const second = note({ id: 'n2', title: 'Second' });
    const secondWrite = await vault.writeTextAtomic('Notes/n2.md', serializeNote(second));
    await index.upsert(second, 'Notes/n2.md', secondWrite.hash);
    await service.trash('n2');
    await service.restore('n1');

    const manifest = JSON.parse((await vault.readText('.studio/Trash/manifest.json')).text) as {
      entries: Array<{ id: string }>;
    };
    expect(manifest.entries).toEqual([expect.objectContaining({ id: 'n2' })]);
  });

  it('reconciles a restoring entry at its original path when no explicit destination was recorded', async () => {
    const { service, vault } = await setup();
    const deleted = await service.trash('n1');
    const manifestFile = await vault.readText('.studio/Trash/manifest.json');
    const manifest = JSON.parse(manifestFile.text) as {
      entries: Array<{ state: string; restorePath?: string }>;
    };
    manifest.entries[0]!.state = 'restoring';
    delete manifest.entries[0]!.restorePath;
    await vault.writeTextAtomic('.studio/Trash/manifest.json', `${JSON.stringify(manifest)}\n`, {
      expectedHash: manifestFile.hash,
    });
    await vault.move(deleted.trashPath, 'Reflection Garden/n1.md');
    await expect(service.reconcile()).resolves.toEqual([]);
  });

  it('supports a root-level extensionless imported path and the default clock', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const imported = note({ id: 'root' });
    const write = await vault.writeTextAtomic('root-note', serializeNote(imported));
    await index.upsert(imported, 'root-note', write.hash);
    const service = createNoteLifecycleService({ vault, index });
    const archived = await service.archive('root');
    expect(Number.isFinite(Date.parse(archived.note.updated))).toBe(true);
    await service.trash('root');
    await vault.writeTextAtomic('root-note', 'occupied');
    const restored = await service.restore('root');
    expect(restored.kind).toBe('restored');
    if (restored.kind !== 'restored') throw new Error('Expected a restored note.');
    expect(restored.path).toBe('root-note--restored');
  });

  it('returns a repair state instead of restoring a stable id that already exists elsewhere', async () => {
    const { service, vault, index } = await setup();
    const deleted = await service.trash('n1');
    const collision = note({ id: 'n1', title: 'Existing identity', body: 'Keep my backlinks.' });
    const collisionWrite = await vault.writeTextAtomic(
      'Elsewhere/existing.md',
      serializeNote(collision),
    );
    await index.upsert(collision, 'Elsewhere/existing.md', collisionWrite.hash);
    const backlinks = vi.spyOn(index, 'backlinks').mockResolvedValue(['source-note']);
    const manifestBefore = await vault.readText('.studio/Trash/manifest.json');

    const result = await service.restore('n1');

    expect(result).toEqual({
      kind: 'identity-conflict',
      noteId: 'n1',
      trashPath: deleted.trashPath,
      conflictingPaths: ['Elsewhere/existing.md'],
      repair: {
        required: true,
        options: ['change-existing-id', 'restore-with-new-id'],
      },
    });
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
    await expect(vault.readText('Elsewhere/existing.md')).resolves.toMatchObject({
      hash: collisionWrite.hash,
    });
    await expect(vault.readText('.studio/Trash/manifest.json')).resolves.toEqual(manifestBefore);
    await expect(index.getById('n1')).resolves.toMatchObject({ path: 'Elsewhere/existing.md' });
    await expect(index.backlinks('n1')).resolves.toEqual(['source-note']);
    expect(backlinks).toHaveBeenCalledOnce();
  });

  it('atomically rejects an id introduced after the restore collision scan', async () => {
    const { service, vault, index } = await setup();
    const deleted = await service.trash('n1');
    const second = note({ id: 'n2', title: 'Second Trash entry' });
    const secondWrite = await vault.writeTextAtomic('Notes/n2.md', serializeNote(second));
    await index.upsert(second, 'Notes/n2.md', secondWrite.hash);
    await service.trash('n2');
    const move = vault.move.bind(vault);
    let injected = false;
    vault.move = async (from, to, condition) => {
      if (!injected && from === deleted.trashPath) {
        injected = true;
        await vault.writeTextAtomic(
          'Elsewhere/concurrent.md',
          serializeNote(note({ id: 'n1', title: 'Concurrent identity' })),
        );
      }
      return move(from, to, condition);
    };

    await expect(service.restore('n1')).resolves.toMatchObject({
      kind: 'identity-conflict',
      conflictingPaths: ['Elsewhere/concurrent.md'],
    });
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
    await expect(vault.exists('Reflection Garden/n1.md')).resolves.toBe(false);
    expect(JSON.parse((await vault.readText('.studio/Trash/manifest.json')).text)).toMatchObject({
      entries: expect.arrayContaining([expect.objectContaining({ id: 'n1', state: 'trashed' })]),
    });
  });

  it('resets the restore journal when an id appears before guarded move preparation', async () => {
    const { service, vault } = await setup();
    const deleted = await service.trash('n1');
    const list = vault.list.bind(vault);
    let scans = 0;
    vault.list = async (prefix) => {
      if (prefix === undefined && ++scans === 2) {
        await vault.writeTextAtomic(
          'Elsewhere/between-scans.md',
          serializeNote(note({ id: 'n1', title: 'Between scans' })),
        );
      }
      return list(prefix);
    };

    await expect(service.restore('n1')).resolves.toMatchObject({
      kind: 'identity-conflict',
      conflictingPaths: ['Elsewhere/between-scans.md'],
    });
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
  });

  it('resets the restore journal and retries after an unrelated guarded state conflict', async () => {
    const { service, vault } = await setup();
    const deleted = await service.trash('n1');
    const move = vault.move.bind(vault);
    vault.move = async (from, to, condition) => {
      if (from === deleted.trashPath) {
        await vault.writeTextAtomic(
          'Elsewhere/unrelated.md',
          serializeNote(note({ id: 'other', title: 'Unrelated identity' })),
        );
      }
      return move(from, to, condition);
    };

    await expect(service.restore('n1')).rejects.toBeInstanceOf(VaultConflictError);
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
    expect(JSON.parse((await vault.readText('.studio/Trash/manifest.json')).text)).toMatchObject({
      entries: [expect.objectContaining({ state: 'trashed' })],
    });
  });

  it('keeps restore retryable when another potential note cannot be inspected for id collisions', async () => {
    const { service, vault } = await setup();
    const deleted = await service.trash('n1');
    await vault.writeTextAtomic('Elsewhere/unreadable.md', 'temporarily unavailable');
    const read = vault.readText.bind(vault);
    vault.readText = async (path) => {
      if (path === 'Elsewhere/unreadable.md') throw new Error('read outage');
      return read(path);
    };

    await expect(service.restore('n1')).rejects.toMatchObject({
      name: 'LifecycleStorageUnavailableError',
      paths: ['Elsewhere/unreadable.md'],
      cause: expect.any(Error),
    });
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
  });

  it('refuses to move a note whose indexed source version is stale', async () => {
    const { service, vault } = await setup();
    await vault.writeTextAtomic('Reflection Garden/n1.md', 'newer source');

    await expect(service.trash('n1')).rejects.toBeInstanceOf(VaultConflictError);
    expect(await vault.exists('Reflection Garden/n1.md')).toBe(true);
  });
});
