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

  it('skips a note confirmed removed between list and read while rebuilding the remaining vault', async () => {
    const backing = createInMemoryVault();
    await backing.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a' })));
    await backing.writeTextAtomic('Notes/b.md', serializeNote(note({ id: 'b' })));
    const originalRead = backing.readText.bind(backing);
    const read = vi.fn(async (path: string) => {
      if (path === 'Notes/a.md') {
        await backing.remove(path);
        throw new VaultUnavailableError('moved');
      }
      return originalRead(path);
    });
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

  it('aborts rebuild on a transient unavailable read when the path still exists', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic('Notes/a.md', serializeNote(note()));
    const index = new RecordingIndex();
    index.entries.set('preserved', { note: note({ id: 'preserved' }), path: 'Old.md', hash: 'old' });
    vi.spyOn(vault, 'readText').mockRejectedValueOnce(new VaultUnavailableError('backend offline'));
    const service = createStudioService({ vault, index, timers: new ManualTimers() });

    await expect(service.rebuildIndex()).rejects.toThrow('backend offline');
    expect(service.indexState()).toBe('stale');
    expect(index.entries.has('preserved')).toBe(true);

    const uncertain = createInMemoryVault();
    await uncertain.writeTextAtomic('Notes/a.md', serializeNote(note()));
    vi.spyOn(uncertain, 'readText').mockRejectedValueOnce(new VaultUnavailableError('read outage'));
    vi.spyOn(uncertain, 'exists').mockRejectedValueOnce(new VaultUnavailableError('existence unknown'));
    const uncertainService = createStudioService({ vault: uncertain, index: new RecordingIndex(), timers: new ManualTimers() });
    await expect(uncertainService.rebuildIndex()).rejects.toThrow('read outage');
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

  it('reconciles moves across the internal namespace in both directions', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const timers = new ManualTimers();
    const service = createStudioService({ vault, index, timers });
    await service.start();
    await vault.writeTextAtomic('Notes/a.md', serializeNote(note({ id: 'a' })));
    await timers.runNext();
    expect(index.entries.has('a')).toBe(true);

    await vault.move('Notes/a.md', '.studio/hidden/a.md');
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    expect(index.entries.has('a')).toBe(false);

    await vault.move('.studio/hidden/a.md', 'Notes/restored.md');
    expect(timers.tasks).toHaveLength(1);
    await timers.runNext();
    expect((await index.getById('a'))?.path).toBe('Notes/restored.md');
    await service.dispose();
  });

  it('shares concurrent start registration and closes a watcher returned after dispose', async () => {
    const backing = createInMemoryVault();
    let resolveWatch!: (stop: () => void) => void;
    const pendingWatch = new Promise<() => void>((resolve) => { resolveWatch = resolve; });
    const firstStop = vi.fn();
    let pendingListener: Parameters<VaultPort['watch']>[0] | undefined;
    let registrations = 0;
    const watch = vi.fn((listener: Parameters<VaultPort['watch']>[0]) => {
      registrations += 1;
      if (registrations === 1) {
        pendingListener = listener;
        return pendingWatch;
      }
      return Promise.resolve(vi.fn());
    });
    const vault: VaultPort = {
      list: backing.list.bind(backing),
      readText: backing.readText.bind(backing),
      writeTextAtomic: backing.writeTextAtomic.bind(backing),
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch,
    };
    const timers = new ManualTimers();
    const service = createStudioService({ vault, index: new RecordingIndex(), timers });

    const firstStart = service.start();
    const secondStart = service.start();
    expect(watch).toHaveBeenCalledTimes(1);
    const disposing = service.dispose();
    pendingListener?.({ kind: 'created', path: 'Notes/late.md', hash: 'late' });
    expect(timers.tasks).toEqual([]);
    resolveWatch(firstStop);
    await Promise.all([firstStart, secondStart, disposing]);
    expect(firstStop).toHaveBeenCalledOnce();

    await expect(service.start()).rejects.toThrow('disposed');
    await service.dispose();
    expect(firstStop).toHaveBeenCalledOnce();
  });

  it('suppresses matching self-published events but reconciles a mismatched concurrent hash', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    const rebuild = vi.spyOn(index, 'rebuild');
    const timers = new ManualTimers();
    const service = createStudioService({ vault, index, timers });
    await service.start();

    const saved = await service.save({ note: note({ id: 'self' }), path: 'Notes/self.md', expectedMissing: true });
    expect(service.indexState()).toBe('ready');
    expect(rebuild).not.toHaveBeenCalled();
    await timers.runNext();
    expect(rebuild).not.toHaveBeenCalled();
    expect(service.indexState()).toBe('ready');

    await vault.writeTextAtomic('Notes/self.md', serializeNote(note({ id: 'self', body: 'external' })), {
      expectedHash: saved.hash,
    });
    await timers.runNext();
    expect(rebuild).toHaveBeenCalledOnce();
    await service.dispose();
  });

  it('falls back to safe timers when an injected recovery scheduler throws', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    index.failUpsert = true;
    const timers = new ManualTimers();
    const diagnostic = vi.fn();
    const service = createStudioService({
      vault,
      index,
      timers,
      scheduleIndexRebuild: () => { throw new Error('scheduler failed'); },
      reportDiagnostic: diagnostic,
    });

    await expect(service.save({ note: note(), path: 'Notes/n.md', expectedMissing: true })).resolves.toBeDefined();
    expect(diagnostic).toHaveBeenCalledWith(expect.any(Error), 'recovery-scheduler');
    expect(timers.tasks.map((task) => task.delay)).toEqual([100]);
    index.failUpsert = false;
    await timers.runNext();
    expect(service.indexState()).toBe('ready');
  });

  it('keeps the timer fallback when diagnostic reporting also throws', async () => {
    const index = new RecordingIndex();
    index.failUpsert = true;
    const timers = new ManualTimers();
    const service = createStudioService({
      vault: createInMemoryVault(),
      index,
      timers,
      scheduleIndexRebuild: () => { throw new Error('scheduler failed'); },
      reportDiagnostic: () => { throw new Error('diagnostic failed'); },
    });

    await service.save({ note: note(), path: 'Notes/n.md', expectedMissing: true });
    expect(timers.tasks.map((task) => task.delay)).toEqual([100]);
    index.failUpsert = false;
    await timers.runNext();
    expect(service.indexState()).toBe('ready');
  });

  it('classifies delayed, expired, and mismatched self-publication events by hash', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00Z'));
    try {
      const backing = createInMemoryVault();
      let listener: Parameters<VaultPort['watch']>[0] | undefined;
      const vault: VaultPort = {
        list: backing.list.bind(backing),
        readText: backing.readText.bind(backing),
        writeTextAtomic: backing.writeTextAtomic.bind(backing),
        readBinary: backing.readBinary.bind(backing),
        writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
        move: backing.move.bind(backing),
        remove: backing.remove.bind(backing),
        exists: backing.exists.bind(backing),
        watch: async (next) => { listener = next; return () => undefined; },
      };
      const index = new RecordingIndex();
      const rebuild = vi.spyOn(index, 'rebuild');
      const timers = new ManualTimers();
      const service = createStudioService({
        vault,
        index,
        timers,
        clock: () => new Date('2026-07-13T00:00:00Z'),
      });
      await service.start();

      const first = await service.save({ note: note({ id: 'self' }), path: 'Notes/self.md' });
      listener?.({ kind: 'modified', path: 'Notes/self.md', hash: first.hash });
      expect(timers.tasks).toEqual([]);

      const expiring = await service.save({ note: note({ id: 'expiring' }), path: 'Notes/expiring.md' });
      vi.setSystemTime(new Date('2026-07-13T00:00:06Z'));
      listener?.({ kind: 'modified', path: 'Notes/expiring.md', hash: expiring.hash });
      await timers.runNext();
      expect(rebuild).toHaveBeenCalledOnce();
      await service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never reuses an older self hash while a later write to the same path is pending', async () => {
    const backing = createInMemoryVault();
    let listener: Parameters<VaultPort['watch']>[0] | undefined;
    let releaseSecondWrite!: () => void;
    const secondWriteGate = new Promise<void>((resolve) => { releaseSecondWrite = resolve; });
    let secondWriteStarted!: (hash: string) => void;
    const secondWriteDurable = new Promise<string>((resolve) => { secondWriteStarted = resolve; });
    let writes = 0;
    const vault: VaultPort = {
      list: backing.list.bind(backing),
      readText: backing.readText.bind(backing),
      async writeTextAtomic(path, value, options) {
        writes += 1;
        const result = await backing.writeTextAtomic(path, value, options);
        if (writes === 2) {
          secondWriteStarted(result.hash);
          await secondWriteGate;
        }
        return result;
      },
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch: async (next) => { listener = next; return () => undefined; },
    };
    const timers = new ManualTimers();
    const index = new RecordingIndex();
    const rebuild = vi.spyOn(index, 'rebuild');
    const service = createStudioService({ vault, index, timers });
    await service.start();
    const savedA = await service.save({
      note: note({ id: 'same-path', body: 'A' }),
      path: 'Notes/same.md',
      expectedMissing: true,
    });

    const savingB = service.save({
      note: note({ id: 'same-path', body: 'B' }),
      path: 'Notes/same.md',
      expectedHash: savedA.hash,
    });
    const hashB = await secondWriteDurable;
    const restoredA = await backing.writeTextAtomic('Notes/same.md', serializeNote(savedA.note), {
      expectedHash: hashB,
    });
    listener?.({ kind: 'modified', path: 'Notes/same.md', hash: restoredA.hash });
    expect(service.indexState()).toBe('stale');

    releaseSecondWrite();
    await savingB;
    expect(service.indexState()).toBe('stale');
    await timers.runNext();
    expect(rebuild).toHaveBeenCalledOnce();
    expect((await index.getById('same-path'))?.note.body).toBe('A');
    expect(service.indexState()).toBe('ready');
    await service.dispose();
  });

  it('reconciles a synchronous watcher event whose hash does not match the completed write', async () => {
    const backing = createInMemoryVault();
    let listener: Parameters<VaultPort['watch']>[0] | undefined;
    const vault: VaultPort = {
      list: backing.list.bind(backing),
      readText: backing.readText.bind(backing),
      async writeTextAtomic(path, value, options) {
        const result = await backing.writeTextAtomic(path, value, options);
        listener?.({ kind: 'modified', path, hash: 'concurrent-hash' });
        return result;
      },
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch: async (next) => { listener = next; return () => undefined; },
    };
    const timers = new ManualTimers();
    const index = new RecordingIndex();
    const rebuild = vi.spyOn(index, 'rebuild');
    const service = createStudioService({ vault, index, timers });
    await service.start();

    await service.save({ note: note(), path: 'Notes/n.md' });
    expect(service.indexState()).toBe('ready');
    await timers.runNext();
    expect(service.indexState()).toBe('ready');
    expect(rebuild).toHaveBeenCalledOnce();
    await service.dispose();
  });

  it('tracks overlapping writes to the same path until both have settled', async () => {
    const backing = createInMemoryVault();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const vault: VaultPort = {
      list: backing.list.bind(backing),
      readText: backing.readText.bind(backing),
      async writeTextAtomic(path, value, options) {
        await gate;
        return backing.writeTextAtomic(path, value, options);
      },
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch: backing.watch.bind(backing),
    };
    const service = createStudioService({ vault, index: new RecordingIndex() });
    const first = service.save({ note: note({ id: 'first' }), path: 'Notes/shared.md' });
    const second = service.save({ note: note({ id: 'second' }), path: 'Notes/shared.md' });
    release();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('waits for an in-flight durable save before disposal completes', async () => {
    const backing = createInMemoryVault();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const vault: VaultPort = {
      list: backing.list.bind(backing),
      readText: backing.readText.bind(backing),
      async writeTextAtomic(path, value, options) {
        await gate;
        return backing.writeTextAtomic(path, value, options);
      },
      readBinary: backing.readBinary.bind(backing),
      writeBinaryAtomic: backing.writeBinaryAtomic.bind(backing),
      move: backing.move.bind(backing),
      remove: backing.remove.bind(backing),
      exists: backing.exists.bind(backing),
      watch: backing.watch.bind(backing),
    };
    const events = vi.fn();
    const service = createStudioService({ vault, index: new RecordingIndex(), publish: events });
    const saving = service.save({ note: note(), path: 'Notes/pending.md' });
    let disposed = false;
    const disposing = service.dispose();
    const alsoDisposing = service.dispose();
    expect(alsoDisposing).toBe(disposing);
    void disposing.then(() => { disposed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(disposed).toBe(false);

    release();
    await Promise.all([saving, disposing, alsoDisposing]);
    expect(events).not.toHaveBeenCalled();
  });

  it('ignores a reconciliation callback that begins after disposal', async () => {
    const vault = createInMemoryVault();
    const timers = new ManualTimers();
    const index = new RecordingIndex();
    const rebuild = vi.spyOn(index, 'rebuild');
    const service = createStudioService({ vault, index, timers });
    await service.start();
    await vault.writeTextAtomic('Notes/external.md', serializeNote(note()));
    const callback = timers.tasks[0]!.callback;

    await service.dispose();
    await callback();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('makes dispose terminal, drains pending index work, and suppresses late effects', async () => {
    const vault = createInMemoryVault();
    const index = new RecordingIndex();
    let release!: () => void;
    index.rebuild = async () => new Promise<void>((resolve) => { release = resolve; });
    const events = vi.fn();
    const service = createStudioService({ vault, index, publish: events, timers: new ManualTimers() });
    const rebuilding = service.rebuildIndex();
    await vi.waitFor(() => expect(service.indexState()).toBe('rebuilding'));
    const disposing = service.dispose();
    release();
    await Promise.all([rebuilding, disposing]);
    expect(events).not.toHaveBeenCalled();
    expect(() => service.subscribe(() => undefined)).toThrow('disposed');
    await expect(service.start()).rejects.toThrow('disposed');
    await expect(service.save({ note: note(), path: 'Notes/late.md' })).rejects.toThrow('disposed');
    await expect(service.rebuildIndex()).rejects.toThrow('disposed');
  });
});
