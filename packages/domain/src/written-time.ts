/**
 * Note timestamps keep the writer's wall clock and offset, so an entry stays on
 * the day it was written wherever and whenever it is read.
 *
 * Uses only the language's built-in `Intl`, which carries the IANA time zone
 * database. Nothing leaves the device.
 */

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, '0');
}

/** The offset (local − UTC) of `timeZone` at `instant`, in whole minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
  } catch {
    return 0; // An unknown zone name: write UTC rather than fail the save.
  }
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClock = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour') % 24,
    field('minute'),
    field('second'),
  );
  const wholeSecond = Math.floor(instant.valueOf() / 1000) * 1000;
  return Math.round((wallClock - wholeSecond) / 60_000);
}

/**
 * `instant` as ISO 8601 in `timeZone`'s wall clock with its offset, for example
 * `2026-11-02T08:00:00.000+11:00`. It names the same instant as
 * `toISOString()`; only the written day and hour differ.
 */
export function localTimestamp(instant: Date, timeZone: string): string {
  const offset = offsetMinutes(instant, timeZone);
  const wall = new Date(instant.valueOf() + offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
    `.${pad(wall.getUTCMilliseconds(), 3)}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

/**
 * A note timestamp for `instant`: in the writer's zone with its offset when
 * one is known, and in UTC (`toISOString()`) when it isn't.
 */
export function writerTimestamp(instant: Date, timeZone: string | undefined): string {
  return timeZone === undefined ? instant.toISOString() : localTimestamp(instant, timeZone);
}

/**
 * The calendar day a timestamp was written on, in the writer's own zone:
 * `YYYY-MM-DD`. A timestamp ending in `Z` gives its UTC day. Undefined when the
 * text is not a valid timestamp.
 */
export function writtenDay(timestamp: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}/u.exec(timestamp);
  if (match === null || !Number.isFinite(Date.parse(timestamp))) return undefined;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const civil = new Date(Date.UTC(year, month - 1, day));
  return civil.getUTCMonth() === month - 1 && civil.getUTCDate() === day
    ? match[0].slice(0, 10)
    : undefined;
}
