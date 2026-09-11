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

export interface ILocalDay {
  /** Absolute `[lo, hi)` ranges carrying the local pseudo-epoch range `[lo, hi)`, sorted. */
  map: (lo: number, hi: number) => { lo: number; hi: number }[];
  /** An instant at or before the day's first; exact except on a transition day, where it may run early by the shift. */
  start: number;
  /** The first absolute instant of the next local day (exact). */
  end: number;
}

/**
 *  How the local calendar day `day` (days since 1970-01-01) maps onto absolute
 *  time in `tz`.
 *
 *  The zone's offset is probed a day either side of the local day; when the two
 *  differ, the transition between them is located by bisection and the day is
 *  two segments. Local times inside a spring-forward gap belong to neither
 *  segment and map to nothing; times inside a fall-back overlap belong to both
 *  and map twice — the same instants `covers()` accepts (spec §9.3). A day
 *  swallowed whole by a transition (Pacific/Apia 2011-12-30) maps every range
 *  to nothing and has `start === end`, the transition instant. Assumes at most
 *  one transition per 72-hour neighbourhood, which holds for every IANA zone.
 */
export function localDay(tz: string, day: number): ILocalDay {
  const p0 = day * MS_PER_DAY;
  const p1 = p0 + MS_PER_DAY;
  // Stryker disable next-line all: 'UTC' fast path is a pure optimization — the probes below find offA === offB === 0
  if (tz === 'UTC') return { map: (lo, hi) => [{ lo, hi }], start: p0, end: p1 };
  const offsetAt = (t: number): number => fieldsFromInstant(t, tz).pseudo - t;
  // A zone offset never exceeds ±24h, so these bracket every offset in effect on the day.
  let a = p0 - MS_PER_DAY;
  let b = p0 + 2 * MS_PER_DAY;
  const offA = offsetAt(a);
  const offB = offsetAt(b);
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent — with equal offsets the bisection below converges on the far probe, so the second segment starts past the day and the general mapper returns the same single range; the branch only saves the probes.
  if (offA === offB) {
    return {
      map: (lo, hi) => [{ lo: lo - offA, hi: hi - offA }],
      start: p0 - offA,
      end: p1 - offA
    };
  }
  // first instant carrying offB
  while (b - a > 1) {
    const mid = Math.floor((a + b) / 2);
    if (offsetAt(mid) === offA) a = mid;
    else b = mid;
  }
  const endA = b + offA; // local times before this belong to the first segment
  const startB = b + offB; // local times from this on belong to the second
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
  // A lower bound is enough for `start` (it only opens a scan window), so the earlier of the two readings serves.
  // Stryker disable next-line ArithmeticOperator: equivalent — flipping the sign on the reading that is not the minimum leaves the minimum in place, and an even earlier bound only lengthens a scan.
  const start = Math.min(p0 - offA, p0 - offB);
  // `end` is exact: the earliest instant whose wall clock reads the next day's midnight — the second
  // reading when the overlap reaches it, the transition itself when a gap swallows it, else the first.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — the `false` branch yields `b` or the first reading, both at or before the true end, and an early `end` only delays the stepper's day-end return by one day (the next day's coverage decides the same way); at p1 === endA the first reading IS the transition instant (endA - offA = b), so `>=` picks the same value.
  const end = p1 > startB ? p1 - offB : p1 > endA ? b : p1 - offA;
  return { map, start, end };
}
