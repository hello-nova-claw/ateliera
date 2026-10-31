import { describe, it, expect } from 'vitest';
import { computeCycle, computeLunarSeason, computeMoon, computeRhythmContext, resolveMicroSeason, resolveSeason } from './rhythm';
import type { RhythmProfile } from './types';

function makeProfile(over: Partial<RhythmProfile> = {}): RhythmProfile {
  return {
    location: { hemisphere: 'S' },
    natal: { placements: { sun: 'Gemini', moon: 'Pisces' } },
    ...over,
  };
}

describe('Hemisphere-aware season', () => {
  it('S hemisphere on 2026-06-21 is winter', () => {
    expect(computeRhythmContext(makeProfile({ location: { hemisphere: 'S' } }), '2026-06-21').season).toBe('winter');
  });

  it('N hemisphere on 2026-06-21 is summer', () => {
    expect(computeRhythmContext(makeProfile({ location: { hemisphere: 'N' } }), '2026-06-21').season).toBe('summer');
  });

  it('resolveSeason flips every northern season for the southern hemisphere', () => {
    for (const month of [1, 4, 7, 10]) {
      expect(resolveSeason(month, 'S')).not.toBe(resolveSeason(month, 'N'));
    }
    expect(resolveSeason(12, 'N')).toBe('winter');
    expect(resolveSeason(12, 'S')).toBe('summer');
  });
});

describe('Geography', () => {
  it('hemisphere is the only geographic input and always yields a valid season', () => {
    let season;
    expect(() => {
      season = computeRhythmContext(makeProfile({ location: { hemisphere: 'N' } }), '2026-06-21').season;
    }).not.toThrow();
    expect(['winter', 'spring', 'summer', 'autumn']).toContain(season);
  });
});

describe('Moon phase + illumination', () => {
  it('is new at the 2026-08-12 new moon', () => {
    const ctx = computeRhythmContext(makeProfile(), '2026-08-12');
    expect(ctx.moon.phase).toBe('new');
    expect(ctx.moon.illumination).toBeLessThan(0.03);
  });

  it('is full at the 2026-08-28 full moon', () => {
    const ctx = computeRhythmContext(makeProfile(), '2026-08-28');
    expect(ctx.moon.phase).toBe('full');
    expect(ctx.moon.illumination).toBeGreaterThan(0.99);
  });

  it('is a waxing gibbous roughly three-quarters lit on 2026-08-23', () => {
    const ctx = computeRhythmContext(makeProfile(), '2026-08-23');
    expect(ctx.moon.phase).toBe('waxing-gibbous');
    expect(ctx.moon.illumination).toBeGreaterThan(0.7);
    expect(ctx.moon.illumination).toBeLessThan(0.82);
  });

  it('illumination is always within [0, 1]', () => {
    for (const d of ['2026-06-21', '2026-07-09', '2026-01-01']) {
      const illum = computeRhythmContext(makeProfile(), d).moon.illumination;
      expect(illum).toBeGreaterThanOrEqual(0);
      expect(illum).toBeLessThanOrEqual(1);
    }
  });

  it('computeMoon returns a valid phase for any historical date', () => {
    const moon = computeMoon(Date.UTC(1900, 0, 1));
    expect(moon.illumination).toBeGreaterThanOrEqual(0);
    expect(moon.illumination).toBeLessThanOrEqual(1);
    expect(moon.phase).toBeDefined();
  });
});

describe('Cycle phase/day', () => {
  it('lastPeriodStart 2026-06-01, avg 28, date 2026-06-21 => day 21, luteal', () => {
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-06-01', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2026-06-21');
    expect(ctx.cycle).toBeDefined();
    expect(ctx.cycle!.day).toBe(21);
    expect(ctx.cycle!.phase).toBe('luteal');
  });

  it('walks a 28-day cycle through menstrual, follicular, ovulation and luteal', () => {
    const cycle = { lastPeriodStart: '2026-06-01', avgLengthDays: 28 };
    const phaseOnDay = (day: number) =>
      computeCycle(cycle, Date.UTC(2026, 5, day))!.phase;
    expect(phaseOnDay(1)).toBe('menstrual');
    expect(phaseOnDay(5)).toBe('menstrual');
    expect(phaseOnDay(6)).toBe('follicular');
    expect(phaseOnDay(13)).toBe('follicular');
    expect(phaseOnDay(14)).toBe('ovulation');
    expect(phaseOnDay(16)).toBe('ovulation');
    expect(phaseOnDay(17)).toBe('luteal');
  });
});

