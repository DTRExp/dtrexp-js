import type { IDateLiteral, IDTRExpIR, IExpressionIR, ISelector } from '../types/index.js';
import { renderLiteral } from './Canonical.js';

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FREQ: Record<string, string> = { Y: 'YEARLY', M: 'MONTHLY', W: 'WEEKLY', D: 'DAILY' };

/**
 *  RFC 5545 RRULE for the losslessly-mappable subset, else `null` (spec §9.2).
 *  Conservative: unions, time-of-day components, exclusions and open positive
 *  ranges are not mapped. Constrained cadences emit RFC 7529 `SKIP=BACKWARD`.
 */
export function toRRuleString(ir: IDTRExpIR): string | null {
  if (ir.expressions.length !== 1) return null;
  const expr = ir.expressions[0] as IExpressionIR;
  if (expr.time) return null;

  let freq: string | null = null;
  let interval = 1;
  let dtstart: IDateLiteral | null = null;
  let until: IDateLiteral | null = null;
  let skip = false;
  const byMonth: number[] = [];
  const byWeekNo: number[] = [];
  const byYearDay: number[] = [];
  const byMonthDay: number[] = [];
  const byDay: string[] = [];
  const present = new Set(expr.selectors.map((s) => s.unit));

  if (expr.cadence) {
    const c = expr.cadence;
    const isDefaultDuration = c.duration === 1 && c.durationUnit === c.periodUnit;
    const monthish = c.periodUnit === 'M' || c.periodUnit === 'Y';
    // the instant-like day recurrence (`…/1M/1D`) also maps; other durations don't
    const isDayInstant = monthish && c.duration === 1 && c.durationUnit === 'D';
    if (!isDefaultDuration && !isDayInstant) return null;
    const mapped = FREQ[c.periodUnit];
    if (mapped === undefined) return null;
    freq = mapped;
    interval = c.period;
    dtstart = c.anchor;
    skip = monthish && c.anchor.day > 28;
  }

  for (const selector of expr.selectors) {
    if (selector.exclude) return null;
    switch (selector.unit) {
      case 'Y': {
        if (expr.cadence) return null;
        const stride = selector.stride;
        if (stride) {
          freq = 'YEARLY';
          interval = stride.interval;
          dtstart = { year: stride.start, month: 1, day: 1 };
          if (stride.end !== null) until = { year: stride.end, month: 12, day: 31 };
          break;
        }
        const span = selector.spans[0];
        if (selector.spans.length !== 1 || !span || span.start === null) {
          return null;
        }
        dtstart = { year: span.start, month: 1, day: 1 };
        if (span.end !== null) until = { year: span.end, month: 12, day: 31 };
        freq ??= 'YEARLY';
        break;
      }
      case 'Q': {
        const months = expandSpans(selector, 4);
        if (!months) return null;
        for (const q of months) byMonth.push((q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3);
        freq ??= 'YEARLY';
        break;
      }
      case 'M': {
        const months = expandSpans(selector, 12);
        if (!months) return null;
        byMonth.push(...months);
        freq ??= 'YEARLY';
        break;
      }
      case 'W': {
        const weeks = expandSpans(selector, 53);
        if (!weeks) return null;
        byWeekNo.push(...weeks);
        freq ??= 'YEARLY';
        break;
      }
      case 'D': {
        if (present.has('Q')) return null;
        const yearScope = !present.has('M') && present.has('Y');
        const days = expandDaySpans(selector);
        if (!days) return null;
        if (yearScope) byYearDay.push(...days);
        else byMonthDay.push(...days);
        freq ??= yearScope || present.has('M') ? 'YEARLY' : 'MONTHLY';
        break;
      }
      case 'E': {
        if (selector.ordinal !== undefined) {
          // BYWEEKNO is YEARLY-only and an ordinal BYDAY is MONTHLY/YEARLY-only (RFC 5545);
          // W or a cadence would force an invalid combination
          if (present.has('Q') || present.has('W') || expr.cadence) return null;
          const value = selector.spans[0]?.start as number;
          byDay.push(`${selector.ordinal}${BYDAY[value - 1]}`);
          freq ??= present.has('M') || present.has('Y') ? 'YEARLY' : 'MONTHLY';
          break;
        }
        const days = expandSpans(selector, 7);
        if (!days) return null;
        byDay.push(...days.map((d) => BYDAY[d - 1] as string));
        freq ??= present.has('M') || present.has('Q') || present.has('Y') ? 'YEARLY' : 'WEEKLY';
        break;
      }
      default:
        // H/m/s selectors are time-of-day patterns — out of the mapped subset
        return null;
    }
  }

  if (expr.bounds) {
    const b = expr.bounds;
    if (b.start?.hour !== undefined || b.end?.hour !== undefined) return null;
    if (b.start) {
      if (dtstart) return null; // phase conflict with a cadence anchor or Y selector
      dtstart = b.start;
    }
    // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — with no b.end the assignment stores undefined into an already-falsy until, and at render-equality either literal renders the same UNTIL.
    if (b.end) until = until && renderLiteral(until) < renderLiteral(b.end) ? until : b.end;
  }
  if (!freq) return null;

  const parts: string[] = [];
  if (skip) parts.push('RSCALE=GREGORIAN');
  parts.push(`FREQ=${freq}`);
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);
  if (byMonth.length > 0) parts.push(`BYMONTH=${byMonth.join(',')}`);
  if (byWeekNo.length > 0) parts.push(`BYWEEKNO=${byWeekNo.join(',')}`);
  if (byYearDay.length > 0) parts.push(`BYYEARDAY=${byYearDay.join(',')}`);
  if (byMonthDay.length > 0) parts.push(`BYMONTHDAY=${byMonthDay.join(',')}`);
  if (byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`);
  if (until) parts.push(`UNTIL=${renderLiteral(until)}`);
  if (skip) parts.push('SKIP=BACKWARD');

  const rule = `RRULE:${parts.join(';')}`;
  return dtstart ? `DTSTART;VALUE=DATE:${renderLiteral(dtstart)}\n${rule}` : rule;
}

/**
 *  Expands spans (and phase-locked strides) to a concrete value list, else null.
 *  Open and negative spans are unmapped: of RRULE's BY* rules only the day lists
 *  take negative values, and days go through expandDaySpans instead.
 */
export function expandSpans(selector: ISelector, max: number): number[] | null {
  const out: number[] = [];
  if (selector.stride) {
    const s = selector.stride;
    const end = s.end ?? max;
    for (let v = s.start; v <= end; v += s.interval) {
      for (let d = 0; d < s.duration && v + d <= end; d++) out.push(v + d);
    }
    return out;
  }
  for (const span of selector.spans) {
    if (span.start === null || span.end === null) return null;
    // Stryker disable next-line EqualityOperator: equivalent — 0 is not a parseable value for any unit routed here, so < and <= coincide.
    if (span.start < 0 || span.end < 0) return null;
    for (let v = span.start; v <= span.end; v++) out.push(v);
  }
  return out;
}

/** Day spans keep RRULE's native negative-day form: `D-7-*` → BYMONTHDAY=-7…-1. */
export function expandDaySpans(selector: ISelector): number[] | null {
  if (selector.stride) return null;
  const out: number[] = [];
  for (const span of selector.spans) {
    if (span.start === null) return null;
    // Stryker disable next-line EqualityOperator: equivalent — 'D0' is rejected at parse, so < and <= coincide.
    if (span.start < 0) {
      const end = span.end ?? -1;
      // Stryker disable next-line EqualityOperator: equivalent — end is -1 or a parsed nonzero day, never 0.
      if (end > 0) return null;
      for (let v = span.start; v <= end; v++) out.push(v);
    } else {
      // Stryker disable next-line EqualityOperator: equivalent — 'D0' is rejected at parse, so < and <= coincide.
      if (span.end === null || span.end < 0) return null;
      for (let v = span.start; v <= span.end; v++) out.push(v);
    }
  }
  return out;
}
