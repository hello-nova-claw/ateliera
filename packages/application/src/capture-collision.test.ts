import { parseNote } from '@studio/content';
import { serializeNote } from '@studio/content';
import { VaultConflictError, VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createCaptureService } from './capture-service';
import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';
import { note } from './test-helpers';

describe('capture collisions', () => {
  it('regenerates identity and path without overwriting the existing capture', async () => {
    const ids = [
      '01JCOLLISION0000000000000001',
      '01JCOLLISION0000000000000001',
      '01JCOLLISION0000000000000002',
    ];
    const vault = createInMemoryVault();
    const service = createStudioService({
      vault,
      index: new RecordingIndex(),
      clock: () => new Date('2026-07-13T00:00:00Z'),
      generateId: () => ids.shift()!,
    });
    const first = await service.capture({ body: 'First' });
    const second = await service.capture({ body: 'Second' });

    expect(second.note.id).toBe('01JCOLLISION0000000000000002');
    expect(second.path).not.toBe(first.path);
    const original = parseNote((await vault.readText(first.path)).text);
    expect(original.ok && original.note.body).toBe('First');
  });

  it('keeps the transitional capture adapter on safe StudioService defaults', async () => {
    const vault = createInMemoryVault();
    const capture = createCaptureService(vault);
    const saved = await capture.capture('  Remember safely  ');
    const entries = await vault.list('Inbox');
    const parsed = parseNote((await vault.readText(entries.find((entry) => entry.kind === 'file')!.path)).text);
    expect(saved.text).toBe('Remember safely');
    expect(parsed.ok && parsed.note).toMatchObject({ status: 'draft', rooms: ['inbox'] });
    expect(await capture.list()).toEqual([saved]);
    await expect(capture.capture(' ')).rejects.toThrow('Write something');
  });

  it('bounds path retries and propagates non-collision storage failures', async () => {
    const conflicts = createInMemoryVault();
    conflicts.writeTextAtomic = async () => { throw new VaultConflictError(); };
    await expect(createCaptureService(conflicts).capture('Never overwrite')).rejects.toThrow('unique capture path');

    const unavailable = createInMemoryVault();
    unavailable.writeTextAtomic = async () => { throw new VaultUnavailableError(); };
    await expect(createCaptureService(unavailable).capture('Keep error')).rejects.toBeInstanceOf(VaultUnavailableError);
  });

  it('skips directories, non-Markdown, non-captures, malformed files, and read races when listing', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Inbox/plain.txt', 'plain');
    await vault.writeTextAtomic('Inbox/note.md', serializeNote(note({ id: 'regular', cardType: 'note' })));
    await vault.writeTextAtomic('Inbox/malformed.md', 'not frontmatter');
    await vault.writeTextAtomic('Inbox/race.md', 'gone');
    const read = vault.readText.bind(vault);
    vault.readText = async (path) => {
      if (path === 'Inbox/race.md') throw new VaultUnavailableError();
      return read(path);
    };
    expect(await createCaptureService(vault).list()).toEqual([]);
  });

  it('bounds StudioService collision retries and propagates unrelated capture errors', async () => {
    const vault = createInMemoryVault();
    const sameId = '01JCOLLISION0000000000000099';
    const service = createStudioService({
      vault,
      index: new RecordingIndex(),
      clock: () => new Date('2026-07-13T00:00:00Z'),
      generateId: () => sameId,
    });
    await service.capture({ body: 'Existing' });
    await expect(service.capture({ body: 'Colliding' })).rejects.toThrow('unique capture path');

    const broken = createInMemoryVault();
    broken.writeTextAtomic = async () => { throw new VaultUnavailableError(); };
    await expect(createStudioService({ vault: broken, index: new RecordingIndex() }).capture({ body: 'Error' }))
      .rejects.toBeInstanceOf(VaultUnavailableError);
  });
});