describe('Cycle day wraps past avg length', () => {
  it('lastPeriodStart 40 days before, avg 28 => day 13 of the second cycle', () => {
    // 2026-06-21 minus 40 days = 2026-05-12. Days 0..27 are cycle one, so day
    // 40 is the 13th day of cycle two.
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-05-12', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2026-06-21');
    expect(ctx.cycle).toEqual({ day: 13, phase: 'follicular' });
  });
});

// Shared with apple/AtelieraTests/RhythmTests.swift (testCycleDayGoldens), which
// takes its expected values from this table. `null` is no estimate: the start is
// in the future, or more than two average cycles ago.
const cycleDayGoldens: ReadonlyArray<
  readonly [start: string, avg: number, date: string, day: number | null, phase: string | null]
> = [
  // A typical 28-day cycle, across two cycles and into the stale window.
  ['2026-01-01', 28, '2026-01-01', 1, 'menstrual'],
  ['2026-01-01', 28, '2026-01-28', 28, 'luteal'],
  ['2026-01-01', 28, '2026-01-29', 1, 'menstrual'],
  ['2026-01-01', 28, '2026-02-10', 13, 'follicular'],
  ['2026-01-01', 28, '2026-02-25', 28, 'luteal'],
  ['2026-01-01', 28, '2026-02-26', 1, 'menstrual'],
  ['2026-01-01', 28, '2026-02-27', null, null],
  ['2026-01-01', 28, '2025-12-31', null, null],
  // Short.
  ['2026-03-01', 21, '2026-03-21', 21, 'luteal'],
  ['2026-03-01', 21, '2026-03-22', 1, 'menstrual'],
  ['2026-03-01', 21, '2026-04-02', 12, 'luteal'],
  ['2026-03-01', 21, '2026-04-12', 1, 'menstrual'],
  ['2026-03-01', 21, '2026-04-13', null, null],
  // Long.
  ['2026-05-01', 35, '2026-06-04', 35, 'luteal'],
  ['2026-05-01', 35, '2026-06-05', 1, 'menstrual'],
  ['2026-05-01', 35, '2026-06-20', 16, 'follicular'],
  ['2026-05-01', 35, '2026-07-10', 1, 'menstrual'],
  ['2026-05-01', 35, '2026-07-11', null, null],
  // Irregular: an uneven history averages to an odd length.
  ['2026-07-01', 31, '2026-07-31', 31, 'luteal'],
  ['2026-07-01', 31, '2026-08-01', 1, 'menstrual'],
  ['2026-07-01', 31, '2026-08-15', 15, 'follicular'],
  // A last period long ago, and one across a year boundary.
  ['2025-01-01', 28, '2026-06-21', null, null],
  ['2025-12-20', 28, '2026-01-20', 4, 'menstrual'],
];

describe('Cycle day across several cycles', () => {
  it.each(cycleDayGoldens)(
    'start %s, avg %i, on %s => day %s (%s)',
    (start, avg, date, day, phase) => {
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      const state = computeCycle(
        { lastPeriodStart: start, avgLengthDays: avg },
        Date.UTC(y, m - 1, d),
      );
      expect(state === undefined ? [null, null] : [state.day, state.phase]).toEqual([day, phase]);
    },
  );

  it('never shows the last day of a cycle twice', () => {
    const cycle = { lastPeriodStart: '2026-01-01', avgLengthDays: 28 };
    const days = Array.from({ length: 56 }, (_, offset) =>
      computeCycle(cycle, Date.UTC(2026, 0, 1 + offset))!.day,
    );
    expect(days).toEqual([...Array.from({ length: 28 }, (_, i) => i + 1), ...Array.from({ length: 28 }, (_, i) => i + 1)]);
  });
});

describe('No cycle data', () => {
  it('profile.cycle undefined => RhythmContext.cycle undefined, other fields still compute', () => {
    const ctx = computeRhythmContext(makeProfile({ cycle: undefined }), '2026-06-21');
    expect(ctx.cycle).toBeUndefined();
    expect(ctx.season).toBe('winter'); // S hemisphere default in makeProfile
    expect(ctx.microSeason.term.length).toBeGreaterThan(0);
    expect(ctx.moon.phase).toBeDefined();
    expect(ctx.placements).toEqual({ sun: 'Gemini', moon: 'Pisces' });
  });
});

describe('Placements pass-through', () => {
  it('returned placements deep-equals the profile placements', () => {
    const placements = { sun: 'Gemini', moon: 'Pisces' };
    const p = makeProfile({ natal: { placements } });
    const ctx = computeRhythmContext(p, '2026-06-21');
    expect(ctx.placements).toEqual(placements);
    expect(ctx.placements).toEqual(p.natal.placements);
  });

  it('engine reads placements, never invents extra keys', () => {
    const placements = { sun: 'Aries', mars: 'Scorpio', venus: 'Libra' };
    const p = makeProfile({ natal: { placements } });
    expect(Object.keys(computeRhythmContext(p, '2026-06-21').placements).sort()).toEqual([
      'mars',
      'sun',
      'venus',
    ]);
  });
});

