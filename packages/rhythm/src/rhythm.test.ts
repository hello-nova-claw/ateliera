import { describe, it, expect } from 'vitest';
import { computeCycle, computeMoon, computeRhythmContext, resolveMicroSeason, resolveSeason } from './rhythm';
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
  it('known new moon 2026-06-25 is new with illumination < 0.02', () => {
    const ctx = computeRhythmContext(makeProfile(), '2026-06-25');
    expect(ctx.moon.phase).toBe('new');
    expect(ctx.moon.illumination).toBeLessThan(0.02);
  });

  it('illumination is always within [0, 1]', () => {
    for (const d of ['2026-06-21', '2026-07-09', '2026-01-01']) {
      const illum = computeRhythmContext(makeProfile(), d).moon.illumination;
      expect(illum).toBeGreaterThanOrEqual(0);
      expect(illum).toBeLessThanOrEqual(1);
    }
  });

  it('computeMoon reaches full roughly half a synodic month after the reference new moon', () => {
    const halfCycleMs = Date.UTC(2026, 5, 25) + 14.77 * 86400000;
    const moon = computeMoon(halfCycleMs);
    expect(moon.phase).toBe('full');
    expect(moon.illumination).toBeGreaterThan(0.99);
  });

  it('computeMoon returns a phase for dates far before the reference epoch', () => {
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
  it('lastPeriodStart 40 days before, avg 28 => day 12 (40 mod 28), phase recomputed', () => {
    // 2026-06-21 minus 40 days = 2026-05-12
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-05-12', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2026-06-21');
    expect(ctx.cycle!.day).toBe(12);
    expect(['menstrual', 'follicular', 'ovulation', 'luteal']).toContain(ctx.cycle!.phase);
    expect(ctx.cycle!.phase).toBe('follicular'); // day 12 of a 28-day cycle
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
    expect(ctx.cycle!.day).toBeGreaterThanOrEqual(1);
    expect(ctx.cycle!.day).toBeLessThanOrEqual(28);
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
    expect(ctx!.microSeason.term).toBe('Winter Solstice'); // on/after Dec 21
    expect(ctx!.microSeason.gloss.length).toBeGreaterThan(0);
  });
});

describe('Micro-season mapping', () => {
  it('2026-06-21 S returns the containing solar-term window with a non-empty gloss', () => {
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

  it('dates before the first term of the year wrap back to Winter Solstice', () => {
    expect(resolveMicroSeason(1, 1, 'N').term).toBe('Winter Solstice');
  });

  it('a June date in the south reads the December term six months away', () => {
    expect(resolveMicroSeason(6, 21, 'S').term).toBe('Winter Solstice');
    expect(resolveMicroSeason(6, 21, 'N').term).toBe('Summer Solstice');
  });
});

describe('Cycle day exact-multiple bugfix (P2 carry-forward)', () => {
  it('cycle.day is avg (not 0) when daysSince is an exact multiple of avgLengthDays', () => {
    // lastPeriodStart exactly 28 days before date → daysSince = 28, avg = 28
    // Bug: 28 % 28 = 0, should return 28 (last day of cycle, not 0)
    const p = makeProfile({ cycle: { lastPeriodStart: '2026-05-24', avgLengthDays: 28 } });
    const ctx = computeRhythmContext(p, '2026-06-21'); // exactly 28 days later
    expect(ctx.cycle!.day).toBe(28); // must be avg, not 0
    expect(ctx.cycle!.phase).toBe('luteal'); // day 28 of a 28-day cycle is luteal
  });
});
