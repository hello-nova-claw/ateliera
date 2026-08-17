import { parseNote } from '@studio/content';
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

describe('save', () => {
  it('writes durably before indexing and publishing', async () => {
    const vault = createInMemoryVault();
    const order: string[] = [];
    const index = new RecordingIndex();
    const originalWrite = vault.writeTextAtomic.bind(vault);
    vault.writeTextAtomic = async (...args) => {
      order.push('vault');
      return originalWrite(...args);
    };
    index.upsert = async () => {
      order.push('index');
    };
    const service = createStudioService({
      vault,
      index,
      publish: () => order.push('event'),
      clock: () => new Date('2026-07-13T01:00:00.000Z'),
    });

    await service.save({
      note: note(),
      path: 'Reflection/n1.md',
      expectedMissing: true,
    });
    expect(order).toEqual(['vault', 'index', 'event']);
  });

  it('preserves the durable note and schedules rebuild when indexing fails', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    index.failUpsert = true;
    const rebuild = vi.fn();
    const events: string[] = [];
    const service = createStudioService({
      vault,
      index,
      scheduleIndexRebuild: rebuild,
      publish: (event) => events.push(event.kind),
    });

    const saved = await service.save({
      note: note(),
      path: 'Reflection/n1.md',
      expectedMissing: true,
    });

    expect(parseNote((await vault.readText(saved.path)).text).ok).toBe(true);
    expect(service.indexState()).toBe('stale');
    expect(rebuild).toHaveBeenCalledOnce();
    expect(events).toEqual(['index-stale', 'note-saved']);
  });

  it('preserves both versions when a concurrent writer wins', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const first = await service.save({
      note: note(),
      path: 'Reflection/n1.md',
      expectedMissing: true,
    });
    await vault.writeTextAtomic('Reflection/n1.md', 'external edit', {
      expectedHash: first.hash,
    });

    await expect(
      service.save({
        note: note({ body: 'my unsaved version' }),
        path: first.path,
        expectedHash: first.hash,
      }),
    ).rejects.toMatchObject({
      name: 'StudioSaveConflictError',
      attemptedNote: expect.objectContaining({ body: 'my unsaved version' }),
      durableText: 'external edit',
    });
    expect((await vault.readText(first.path)).text).toBe('external edit');
  });

  it('rejects invalid runtime note data before writing', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await expect(
      service.save({
        note: { ...note(), semanticType: 'action' } as never,
        path: 'Reflection/invalid.md',
        expectedMissing: true,
      }),
    ).rejects.toThrow('invalid');
    expect(await vault.exists('Reflection/invalid.md')).toBe(false);
  });

  it('normalizes a Landscape card meaning to its structural anchor on save', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });

    const saved = await service.save({
      note: note({ landscapeAnchor: 'decisions', semanticType: 'vision' }),
      path: 'Life Landscape/Home/decision.md',
      expectedMissing: true,
    });

    expect(saved.note.semanticType).toBe('growth');
  });
});
