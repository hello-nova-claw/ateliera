import { serializeNote } from '@studio/content';
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

  it('creates a bounded exact-file snapshot before a conflict resolution', async () => {
    const vault = createInMemoryVault();
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });
    const snapshot = await service.snapshot('conflict-resolution', ['Notes/n1.md']);
    expect(snapshot.manifest).toMatchObject({
      reason: 'conflict-resolution',
      state: 'complete',
      files: [expect.objectContaining({ originalPath: 'Notes/n1.md' })],
    });
  });

  it('uses an injected revision boundary and rejects snapshots after disposal', async () => {
    const create = vi.fn(async () => ({
      manifestPath: '.studio/backups/injected/manifest.json',
      manifest: {
        version: 1 as const,
        id: 'injected',
        reason: 'conflict-resolution' as const,
        createdAt: '2026-07-13T00:00:00.000Z',
        state: 'complete' as const,
        files: [],
      },
    }));
    const service = createStudioService({
      vault: createInMemoryVault(),
      index: new RecordingIndex(),
      revisions: { create, prune: vi.fn() },
    });
    await service.snapshot('conflict-resolution', []);
    expect(create).toHaveBeenCalledWith('conflict-resolution', []);
    await service.dispose();
    expect(() => service.snapshot('conflict-resolution', [])).toThrow('disposed');
  });

  it('keeps durable lifecycle success when a disposable incremental index mutation fails', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const service = createStudioService({ vault, index });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });
    index.failUpsert = true;
    await expect(service.archive('n1')).resolves.toMatchObject({ note: { status: 'archived' } });
    index.failUpsert = false;
    index.remove = vi.fn().mockRejectedValueOnce(new Error('incremental index unavailable'));
    await expect(service.trash('n1')).resolves.toMatchObject({ id: 'n1' });
    expect(await vault.exists('Notes/n1.md')).toBe(false);
  });

  it('serializes a concurrent save before lifecycle work observes the durable index', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const getById = vi.spyOn(index, 'getById');
    const service = createStudioService({ vault, index });
    const write = vault.writeTextAtomic.bind(vault);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started = false;
    vault.writeTextAtomic = async (path, text, condition) => {
      if (path === 'Notes/n1.md') {
        started = true;
        await gate;
      }
      return write(path, text, condition);
    };

    const saving = service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });
    await vi.waitFor(() => expect(started).toBe(true));
    const trashing = service.trash('n1');
    await Promise.resolve();
    await Promise.resolve();
    expect(getById).not.toHaveBeenCalled();
    release();

    await expect(saving).resolves.toMatchObject({ note: { id: 'n1' } });
    await expect(trashing).resolves.toMatchObject({ id: 'n1' });
    await expect(vault.exists('Notes/n1.md')).resolves.toBe(false);
  });

  it('drains accepted lifecycle and snapshot mutations before disposal completes', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    let releaseMove!: () => void;
    const moveGate = new Promise<void>((resolve) => { releaseMove = resolve; });
    let moveStarted = false;
    const move = vault.move.bind(vault);
    vault.move = async (from, to, condition) => {
      if (from === 'Notes/n1.md') {
        moveStarted = true;
        await moveGate;
      }
      return move(from, to, condition);
    };
    const create = vi.fn(async () => ({
      manifestPath: '.studio/backups/injected/manifest.json',
      manifest: {
        version: 1 as const,
        id: 'injected',
        reason: 'conflict-resolution' as const,
        createdAt: '2026-07-13T00:00:00.000Z',
        state: 'complete' as const,
        files: [],
      },
    }));
    const service = createStudioService({
      vault,
      index,
      revisions: { create, prune: vi.fn() },
    });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });

    const trashing = service.trash('n1');
    await vi.waitFor(() => expect(moveStarted).toBe(true));
    const snapshot = service.snapshot('conflict-resolution', []);
    let disposed = false;
    const disposal = service.dispose().then(() => { disposed = true; });
    const disposalState = await Promise.race([
      disposal.then(() => 'disposed' as const),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 10)),
    ]);
    expect(disposalState).toBe('pending');
    expect(disposed).toBe(false);
    expect(create).not.toHaveBeenCalled();
    releaseMove();

    await expect(trashing).resolves.toMatchObject({ id: 'n1' });
    await expect(snapshot).resolves.toMatchObject({ manifestPath: expect.any(String) });
    await disposal;
    expect(create).toHaveBeenCalledOnce();
    await expect(service.save({ note: note(), path: 'Notes/late.md' })).rejects.toThrow('disposed');
    expect(() => service.snapshot('conflict-resolution', [])).toThrow('disposed');
  });

  it('publishes an explicit non-mutating repair event for restore identity collisions', async () => {
    const vault = createInMemoryVault();
    const events: StudioEvent[] = [];
    const service = createStudioService({
      vault,
      index: new RecordingIndex(),
      publish: (event) => events.push(event),
    });
    await service.save({ note: note(), path: 'Notes/n1.md', expectedMissing: true });
    const deleted = await service.trash('n1');
    await vault.writeTextAtomic(
      'Elsewhere/existing.md',
      serializeNote(note({ id: 'n1', title: 'Existing identity' })),
    );

    await expect(service.restore('n1')).resolves.toEqual(expect.objectContaining({
      kind: 'identity-conflict',
      conflictingPaths: ['Elsewhere/existing.md'],
    }));
    await expect(vault.exists(deleted.trashPath)).resolves.toBe(true);
    expect(events.at(-1)).toEqual({
      kind: 'note-restore-conflict',
      noteId: 'n1',
      conflictingPaths: ['Elsewhere/existing.md'],
    });
  });
});
