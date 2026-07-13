import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it, vi } from 'vitest';

import { createSeasonService, seasonStateFromNote } from './season-service';
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
    const revisions = {
      create: vi.fn(async () => {
        order.push('snapshot');
        return { manifest: {} as never, manifestPath: '.studio/revision.json' };
      }),
      prune: vi.fn(async () => undefined),
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
