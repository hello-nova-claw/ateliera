import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

describe('Studio events', () => {
  it('isolates throwing listeners, continues delivery, and supports unsubscribe', async () => {
    const diagnostics = vi.fn();
    const dependencyListener = vi.fn(() => { throw new Error('dependency listener'); });
    const service = createStudioService({
      vault: createInMemoryVault(),
      index: new RecordingIndex(),
      publish: dependencyListener,
      reportListenerError: diagnostics,
    });
    const throwing = vi.fn(() => { throw new Error('subscriber'); });
    const remaining = vi.fn();
    service.subscribe(throwing);
    const unsubscribe = service.subscribe(remaining);

    await expect(service.save({
      note: note({ id: 'a' }),
      path: 'Notes/a.md',
      expectedMissing: true,
    })).resolves.toMatchObject({ note: { id: 'a' } });
    expect(remaining).toHaveBeenCalledWith(expect.objectContaining({ kind: 'note-saved' }));
    expect(diagnostics).toHaveBeenCalledTimes(2);

    unsubscribe();
    await service.save({
      note: note({ id: 'b' }),
      path: 'Notes/b.md',
      expectedMissing: true,
    });
    expect(remaining).toHaveBeenCalledTimes(1);
  });

  it('never lets event failures block stale scheduling or reject a successful rebuild', async () => {
    const index = new RecordingIndex();
    index.failUpsert = true;
    const scheduled: Array<() => Promise<void>> = [];
    const service = createStudioService({
      vault: createInMemoryVault(),
      index,
      publish: () => { throw new Error('listener failed'); },
      reportListenerError: () => { throw new Error('diagnostics failed'); },
      scheduleIndexRebuild: (rebuild) => scheduled.push(rebuild),
    });
    service.subscribe(() => { throw new Error('subscriber failed'); });

    await expect(service.save({
      note: note(),
      path: 'Notes/n.md',
      expectedMissing: true,
    })).resolves.toBeDefined();
    expect(scheduled).toHaveLength(1);
    index.failUpsert = false;
    await expect(scheduled[0]?.()).resolves.toBeUndefined();
    expect(service.indexState()).toBe('ready');
  });
});
