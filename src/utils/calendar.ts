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

/** Absolute instant of a local pseudo-epoch value (millisecond precision). */
export function epochFromPseudo(tz: string, pseudo: number): number {
  const dayNum = Math.floor(pseudo / MS_PER_DAY);
  const msOfDay = pseudo - dayNum * MS_PER_DAY;
  const { year, month, day } = civilFromDays(dayNum);
  const ms = msOfDay % 1000;
  const seconds = Math.floor(msOfDay / 1000);
  return (
    epochFromLocal(
      tz,
      year,
      month,
      day,
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60
    ) + ms
  );
}
