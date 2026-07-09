import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDTRExpIR,
  IExpressionIR,
  IFields,
  ISelector,
  Unit
} from '../types/index.js';
import {
  addMonthsConstrain,
  civilFromDays,
  daysInMonth,
  daysInQuarter,
  daysInYear,
  epochDay,
  epochFromLocal,
  fieldsFromInstant,
  monthsBetween,
  weeksInIsoYear
} from '../utils/index.js';
import { literalPseudo } from './Parser.js';

const MS_PER_DAY = 86_400_000;

/** Spec §9: one field extraction, then integer tests per component; `|` = any branch. */
export function coversInstant(ir: IDTRExpIR, epochMs: number, tz: string): boolean {
  const fields = fieldsFromInstant(epochMs, tz);
  return ir.expressions.some((expr) => coversExpression(expr, fields, epochMs, tz));
}

function coversExpression(expr: IExpressionIR, f: IFields, epochMs: number, tz: string): boolean {
  const present = new Set(expr.selectors.map((s) => s.unit));
  for (const selector of expr.selectors) {
    if (!matchSelector(selector, f, present)) return false;
  }
  if (expr.time && !expr.time.ranges.some((r) => f.msOfDay >= r.startMs && f.msOfDay < r.endMs)) {
    return false;
  }
  if (expr.bounds && !matchBounds(expr.bounds, f)) return false;
  if (expr.cadence) {
    const covered = isSubDayCadence(expr.cadence)
      ? cadenceAbsWindows(expr.cadence, epochMs, epochMs + 1, tz).length > 0
      : cadencePseudoWindows(expr.cadence, f.pseudo, f.pseudo + 1).length > 0;
    if (!covered) return false;
  }
  return true;
}

// -------------------------------
// discrete selectors
// -------------------------------

/** Span/stride/exclusion test of one raw value against its per-instance domain. */
export function selectorCoversValue(
  selector: ISelector,
  value: number,
  min: number,
  max: number
): boolean {
  // negative values count from the end of the parent's actual domain (spec §3/§9.1)
  const resolve = (v: number | null): number | null => (v !== null && v < 0 ? max + 1 + v : v);

  if (selector.stride) {
    const start = selector.stride.start;
    const end = resolve(selector.stride.end) ?? max;
    if (value < start || value > end) return false;
    return (value - start) % selector.stride.interval < selector.stride.duration;
  }

  const inSet = selector.spans.some((span) => {
    const start = resolve(span.start) ?? min;
    const end = resolve(span.end) ?? max;
    return value >= start && value <= end;
  });
  return selector.exclude ? !inSet : inSet;
}

export function matchSelector(selector: ISelector, f: IFields, present: Set<Unit>): boolean {
  const value = fieldValue(selector.unit, f, present);
  const { min, max } = instanceDomain(selector.unit, f, present);
  if (!selectorCoversValue(selector, value, min, max)) return false;
  return selector.ordinal === undefined || matchOrdinal(selector.ordinal, f, present);
}

const DAY_LEVEL_UNITS = 'YQMWDE';

/** Whether the day-level selectors (Y Q M W D E) all pass — sub-day components ignored. */
export function matchesDayLevel(expr: IExpressionIR, f: IFields, present: Set<Unit>): boolean {
  return expr.selectors.every(
    (s) => !DAY_LEVEL_UNITS.includes(s.unit) || matchSelector(s, f, present)
  );
}

function fieldValue(unit: Unit, f: IFields, present: Set<Unit>): number {
  switch (unit) {
    case 'Y':
      // with W present, Y means the ISO week-year (spec §2)
      return present.has('W') ? f.isoWeekYear : f.year;
    case 'Q':
      return f.quarter;
    case 'M':
      return f.month;
    case 'W':
      return f.isoWeek;
    case 'D':
      return present.has('M')
        ? f.day
        : present.has('Q')
          ? f.dayOfQuarter
          : present.has('Y')
            ? f.dayOfYear
            : f.day;
    case 'E':
      return f.weekday;
    case 'H':
      return f.hour;
    case 'm':
      return f.minute;
    default:
      return f.second;
  }
}

export function instanceDomain(
  unit: Unit,
  f: IFields,
  present: Set<Unit>
): { min: number; max: number } {
  switch (unit) {
    case 'Y':
      return { min: 1, max: 9999 };
    case 'Q':
      return { min: 1, max: 4 };
    case 'M':
      return { min: 1, max: 12 };
    case 'W':
      return { min: 1, max: weeksInIsoYear(f.isoWeekYear) };
    case 'D':
      return {
        min: 1,
        max: present.has('M')
          ? daysInMonth(f.year, f.month)
          : present.has('Q')
            ? daysInQuarter(f.year, f.quarter)
            : present.has('Y')
              ? daysInYear(f.year)
              : daysInMonth(f.year, f.month)
      };
    case 'E':
      return { min: 1, max: 7 };
    case 'H':
      return { min: 0, max: 23 };
    default:
      return { min: 0, max: 59 };
  }
}

/** nth / nth-from-last occurrence of the weekday within the scope (spec §3). */
function matchOrdinal(ordinal: number, f: IFields, present: Set<Unit>): boolean {
  let day = f.day;
  let total = daysInMonth(f.year, f.month);
  if (!present.has('M')) {
    if (present.has('Q')) {
      day = f.dayOfQuarter;
      total = daysInQuarter(f.year, f.quarter);
    } else if (present.has('Y')) {
      day = f.dayOfYear;
      total = daysInYear(f.year);
    }
  }
  // Stryker disable next-line EqualityOperator: ordinal is never 0 (parser forbids #0), so > and >= are equivalent
  if (ordinal > 0) return Math.ceil(day / 7) === ordinal;
  return Math.ceil((total - day + 1) / 7) === -ordinal;
}

