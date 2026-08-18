import { describe, it, expect } from 'vitest';
import { isDue, sm2Interval, selectResurface, preferredKinds } from './resurfacing';
import type { ResurfaceCard, RhythmContext } from './types';

function card(partial: Partial<ResurfaceCard>): ResurfaceCard {
  return {
    sourcePath: 'daily/2026-05-01',
    kind: 'evidence',
    dueDate: '2026-06-21',
    intervalDays: 1,
    ...partial,
  };
}

function ctxWith(over: Partial<RhythmContext> = {}): RhythmContext {
  return {
    date: '2026-06-21',
    season: 'winter',
    microSeason: { term: 'Summer Solstice', gloss: 'the longest day' },
    moon: { phase: 'first-quarter', illumination: 0.5 },
    cycle: { phase: 'follicular', day: 8 },
    placements: {},
    ...over,
  };
}

describe('SM-2 helpers', () => {
  it('isDue is true when dueDate equals today', () => {
    expect(isDue(card({ dueDate: '2026-06-21' }), '2026-06-21')).toBe(true);
  });

  it('isDue is true when dueDate is before today', () => {
    expect(isDue(card({ dueDate: '2026-06-10' }), '2026-06-21')).toBe(true);
  });

  it('isDue is false when dueDate is after today', () => {
    expect(isDue(card({ dueDate: '2026-07-01' }), '2026-06-21')).toBe(false);
  });

  it('sm2Interval resets to 1 day on a failing recall (quality < 3)', () => {
    expect(sm2Interval(6, 2)).toBe(1);
    expect(sm2Interval(40, 0)).toBe(1);
  });

  it('sm2Interval grows the interval on a passing recall (quality >= 3)', () => {
    expect(sm2Interval(1, 4)).toBe(6); // first pass → fixed 6-day step
    expect(sm2Interval(6, 5)).toBe(15); // 6 * 2.5 = 15, rounded
  });
});

describe('selectResurface — due filtering', () => {
  it('Due by interval — a card due today is returned', () => {
    const due = card({ dueDate: '2026-06-21', intervalDays: 6 });
    expect(selectResurface([due], ctxWith(), '2026-06-21')).toEqual(due);
  });

  it('None due → null — every card is due in the future', () => {
    const future = [
      card({ sourcePath: 'a', kind: 'evidence', dueDate: '2026-07-01', intervalDays: 6 }),
      card({ sourcePath: 'b', kind: 'wish', dueDate: '2026-07-01', intervalDays: 6 }),
    ];
    expect(selectResurface(future, ctxWith(), '2026-06-21')).toBeNull();
  });

  it('Empty pool — returns null and does not throw', () => {
    expect(() => selectResurface([], ctxWith(), '2026-06-21')).not.toThrow();
    expect(selectResurface([], ctxWith(), '2026-06-21')).toBeNull();
  });
});

const POOL: ResurfaceCard[] = [
  { sourcePath: 'evidence/a', kind: 'evidence', dueDate: '2026-06-01', intervalDays: 6 },
  { sourcePath: 'wishes/b', kind: 'wish', dueDate: '2026-06-01', intervalDays: 6 },
];

describe('selectResurface — rhythm ranking', () => {
  it('Late-luteal/deep-winter brings proof — an evidence card is chosen', () => {
    const ctx = ctxWith({ season: 'winter', cycle: { phase: 'luteal', day: 26 } });
    const picked = selectResurface(POOL, ctx, '2026-06-21');
    expect(picked).not.toBeNull();
    expect(picked!.kind).toBe('evidence');
  });

  it('Follicular/spring surfaces wishes — a wish card is chosen', () => {
    const ctx = ctxWith({ season: 'spring', cycle: { phase: 'follicular', day: 8 } });
    const picked = selectResurface(POOL, ctx, '2026-06-21');
    expect(picked).not.toBeNull();
    expect(picked!.kind).toBe('wish');
  });

  it('Moon-keyed selection — new moon surfaces a wish, full moon surfaces evidence', () => {
    const newMoon = ctxWith({ moon: { phase: 'new', illumination: 0 } });
    const fullMoon = ctxWith({ moon: { phase: 'full', illumination: 1 } });
    expect(selectResurface(POOL, newMoon, '2026-06-21')!.kind).toBe('wish');
    expect(selectResurface(POOL, fullMoon, '2026-06-21')!.kind).toBe('evidence');
  });

  it('Phase determinism, not randomness — same cards/ctx/today returns the same card twice', () => {
    const ctx = ctxWith({ season: 'winter', cycle: { phase: 'luteal', day: 26 } });
    const first = selectResurface(POOL, ctx, '2026-06-21');
    const second = selectResurface(POOL, ctx, '2026-06-21');
    expect(first).toEqual(second);
    expect(first!.sourcePath).toBe(second!.sourcePath);
  });

  it('Input order does not change the pick — selection depends only on rhythm and sourcePath', () => {
    const ctx = ctxWith({ season: 'winter', cycle: { phase: 'luteal', day: 26 } });
    expect(selectResurface([...POOL].reverse(), ctx, '2026-06-21')).toEqual(
      selectResurface(POOL, ctx, '2026-06-21'),
    );
  });

  it('Same-kind ties break on sourcePath, lowest first', () => {
    const sameKind: ResurfaceCard[] = [
      { sourcePath: 'evidence/z', kind: 'evidence', dueDate: '2026-06-01', intervalDays: 6 },
      { sourcePath: 'evidence/a', kind: 'evidence', dueDate: '2026-06-01', intervalDays: 6 },
    ];
    expect(selectResurface(sameKind, ctxWith(), '2026-06-21')!.sourcePath).toBe('evidence/a');
  });

  it('preferredKinds leads with evidence in deep winter and wish in spring', () => {
    expect(preferredKinds(ctxWith({ season: 'winter', cycle: { phase: 'luteal', day: 26 } }))[0]).toBe(
      'evidence',
    );
    expect(preferredKinds(ctxWith({ season: 'spring', cycle: { phase: 'follicular', day: 8 } }))[0]).toBe(
      'wish',
    );
  });

  it('preferredKinds always returns all four kinds exactly once', () => {
    const order = preferredKinds(ctxWith());
    expect([...order].sort()).toEqual(['dream', 'evidence', 'reframe', 'wish']);
  });

  it('preferredKinds works with no cycle data', () => {
    const order = preferredKinds(ctxWith({ cycle: undefined, moon: { phase: 'new', illumination: 0 } }));
    expect(order[0]).toBe('wish');
  });
});
