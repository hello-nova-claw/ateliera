import { serializeNote } from '@studio/content';
import { VaultUnavailableError, createInMemoryVault } from '@studio/storage';
import type { VaultPort } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

class ManualTimers {
  readonly tasks: Array<{ callback: () => void | Promise<void>; delay: number }> = [];
  set = (callback: () => void | Promise<void>, delay: number) => {
    this.tasks.push({ callback, delay });
    return callback;
  };
  clear = (token: unknown) => {
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

    await service.dispose();
    await service.dispose();
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
});
