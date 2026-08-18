import { describe, it, expect } from 'vitest';
import { localToUTC, zoneOptions } from './timezone';

describe('localToUTC', () => {
  it('UTC+12 birth steps the calendar day back (Pacific/Auckland, June = NZST)', () => {
    // 09:00 local on the 24th in NZST (+12) is 21:00 UTC on the 23rd.
    expect(localToUTC('2026-06-24', '09:00', 'Pacific/Auckland')).toEqual({
      date: '2026-06-23',
      time: '21:00',
    });
  });

  it('negative-offset zone (New York winter, EST = UTC-5)', () => {
    expect(localToUTC('2026-01-15', '06:00', 'America/New_York')).toEqual({
      date: '2026-01-15',
      time: '11:00',
    });
  });

  it('honours daylight saving — same zone, summer vs winter convert differently', () => {
    // EDT (UTC-4) in July, EST (UTC-5) in January.
    expect(localToUTC('2026-07-15', '12:00', 'America/New_York')).toEqual({
      date: '2026-07-15',
      time: '16:00',
    });
    expect(localToUTC('2026-01-15', '12:00', 'America/New_York')).toEqual({
      date: '2026-01-15',
      time: '17:00',
    });
  });

  it('returns null for an invalid zone', () => {
    expect(localToUTC('2026-06-24', '09:00', 'Not/AZone')).toBeNull();
  });

  it('returns null for a malformed date or time', () => {
    expect(localToUTC('nope', '09:00', 'Pacific/Auckland')).toBeNull();
    expect(localToUTC('2026-06-24', '9am', 'Pacific/Auckland')).toBeNull();
  });

  it('returns null for an out-of-range hour or minute', () => {
    expect(localToUTC('2026-06-24', '25:00', 'Pacific/Auckland')).toBeNull();
    expect(localToUTC('2026-06-24', '09:75', 'Pacific/Auckland')).toBeNull();
  });

  it('is a no-op for UTC itself', () => {
    expect(localToUTC('2026-06-24', '09:00', 'UTC')).toEqual({
      date: '2026-06-24',
      time: '09:00',
    });
  });
});

describe('zoneOptions', () => {
  it('labels each zone with its UTC offset at the given instant', () => {
    const opts = zoneOptions(new Date('2026-06-24T00:00:00Z'));
    const auckland = opts.find((o) => o.id === 'Pacific/Auckland');
    expect(auckland).toBeDefined();
    expect(auckland!.label).toBe('Pacific/Auckland (UTC+12)');
    expect(opts.length).toBeGreaterThan(100);
  });

  it('rounds whole-hour offsets to whole minutes despite a sub-second instant', () => {
    // A non-zero millisecond `now` must not produce a "UTC+9:59" rounding artifact.
    const opts = zoneOptions(new Date('2026-06-24T00:00:00.500Z'));
    const melbourne = opts.find((o) => o.id === 'Australia/Melbourne');
    expect(melbourne!.label).toBe('Australia/Melbourne (UTC+10)');
  });

  it('renders half-hour offsets with minutes', () => {
    const opts = zoneOptions(new Date('2026-06-24T00:00:00Z'));
    const adelaide = opts.find((o) => o.id === 'Australia/Adelaide');
    expect(adelaide!.label).toBe('Australia/Adelaide (UTC+9:30)');
  });
});
