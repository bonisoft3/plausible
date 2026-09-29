// clock — the site's calendar, as integer arithmetic over the three Zone rows.
//
// Shared by the generator and by verify.ts, and by nothing that ships: the app
// re-implements this in Jessie and oracle.sql re-implements it in SQL, which is
// the point (ORACLE.md §3.4). Both of those are graded against a real tz
// database, and so is this file — verify.ts probes every function here against
// Intl and against DuckDB's ICU.
//
// Every local instant this module is asked for must exist. A local time inside
// a spring-forward gap raises; it never slides to the neighbouring hour, because
// a fixture that quietly moves a planted hit is a fixture that has stopped
// planting it.

export type Zone = {
  id: string;
  starts_epoch: number;
  offset_seconds: number;
  abbr: string;
};

/** The seeded clock. Ascending by `starts_epoch`; see ORACLE.md §1.5. */
export const ZONES: readonly Zone[] = [
  { id: "z-cet-2025", starts_epoch: 1761440400, offset_seconds: 3600, abbr: "CET" },
  { id: "z-cest-2026", starts_epoch: 1774746000, offset_seconds: 7200, abbr: "CEST" },
  { id: "z-cet-2026", starts_epoch: 1792890000, offset_seconds: 3600, abbr: "CET" },
];

/**
 * The files spell an instant the way the app's `timestamp` columns hold it —
 * RFC 3339 in UTC with six fractional digits — and the arithmetic here is whole
 * UTC seconds. These two cross that line. A log instant is a whole second, so a
 * fraction is refused, never dropped.
 */
export function instantOf(epoch: number): string {
  if (!Number.isInteger(epoch)) throw new Error(`${epoch} is not a whole second`);
  const days = Math.floor(epoch / 86400);
  const [y, m, d] = civilFromDays(days);
  const s = epoch - days * 86400;
  return `${isoDate(y, m, d)}T${p2(Math.floor(s / 3600))}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}.000000Z`;
}

export function epochOf(instant: unknown): number {
  // The second the instant falls in, as the handlers and oracle.sql take it:
  // three readers of one column, one rule for the fraction.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{6}Z$/.exec(String(instant));
  if (m === null) throw new Error(`${JSON.stringify(instant)} is not a timestamp`);
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s;
}

/** The offsets the table can produce, widest first. */
const OFFSETS = [...new Set(ZONES.map((z) => z.offset_seconds))].sort((a, b) => b - a);

/**
 * The greatest `starts_epoch <= epoch`. An epoch before the first row raises:
 * a lookup that takes the last row, or the widest offset, passes with two rows
 * and fails H8, so the bound is the thing being exercised.
 */
export function offsetAt(epoch: number): number {
  let found: number | null = null;
  for (const z of ZONES) if (z.starts_epoch <= epoch) found = z.offset_seconds;
  if (found === null) throw new Error(`no Zone row covers epoch ${epoch}`);
  return found;
}

/** Days from 1970-01-01 for a proleptic Gregorian date. Hinnant's algorithm. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse. */
export function civilFromDays(z0: number): [number, number, number] {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}

const p2 = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;

export type Local = {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  second: number;
  /** Days from 1970-01-01 of the local civil date. */
  days: number;
};

export function localParts(epoch: number): Local {
  const ls = epoch + offsetAt(epoch);
  const days = Math.floor(ls / 86400);
  const sod = ls - days * 86400;
  const [y, m, d] = civilFromDays(days);
  return {
    y,
    m,
    d,
    hour: Math.floor(sod / 3600),
    minute: Math.floor((sod % 3600) / 60),
    second: sod % 60,
    days,
  };
}

export const dayKey = (epoch: number): string => {
  const p = localParts(epoch);
  return isoDate(p.y, p.m, p.d);
};

export const hourKey = (epoch: number): string => {
  const p = localParts(epoch);
  return `${isoDate(p.y, p.m, p.d)} ${p2(p.hour)}`;
};

/** 0 = Sunday. 1970-01-01 was a Thursday, so day 0 is 4. */
export const weekdayOf = (epoch: number): number => (((localParts(epoch).days + 4) % 7) + 7) % 7;

