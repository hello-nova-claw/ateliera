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
  await index.upsert(original, 'Reflection Garden/n1.md', written.hash, { links: [], searchText: '' });
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
    const restored = await service.restore('n1');
    expect(restored.note.id).toBe('n1');
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
    await expect(clean.service.trash('n1')).rejects.toBeInstanceOf(VaultConflictError);
    expect(await clean.vault.exists('Reflection Garden/n1.md')).toBe(true);
  });
});