describe('Future date with no note', () => {
  it('a far-future date still returns a full context', () => {
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-06-01', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2030-11-15');
    expect(ctx.date).toBe('2030-11-15');
    expect(['winter', 'spring', 'summer', 'autumn']).toContain(ctx.season);
    expect(ctx.microSeason.term.length).toBeGreaterThan(0);
    expect(ctx.moon.phase).toBeDefined();
    // Four years after the last period, there is no estimate to give.
    expect(ctx.cycle).toBeUndefined();
  });
});

describe('Leap-day / year boundary', () => {
  it('2024-02-29 computes season and micro-season without throwing', () => {
    const p = makeProfile({ location: { hemisphere: 'N' } });
    let ctx;
    expect(() => {
      ctx = computeRhythmContext(p, '2024-02-29');
    }).not.toThrow();
    expect(ctx!.season).toBe('winter'); // late February, N hemisphere
    expect(ctx!.microSeason.term.length).toBeGreaterThan(0);
    expect(ctx!.microSeason.gloss.length).toBeGreaterThan(0);
  });

  it('2025-12-31 computes season and micro-season without throwing', () => {
    const p = makeProfile({ location: { hemisphere: 'N' } });
    let ctx;
    expect(() => {
      ctx = computeRhythmContext(p, '2025-12-31');
    }).not.toThrow();
    expect(ctx!.season).toBe('winter'); // December, N hemisphere
    expect(ctx!.microSeason.term).toBe('The Long Night'); // on/after Dec 21
    expect(ctx!.microSeason.gloss.length).toBeGreaterThan(0);
  });
});

describe('Micro-season mapping', () => {
  it('2026-06-21 S returns the containing micro-season window with a non-empty gloss', () => {
    const ctx = computeRhythmContext(makeProfile({ location: { hemisphere: 'S' } }), '2026-06-21');
    expect(typeof ctx.microSeason.term).toBe('string');
    expect(ctx.microSeason.term.length).toBeGreaterThan(0);
    expect(ctx.microSeason.gloss.length).toBeGreaterThan(0);
  });

  it('N and S on the same date pick different terms (hemisphere offset applied)', () => {
    const north = makeProfile({ location: { hemisphere: 'N' } });
    const south = makeProfile({ location: { hemisphere: 'S' } });
    expect(computeRhythmContext(north, '2026-06-21').microSeason.term).not.toBe(
      computeRhythmContext(south, '2026-06-21').microSeason.term,
    );
  });

  it('dates before the first term of the year wrap back to the final micro-season', () => {
    expect(resolveMicroSeason(1, 1, 'N').term).toBe('The Long Night');
  });

  it('a June date in the south reads the December term six months away', () => {
    expect(resolveMicroSeason(6, 21, 'S').term).toBe('The Long Night');
    expect(resolveMicroSeason(6, 21, 'N').term).toBe('The Long Light');
  });
});

describe('Moon-phase seasons', () => {
  it('the lunar season and progress track the synodic month', () => {
    // 2026-09-11 is a new moon (golden instant in the Swift ephemeris tests); at 00:00
    // UTC the moon sits just shy of the exact new, so progress is near the 0/1 wrap.
    const ctx = computeRhythmContext(makeProfile({ location: { hemisphere: 'N' } }), '2026-09-11');
    expect(ctx.lunarSeason).toBe('new');
    expect(ctx.lunarProgress > 0.94 || ctx.lunarProgress < 0.06).toBe(true);
  });

  it('a full moon reads as the full season near mid-cycle', () => {
    const full = computeLunarSeason(Date.UTC(2026, 7, 28)); // 2026-08-28 full moon
    expect(full.season).toBe('full');
    expect(full.progress).toBeGreaterThan(0.4);
    expect(full.progress).toBeLessThan(0.6);
  });

  it('names every quarter of the cycle across a full month', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) {
      seen.add(computeLunarSeason(Date.UTC(2026, 8, 11) + d * 86400000).season);
    }
    expect(seen).toEqual(new Set(['new', 'waxing', 'full', 'waning']));
  });
});

describe('Cycle day on an exact multiple of the average', () => {
  it('starts a new cycle at day 1 when daysSince is a multiple of avgLengthDays', () => {
    // lastPeriodStart exactly 28 days before date: day 28 was yesterday.
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-05-24', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2026-06-21');
    expect(ctx.cycle).toEqual({ day: 1, phase: 'menstrual' });
  });
});
