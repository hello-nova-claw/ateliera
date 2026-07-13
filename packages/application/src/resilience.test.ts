import { serializeNote } from '@studio/content';
import {
  VaultConflictError,
  VaultUnavailableError,
  createInMemoryVault,
} from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { createViewStateRepository } from './view-state';
import { RecordingIndex, note } from './test-helpers';

describe('index recovery and loading', () => {
  it('rebuilds a missing index from valid vault notes and publishes recovery', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/n.md', serializeNote(note()));
    await vault.writeTextAtomic('Attachments/image.jpg', 'not markdown');
    await vault.writeTextAtomic('.studio/views/ignored.md', 'not user content');
    const index = new RecordingIndex();
    const events: string[] = [];
    const service = createStudioService({ vault, index, publish: (event) => events.push(event.kind) });

    await service.rebuildIndex();

    expect(service.indexState()).toBe('ready');
    expect((await index.getById('n1'))?.path).toBe('Notes/n.md');
    expect(events).toEqual(['index-rebuilt']);
  });

  it('stays stale when rebuild fails and can be scheduled again', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const failing = vi.spyOn(index, 'rebuild').mockRejectedValueOnce(new Error('offline'));
    const service = createStudioService({ vault, index });

    await expect(service.rebuildIndex()).rejects.toThrow('offline');
    expect(service.indexState()).toBe('stale');
    failing.mockRestore();
    await expect(service.rebuildIndex()).resolves.toBeUndefined();
  });

  it('executes a scheduled stale recovery and coalesces repeat scheduling', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    index.failUpsert = true;
    const scheduled: Array<() => Promise<void>> = [];
    const service = createStudioService({
      vault,
      index,
      scheduleIndexRebuild: (rebuild) => scheduled.push(rebuild),
    });

    await service.save({ note: note({ id: 'a' }), path: 'Notes/a.md', expectedMissing: true });
    await service.save({ note: note({ id: 'b' }), path: 'Notes/b.md', expectedMissing: true });
    expect(scheduled).toHaveLength(1);
    index.failUpsert = false;
    await scheduled[0]?.();
    expect(service.indexState()).toBe('ready');
  });

  it('does not call a stale index ready after one later upsert succeeds', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    index.failUpsert = true;
    const service = createStudioService({ vault, index });
    await service.save({ note: note({ id: 'a' }), path: 'Notes/a.md', expectedMissing: true });
    index.failUpsert = false;
    await service.save({ note: note({ id: 'b' }), path: 'Notes/b.md', expectedMissing: true });
    expect(service.indexState()).toBe('stale');
  });

  it('returns to stale and releases recovery scheduling when a vault scan fails', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const scheduled: Array<() => Promise<void>> = [];
    index.failUpsert = true;
    const service = createStudioService({
      vault,
      index,
      scheduleIndexRebuild: (rebuild) => scheduled.push(rebuild),
    });
    await service.save({ note: note({ id: 'a' }), path: 'Notes/a.md', expectedMissing: true });
    vi.spyOn(vault, 'list').mockRejectedValueOnce(new VaultUnavailableError());
    await expect(scheduled[0]?.()).resolves.toBeUndefined();
    expect(service.indexState()).toBe('stale');
    expect(scheduled).toHaveLength(2);

    await service.save({ note: note({ id: 'b' }), path: 'Notes/b.md', expectedMissing: true });
    expect(scheduled).toHaveLength(2);
  });

  it('loads valid notes and rejects corrupt notes without hiding their file', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/good.md', serializeNote(note()));
    await vault.writeTextAtomic('Notes/bad.md', 'Body without metadata');
    const service = createStudioService({ vault, index: new RecordingIndex() });

    expect((await service.load('Notes/good.md')).note.id).toBe('n1');
    await expect(service.load('Notes/bad.md')).rejects.toThrow('needs metadata repair');
    expect(await vault.exists('Notes/bad.md')).toBe(true);
  });

  it('propagates non-conflict write failures and preserves a conflict when its target vanished', async () => {
    const vault = createInMemoryVault();
    const unavailable = vi.spyOn(vault, 'writeTextAtomic').mockRejectedValueOnce(new VaultUnavailableError());
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await expect(service.save({ note: note(), path: 'Notes/n.md' })).rejects.toBeInstanceOf(VaultUnavailableError);
    unavailable.mockRestore();

    vi.spyOn(vault, 'writeTextAtomic').mockRejectedValueOnce(new VaultConflictError());
    await expect(service.save({ note: note(), path: 'Notes/missing.md' })).rejects.toMatchObject({
      name: 'StudioSaveConflictError',
      durableText: '',
    });
  });

  it('uses default dependencies for an ordinary capture', async () => {
    const service = createStudioService({ vault: createInMemoryVault(), index: new RecordingIndex() });
    const captured = await service.capture({ body: 'Remember this', title: '  A title  ' });
    expect(captured.note.title).toBe('A title');
    expect(captured.note.id).toHaveLength(26);
  });
});

describe('view state repository', () => {
  it('falls back for malformed state, de-duplicates state, and updates conditionally', async () => {
    const vault = createInMemoryVault();
    const views = createViewStateRepository(vault);
    await vault.writeTextAtomic('.studio/views/broken.json', '{');
    await vault.writeTextAtomic('.studio/views/wrong.json', '{"version":2,"noteIds":[1]}');
    expect(await views.load('broken')).toEqual([]);
    expect(await views.load('wrong')).toEqual([]);

    await views.save('room:test', ['a', 'a', 'b']);
    expect(await views.load('room:test')).toEqual(['a', 'b']);
    await views.save('room:test', ['b']);
    expect(await views.load('room:test')).toEqual(['b']);
  });

  it('rejects blank keys and propagates unexpected read/write failures', async () => {
    const vault = createInMemoryVault();
    const views = createViewStateRepository(vault);
    await expect(views.load(' ')).rejects.toThrow('view key');

    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new TypeError('adapter bug'));
    await expect(views.load('test')).rejects.toThrow('adapter bug');

    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new TypeError('adapter bug'));
    await expect(views.save('test', [])).rejects.toThrow('adapter bug');
  });
});
