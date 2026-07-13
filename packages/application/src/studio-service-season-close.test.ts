import { createInMemoryVault, type VaultPort } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import { createStudioService } from './studio-service';
import { RecordingIndex } from './test-helpers';

describe('StudioService season-close resilience', () => {
  it('schedules index recovery when rebuilding after a close operation fails', async () => {
    class FailingRebuildIndex extends RecordingIndex {
      override async rebuild(): Promise<void> {
        throw new Error('index unavailable');
      }
    }
    let scheduled = 0;
    const studio = createStudioService({
      vault: createInMemoryVault(),
      index: new FailingRebuildIndex(),
      scheduleIndexRebuild: () => {
        scheduled += 1;
      },
    });

    await expect(studio.resumeSeasonCloseTransaction()).resolves.toBeNull();
    expect(scheduled).toBe(1);
  });

  it('clears a rejected start so watching can be retried', async () => {
    const backing = createInMemoryVault();
    let failWatch = true;
    const vault: VaultPort = {
      ...backing,
      watch(listener) {
        if (failWatch) return Promise.reject(new Error('watch unavailable'));
        return backing.watch(listener);
      },
    };
    const studio = createStudioService({
      vault,
      index: new RecordingIndex(),
    });

    await expect(studio.start()).rejects.toThrow('watch unavailable');
    failWatch = false;
    await expect(studio.start()).resolves.toBeUndefined();
    await studio.dispose();
  });
});