// -------------------------------
// bounds
// -------------------------------

/** End of a literal's span, exclusive: whole day, or minute/second with a T-part (spec §6). */
export function literalSpanEnd(literal: IDateLiteral): number {
  const spanMs =
    literal.hour === undefined ? MS_PER_DAY : literal.second === undefined ? 60_000 : 1000;
  return literalPseudo(literal) + spanMs;
}

/** The absolute window of a bounds component, in local pseudo-epoch; open ends are ±Infinity. */
export function boundsPseudoWindow(bounds: IBounds): { lo: number; hi: number } {
  return {
    lo: bounds.start ? literalPseudo(bounds.start) : Number.NEGATIVE_INFINITY,
    hi: bounds.end ? literalSpanEnd(bounds.end) : Number.POSITIVE_INFINITY
  };
}

function matchBounds(bounds: IBounds, f: IFields): boolean {
  const { lo, hi } = boundsPseudoWindow(bounds);
  return f.pseudo >= lo && f.pseudo < hi;
}

// -------------------------------
// cadence windows
// -------------------------------

/** H/m-period cadences run on absolute elapsed time; the rest on calendar arithmetic (§9.3). */
export function isSubDayCadence(c: ICadence): boolean {
  return c.periodUnit === 'H' || c.periodUnit === 'm';
}

/**
 *  Occurrence windows of a calendar cadence (Y/M/W/D period) overlapping
 *  `[lo, hi)`, in local pseudo-epoch, constrain arithmetic per spec §9.2.
 */
export function cadencePseudoWindows(c: ICadence, lo: number, hi: number): [number, number][] {
  // occurrences before the anchor are naturally excluded by the `start >= hi` loop guards
  const anchorPseudo = literalPseudo(c.anchor);
  const out: [number, number][] = [];

  if (c.periodUnit === 'M' || c.periodUnit === 'Y') {
    const periodMonths = c.period * (c.periodUnit === 'Y' ? 12 : 1);
    const anchorMsOfDay =
      anchorPseudo - epochDay(c.anchor.year, c.anchor.month, c.anchor.day) * MS_PER_DAY;
    const loDay = civilFromDays(Math.floor(lo / MS_PER_DAY));
    const elapsed = monthsBetween(
      { year: c.anchor.year, month: c.anchor.month, day: c.anchor.day, msOfDay: anchorMsOfDay },
      { ...loDay, msOfDay: lo - Math.floor(lo / MS_PER_DAY) * MS_PER_DAY }
    );
    // constrain clamping wobbles occurrence starts — begin one period early
    for (let k = Math.max(0, Math.floor(elapsed / periodMonths) - 1); ; k++) {
      const occ = addMonthsConstrain(c.anchor.year, c.anchor.month, c.anchor.day, k * periodMonths);
      const start = epochDay(occ.year, occ.month, occ.day) * MS_PER_DAY + anchorMsOfDay;
      if (start >= hi) break;
      const end = windowEnd(c, occ, start, anchorMsOfDay);
      if (end > lo) out.push([start, end]);
    }
    return out;
  }

  const periodMs = c.period * (c.periodUnit === 'W' ? 7 : 1) * MS_PER_DAY;
  const durMs = durationMs(c.duration, c.durationUnit as 'W' | 'D' | 'H' | 'm');
  for (let k = Math.max(0, Math.floor((lo - anchorPseudo) / periodMs) - 1); ; k++) {
    const start = anchorPseudo + k * periodMs;
    if (start >= hi) break;
    if (start + durMs > lo) out.push([start, start + durMs]);
  }
  return out;
}

/** Occurrence windows of an H/m-period cadence overlapping `[lo, hi)`, in absolute epoch ms. */
export function cadenceAbsWindows(
  c: ICadence,
  lo: number,
  hi: number,
  tz: string
): [number, number][] {
  const anchorEpoch = epochFromLocal(
    tz,
    c.anchor.year,
    c.anchor.month,
    c.anchor.day,
    c.anchor.hour ?? 0,
    c.anchor.minute ?? 0,
    c.anchor.second ?? 0
  );
  const periodMs = c.period * (c.periodUnit === 'H' ? 3_600_000 : 60_000);
  const durMs = durationMs(c.duration, c.durationUnit as 'W' | 'D' | 'H' | 'm');
  const out: [number, number][] = [];
  for (let k = Math.max(0, Math.floor((lo - anchorEpoch) / periodMs) - 1); ; k++) {
    const start = anchorEpoch + k * periodMs;
    if (start >= hi) break;
    if (start + durMs > lo) out.push([start, start + durMs]);
  }
  return out;
}

function windowEnd(
  c: ICadence,
  occ: { year: number; month: number; day: number },
  occPseudo: number,
  anchorMsOfDay: number
): number {
  if (c.durationUnit === 'M' || c.durationUnit === 'Y') {
    const months = c.duration * (c.durationUnit === 'Y' ? 12 : 1);
    const end = addMonthsConstrain(occ.year, occ.month, occ.day, months);
    return epochDay(end.year, end.month, end.day) * MS_PER_DAY + anchorMsOfDay;
  }
  return occPseudo + durationMs(c.duration, c.durationUnit);
}

/** M/Y durations never reach here — the parser requires them to pair with M/Y periods. */
function durationMs(duration: number, unit: 'W' | 'D' | 'H' | 'm'): number {
  return (
    duration *
    (unit === 'W' ? 7 * MS_PER_DAY : unit === 'D' ? MS_PER_DAY : unit === 'H' ? 3_600_000 : 60_000)
  );
}
