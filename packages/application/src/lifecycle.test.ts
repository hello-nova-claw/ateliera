import { serializeNote } from '@studio/content';
import { VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import type { VaultPort } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

class ManualTimers {
  readonly tasks: Array<{ callback: () => void | Promise<void>; delay: number }> = [];
  setTimeout = (callback: () => void | Promise<void>, delay: number) => {
    this.tasks.push({ callback, delay });
    return callback;
  };
  clearTimeout = (token: unknown) => {
    const index = this.tasks.findIndex((task) => task.callback === token);
    if (index >= 0) this.tasks.splice(index, 1);
  };
  async runNext() {
    const task = this.tasks.shift();
    if (task !== undefined) await task.callback();
  }
}

describe('service lifecycle and reconciliation', () => {
  it('coalesces external changes, ignores internal paths case-insensitively, and disposes watcher/timer state', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const timers = new ManualTimers();
    const service = createStudioService({ vault, index, timers });
    await service.start();
    await service.start();

    await vault.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a' })));
    await vault.writeTextAtomic('Notes/b.md', serializeNote(note({ id: 'b' })));
    await vault.writeTextAtomic('.StUdIo/views/private.json', '{}');
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    expect((await index.getById('a'))?.path).toBe('Notes/a.md');
    expect((await index.getById('b'))?.path).toBe('Notes/b.md');

    const a = await vault.readText('Notes/a.md');
    await vault.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a', body: 'changed' })), { expectedHash: a.hash });
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    await vault.move('Notes/a.md', 'Notes/moved.md');
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    const moved = await vault.readText('Notes/moved.md');
    await vault.remove('Notes/moved.md', { expectedHash: moved.hash });
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    expect(await index.getById('a')).toBeNull();

    await vault.writeTextAtomic('Notes/pending.md', serializeNote(note({ id: 'pending' })));
    expect(timers.tasks).toHaveLength(1);
    await service.dispose();
    await service.dispose();
    expect(timers.tasks).toHaveLength(0);
    await vault.writeTextAtomic('Notes/c.md', serializeNote(note({ id: 'c' })));
    expect(timers.tasks).toHaveLength(0);
  });

  it('skips a note removed between list and read while rebuilding the remaining vault', async () => {
    const backing = createInMemoryVault();
    await backing.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a' })));
    await backing.writeTextAtomic('Notes/b.md', serializeNote(note({ id: 'b' })));
    const read = vi.fn(backing.readText.bind(backing));
    read.mockRejectedValueOnce(new VaultUnavailableError('moved'));
    const racing: VaultPort = {
      list: backing.list.bind(backing),
      readText: read,
      writeTextAtomic: backing.writeTextAtomic.bind(backing),
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch: backing.watch.bind(backing),
    };
    const index = new RecordingIndex();
    const service = createStudioService({ vault: racing, index });

    await expect(service.rebuildIndex()).resolves.toBeUndefined();
    expect(index.entries.size).toBe(1);
  });

  it('does not hide unexpected adapter failures during a scan', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', serializeNote(note()));
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new TypeError('adapter invariant'));
    const service = createStudioService({ vault, index: new RecordingIndex() });
    await expect(service.rebuildIndex()).rejects.toThrow('adapter invariant');
    expect(service.indexState()).toBe('stale');
  });

  it('retries failed stale recovery with bounded backoff without another edit', async () => {
    const index = new RecordingIndex();
    index.failUpsert = true;
    const timers = new ManualTimers();
    const rebuild = vi.spyOn(index, 'rebuild')
      .mockRejectedValueOnce(new Error('still unavailable'))
      .mockResolvedValue(undefined);
    const service = createStudioService({ vault: createInMemoryVault(), index, timers });

    await service.save({ note: note(), path: 'Notes/n.md', expectedMissing: true });
    expect(timers.tasks.map((task) => task.delay)).toEqual([100]);
    await timers.runNext();
    expect(timers.tasks.map((task) => task.delay)).toEqual([500]);
    index.failUpsert = false;
    await timers.runNext();
    expect(service.indexState()).toBe('ready');
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(timers.tasks).toEqual([]);
  });

  it('bounds persistent recovery failures and retries watcher rebuild failure', async () => {
    const vault = createInMemoryVault();
    const timers = new ManualTimers();
    const index = new RecordingIndex();
    index.failUpsert = true;
    vi.spyOn(index, 'rebuild').mockRejectedValue(new Error('offline'));
    const service = createStudioService({ vault, index, timers });
    await service.save({ note: note(), path: 'Notes/n.md', expectedMissing: true });
    for (let attempt = 0; attempt < 4; attempt += 1) await timers.runNext();
    expect(timers.tasks).toEqual([]);
    expect(service.indexState()).toBe('stale');

    const watcherIndex = new RecordingIndex();
    vi.spyOn(watcherIndex, 'rebuild').mockRejectedValueOnce(new Error('transient'));
    const watcherTimers = new ManualTimers();
    const watcherVault = createInMemoryVault();
    const watcher = createStudioService({ vault: watcherVault, index: watcherIndex, timers: watcherTimers });
    await watcher.start();
    await watcherVault.writeTextAtomic('Notes/external.md', serializeNote(note({ id: 'external' })));
    await watcherTimers.runNext();
    expect(watcherTimers.tasks.map((task) => task.delay)).toEqual([100]);
    await watcherTimers.runNext();
    expect(watcher.indexState()).toBe('ready');
    await watcher.dispose();
  });

  it('uses and cancels the default recovery timer safely', async () => {
    vi.useFakeTimers();
    try {
      const index = new RecordingIndex();
      index.failUpsert = true;
      const service = createStudioService({ vault: createInMemoryVault(), index });
      await service.save({ note: note(), path: 'Notes/n.md', expectedMissing: true });
      index.failUpsert = false;
      await service.rebuildIndex();
      await vi.advanceTimersByTimeAsync(100);
      expect(service.indexState()).toBe('ready');

      const retryIndex = new RecordingIndex();
      retryIndex.failUpsert = true;
      const retrying = createStudioService({ vault: createInMemoryVault(), index: retryIndex });
      await retrying.save({ note: note({ id: 'retry' }), path: 'Notes/retry.md', expectedMissing: true });
      retryIndex.failUpsert = false;
      await vi.advanceTimersByTimeAsync(100);
      expect(retrying.indexState()).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays stale when another external write lands during watcher reconciliation', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const timers = new ManualTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let rebuilds = 0;
    index.rebuild = async (entries) => {
      rebuilds += 1;
      if (rebuilds === 1) await gate;
      index.entries.clear();
      for (const entry of entries) index.entries.set(entry.note.id, entry);
    };
    const service = createStudioService({ vault, index, timers });
    await service.start();
    await vault.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a' })));
    const firstReconciliation = timers.runNext();
    await vi.waitFor(() => expect(service.indexState()).toBe('rebuilding'));
    await vault.writeTextAtomic('Notes/b.md', serializeNote(note({ id: 'b' })));
    expect(service.indexState()).toBe('stale');
    release();
    await firstReconciliation;
    expect(service.indexState()).toBe('stale');
    await timers.runNext();
    expect(service.indexState()).toBe('ready');
    expect(index.entries.has('b')).toBe(true);
    await service.dispose();
  });
});
