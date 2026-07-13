import { parseNote } from '@studio/content';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createCaptureService } from './capture-service';
import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

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
});
