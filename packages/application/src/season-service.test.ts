import {
  VaultConflictError,
  createInMemoryVault,
  createRevisionStore,
  createStudioControlVault,
} from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createSeasonService, seasonStateFromNote } from './season-service';
import { SeasonClosePreflightError } from './season-close-transaction';
import { StudioSaveConflictError, createStudioService } from './studio-service';
import { RecordingIndex, note } from './test-helpers';

function setup() {
  const vault = createInMemoryVault();
  const studio = createStudioService({
    vault,
    index: new RecordingIndex(),
    clock: () => new Date('2026-07-14T00:00:00.000Z'),
    generateId: () => '01SEASONNOTE',
  });
  return {
    vault,
    studio,
    seasons: createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => '01SEASONNOTE',
    }),
  };
}

async function completeWizard(
  seasons: ReturnType<typeof createSeasonService>,
  record: Awaited<
    ReturnType<ReturnType<typeof createSeasonService>['beginSeason']>
  >,
) {
  let current = record;
  for (const step of [
    'prior-reflection',
    'feelings',
    'priorities',
    'decisions-practices',
    'supports-constraints',
    'enough',
    'not-now',
    'confirm',
  ] as const) {
    current = await seasons.saveStep(
      current,
      step,
      step === 'prior-reflection' ? { skippedPriorReflection: true } : {},
    );
  }
  return current;
}

