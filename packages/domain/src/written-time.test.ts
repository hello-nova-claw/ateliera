import { describe, expect, it } from 'vitest';

import { localTimestamp, writerTimestamp, writtenDay } from './written-time';

// 08:00 on 2 November 2026 in Melbourne (daylight time, UTC+11) is still
// 1 November in UTC and in Los Angeles.
const melbourneMorning = new Date('2026-11-01T21:00:00.000Z');

describe('localTimestamp', () => {
  it('keeps the writer’s wall clock and offset', () => {
    expect(localTimestamp(melbourneMorning, 'Australia/Melbourne')).toBe(
      '2026-11-02T08:00:00.000+11:00',
    );
  });

  it('names the same instant as the UTC form', () => {
    const stamp = localTimestamp(melbourneMorning, 'Australia/Melbourne');
    expect(Date.parse(stamp)).toBe(melbourneMorning.valueOf());
  });

  it('follows daylight saving and zones west of UTC', () => {
    expect(localTimestamp(new Date('2026-07-01T22:00:00.000Z'), 'Australia/Melbourne')).toBe(
      '2026-07-02T08:00:00.000+10:00',
    );
    expect(localTimestamp(new Date('2026-11-01T15:30:05.250Z'), 'America/Los_Angeles')).toBe(
      '2026-11-01T07:30:05.250-08:00',
    );
    expect(localTimestamp(new Date('2026-10-31T15:30:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-10-31T08:30:00.000-07:00',
    );
  });

  it('writes UTC as +00:00 and handles half-hour and date-line zones', () => {
    expect(localTimestamp(melbourneMorning, 'UTC')).toBe('2026-11-01T21:00:00.000+00:00');
    expect(localTimestamp(melbourneMorning, 'Asia/Kolkata')).toBe(
      '2026-11-02T02:30:00.000+05:30',
    );
    expect(localTimestamp(melbourneMorning, 'Pacific/Kiritimati')).toBe(
      '2026-11-02T11:00:00.000+14:00',
    );
    expect(localTimestamp(melbourneMorning, 'Pacific/Pago_Pago')).toBe(
      '2026-11-01T10:00:00.000-11:00',
    );
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(localTimestamp(melbourneMorning, 'Not/AZone')).toBe('2026-11-01T21:00:00.000+00:00');
  });
});

describe('writtenDay', () => {
  it('is the date in the writer’s own zone, wherever it is read', () => {
    expect(writtenDay('2026-11-02T08:00:00.000+11:00')).toBe('2026-11-02');
    expect(writtenDay('2026-11-01T07:30:05.250-08:00')).toBe('2026-11-01');
  });

  it('reads a UTC timestamp as its UTC date', () => {
    expect(writtenDay('2026-11-01T21:00:00.000Z')).toBe('2026-11-01');
  });

  it('has no day for text that is not a timestamp', () => {
    expect(writtenDay('yesterday')).toBeUndefined();
    expect(writtenDay('2026-02-30T08:00:00+11:00')).toBeUndefined();
  });
});

describe('writerTimestamp', () => {
  it('uses the writer’s zone when there is one, and UTC when there isn’t', () => {
    expect(writerTimestamp(melbourneMorning, 'Australia/Melbourne')).toBe(
      '2026-11-02T08:00:00.000+11:00',
    );
    expect(writerTimestamp(melbourneMorning, undefined)).toBe('2026-11-01T21:00:00.000Z');
  });
});
