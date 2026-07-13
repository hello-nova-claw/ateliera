import { describe, expect, it } from 'vitest';

import type { SeasonState } from './season';

import {
  activateSeasonState,
  PriorityLimitError,
  addSeasonPriority,
  createSeasonDraft,
  closeSeasonState,
  seasonWizardSteps,
  updateSeasonDraft,
} from './season';

describe('season domain', () => {
  it('persists an interruptible nine-step draft without losing earlier answers', () => {
    const draft = {
      ...createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z'),
      title: 'Winter',
    };
    const named = updateSeasonDraft(draft, 'name-dates', {
      title: 'A spacious winter',
      startsOn: '2026-07-14',
      endsOn: '2026-10-01',
    });
    const reflected = updateSeasonDraft(named, 'prior-reflection', {
      priorReflection: '',
      skippedPriorReflection: true,
    });

    expect(seasonWizardSteps).toHaveLength(9);
    expect(reflected.title).toBe('A spacious winter');
    expect(reflected.skippedPriorReflection).toBe(true);
    expect(reflected.completedSteps).toEqual([
      'name-dates',
      'prior-reflection',
    ]);
  });

  it('requires an explicit override before adding a fourth priority', () => {
    const base = {
      ...createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z'),
      priorities: ['one', 'two', 'three'],
    };
    expect(() => addSeasonPriority(base, 'four')).toThrow(PriorityLimitError);
    expect(
      addSeasonPriority(base, 'four', { override: true }).priorities,
    ).toHaveLength(4);
  });

  it('never carries notes forward automatically when closing', () => {
    const closed = closeSeasonState({
      ...createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z'),
      status: 'active',
      priorities: ['one'],
      notNow: ['two'],
    });
    expect(closed.carryForward).toEqual([]);
    expect(closed.status).toBe('archived');
  });

  it('rejects an end date before the start date', () => {
    const draft = createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z');
    expect(() =>
      updateSeasonDraft(draft, 'name-dates', {
        title: 'Winter',
        startsOn: '2026-09-01',
        endsOn: '2026-08-01',
      }),
    ).toThrow('End date');
  });

  it('accepts only real ISO calendar dates and supports explicit date clearing', () => {
    const draft = createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z');
    expect(() =>
      updateSeasonDraft(draft, 'name-dates', {
        title: 'Winter',
        startsOn: '2026-02-30',
      }),
    ).toThrow('YYYY-MM-DD');
    expect(() =>
      updateSeasonDraft(draft, 'name-dates', {
        title: 'Winter',
        startsOn: '2025-02-29',
      }),
    ).toThrow('YYYY-MM-DD');
    const dated = updateSeasonDraft(draft, 'name-dates', {
      title: 'Winter',
      startsOn: '2028-02-29',
      endsOn: '2028-03-01',
    });
    const cleared = updateSeasonDraft(dated, 'name-dates', {
      title: 'Winter',
      startsOn: null,
      endsOn: null,
    });
    expect(cleared.startsOn).toBeUndefined();
    expect(cleared.endsOn).toBeUndefined();
  });

  it('rejects fields outside a wizard step and protects lifecycle identity', () => {
    const draft = {
      ...createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z'),
      title: 'Winter',
    };
    expect(() =>
      updateSeasonDraft(draft, 'feelings', {
        feelings: ['calm'],
        // A JavaScript caller can bypass TypeScript, so the domain boundary must still reject it.
        status: 'active',
      } as never),
    ).toThrow('not accepted');
    expect(() =>
      updateSeasonDraft(draft, 'priorities', {
        priorities: ['one', 'two', 'three', 'four'],
      }),
    ).toThrow(PriorityLimitError);
    expect(() =>
      updateSeasonDraft(draft, 'feelings', {
        feelings: ['calm', 42],
      } as never),
    ).toThrow('feelings');
    expect(() =>
      updateSeasonDraft(draft, 'decisions-practices', {
        decisions: [
          { id: 'bad', text: 'Maybe', horizon: '120', kind: 'decision' },
        ],
      } as never),
    ).toThrow('decisions');
  });

  it('activates only a draft confirmed through the confirm step', () => {
    const draft = createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z');
    const forged: SeasonState = {
      ...draft,
      title: 'Winter',
      completedSteps: ['confirm'],
    };
    expect(() => activateSeasonState(forged)).toThrow('all earlier steps');
    const archived = { ...draft, status: 'archived' as const };
    expect(() => activateSeasonState(archived)).toThrow('draft');
  });
});