describe('season service', () => {
  it('persists each wizard step and recovers the draft at the next incomplete step', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({
      title: 'A spacious winter',
      startsOn: '2026-07-14',
      endsOn: '2026-10-01',
    });
    const reflected = await seasons.saveStep(begun, 'prior-reflection', {
      skippedPriorReflection: true,
    });

    const recovered = await seasons.recoverWizard();
    expect(recovered?.record.state.title).toBe('A spacious winter');
    expect(recovered?.step).toBe('feelings');
    expect(reflected.hash).not.toBe(begun.hash);
  });

  it('uses exact-hash saves and leaves both versions available on conflict', async () => {
    const { seasons, studio } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    await studio.save({
      note: { ...begun.note, body: 'An outside edit.' },
      path: begun.path,
      expectedHash: begun.hash,
    });

    await expect(
      seasons.saveStep(begun, 'feelings', {
        feelings: ['calm'],
      }),
    ).rejects.toBeInstanceOf(StudioSaveConflictError);
  });

  it('requires the fourth-priority override at the application boundary', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    await expect(
      seasons.saveStep(begun, 'priorities', {
        priorities: ['one', 'two', 'three', 'four'],
      }),
    ).rejects.toThrow('three priorities');
    const saved = await seasons.saveStep(
      begun,
      'priorities',
      {
        priorities: ['one', 'two', 'three', 'four'],
      },
      { priorityOverride: true },
    );
    expect(saved.state.priorities).toHaveLength(4);
  });

  it('allows exactly one active season and never activates a draft implicitly', async () => {
    const { seasons } = setup();
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      record = await seasons.saveStep(
        record,
        step,
        step === 'prior-reflection' ? { skippedPriorReflection: true } : {},
      );
    }
    record = await seasons.activateSeason(record);
    expect(record.state.status).toBe('active');
    await expect(seasons.beginSeason({ title: 'Spring' })).rejects.toThrow(
      'active season',
    );
  });

  it('preserves unknown metadata and stores canonical season_id relationships', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    begun.note.extraFrontmatter.future_key = { retained: true };
    const saved = await seasons.saveStep(begun, 'feelings', {
      feelings: ['calm'],
    });
    expect(saved.note.extraFrontmatter.future_key).toEqual({ retained: true });
    expect(saved.note.extraFrontmatter.season_id).toBe(saved.state.id);
  });

  it('returns no recovery or current record in an empty Studio', async () => {
    const { seasons } = setup();
    expect(await seasons.recoverWizard()).toBeNull();
    expect(await seasons.loadCurrent()).toEqual({
      record: null,
      conflicts: [],
    });
  });

  it('loads the selected active season and exposes additional active notes as repair conflicts', async () => {
    const { studio, seasons } = setup();
    const created = '2026-07-14T00:00:00.000Z';
    for (const [id, title] of [
      ['first', 'First'],
      ['second', 'Second'],
    ] as const) {
      await studio.save({
        note: note({
          id,
          title,
          cardType: 'season',
          status: 'active',
          rooms: ['current-season'],
          created,
          updated: created,
          extraFrontmatter: { season_id: id },
        }),
        path: `Current Season/${id}.md`,
        expectedMissing: true,
      });
    }
    const current = await seasons.loadCurrent();
    expect(current.record?.note.cardType).toBe('season');
    expect(current.conflicts).toHaveLength(1);
    await expect(seasons.repairActiveSeason('missing')).rejects.toThrow(
      'no longer active',
    );
    const repaired = await seasons.repairActiveSeason('first');
    expect(repaired.note.id).toBe('first');
    expect((await seasons.loadCurrent()).conflicts).toEqual([]);
  });

  it('can keep a conflicting season that differs from the active checkpoint selection', async () => {
    const { studio, seasons } = setup();
    for (const id of ['first', 'second']) {
      await studio.save({
        note: note({
          id,
          title: id,
          cardType: 'season',
          status: 'active',
          rooms: ['current-season'],
          extraFrontmatter: { season_id: id },
        }),
        path: `Current Season/${id}.md`,
        expectedMissing: true,
      });
    }
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: observed.value.revision + 1,
      activeNoteId: 'first',
      activePath: 'Current Season/first.md',
      operation: null,
    });

    await expect(seasons.repairActiveSeason('second')).resolves.toMatchObject({
      note: { id: 'second', status: 'active' },
    });
    expect((await studio.load('Current Season/first.md')).note.status).toBe(
      'archived',
    );
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: 'second',
      activePath: 'Current Season/second.md',
      operation: null,
    });
  });

  it('refuses conflict repair when the checkpoint names no active candidate', async () => {
    const { studio, seasons } = setup();
    for (const id of ['first', 'second']) {
      await studio.save({
        note: note({
          id,
          cardType: 'season',
          status: 'active',
          rooms: ['current-season'],
          extraFrontmatter: { season_id: id },
        }),
        path: `Current Season/${id}.md`,
        expectedMissing: true,
      });
    }
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: observed.value.revision + 1,
      activeNoteId: 'unrelated',
      activePath: 'Current Season/unrelated.md',
      operation: null,
    });

    await expect(seasons.repairActiveSeason('second')).rejects.toThrow(
      'checkpoint no longer identifies an active candidate',
    );
    expect((await studio.load('Current Season/first.md')).note.status).toBe(
      'active',
    );
    expect((await studio.load('Current Season/second.md')).note.status).toBe(
      'active',
    );
  });

  it.each(['activating', 'repairing', 'closing'] as const)(
    'preserves an in-progress %s operation instead of switching the repair candidate',
    async (kind) => {
      const { studio, seasons } = setup();
      for (const id of ['first', 'second']) {
        await studio.save({
          note: note({
            id,
            cardType: 'season',
            status: 'active',
            rooms: ['current-season'],
            extraFrontmatter: { season_id: id },
          }),
          path: `Current Season/${id}.md`,
          expectedMissing: true,
        });
      }
      const observed = await studio.seasonTransactions.readActive();
      await studio.seasonTransactions.compareAndSetActive(observed, {
        version: 1,
        revision: observed.value.revision + 1,
        activeNoteId: 'first',
        activePath: 'Current Season/first.md',
        operation: {
          id: `${kind}-first-1`,
          kind,
          targetNoteId: 'first',
          targetPath: 'Current Season/first.md',
        },
      });

      await expect(seasons.repairActiveSeason('second')).rejects.toThrow(
        'operation must finish before repairing conflicts',
      );
      expect(
        (await studio.seasonTransactions.readActive()).value.operation,
      ).toMatchObject({ kind, targetNoteId: 'first' });
      expect((await studio.load('Current Season/first.md')).note.status).toBe(
        'active',
      );
      expect((await studio.load('Current Season/second.md')).note.status).toBe(
        'active',
      );
    },
  );

  it('updates an active season without treating a revision as failure', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    const revised = await seasons.updateSeason(begun, {
      statement: 'making room',
      practices: ['A quiet morning'],
      supports: ['Childcare'],
      constraints: ['Energy'],
      enough: 'One useful version',
      notNow: ['Everything else'],
    });
    expect(revised.note.body).toContain('This is a season of making room');
    expect(revised.note.body).toContain('Constraint: Energy');
  });

  it('whitelists revision fields, enforces priority limits, and clears dates durably', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({
      title: 'Winter',
      startsOn: '2026-07-14',
      endsOn: '2026-09-14',
    });
    await expect(
      seasons.updateSeason(begun, {
        status: 'active',
      } as never),
    ).rejects.toThrow('not accepted');
    await expect(
      seasons.updateSeason(begun, {
        priorities: ['one', 'two', 'three', 'four'],
      }),
    ).rejects.toThrow('three priorities');
    const cleared = await seasons.updateSeason(begun, {
      startsOn: null,
      endsOn: null,
    });
    expect(cleared.state.startsOn).toBeUndefined();
    expect(cleared.state.endsOn).toBeUndefined();
    expect(cleared.note.extraFrontmatter).not.toHaveProperty('date_start');
    expect(cleared.note.extraFrontmatter).not.toHaveProperty('date_end');
    expect(cleared.state.id).toBe(begun.state.id);
    expect(cleared.state.created).toBe(begun.state.created);
    expect(cleared.state.status).toBe('draft');
  });

  it('rejects wizard answers assigned to a different step', async () => {
    const { seasons } = setup();
    const begun = await seasons.beginSeason({ title: 'Winter' });
    await expect(
      seasons.saveStep(begun, 'feelings', {
        enough: 'A forged cross-step answer',
      } as never),
    ).rejects.toThrow('not accepted');
  });

  it('coordinates a journalled close, writes a letter, and clears the active checkpoint last', async () => {
    const vault = createInMemoryVault();
    const order: string[] = [];
    let next = 0;
    const durableRevisions = createRevisionStore(vault, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
    });
    const revisions = {
      create: vi.fn(
        async (...input: Parameters<typeof durableRevisions.create>) => {
          order.push('snapshot');
          return durableRevisions.create(...input);
        },
      ),
      prune: vi.fn(() => durableRevisions.prune()),
    };
    const studio = createStudioService({
      vault,
      index: new RecordingIndex(),
      revisions,
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => `note-${(next += 1)}`,
      publish: (event) => {
        if (event.kind === 'note-saved') order.push(`save:${event.path}`);
        if (event.kind === 'note-archived')
          order.push(`archive:${event.noteId}`);
      },
    });
    const seasons = createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => `season-${(next += 1)}`,
    });
    const thread = await studio.save({
      note: note({
        id: 'thread',
        title: 'A thread',
        rooms: ['life-landscape'],
      }),
      path: 'Life Landscape/thread.md',
      expectedMissing: true,
    });
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      record = await seasons.saveStep(
        record,
        step,
        step === 'prior-reflection'
          ? { skippedPriorReflection: true }
          : step === 'priorities'
            ? { priorities: ['thread'] }
            : {},
      );
    }
    record = await seasons.activateSeason(record);
    order.length = 0;
    const closed = await seasons.closeSeason(record, {
      celebration: 'We made room.',
      learning: 'Small was enough.',
      identity: 'More trusting.',
      dispositions: [
        {
          noteId: 'thread',
          title: 'A thread',
          expectedHash: thread.hash,
          disposition: 'archive',
        },
      ],
    });
    expect(order[0]).toBe('snapshot');
    expect((await studio.load(thread.path)).note.status).toBe('archived');
    expect(closed.state.status).toBe('archived');
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: null,
      operation: null,
    });
    expect((await studio.projectStream('reflection'))[0]?.title).toBe(
      'A letter from Winter',
    );
  });

  it('keeps an explicit resumable checkpoint when the pre-close snapshot fails', async () => {
    const vault = createInMemoryVault();
    const studio = createStudioService({
      vault,
      index: new RecordingIndex(),
      revisions: {
        create: vi.fn(async () => {
          throw new Error('snapshot unavailable');
        }),
        prune: vi.fn(async () => undefined),
      },
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => 'season',
    });
    const seasons = createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => 'season',
    });
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      record = await seasons.saveStep(
        record,
        step,
        step === 'prior-reflection' ? { skippedPriorReflection: true } : {},
      );
    }
    record = await seasons.activateSeason(record);
    await expect(
      seasons.closeSeason(record, {
        celebration: 'A beginning.',
        learning: 'Still learning.',
        identity: 'More present.',
        dispositions: [],
      }),
    ).rejects.toThrow('snapshot unavailable');
    expect((await studio.load(record.path)).note.status).toBe('active');
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toMatchObject({
      kind: 'closing',
      targetNoteId: record.note.id,
    });
    expect(await studio.projectStream('reflection')).toEqual([]);
  });

  it('does not reserve closing when the durable request cannot be prepared', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    vi.spyOn(studio, 'prepareSeasonCloseTransaction').mockRejectedValueOnce(
      new Error('journal unavailable'),
    );

    await expect(
      seasons.closeSeason(record, {
        celebration: 'A beginning.',
        learning: 'Still learning.',
        identity: 'More present.',
        dispositions: [],
      }),
    ).rejects.toThrow('journal unavailable');
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: record.note.id,
      activePath: record.path,
      operation: null,
    });
    expect(
      (await studio.seasonTransactions.readCloseJournal()).value,
    ).toBeNull();
  });

  it('recovers a prepared close after reservation fails before process restart', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const compare = studio.seasonTransactions.compareAndSetActive.bind(
      studio.seasonTransactions,
    );
    const compareSpy = vi
      .spyOn(studio.seasonTransactions, 'compareAndSetActive')
      .mockImplementation(async (observed, next) => {
        if (next.operation?.kind === 'closing') {
          compareSpy.mockRestore();
          throw new VaultConflictError();
        }
        return compare(observed, next);
      });

    await expect(
      seasons.closeSeason(record, {
        celebration: 'A beginning.',
        learning: 'Still learning.',
        identity: 'More present.',
        dispositions: [],
      }),
    ).rejects.toThrow('Another active season needs attention');
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toBeNull();
    expect(
      (await studio.seasonTransactions.readCloseJournal()).value,
    ).not.toBeNull();

    const restarted = createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => '01SEASONNOTE',
    });
    await expect(restarted.loadCurrent()).resolves.toEqual({
      record: null,
      conflicts: [],
    });
    expect((await studio.load(record.path)).note.status).toBe('archived');
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: null,
      activePath: null,
      operation: null,
    });
  });

  it('ignores a completed journal after its active checkpoint was cleared', async () => {
    const { seasons } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    await seasons.closeSeason(record, {
      celebration: 'A beginning.',
      learning: 'Still learning.',
      identity: 'More present.',
      dispositions: [],
    });

    await expect(seasons.loadCurrent()).resolves.toEqual({
      record: null,
      conflicts: [],
    });
  });

  it('fails closed when an orphaned journal targets the wrong note or an archived season', async () => {
    const wrong = setup();
    let wrongRecord = await completeWizard(
      wrong.seasons,
      await wrong.seasons.beginSeason({ title: 'Winter' }),
    );
    wrongRecord = await wrong.seasons.activateSeason(wrongRecord);
    vi.spyOn(wrong.studio, 'pendingSeasonCloseTransaction').mockResolvedValue({
      transactionId: 'closing-wrong',
      seasonNoteId: 'other-season',
      seasonPath: wrongRecord.path,
      stage: 'prepared',
    });
    await expect(wrong.seasons.loadCurrent()).rejects.toThrow(
      'no longer matches its canonical note',
    );

    const archived = setup();
    let archivedRecord = await completeWizard(
      archived.seasons,
      await archived.seasons.beginSeason({ title: 'Winter' }),
    );
    archivedRecord = await archived.seasons.activateSeason(archivedRecord);
    await archived.studio.archive(archivedRecord.note.id);
    vi.spyOn(
      archived.studio,
      'pendingSeasonCloseTransaction',
    ).mockResolvedValue({
      transactionId: 'closing-archived',
      seasonNoteId: archivedRecord.note.id,
      seasonPath: archivedRecord.path,
      stage: 'prepared',
    });
    await expect(archived.seasons.loadCurrent()).rejects.toThrow(
      'no longer targets an active season',
    );
  });

  it('preserves a matched closing checkpoint when its journal disappears before resume', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      ...observed.value,
      revision: observed.value.revision + 1,
      operation: {
        id: 'closing-missing-at-resume',
        kind: 'closing',
        targetNoteId: record.note.id,
        targetPath: record.path,
      },
    });
    vi.spyOn(studio, 'pendingSeasonCloseTransaction').mockResolvedValue({
      transactionId: 'closing-missing-at-resume',
      seasonNoteId: record.note.id,
      seasonPath: record.path,
      stage: 'prepared',
    });
    vi.spyOn(studio, 'resumeSeasonCloseTransaction').mockResolvedValue(null);

    await expect(seasons.loadCurrent()).rejects.toThrow('has no journal');
  });

  it('rejects blank close reflections and incomplete disposition sets before reserving close', async () => {
    const { seasons, studio } = setup();
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      record = await seasons.saveStep(
        record,
        step,
        step === 'prior-reflection' ? { skippedPriorReflection: true } : {},
      );
    }
    record = await seasons.activateSeason(record);
    await expect(
      seasons.closeSeason(record, {
        celebration: '   ',
        learning: 'Learning',
        identity: 'Becoming',
        dispositions: [],
      }),
    ).rejects.toThrow('celebration');
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toBeNull();
  });

  it('rejects every malformed priority disposition shape before reserving close', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const malformed = [
      {
        priorities: ['thread', 'thread'],
        dispositions: [
          {
            noteId: 'thread',
            title: 'Thread',
            expectedHash: 'hash',
            disposition: 'archive' as const,
          },
          {
            noteId: 'other',
            title: 'Other',
            expectedHash: 'hash',
            disposition: 'archive' as const,
          },
        ],
      },
      { priorities: ['thread'], dispositions: [] },
      {
        priorities: ['thread', 'other'],
        dispositions: [
          {
            noteId: 'thread',
            title: 'Thread',
            expectedHash: 'hash',
            disposition: 'archive' as const,
          },
          {
            noteId: 'thread',
            title: 'Thread again',
            expectedHash: 'hash',
            disposition: 'release' as const,
          },
        ],
      },
      {
        priorities: ['thread'],
        dispositions: [
          {
            noteId: 'other',
            title: 'Other',
            expectedHash: 'hash',
            disposition: 'archive' as const,
          },
        ],
      },
      {
        priorities: ['thread'],
        dispositions: [
          {
            noteId: 'thread',
            title: 'Thread',
            expectedHash: '   ',
            disposition: 'archive' as const,
          },
        ],
      },
    ];

    for (const candidate of malformed) {
      await expect(
        seasons.closeSeason(
          {
            ...record,
            state: { ...record.state, priorities: candidate.priorities },
          },
          {
            celebration: 'Enough.',
            learning: 'Learning.',
            identity: 'Becoming.',
            dispositions: candidate.dispositions,
          },
        ),
      ).rejects.toThrow('exactly one current disposition');
    }
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toBeNull();
  });

  it('preserves a closing checkpoint that has no durable journal', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      ...observed.value,
      revision: observed.value.revision + 1,
      operation: {
        id: 'missing-close-journal',
        kind: 'closing',
        targetNoteId: record.note.id,
        targetPath: record.path,
      },
    });

    await expect(seasons.loadCurrent()).rejects.toThrow(
      'does not match its durable journal',
    );
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toMatchObject({ id: 'missing-close-journal' });
  });

  it('returns its archived season when a close reservation resumes first', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      ...observed.value,
      revision: observed.value.revision + 1,
      operation: {
        id: 'completed-close',
        kind: 'closing',
        targetNoteId: record.note.id,
        targetPath: record.path,
      },
    });
    vi.spyOn(studio, 'resumeSeasonCloseTransaction').mockResolvedValue({
      season: {
        ...record,
        note: { ...record.note, status: 'archived' },
      },
      snapshot: {
        manifestPath: '.studio/revisions/close/manifest.json',
        manifest: {
          version: 1,
          id: 'close',
          reason: 'season-close',
          createdAt: '2026-07-14T00:00:00.000Z',
          state: 'complete',
          files: [],
        },
      },
    });
    vi.spyOn(studio, 'pendingSeasonCloseTransaction').mockResolvedValue({
      transactionId: 'completed-close',
      seasonNoteId: record.note.id,
      seasonPath: record.path,
      stage: 'completed',
    });

    await expect(
      seasons.closeSeason(record, {
        celebration: 'Enough.',
        learning: 'Learning.',
        identity: 'Becoming.',
        dispositions: [],
      }),
    ).resolves.toMatchObject({ state: { status: 'archived' } });
  });

  it('rejects close when recovery completes another season first', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      ...observed.value,
      revision: observed.value.revision + 1,
      operation: {
        id: 'closing-other',
        kind: 'closing',
        targetNoteId: record.note.id,
        targetPath: record.path,
      },
    });
    vi.spyOn(studio, 'pendingSeasonCloseTransaction').mockResolvedValue({
      transactionId: 'closing-other',
      seasonNoteId: record.note.id,
      seasonPath: record.path,
      stage: 'completed',
    });
    vi.spyOn(studio, 'resumeSeasonCloseTransaction').mockResolvedValue({
      season: {
        note: note({
          id: 'other-season',
          cardType: 'season',
          status: 'archived',
          extraFrontmatter: { season_id: 'other-season' },
        }),
        path: 'Current Season/other-season.md',
        hash: 'other-hash',
      },
      snapshot: {
        manifestPath: '.studio/backups/other/manifest.json',
        manifest: {
          version: 1,
          id: 'other',
          reason: 'season-close',
          createdAt: '2026-07-14T00:00:00.000Z',
          state: 'complete',
          files: [],
        },
      },
    });

    await expect(
      seasons.closeSeason(record, {
        celebration: 'Enough.',
        learning: 'Learning.',
        identity: 'Becoming.',
        dispositions: [],
      }),
    ).rejects.toThrow('Another active season needs attention');
  });

  it('rejects close when the active checkpoint changed before preparation', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      ...observed.value,
      revision: observed.value.revision + 1,
      activeNoteId: 'other-season',
      activePath: 'Current Season/other-season.md',
    });

    await expect(
      seasons.closeSeason(record, {
        celebration: 'Enough.',
        learning: 'Learning.',
        identity: 'Becoming.',
        dispositions: [],
      }),
    ).rejects.toThrow('Another active season needs attention');
  });

  it('clears a reservation after a resume preflight failure and detects a disappeared prepared journal', async () => {
    for (const failure of [
      null,
      new SeasonClosePreflightError('resume preflight failed'),
    ] as const) {
      const { seasons, studio } = setup();
      let record = await completeWizard(
        seasons,
        await seasons.beginSeason({ title: 'Winter' }),
      );
      record = await seasons.activateSeason(record);
      if (failure === null) {
        vi.spyOn(studio, 'resumeSeasonCloseTransaction').mockResolvedValueOnce(
          null,
        );
      } else {
        vi.spyOn(studio, 'resumeSeasonCloseTransaction').mockRejectedValueOnce(
          failure,
        );
      }

      await expect(
        seasons.closeSeason(record, {
          celebration: 'Enough.',
          learning: 'Learning.',
          identity: 'Becoming.',
          dispositions: [],
        }),
      ).rejects.toThrow(
        failure === null ? 'journal disappeared' : 'resume preflight failed',
      );
      const operation = (await studio.seasonTransactions.readActive()).value
        .operation;
      if (failure === null) {
        expect(operation).toMatchObject({ kind: 'closing' });
      } else {
        expect(operation).toBeNull();
      }
    }
  });

  it('fails explicitly without mutating user notes when recovery finds a forged active target', async () => {
    const { seasons, studio, vault } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const before = await vault.readText(record.path);
    await createStudioControlVault(vault).writeTextAtomic(
      '.studio/season/active.json',
      `${JSON.stringify({
        version: 1,
        revision: 3,
        activeNoteId: record.note.id,
        activePath: record.path,
        operation: {
          id: 'other-completed-close',
          kind: 'closing',
          targetNoteId: 'other-season',
          targetPath: 'Current Season/other.md',
        },
      })}\n`,
    );
    const resume = vi.spyOn(studio, 'resumeSeasonCloseTransaction');

    await expect(seasons.loadCurrent()).rejects.toThrow(
      'active-season checkpoint',
    );
    expect(resume).not.toHaveBeenCalled();
    expect(await vault.readText(record.path)).toEqual(before);
    expect((await studio.projectCurrentSeason()).current).toMatchObject({
      noteId: record.note.id,
      status: 'active',
    });
  });

  it('treats a close checkpoint cleared by a concurrent finisher as complete', async () => {
    const { seasons, studio } = setup();
    let record = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    record = await seasons.activateSeason(record);
    const compare = studio.seasonTransactions.compareAndSetActive.bind(
      studio.seasonTransactions,
    );
    let calls = 0;
    vi.spyOn(
      studio.seasonTransactions,
      'compareAndSetActive',
    ).mockImplementation(async (observed, next) => {
      calls += 1;
      const result = await compare(observed, next);
      if (calls === 2) throw new VaultConflictError();
      return result;
    });

    await expect(
      seasons.closeSeason(record, {
        celebration: 'Enough.',
        learning: 'Learning.',
        identity: 'Becoming.',
        dispositions: [],
      }),
    ).resolves.toMatchObject({ state: { status: 'archived' } });
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: null,
      operation: null,
    });
  });

  it('clears only the close reservation when canonical preflight fails', async () => {
    const { seasons, studio } = setup();
    await studio.save({
      note: note({
        id: 'thread',
        title: 'Thread',
        rooms: ['life-landscape'],
      }),
      path: 'Life Landscape/thread.md',
      expectedMissing: true,
    });
    let record = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      record = await seasons.saveStep(
        record,
        step,
        step === 'prior-reflection'
          ? { skippedPriorReflection: true }
          : step === 'priorities'
            ? { priorities: ['thread'] }
            : {},
      );
    }
    record = await seasons.activateSeason(record);

    await expect(
      seasons.closeSeason(record, {
        celebration: 'Enough.',
        learning: 'Learning.',
        identity: 'Becoming.',
        dispositions: [
          {
            noteId: 'thread',
            title: 'Thread',
            expectedHash: 'stale-hash',
            disposition: 'archive',
          },
        ],
      }),
    ).rejects.toThrow('changed before close began');
    expect((await studio.seasonTransactions.readActive()).value).toMatchObject({
      activeNoteId: record.note.id,
      operation: null,
    });
    expect((await studio.load(record.path)).note.status).toBe('active');
  });

  it('recovers malformed optional workflow fields conservatively', () => {
    const malformed = note({
      status: 'archived',
      extraFrontmatter: {
        season_id: '',
        date_start: 42,
        date_end: false,
        priorities: ['one', 2],
        season_workflow: {
          statement: 1,
          prior_reflection: false,
          skipped_prior_reflection: 'yes',
          feelings: 'calm',
          decisions: [
            null,
            'bad',
            {},
            { id: 'd', text: 'Decide', horizon: '30', kind: 'decision' },
          ],
          practices: [1],
          supports: null,
          constraints: {},
          enough: 2,
          not_now: false,
          mid_season_notes: 'none',
          completed_steps: ['feelings', 'future'],
        },
      },
    });
    delete malformed.title;
    const state = seasonStateFromNote(malformed);
    expect(state.id).toBe('n1');
    expect(state.title).toBe('');
    expect(state.status).toBe('archived');
    expect(state.decisions).toHaveLength(1);
    expect(state.completedSteps).toEqual(['feelings']);
  });

  it('uses defaults and rejects activation or closing in invalid lifecycle states', async () => {
    const vault = createInMemoryVault();
    const studio = createStudioService({ vault, index: new RecordingIndex() });
    const seasons = createSeasonService(studio);
    const draft = await seasons.beginSeason({ title: 'A season' });
    await expect(seasons.activateSeason(draft)).rejects.toThrow('confirm');
    await expect(
      seasons.closeSeason(draft, {
        celebration: '',
        learning: '',
        identity: '',
        dispositions: [],
      }),
    ).rejects.toThrow('active season');
  });

  it('refuses activation when another season became active during the wizard', async () => {
    const { studio, seasons } = setup();
    let draft = await seasons.beginSeason({ title: 'Winter' });
    for (const step of [
      'prior-reflection',
      'feelings',
      'priorities',
      'decisions-practices',
      'supports-constraints',
      'enough',
      'not-now',
      'confirm',
    ] as const) {
      draft = await seasons.saveStep(
        draft,
        step,
        step === 'prior-reflection' ? { skippedPriorReflection: true } : {},
      );
    }
    await studio.save({
      note: note({
        id: 'other-season',
        title: 'Other',
        cardType: 'season',
        status: 'active',
        rooms: ['current-season'],
        extraFrontmatter: { season_id: 'other' },
      }),
      path: 'Current Season/other.md',
      expectedMissing: true,
    });
    await expect(seasons.activateSeason(draft)).rejects.toThrow(
      'Another active season',
    );
  });

  it('refuses activation when a checkpoint already names another season', async () => {
    const { studio, seasons } = setup();
    const draft = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: observed.value.revision + 1,
      activeNoteId: 'other-season',
      activePath: 'Current Season/other-season.md',
      operation: null,
    });

    await expect(seasons.activateSeason(draft)).rejects.toThrow(
      'Another active season needs attention',
    );
    expect((await studio.load(draft.path)).note.status).toBe('draft');
  });

  it('has one exact winner when two confirmed drafts activate concurrently', async () => {
    const vault = createInMemoryVault();
    const studio = createStudioService({
      vault,
      index: new RecordingIndex(),
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
    });
    const winter = createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => 'winter',
    });
    const spring = createSeasonService(studio, {
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
      generateId: () => 'spring',
    });
    const winterDraft = await completeWizard(
      winter,
      await winter.beginSeason({ title: 'Winter' }),
    );
    const springDraft = await completeWizard(
      spring,
      await spring.beginSeason({ title: 'Spring' }),
    );

    const results = await Promise.allSettled([
      winter.activateSeason(winterDraft),
      spring.activateSeason(springDraft),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect((await studio.projectCurrentSeason()).conflicts).toEqual([]);
    expect((await studio.projectCurrentSeason()).current?.status).toBe(
      'active',
    );
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toBeNull();
  });

  it('recovers an activation reserved before the note write', async () => {
    const { studio, seasons } = setup();
    const draft = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: observed.value.revision + 1,
      activeNoteId: draft.note.id,
      activePath: draft.path,
      operation: {
        id: 'interrupted-activation',
        kind: 'activating',
        targetNoteId: draft.note.id,
        targetPath: draft.path,
      },
    });

    const [recovered, concurrentRecovery] = await Promise.all([
      seasons.loadCurrent(),
      seasons.loadCurrent(),
    ]);

    expect(recovered.record?.state.status).toBe('active');
    expect(concurrentRecovery.record?.state.status).toBe('active');
    expect(
      (await studio.seasonTransactions.readActive()).value.operation,
    ).toBeNull();
  });

  it('fails closed when a reserved activation targets the wrong or archived note', async () => {
    const { studio, seasons } = setup();
    const draft = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    let observed = await studio.seasonTransactions.readActive();
    let reserved = await studio.seasonTransactions.compareAndSetActive(
      observed,
      {
        version: 1,
        revision: 1,
        activeNoteId: 'different-id',
        activePath: draft.path,
        operation: {
          id: 'wrong-target',
          kind: 'activating',
          targetNoteId: 'different-id',
          targetPath: draft.path,
        },
      },
    );
    await expect(seasons.loadCurrent()).rejects.toThrow('no longer matches');
    reserved = await studio.seasonTransactions.compareAndSetActive(reserved, {
      ...reserved.value,
      revision: 2,
      activeNoteId: draft.note.id,
      operation: {
        id: 'archived-target',
        kind: 'activating',
        targetNoteId: draft.note.id,
        targetPath: draft.path,
      },
    });
    await studio.archive(draft.note.id);
    await expect(seasons.loadCurrent()).rejects.toThrow('cannot be activated');
    observed = reserved;
    expect(observed.value.operation?.id).toBe('archived-target');
  });

  it('fails closed when a reserved repair target disappeared', async () => {
    const { studio, seasons } = setup();
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: 1,
      activeNoteId: 'missing',
      activePath: 'Current Season/missing.md',
      operation: {
        id: 'repair-missing',
        kind: 'repairing',
        targetNoteId: 'missing',
        targetPath: 'Current Season/missing.md',
      },
    });
    await expect(seasons.loadCurrent()).rejects.toThrow('no longer exists');
  });

  it('finishes another interrupted activation before rejecting this draft', async () => {
    const vault = createInMemoryVault();
    const studio = createStudioService({
      vault,
      index: new RecordingIndex(),
      clock: () => new Date('2026-07-14T00:00:00.000Z'),
    });
    const winter = createSeasonService(studio, { generateId: () => 'winter' });
    const spring = createSeasonService(studio, { generateId: () => 'spring' });
    const winterDraft = await completeWizard(
      winter,
      await winter.beginSeason({ title: 'Winter' }),
    );
    const springDraft = await completeWizard(
      spring,
      await spring.beginSeason({ title: 'Spring' }),
    );
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: 1,
      activeNoteId: winterDraft.note.id,
      activePath: winterDraft.path,
      operation: {
        id: 'activate-winter',
        kind: 'activating',
        targetNoteId: winterDraft.note.id,
        targetPath: winterDraft.path,
      },
    });
    await expect(spring.activateSeason(springDraft)).rejects.toThrow(
      'Another active season',
    );
    expect((await winter.loadCurrent()).record?.note.id).toBe('winter');
  });

  it('blocks begin for a legacy active note even before checkpoint adoption', async () => {
    const { studio, seasons } = setup();
    await studio.save({
      note: note({
        id: 'legacy',
        cardType: 'season',
        status: 'active',
        rooms: ['current-season'],
      }),
      path: 'Current Season/legacy.md',
      expectedMissing: true,
    });
    await expect(seasons.beginSeason({ title: 'Spring' })).rejects.toThrow(
      'Close the active season',
    );
  });

  it('treats an already-completed activation checkpoint as idempotent', async () => {
    const { studio, seasons } = setup();
    const draft = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    const compare = studio.seasonTransactions.compareAndSetActive.bind(
      studio.seasonTransactions,
    );
    let calls = 0;
    vi.spyOn(
      studio.seasonTransactions,
      'compareAndSetActive',
    ).mockImplementation(async (observed, next) => {
      calls += 1;
      const result = await compare(observed, next);
      if (calls === 2) throw new VaultConflictError();
      return result;
    });

    await expect(seasons.activateSeason(draft)).resolves.toMatchObject({
      state: { status: 'active' },
    });
  });

  it.each([
    ['unexpected', new Error('checkpoint unavailable')],
    ['competing', new VaultConflictError()],
  ] as const)(
    'preserves a %s failure while completing activation',
    async (_kind, completionError) => {
      const { studio, seasons } = setup();
      const draft = await completeWizard(
        seasons,
        await seasons.beginSeason({ title: 'Winter' }),
      );
      const compare = studio.seasonTransactions.compareAndSetActive.bind(
        studio.seasonTransactions,
      );
      let calls = 0;
      vi.spyOn(
        studio.seasonTransactions,
        'compareAndSetActive',
      ).mockImplementation(async (observed, next) => {
        calls += 1;
        if (calls === 2) throw completionError;
        return compare(observed, next);
      });
      await expect(seasons.activateSeason(draft)).rejects.toBe(completionError);
    },
  );

  it('preserves unexpected checkpoint and note-save failures', async () => {
    const first = setup();
    const firstDraft = await completeWizard(
      first.seasons,
      await first.seasons.beginSeason({ title: 'Winter' }),
    );
    vi.spyOn(
      first.studio.seasonTransactions,
      'compareAndSetActive',
    ).mockRejectedValueOnce(new Error('checkpoint unavailable'));
    await expect(first.seasons.activateSeason(firstDraft)).rejects.toThrow(
      'checkpoint unavailable',
    );

    const second = setup();
    const secondDraft = await completeWizard(
      second.seasons,
      await second.seasons.beginSeason({ title: 'Winter' }),
    );
    const observed = await second.studio.seasonTransactions.readActive();
    await second.studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: 1,
      activeNoteId: secondDraft.note.id,
      activePath: secondDraft.path,
      operation: {
        id: 'activate-with-conflict',
        kind: 'activating',
        targetNoteId: secondDraft.note.id,
        targetPath: secondDraft.path,
      },
    });
    vi.spyOn(second.studio, 'save').mockRejectedValueOnce(
      new StudioSaveConflictError(secondDraft.note, ''),
    );
    await expect(second.seasons.loadCurrent()).rejects.toBeInstanceOf(
      StudioSaveConflictError,
    );
  });

  it('returns the same season when activation resumes its own reservation', async () => {
    const { studio, seasons } = setup();
    const draft = await completeWizard(
      seasons,
      await seasons.beginSeason({ title: 'Winter' }),
    );
    const observed = await studio.seasonTransactions.readActive();
    await studio.seasonTransactions.compareAndSetActive(observed, {
      version: 1,
      revision: 1,
      activeNoteId: draft.note.id,
      activePath: draft.path,
      operation: {
        id: 'activate-self',
        kind: 'activating',
        targetNoteId: draft.note.id,
        targetPath: draft.path,
      },
    });
    await expect(seasons.activateSeason(draft)).resolves.toMatchObject({
      note: { id: draft.note.id },
      state: { status: 'active' },
    });
  });

  it('serializes opposite conflict repairs so they cannot archive both seasons', async () => {
    const { studio, seasons } = setup();
    for (const id of ['first', 'second']) {
      await studio.save({
        note: note({
          id,
          title: id,
          cardType: 'season',
          status: 'active',
          rooms: ['current-season'],
          extraFrontmatter: { season_id: id },
        }),
        path: `Current Season/${id}.md`,
        expectedMissing: true,
      });
    }

    const results = await Promise.allSettled([
      seasons.repairActiveSeason('first'),
      seasons.repairActiveSeason('second'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const projection = await studio.projectCurrentSeason();
    expect(projection.current).not.toBeNull();
    expect(projection.conflicts).toEqual([]);
    const checkpoint = await studio.seasonTransactions.readActive();
    expect(checkpoint.value.activeNoteId).toBe(projection.current?.noteId);
    expect(checkpoint.value.operation).toBeNull();
  });

  it('parses valid dates, active state, experiments, and non-object workflows', () => {
    const active = seasonStateFromNote(
      note({
        status: 'active',
        extraFrontmatter: {
          season_id: 'winter',
          date_start: '2026-07-14',
          date_end: '2026-09-14',
          season_workflow: {
            statement: 'rest',
            prior_reflection: 'Earlier',
            feelings: ['calm'],
            decisions: [
              { id: 'e60', text: 'Try', horizon: '60', kind: 'experiment' },
              {
                id: 'e90',
                text: 'Try later',
                horizon: '90',
                kind: 'experiment',
              },
              {
                id: 'bad-horizon',
                text: 'No',
                horizon: '120',
                kind: 'decision',
              },
              { id: 'bad-kind', text: 'No', horizon: '30', kind: 'task' },
            ],
            practices: ['walk'],
            supports: ['friend'],
            constraints: ['time'],
            enough: 'small',
            not_now: ['more'],
            mid_season_notes: ['changed'],
            completed_steps: [],
          },
        },
      }),
    );
    expect(active).toMatchObject({
      id: 'winter',
      status: 'active',
      startsOn: '2026-07-14',
      endsOn: '2026-09-14',
      statement: 'rest',
      priorReflection: 'Earlier',
      decisions: [{ id: 'e60' }, { id: 'e90' }],
    });
    expect(
      seasonStateFromNote(note({ extraFrontmatter: { season_workflow: [] } }))
        .statement,
    ).toBe('');
    expect(
      seasonStateFromNote(note({ extraFrontmatter: { season_workflow: null } }))
        .feelings,
    ).toEqual([]);
  });
});