/** The date of the local Monday the epoch's local day belongs to. */
export const mondayKey = (epoch: number): string => {
  const p = localParts(epoch);
  const back = (weekdayOf(epoch) + 6) % 7;
  const [y, m, d] = civilFromDays(p.days - back);
  return isoDate(y, m, d);
};

/** `week_starts_sunday`, the wrong reading, computed rather than described. */
export const sundayKey = (epoch: number): string => {
  const p = localParts(epoch);
  const [y, m, d] = civilFromDays(p.days - weekdayOf(epoch));
  return isoDate(y, m, d);
};

/** UTC day, for `utc_day_buckets`. */
export const utcDayKey = (epoch: number): string => {
  const [y, m, d] = civilFromDays(Math.floor(epoch / 86400));
  return isoDate(y, m, d);
};

export const utcHourKey = (epoch: number): string => {
  const days = Math.floor(epoch / 86400);
  const [y, m, d] = civilFromDays(days);
  return `${isoDate(y, m, d)} ${p2(Math.floor((epoch - days * 86400) / 3600))}`;
};

/**
 * The UTC epoch of a local wall-clock instant. Raises on an instant the site's
 * clock skips, which is what makes `localEpoch(2026, 3, 29, 2, 0)` a proof
 * rather than a coincidence.
 */
export function localEpoch(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number {
  const wall = daysFromCivil(y, m, d) * 86400 + hh * 3600 + mm * 60 + ss;
  for (const off of OFFSETS) {
    const e = wall - off;
    if (offsetAt(e) === off) return e;
  }
  throw new Error(`local ${isoDate(y, m, d)} ${p2(hh)}:${p2(mm)}:${p2(ss)} does not exist`);
}

export const localMidnight = (y: number, m: number, d: number): number => localEpoch(y, m, d);

/** `midnight(t)`: the greatest epoch `<= t` that is 00:00:00 local. */
export function midnightOf(epoch: number): number {
  const p = localParts(epoch);
  return localMidnight(p.y, p.m, p.d);
}

/**
 * `back(m, k)`: k days back on the local *civil calendar*, then that date's
 * local midnight. Not `m - k * 86400`: across the clock change the two differ
 * by an hour, and that hour holds a planted hit (H8).
 */
export function backDays(epoch: number, k: number): number {
  const p = localParts(epoch);
  const [y, m, d] = civilFromDays(p.days - k);
  return localMidnight(y, m, d);
}

/** The local midnight after this one, by civil-date arithmetic. */
export function nextMidnight(epoch: number): number {
  const p = localParts(midnightOf(epoch));
  const [y, m, d] = civilFromDays(p.days + 1);
  return localMidnight(y, m, d);
}

/** The next local hour boundary. Steps 01:00 CET straight to 03:00 CEST. */
export function nextHour(epoch: number): number {
  const ls = epoch + offsetAt(epoch);
  const into = ((ls % 3600) + 3600) % 3600;
  return epoch + (3600 - into);
}

export type Grain = "hour" | "day" | "week";

/**
 * The bucket keys a window covers, walked forward from `from`. Window
 * arithmetic, never a group-by: an hour, day or week the log has no hit in is
 * still a bucket, and the 23-hour day yields 23 hour keys rather than 24 with a
 * hole.
 */
export function gridOf(from: number, to: number, grain: Grain): string[] {
  const out: string[] = [];
  if (grain === "hour") {
    for (let e = from; e < to; e = nextHour(e)) out.push(hourKey(e));
    return out;
  }
  if (grain === "day") {
    for (let e = midnightOf(from); e < to; e = nextMidnight(e)) out.push(dayKey(e));
    return out;
  }
  return weekGrid(from, to, mondayKey);
}

/**
 * The week buckets a window covers under a given week keyer. A week clipped by
 * either edge is one bucket like any other, so the count is what separates
 * `mondayKey` from `sundayKey` (H8) rather than only the labels.
 */
export function weekGrid(from: number, to: number, keyer: (e: number) => string): string[] {
  const out: string[] = [keyer(from)];
  for (let e = nextMidnight(from); e < to; e = nextMidnight(e)) {
    const k = keyer(e);
    if (k !== out[out.length - 1]) out.push(k);
  }
  return out;
}
