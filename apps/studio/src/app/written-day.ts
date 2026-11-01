import { writtenDay } from '@studio/domain';

/**
 * Formats the day a note timestamp was written on, in the writer's own zone,
 * whatever zone the reader is in. Text that is not a timestamp comes back as is.
 */
export function formatWrittenDay(
  timestamp: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const day = writtenDay(timestamp);
  if (day === undefined) return timestamp;
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, date)),
  );
}
