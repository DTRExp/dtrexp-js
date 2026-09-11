import type { IFields } from '../types/index.js';

const MS_PER_DAY = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function daysInQuarter(year: number, quarter: number): number {
  const first = (quarter - 1) * 3 + 1;
  return daysInMonth(year, first) + daysInMonth(year, first + 1) + daysInMonth(year, first + 2);
}

/** Days since 1970-01-01 for a civil date (Howard Hinnant's days_from_civil, pure integers). */
export function epochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Civil date from days since 1970-01-01 (Hinnant's civil_from_days — inverse of epochDay). */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** ISO weekday of a civil date: 1 (Mon) – 7 (Sun). 1970-01-01 was a Thursday. */
export function weekdayOf(year: number, month: number, day: number): number {
  return ((((epochDay(year, month, day) + 3) % 7) + 7) % 7) + 1;
}

export function dayOfYear(year: number, month: number, day: number): number {
  return epochDay(year, month, day) - epochDay(year, 1, 1) + 1;
}

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

export function dayOfQuarter(year: number, month: number, day: number): number {
  return epochDay(year, month, day) - epochDay(year, (quarterOf(month) - 1) * 3 + 1, 1) + 1;
}

/** 53 iff the ISO week-year starts on Thursday, or on Wednesday in a leap year. */
export function weeksInIsoYear(weekYear: number): number {
  const jan1 = weekdayOf(weekYear, 1, 1);
  return jan1 === 4 || (isLeapYear(weekYear) && jan1 === 3) ? 53 : 52;
}

export function isoWeekOf(
  year: number,
  month: number,
  day: number
): { week: number; weekYear: number } {
  const week = Math.floor((dayOfYear(year, month, day) - weekdayOf(year, month, day) + 10) / 7);
  if (week < 1) return { week: weeksInIsoYear(year - 1), weekYear: year - 1 };
  if (week > weeksInIsoYear(year)) return { week: 1, weekYear: year + 1 };
  return { week, weekYear: year };
}

/** Adds calendar months with `constrain` overflow: Jan 31 + 1M → Feb 28/29 (spec §9.2). */
export function addMonthsConstrain(
  year: number,
  month: number,
  day: number,
  months: number
): { year: number; month: number; day: number } {
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return { year: y, month: m, day: Math.min(day, daysInMonth(y, m)) };
}

/** Whole calendar months from a→b, where a partial month counts 0 (constrain-aware). */
export function monthsBetween(
  a: { year: number; month: number; day: number; msOfDay: number },
  b: { year: number; month: number; day: number; msOfDay: number }
): number {
  let n = (b.year - a.year) * 12 + (b.month - a.month);
  const landing = addMonthsConstrain(a.year, a.month, a.day, n);
  const landingPseudo = epochDay(landing.year, landing.month, landing.day) * MS_PER_DAY + a.msOfDay;
  const bPseudo = epochDay(b.year, b.month, b.day) * MS_PER_DAY + b.msOfDay;
  if (bPseudo < landingPseudo) n -= 1;
  return n;
}

const utcFields = (epochMs: number): IFields => {
  const d = new Date(epochMs);
  return buildFields(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  );
};

function buildFields(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number
): IFields {
  const iso = isoWeekOf(year, month, day);
  const msOfDay = hour * 3_600_000 + minute * 60_000 + second * 1000 + ms;
  return {
    year,
    quarter: quarterOf(month),
    month,
    day,
    dayOfQuarter: dayOfQuarter(year, month, day),
    dayOfYear: dayOfYear(year, month, day),
    weekday: weekdayOf(year, month, day),
    isoWeek: iso.week,
    isoWeekYear: iso.weekYear,
    hour,
    minute,
    second,
    msOfDay,
    pseudo: epochDay(year, month, day) * MS_PER_DAY + msOfDay
  };
}

/** Day-level calendar fields of a civil date (midnight) — pure math, no time zone involved. */
export function fieldsFromCivil(year: number, month: number, day: number): IFields {
  return buildFields(year, month, day, 0, 0, 0, 0);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  // Stryker disable next-line ConditionalExpression: cache is a pure optimization — recreating always yields the same formatter
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

/** Calendar fields of an absolute instant in the given IANA zone — one extraction per covers(). */
export function fieldsFromInstant(epochMs: number, tz: string): IFields {
  // Stryker disable next-line all: 'UTC' fast path is a pure optimization — the Intl path yields identical fields
  if (tz === 'UTC') return utcFields(epochMs);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of formatterFor(tz).formatToParts(epochMs)) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
      // Stryker disable next-line ConditionalExpression: equivalent — this is the last clause and its body is
      // a bare break, so removing or short-circuiting it leaves the loop iteration unchanged.
      default:
        break;
    }
  }
  const ms = ((epochMs % 1000) + 1000) % 1000;
  return buildFields(year, month, day, hour, minute, second, ms);
}

