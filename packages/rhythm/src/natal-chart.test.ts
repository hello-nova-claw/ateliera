import { describe, it, expect } from 'vitest';
import { computeNatalChart, computeNatalChartLocal } from './natal-chart';

describe('computeNatalChart', () => {
  it('returns the sun sign from date alone (no time, no location)', async () => {
    const chart = await computeNatalChart('2000-01-01', null, null, null);
    expect(chart.sun).toBe('Capricorn');
    expect(chart.moon).toBe('');
    expect(chart.rising).toBeNull();
  });

  it('places the moon once date AND time are known (still no rising without location)', async () => {
    const chart = await computeNatalChart('2000-01-01', '12:00', null, null);
    expect(chart.sun).toBe('Capricorn');
    expect(chart.moon).toBe('Scorpio');
    expect(chart.rising).toBeNull();
  });

  it('computes a rising sign only with date + time + location', async () => {
    const chart = await computeNatalChart('2000-01-01', '12:00', 51.48, 0.0);
    expect(chart.sun).toBe('Capricorn');
    expect(chart.moon).toBe('Scorpio');
    expect(chart.rising).not.toBeNull();
    expect(typeof chart.rising).toBe('string');
    expect(chart.placements.sun).toBe('Capricorn');
    expect(chart.placements.moon).toBe('Scorpio');
    expect(chart.placements.rising).toBe(chart.rising);
  });

  it('respects the sign boundary at the start of a sign', async () => {
    const chart = await computeNatalChart('2026-03-21', '00:00', null, null);
    expect(chart.sun).toBe('Aries');
  });

  it('empty / missing date returns an empty chart and never throws or fabricates', async () => {
    const chart = await computeNatalChart('', null, null, null);
    expect(chart).toEqual({ sun: '', moon: '', rising: null, placements: {} });
  });

  it('an unparseable date degrades to the empty chart (no throw)', async () => {
    const chart = await computeNatalChart('not-a-date', '12:00', 51.48, 0);
    expect(chart).toEqual({ sun: '', moon: '', rising: null, placements: {} });
  });

  it('walks the sun through all twelve signs across a year', async () => {
    const signs = new Set<string>();
    for (let month = 1; month <= 12; month++) {
      const chart = await computeNatalChart(`2000-${String(month).padStart(2, '0')}-10`, null, null, null);
      expect(chart.sun).not.toBe('');
      signs.add(chart.sun);
    }
    expect(signs.size).toBe(12);
  });

  it('a malformed time is ignored rather than fabricating a moon', async () => {
    const chart = await computeNatalChart('2000-01-01', '12pm', null, null);
    expect(chart.sun).toBe('Capricorn');
    expect(chart.moon).toBe('');
    expect(chart.rising).toBeNull();
  });
});

describe('computeNatalChartLocal', () => {
  it('converts a local birth time in its zone to UTC before computing (date rolls back)', async () => {
    // 09:00 on the 24th in Auckland (UTC+12) is 21:00 UTC on the 23rd.
    const local = await computeNatalChartLocal('2026-06-24', '09:00', 'Pacific/Auckland', -36.85, 174.76);
    const utc = await computeNatalChart('2026-06-23', '21:00', -36.85, 174.76);
    expect(local).toEqual(utc);
  });

  it('degrades to sun-only when the zone is missing — never guesses moon/rising', async () => {
    const chart = await computeNatalChartLocal('1990-08-04', '14:30', '', -38.16, 145.93);
    expect(chart.sun).not.toBe('');
    expect(chart.moon).toBe('');
    expect(chart.rising).toBeNull();
  });

  it('degrades to sun-only when the zone is not a real IANA name', async () => {
    const chart = await computeNatalChartLocal('1990-08-04', '14:30', 'Not/AZone', -38.16, 145.93);
    expect(chart.sun).not.toBe('');
    expect(chart.moon).toBe('');
    expect(chart.rising).toBeNull();
  });
});
