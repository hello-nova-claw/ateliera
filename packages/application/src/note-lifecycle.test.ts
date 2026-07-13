import { parseNote, serializeNote } from '@studio/content';
import { VaultConflictError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createNoteLifecycleService } from './note-lifecycle';
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
      { path: 'Attachments/present.jpg', available: true },
      { path: 'Attachments/missing.jpg', available: false },
    ]);

    const restored = await service.restore('n1');
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

  it('treats attachment lookup failures as visible missing attachment state', async () => {
    const { service, vault } = await setup();
    const exists = vault.exists.bind(vault);
    vault.exists = async (path) => {
      if (path === 'Attachments/present.jpg') throw new Error('attachment store unavailable');
      return exists(path);
    };
    const trashed = await service.trash('n1');
    expect(trashed.attachments[0]).toEqual({ path: 'Attachments/present.jpg', available: false });
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
    expect(restored.path).toBe('root-note--restored');
  });

  it('refuses to move a note whose indexed source version is stale', async () => {
    const { service, vault } = await setup();
    await vault.writeTextAtomic('Reflection Garden/n1.md', 'newer source');

    await expect(service.trash('n1')).rejects.toBeInstanceOf(VaultConflictError);
    expect(await vault.exists('Reflection Garden/n1.md')).toBe(true);
  });
});