/**
 *  Absolute instant of a local wall-clock time in the given zone, implementing
 *  Temporal's `compatible` disambiguation, which §9.3 invokes:
 *
 *  - exactly one instant carries the fields → that instant;
 *  - **repeated** local time (fall-back overlap) → the **earlier** occurrence;
 *  - **nonexistent** local time (spring-forward gap) → resolve **forward**, past the gap.
 *
 *  The two candidates come from the offsets in effect a day either side of the target
 *  local time. Probing the target itself is wrong: it is a local pseudo-epoch, not an
 *  instant, so which candidate it lands on flips with the sign of the zone's offset.
 */
export function epochFromLocal(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number {
  const target =
    epochDay(year, month, day) * MS_PER_DAY + hour * 3_600_000 + minute * 60_000 + second * 1000;
  // Stryker disable next-line all: 'UTC' fast path is a pure optimization — the candidate search yields the same result
  if (tz === 'UTC') return target;
  const offsetAt = (t: number): number => fieldsFromInstant(t, tz).pseudo - t;
  // A zone offset never exceeds ±24h, so these bracket every offset in effect at `target`.
  const before = target - offsetAt(target - MS_PER_DAY);
  const after = target - offsetAt(target + MS_PER_DAY);
  const earlier = Math.min(before, after);
  const later = Math.max(before, after);
  if (offsetAt(earlier) + earlier === target) return earlier;
  // Either `later` is the sole instant carrying these fields, or none does (a gap) and
  // constraining forward lands on `later` too — so both cases return the same value.
  return later;
}

/** Zone offset at an instant: local pseudo-epoch minus the instant (ms; east of UTC is positive). */
function rawOffset(tz: string, t: number): number {
  return fieldsFromInstant(t, tz).pseudo - t;
}

const GRID = 7 * MS_PER_DAY;
/** Cells kept per zone before the index is cleared; 65,536 cells is ~1,250 years. */
export const ZONE_CELL_CAP = 65_536;

interface ICell {
  /** Offset at the cell's start. */
  off: number;
  /** Offset at the next cell's start. */
  next: number;
  /** The transition instant inside the cell; `NaN` when `off === next`. */
  at: number;
}

/**
 *  Offsets and transitions of one IANA zone, discovered lazily on a 7-day grid:
 *  one `Intl` probe per grid point, one bisection per cell that contains a
 *  transition. A day scan then costs no zone lookups at all once its week is
 *  indexed. Assumes at most one transition per 7-day cell, which holds for
 *  every IANA zone.
 */
export class ZoneIndex {
  private readonly cells = new Map<number, ICell>();
  private readonly probes = new Map<number, number>();
  private readonly tz: string;
  private readonly cap: number;

  constructor(tz: string, cap = ZONE_CELL_CAP) {
    this.tz = tz;
    this.cap = cap;
  }

  /** Zone offset in effect at `t`. */
  offsetAt(t: number): number {
    const c = this.cell(Math.floor(t / GRID));
    return t < c.at ? c.off : c.next;
  }

  /** The first transition instant in `(a, b]`, or `NaN` when the offset holds throughout. */
  transitionIn(a: number, b: number): number {
    const last = Math.floor(b / GRID);
    for (let k = Math.floor(a / GRID); k <= last; k++) {
      const c = this.cell(k);
      if (c.at > a && c.at <= b) return c.at;
    }
    return Number.NaN;
  }

  private probe(k: number): number {
    let off = this.probes.get(k);
    // Stryker disable next-line ConditionalExpression: the probe cache is a pure optimization — re-probing yields the same offset
    if (off === undefined) {
      off = rawOffset(this.tz, k * GRID);
      this.probes.set(k, off);
    }
    return off;
  }

  private cell(k: number): ICell {
    let c = this.cells.get(k);
    if (c) return c;
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: a memory bound only — clearing early, late or never leaves every answer unchanged (cells are recomputed on demand)
    if (this.cells.size >= this.cap) {
      this.cells.clear();
      this.probes.clear();
    }
    const off = this.probe(k);
    const next = this.probe(k + 1);
    let at = Number.NaN;
    if (off !== next) {
      // first instant carrying `next`
      let a = k * GRID;
      let b = a + GRID;
      while (b - a > 1) {
        const mid = Math.floor((a + b) / 2);
        if (rawOffset(this.tz, mid) === off) a = mid;
        else b = mid;
      }
      at = b;
    }
    c = { off, next, at };
    this.cells.set(k, c);
    return c;
  }
}

const zoneIndexes = new Map<string, ZoneIndex>();

/** The shared index of a zone. */
export function zoneIndex(tz: string): ZoneIndex {
  let z = zoneIndexes.get(tz);
  // Stryker disable next-line ConditionalExpression: the cache is a pure optimization — a fresh index answers identically
  if (!z) {
    z = new ZoneIndex(tz);
    zoneIndexes.set(tz, z);
  }
  return z;
}

export interface ILocalDay {
  /** Absolute `[lo, hi)` ranges carrying the local pseudo-epoch range `[lo, hi)`, sorted. */
  map: (lo: number, hi: number) => { lo: number; hi: number }[];
  /** The first absolute instant of the local day. */
  start: number;
  /** The first absolute instant of the next local day. */
  end: number;
}

/**
 *  How the local calendar day `day` (days since 1970-01-01) maps onto absolute
 *  time in `tz`.
 *
 *  The zone's offset is read a day either side of the local day; when the two
 *  differ, the transition between them splits the day into two segments. Local
 *  times inside a spring-forward gap belong to neither segment and map to
 *  nothing; times inside a fall-back overlap belong to both and map twice — the
 *  same instants `covers()` accepts (spec §9.3). A day swallowed whole by a
 *  transition (Pacific/Apia 2011-12-30) maps every range to nothing and has
 *  `start === end`, the transition instant.
 */
export function localDay(tz: string, day: number): ILocalDay {
  const p0 = day * MS_PER_DAY;
  const p1 = p0 + MS_PER_DAY;
  // Stryker disable next-line all: 'UTC' fast path is a pure optimization — the index finds offA === offB === 0
  if (tz === 'UTC') return { map: (lo, hi) => [{ lo, hi }], start: p0, end: p1 };
  const zone = zoneIndex(tz);
  // A zone offset never exceeds ±24h, so these bracket every offset in effect on the day.
  const a = p0 - MS_PER_DAY;
  const b = p0 + 2 * MS_PER_DAY;
  const offA = zone.offsetAt(a);
  const offB = zone.offsetAt(b);
  if (offA === offB) {
    return {
      map: (lo, hi) => [{ lo: lo - offA, hi: hi - offA }],
      start: p0 - offA,
      end: p1 - offA
    };
  }
  const t = zone.transitionIn(a, b);
  const endA = t + offA; // local times before this belong to the first segment
  const startB = t + offB; // local times from this on belong to the second
  const map = (lo: number, hi: number): { lo: number; hi: number }[] => {
    // Stryker disable next-line ArrayDeclaration: equivalent — the consumer sortMerges every mapped list, and its hi > lo filter drops non-range garbage.
    const out: { lo: number; hi: number }[] = [];
    const hiA = Math.min(hi, endA);
    // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — a part that is empty or reversed (hiA <= lo) is dropped by the consumer's hi > lo filter (sortMerge).
    if (hiA > lo) out.push({ lo: lo - offA, hi: hiA - offA });
    const loB = Math.max(lo, startB);
    // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — same filter: an empty or reversed second part never survives sortMerge.
    if (hi > loB) out.push({ lo: loB - offB, hi: hi - offB });
    return out;
  };
  // The day's first instant: the first reading of local midnight when it exists; else the later
  // of the transition and the second reading (the transition when a gap swallows midnight, the
  // second reading when an overlap has already run past it).
  // Stryker disable next-line EqualityOperator: equivalent — at p0 === endA the `<=` form picks the first reading, which is the transition instant t (endA - offA), at or before the true start; an earlier start only widens the sub-day cadence scan, whose windows are intersected with the day's own ranges.
  const start = p0 < endA ? p0 - offA : Math.max(t, p0 - offB);
  // `end` is the earliest instant reading the next day's midnight: the second reading when the
  // overlap reaches it, the transition when a gap swallows it, else the first reading.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — the `false` branch yields `t` or the first reading, both at or before the true end, and an early `end` only delays a chain's day-end check by one day (the next day's coverage decides the same way); at p1 === endA or p1 === startB both forms land on t.
  const end = p1 > startB ? p1 - offB : p1 > endA ? t : p1 - offA;
  return { map, start, end };
}
