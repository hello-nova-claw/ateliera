import { VaultConflictError, createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';

import {
  createSeasonTransactionStore,
  emptySeasonActiveCheckpoint,
  type SeasonActiveCheckpoint,
} from './season-transaction-store';

describe('season transaction store', () => {
  it('uses one exact CAS winner for concurrent active-season claims', async () => {
    const vault = createInMemoryVault();
    const first = createSeasonTransactionStore(vault);
    const second = createSeasonTransactionStore(vault);
    const observedByFirst = await first.readActive();
    const observedBySecond = await second.readActive();
    const checkpoint = (
      activeNoteId: string,
    ): SeasonActiveCheckpoint => ({
      ...emptySeasonActiveCheckpoint(),
      revision: 1,
      activeNoteId,
      activePath: `Current Season/${activeNoteId}.md`,
      operation: {
        id: `activate-${activeNoteId}`,
        kind: 'activating',
        targetNoteId: activeNoteId,
        targetPath: `Current Season/${activeNoteId}.md`,
      },
    });

    const results = await Promise.allSettled([
      first.compareAndSetActive(observedByFirst, checkpoint('winter')),
      second.compareAndSetActive(observedBySecond, checkpoint('spring')),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(VaultConflictError) });
    expect((await first.readActive()).value.activeNoteId).toMatch(/^(winter|spring)$/u);
  });

  it('persists the close journal through the same private season boundary', async () => {
    const vault = createInMemoryVault();
    const store = createSeasonTransactionStore(vault);
    const missing = await store.readCloseJournal();
    const written = await store.compareAndSetCloseJournal(missing, {
      version: 1,
      operationId: 'close-winter',
      phase: 'prepared',
      seasonNoteId: 'winter',
    });
    expect(written.value).toMatchObject({ operationId: 'close-winter' });
    await store.removeCloseJournal(written);
    expect((await store.readCloseJournal()).value).toBeNull();
  });

  it('rejects malformed durable active checkpoints instead of guessing', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      '.studio/season/active.json',
      '{"version":1,"revision":"wrong"}',
    );
    await expect(
      createSeasonTransactionStore(vault).readActive(),
    ).rejects.toThrow('active-season checkpoint');
  });
});
