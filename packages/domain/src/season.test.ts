import { describe, expect, it } from 'vitest';

import {
  PriorityLimitError,
  addSeasonPriority,
  createSeasonDraft,
  closeSeasonState,
  seasonWizardSteps,
  updateSeasonDraft,
} from './season';

describe('season domain', () => {
  it('persists an interruptible nine-step draft without losing earlier answers', () => {
    const draft = createSeasonDraft('season-1', '2026-07-14T00:00:00.000Z');
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
});
