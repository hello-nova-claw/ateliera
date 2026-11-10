import { describe, expect, it } from 'vitest';

import { formatWrittenDay } from './written-day';

const long = { day: 'numeric', month: 'long', year: 'numeric' } as const;

describe('formatWrittenDay', () => {
  it('shows the day in the writer’s zone, not the reader’s', () => {
    // 08:00 in Melbourne is still 1 November in UTC and in Los Angeles.
    expect(formatWrittenDay('2026-11-02T08:00:00.000+11:00', 'en-AU', long)).toBe(
      '2 November 2026',
    );
    expect(formatWrittenDay('2026-11-01T22:30:00.000-08:00', 'en-AU', long)).toBe(
      '1 November 2026',
    );
  });

  it('shows a UTC timestamp on its UTC day', () => {
    expect(formatWrittenDay('2026-07-14T23:30:00.000Z', 'en-AU', long)).toBe('14 July 2026');
  });

  it('returns text that is not a timestamp unchanged', () => {
    expect(formatWrittenDay('someday', 'en-AU', long)).toBe('someday');
  });
});
