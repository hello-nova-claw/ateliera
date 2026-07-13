import { parseNote } from '@studio/content';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

describe('capture', () => {
  it('captures an unclassified fragment into Inbox with safe defaults', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const events: string[] = [];
    const service = createStudioService({
      vault,
      index,
      clock: () => new Date('2026-07-13T00:30:00.000Z'),
      generateId: () => '01JTESTCAPTURE00000000000000',
      publish: (event) => events.push(event.kind),
    });

    const captured = await service.capture({ body: '  A thought worth keeping  ' });

    expect(captured.note).toMatchObject({
      body: 'A thought worth keeping',
      status: 'draft',
      rooms: ['inbox'],
      semanticType: 'reflection',
    });
    expect(captured.path).toMatch(/^Inbox\//);
    const stored = parseNote((await vault.readText(captured.path)).text);
    expect(stored.ok && stored.note.body).toBe('A thought worth keeping');
    expect(index.upserts).toEqual([captured.note.id]);
    expect(events).toEqual(['note-saved']);
  });

  it('rejects empty capture without writing', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await expect(service.capture({ body: ' \n ' })).rejects.toThrow('Write something');
    expect(await vault.list()).toEqual([]);
  });

  it('creates a classified capture in one durable write', async () => {
    const vault = createInMemoryVault();
    const write = vi.spyOn(vault, 'writeTextAtomic');
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const captured = await service.capture({
      body: 'A possible retreat',
      semanticType: 'uncharted',
    });

    expect(captured.note.semanticType).toBe('uncharted');
    expect(write).toHaveBeenCalledOnce();
    expect((await vault.list()).filter((entry) => entry.kind === 'file')).toHaveLength(1);
  });

  it('leaves no partial note when classified capture fails and retry creates only one', async () => {
    const vault = createInMemoryVault();
    const durableWrite = vault.writeTextAtomic.bind(vault);
    vi.spyOn(vault, 'writeTextAtomic')
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockImplementation(durableWrite);
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const input = { body: 'One atomic thought', semanticType: 'vision' as const };

    await expect(service.capture(input)).rejects.toThrow('disk unavailable');
    expect(await vault.list()).toEqual([]);

    await service.capture(input);
    expect((await vault.list()).filter((entry) => entry.kind === 'file')).toHaveLength(1);
  });
});
