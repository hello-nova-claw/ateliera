import {
  VaultConflictError,
  createInMemoryVault,
  createStudioControlVault,
} from '@studio/storage';
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
    const checkpoint = (activeNoteId: string): SeasonActiveCheckpoint => ({
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

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(VaultConflictError) });
    expect((await first.readActive()).value.activeNoteId).toMatch(
      /^(winter|spring)$/u,
    );
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
    const loaded = await store.readCloseJournal();
    expect(loaded.value).toEqual(written.value);
    if (loaded.value === null) throw new Error('Expected the close journal.');
    const replaced = await store.compareAndSetCloseJournal(loaded, {
      ...loaded.value,
      phase: 'completed',
    });
    await store.removeCloseJournal(replaced);
    expect((await store.readCloseJournal()).value).toBeNull();
  });

  it('replaces an existing active checkpoint only at the next revision', async () => {
    const vault = createInMemoryVault();
    const store = createSeasonTransactionStore(vault);
    const missing = await store.readActive();
    const first = await store.compareAndSetActive(missing, {
      version: 1,
      revision: 1,
      activeNoteId: 'winter',
      activePath: 'Current Season/winter.md',
      operation: null,
    });
    await expect(
      store.compareAndSetActive(first, { ...first.value, revision: 3 }),
    ).rejects.toThrow('advance once');
    const second = await store.compareAndSetActive(first, {
      ...first.value,
      revision: 2,
      operation: {
        id: 'close-winter',
        kind: 'closing',
        targetNoteId: 'winter',
        targetPath: 'Current Season/winter.md',
      },
    });
    expect((await store.readActive()).value).toEqual(second.value);
  });

  it('accepts the generated operation id for a maximum-length canonical note id', async () => {
    const vault = createInMemoryVault();
    const store = createSeasonTransactionStore(vault);
    const observed = await store.readActive();
    const noteId = 'n'.repeat(128);
    const path = `Current Season/${noteId}.md`;
    const next = {
      version: 1 as const,
      revision: 1,
      activeNoteId: noteId,
      activePath: path,
      operation: {
        id: `activating-${noteId}-1`,
        kind: 'activating' as const,
        targetNoteId: noteId,
        targetPath: path,
      },
    };

    await expect(store.compareAndSetActive(observed, next)).resolves.toMatchObject({
      value: next,
    });
  });

  it('rejects malformed durable active checkpoints instead of guessing', async () => {
    const vault = createInMemoryVault();
    await createStudioControlVault(vault).writeTextAtomic(
      '.studio/season/active.json',
      '{"version":1,"revision":"wrong"}',
    );
    await expect(
      createSeasonTransactionStore(vault).readActive(),
    ).rejects.toThrow('active-season checkpoint');
  });

  it.each([
    'not json',
    '[]',
    '{}',
    '{"version":1,"revision":-1,"activeNoteId":null,"activePath":null,"operation":null}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":null,"operation":null}',
    '{"version":1,"revision":0,"activeNoteId":null,"activePath":null,"operation":[]}',
    '{"version":1,"revision":0,"activeNoteId":null,"activePath":null,"operation":{"id":1,"kind":"bad","targetNoteId":false,"targetPath":null}}',
    '{"version":1,"revision":0,"activeNoteId":null,"activePath":null,"operation":{"id":"activate-winter","kind":"activating","targetNoteId":"winter","targetPath":"Current Season/winter.md"}}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"../winter.md","operation":null}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season//winter.md","operation":null}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season/winter.md","operation":{"id":"activate-winter","kind":"activating","targetNoteId":"spring","targetPath":"Current Season/winter.md"}}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season/winter.md","operation":{"id":"activate-winter","kind":"activating","targetNoteId":"winter","targetPath":"Current Season/spring.md"}}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season/winter.md","operation":null,"forged":true}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season/winter.md","operation":{"id":"activate-winter","kind":"activating","targetNoteId":"winter","targetPath":"Current Season/winter.md","forged":true}}',
    '{"version":1,"revision":0,"activeNoteId":"\\ud800","activePath":"Current Season/winter.md","operation":null}',
    '{"version":1,"revision":0,"activeNoteId":"winter","activePath":"Current Season/winter.md","operation":{"id":"activate-winter","kind":["activating"],"targetNoteId":"winter","targetPath":"Current Season/winter.md"}}',
  ])('rejects malformed active checkpoint variant %#', async (text) => {
    const vault = createInMemoryVault();
    await createStudioControlVault(vault).writeTextAtomic(
      '.studio/season/active.json',
      text,
    );
    await expect(
      createSeasonTransactionStore(vault).readActive(),
    ).rejects.toThrow('active-season checkpoint');
  });

  it.each([
    {
      name: 'an operation without an active season',
      checkpoint: {
        version: 1 as const,
        revision: 1,
        activeNoteId: null,
        activePath: null,
        operation: {
          id: 'activate-winter',
          kind: 'activating' as const,
          targetNoteId: 'winter',
          targetPath: 'Current Season/winter.md',
        },
      },
    },
    {
      name: 'an unsafe active path',
      checkpoint: {
        version: 1 as const,
        revision: 1,
        activeNoteId: 'winter',
        activePath: '.studio/forged.md',
        operation: null,
      },
    },
    {
      name: 'a target id that differs from the active season',
      checkpoint: {
        version: 1 as const,
        revision: 1,
        activeNoteId: 'winter',
        activePath: 'Current Season/winter.md',
        operation: {
          id: 'activate-spring',
          kind: 'activating' as const,
          targetNoteId: 'spring',
          targetPath: 'Current Season/winter.md',
        },
      },
    },
    {
      name: 'a target path that differs from the active season',
      checkpoint: {
        version: 1 as const,
        revision: 1,
        activeNoteId: 'winter',
        activePath: 'Current Season/winter.md',
        operation: {
          id: 'activate-winter',
          kind: 'activating' as const,
          targetNoteId: 'winter',
          targetPath: 'Current Season/spring.md',
        },
      },
    },
  ])('refuses to persist $name', async ({ checkpoint }) => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      'Current Season/winter.md',
      'keep this user note',
    );
    const store = createSeasonTransactionStore(vault);
    const observed = await store.readActive();

    await expect(
      store.compareAndSetActive(observed, checkpoint),
    ).rejects.toThrow('active-season checkpoint');

    expect(await vault.readText('Current Season/winter.md')).toMatchObject({
      text: 'keep this user note',
    });
    expect(
      await createStudioControlVault(vault).exists(
        '.studio/season/active.json',
      ),
    ).toBe(false);
  });

  it('rejects an unvalidated observed checkpoint before attempting CAS', async () => {
    const vault = createInMemoryVault();
    const store = createSeasonTransactionStore(vault);

    await expect(
      store.compareAndSetActive(
        {
          value: {
            ...emptySeasonActiveCheckpoint(),
            activeNoteId: 'winter',
            activePath: '../winter.md',
          },
          hash: null,
        },
        {
          ...emptySeasonActiveCheckpoint(),
          revision: 1,
        },
      ),
    ).rejects.toThrow('active-season checkpoint');
    expect(
      await createStudioControlVault(vault).exists(
        '.studio/season/active.json',
      ),
    ).toBe(false);
  });

  it.each(['not json', '[]', 'null'])(
    'rejects malformed close journal variant %#',
    async (text) => {
      const vault = createInMemoryVault();
      await createStudioControlVault(vault).writeTextAtomic(
        '.studio/season/close-journal.json',
        text,
      );
      await expect(
        createSeasonTransactionStore(vault).readCloseJournal(),
      ).rejects.toThrow('season-close journal');
    },
  );

  it('requires an observed close-journal revision before removal', async () => {
    const store = createSeasonTransactionStore(createInMemoryVault());
    await expect(
      store.removeCloseJournal({ value: {}, hash: null }),
    ).rejects.toThrow('revision is missing');
  });
});
