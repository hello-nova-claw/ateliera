import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService, type StudioEvent } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

describe('StudioService note lifecycle', () => {
  it('publishes archive, unarchive, Trash, and restore only after durable lifecycle work', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const events: StudioEvent[] = [];
    const service = createStudioService({
      vault,
      index,
      publish: (event) => events.push(event),
      clock: () => new Date('2026-07-13T01:02:03.000Z'),
    });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });

    await expect(service.archive('n1')).resolves.toMatchObject({ note: { status: 'archived' } });
    await expect(service.projectRoom('reflection-garden')).resolves.toEqual([]);
    await expect(service.unarchive('n1')).resolves.toMatchObject({ note: { status: 'active' } });
    await expect(service.trash('n1')).resolves.toMatchObject({ id: 'n1' });
    await expect(service.restore('n1')).resolves.toMatchObject({
      note: { id: 'n1', status: 'active' },
      relocated: false,
    });
    await expect(service.reconcileTrash()).resolves.toEqual([]);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'note-archived', noteId: 'n1' }),
      expect.objectContaining({ kind: 'note-unarchived', noteId: 'n1' }),
      expect.objectContaining({ kind: 'note-trashed', noteId: 'n1' }),
      expect.objectContaining({ kind: 'note-restored', noteId: 'n1', relocated: false }),
    ]));
    expect(service.indexState()).toBe('ready');
  });

  it('keeps the durable lifecycle result and schedules recovery when its rebuild fails', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const scheduled: Array<() => Promise<void>> = [];
    const service = createStudioService({
      vault,
      index,
      scheduleIndexRebuild: (rebuild) => scheduled.push(rebuild),
    });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });
    index.rebuild = vi.fn().mockRejectedValue(new Error('index unavailable'));

    await expect(service.archive('n1')).resolves.toMatchObject({ note: { status: 'archived' } });
    expect(service.indexState()).toBe('stale');
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it('rejects lifecycle work after disposal', async () => {
    const service = createStudioService({ vault: createInMemoryVault(), index: new RecordingIndex() });
    await service.dispose();
    await expect(service.archive('n1')).rejects.toThrow('disposed');
    expect(() => service.reconcileTrash()).toThrow('disposed');
  });
});
