import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDtreIR,
  IExpressionIR,
  IFields,
  ISelector,
  Unit
} from '../types/index.js';
import {
  addMonthsConstrain,
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
export function coversInstant(ir: IDtreIR, epochMs: number, tz: string): boolean {
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
  if (expr.cadence && !matchCadence(expr.cadence, f, epochMs, tz)) return false;
  return true;
}

// -------------------------------
// discrete selectors
// -------------------------------

function matchSelector(selector: ISelector, f: IFields, present: Set<Unit>): boolean {
  const value = fieldValue(selector.unit, f, present);
  const { min, max } = instanceDomain(selector.unit, f, present);
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
  if (selector.exclude) return !inSet;
  if (!inSet) return false;
  return selector.ordinal === undefined || matchOrdinal(selector.ordinal, f, present);
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

function instanceDomain(unit: Unit, f: IFields, present: Set<Unit>): { min: number; max: number } {
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
  if (ordinal > 0) return Math.ceil(day / 7) === ordinal;
  return Math.ceil((total - day + 1) / 7) === -ordinal;
}

// -------------------------------
// bounds & cadence
// -------------------------------

/** End of a literal's span, exclusive: whole day, or minute/second with a T-part (spec §6). */
function literalSpanEnd(literal: IDateLiteral): number {
  const spanMs =
    literal.hour === undefined ? MS_PER_DAY : literal.second === undefined ? 60_000 : 1000;
  return literalPseudo(literal) + spanMs;
}

function matchBounds(bounds: IBounds, f: IFields): boolean {
  if (bounds.start && f.pseudo < literalPseudo(bounds.start)) return false;
  if (bounds.end && f.pseudo >= literalSpanEnd(bounds.end)) return false;
  return true;
}

function matchCadence(c: ICadence, f: IFields, epochMs: number, tz: string): boolean {
  const anchorPseudo = literalPseudo(c.anchor);
  if (f.pseudo < anchorPseudo) return false;

  if (c.periodUnit === 'M' || c.periodUnit === 'Y') {
    const periodMonths = c.period * (c.periodUnit === 'Y' ? 12 : 1);
    const anchorMsOfDay =
      anchorPseudo - epochDay(c.anchor.year, c.anchor.month, c.anchor.day) * MS_PER_DAY;
    const anchorArg = {
      year: c.anchor.year,
      month: c.anchor.month,
      day: c.anchor.day,
      msOfDay: anchorMsOfDay
    };
    const elapsed = monthsBetween(anchorArg, {
      year: f.year,
      month: f.month,
      day: f.day,
      msOfDay: f.msOfDay
    });
    if (elapsed < 0) return false;
    const k = Math.floor(elapsed / periodMonths);
    // constrain clamping wobbles occurrence starts — probe the neighborhood
    for (const kk of [k, k + 1]) {
      const occ = addMonthsConstrain(
        c.anchor.year,
        c.anchor.month,
        c.anchor.day,
        kk * periodMonths
      );
      const occPseudo = epochDay(occ.year, occ.month, occ.day) * MS_PER_DAY + anchorMsOfDay;
      if (f.pseudo >= occPseudo && f.pseudo < windowEnd(c, occ, occPseudo, anchorMsOfDay)) {
        return true;
      }
    }
    return false;
  }

  if (c.periodUnit === 'W' || c.periodUnit === 'D') {
    // calendar-day arithmetic in the evaluation zone == pseudo-local math (spec §9.3)
    const periodMs = c.period * (c.periodUnit === 'W' ? 7 : 1) * MS_PER_DAY;
    const rem = (f.pseudo - anchorPseudo) % periodMs;
    return rem < durationMs(c.duration, c.durationUnit as 'W' | 'D' | 'H' | 'm');
  }

  // H/m periods are absolute elapsed time (spec §9.3)
  const anchorEpoch = epochFromLocal(
    tz,
    c.anchor.year,
    c.anchor.month,
    c.anchor.day,
    c.anchor.hour ?? 0,
    c.anchor.minute ?? 0,
    c.anchor.second ?? 0
  );
  const elapsedMs = epochMs - anchorEpoch;
  if (elapsedMs < 0) return false;
  const periodMs = c.period * (c.periodUnit === 'H' ? 3_600_000 : 60_000);
  return elapsedMs % periodMs < durationMs(c.duration, c.durationUnit as 'W' | 'D' | 'H' | 'm');
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
