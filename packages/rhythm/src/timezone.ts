/**
 * Local-wall-clock ↔ UTC conversion, on-device.
 *
 * Uses only the JS built-in `Intl` — a language feature, not a host capability —
 * so it works offline and in any runtime. `Intl` ships the full IANA database
 * with historical daylight-saving rules, so conversions are accurate across DST
 * and across the date line. Nothing leaves the device.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_RE = /^\d{2}:\d{2}$/u;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The offset (local − UTC) of `zone` at a given UTC `instant`, in milliseconds.
 * Derived by formatting the instant in the zone and reading the wall clock back.
 * Returns null when the zone is not a valid IANA name.
 */
function zoneOffsetMs(instant: Date, zone: string): number | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    parts = dtf.formatToParts(instant);
  } catch {
    return null; // RangeError on an unknown time zone
  }
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some ICU builds report midnight as 24
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  // Zone offsets are always a whole number of minutes; round to the nearest
  // minute so a sub-second `instant` can't yield e.g. UTC+9:59 instead of +10.
  return Math.round((asUTC - instant.getTime()) / 60_000) * 60_000;
}

/**
 * Convert a local wall-clock date+time in `zone` to UTC.
 * Returns `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` in UTC, or null on invalid input.
 *
 * The UTC instant `t` satisfies `localWallClock = t + offset(t)`, so we start by
 * pretending the wall clock is UTC and correct by the zone's offset twice — two
 * passes converge even across a DST boundary.
 */
export function localToUTC(
  dateISO: string,
  localHHMM: string,
  zone: string,
): { date: string; time: string } | null {
  if (!DATE_RE.test(dateISO) || !TIME_RE.test(localHHMM)) return null;

  const year = Number(dateISO.slice(0, 4));
  const month = Number(dateISO.slice(5, 7));
  const day = Number(dateISO.slice(8, 10));
  const hours = Number(localHHMM.slice(0, 2));
  const minutes = Number(localHHMM.slice(3, 5));
  if (hours > 23 || minutes > 59) return null;

  const naiveUTC = Date.UTC(year, month - 1, day, hours, minutes);
  if (zoneOffsetMs(new Date(naiveUTC), zone) === null) return null; // invalid zone

  let t = naiveUTC;
  for (let i = 0; i < 2; i++) {
    const off = zoneOffsetMs(new Date(t), zone);
    if (off === null) return null;
    t = naiveUTC - off;
  }

  const utc = new Date(t);
  return {
    date: `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`,
    time: `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}`,
  };
}

function offsetLabel(zone: string, now: Date): string {
  const ms = zoneOffsetMs(now, zone);
  if (ms === null) return 'UTC';
  const sign = ms >= 0 ? '+' : '-';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const min = Math.floor((abs % 3_600_000) / 60_000);
  return min ? `UTC${sign}${h}:${pad(min)}` : `UTC${sign}${h}`;
}

/**
 * Every IANA zone the runtime knows, each labelled with its UTC offset at `now`,
 * for a birth-timezone picker — e.g. `{ id: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12)' }`.
 * `now` defaults to the current instant; pass a fixed date for deterministic output.
 */
export function zoneOptions(now: Date = new Date()): { id: string; label: string }[] {
  const supported = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const zones = supported.supportedValuesOf ? supported.supportedValuesOf('timeZone') : [];
  return zones.map((id) => ({ id, label: `${id} (${offsetLabel(id, now)})` }));
}
