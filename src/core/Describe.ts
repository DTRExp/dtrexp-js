import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDtreIR,
  IExpressionIR,
  ISelector,
  ITimeSelector,
  Unit
} from '../types/index.js';
import { renderLiteral } from './Canonical.js';

const MS_PER_DAY = 86_400_000;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const UNIT_NOUNS: Record<Unit, string> = {
  Y: 'year',
  Q: 'quarter',
  M: 'month',
  W: 'week',
  D: 'day',
  E: 'weekday',
  H: 'hour',
  m: 'minute',
  s: 'second'
};
const ORDER: Record<string, number> = {
  s: 0,
  m: 1,
  H: 2,
  T: 3,
  E: 4,
  D: 5,
  W: 6,
  M: 7,
  Q: 8,
  Y: 9
};

/** Human-readable English rendering of the compiled IR (v1: `en` only). */
export function describeIR(ir: IDtreIR): string {
  return ir.expressions.map(describeExpression).join(', or ');
}

function describeExpression(expr: IExpressionIR): string {
  const parts: Array<{ order: number; text: string }> = [];
  for (const selector of expr.selectors) {
    parts.push({ order: ORDER[selector.unit] as number, text: describeSelector(selector) });
  }
  if (expr.time) parts.push({ order: ORDER.T as number, text: describeTime(expr.time) });
  parts.sort((a, b) => a.order - b.order);
  const rendered = parts.map((p) => p.text);
  if (expr.cadence) rendered.push(describeCadence(expr.cadence));
  if (expr.bounds) rendered.push(describeBounds(expr.bounds));
  return rendered.join(rendered.length > 2 ? ', ' : ' ').replace(/, (until|from|on) /g, ', $1 ');
}

function describeSelector(selector: ISelector): string {
  const noun = UNIT_NOUNS[selector.unit];
  if (selector.stride) {
    const s = selector.stride;
    const from = valueName(selector.unit, s.start);
    const through = s.end !== null ? ` through ${valueName(selector.unit, s.end)}` : '';
    const block = s.duration !== 1 ? `, ${s.duration} ${noun}s long` : '';
    return `every ${ordinalWord(s.interval)} ${noun} from ${from}${through}${block}`;
  }
  const values = selector.spans.map((span) => spanName(selector.unit, span)).join(' and ');
  if (selector.exclude) return `every ${noun} except ${values}`;
  if (selector.ordinal !== undefined) {
    const nth =
      selector.ordinal === -1
        ? 'last'
        : selector.ordinal < 0
          ? `${ordinalWord(-selector.ordinal)}-to-last`
          : ordinalWord(selector.ordinal);
    return `the ${nth} ${values}`;
  }
  switch (selector.unit) {
    case 'E':
      return `on ${values}`;
    case 'D':
      return isFullNegative(selector) ? `on ${values}` : `on day ${values}`;
    case 'W':
      return `in week ${values}`;
    case 'M':
    case 'Q':
    case 'Y':
      return `in ${values}`;
    default:
      return `at ${noun} ${values}`;
  }
}

function isFullNegative(selector: ISelector): boolean {
  const span = selector.spans[0];
  return selector.spans.length === 1 && span !== undefined && (span.start ?? 0) < 0;
}

function spanName(unit: Unit, span: { start: number | null; end: number | null }): string {
  if (span.start === null && span.end === null) return `every ${UNIT_NOUNS[unit]}`;
  // `D-7-*` reads as "the last 7 days"
  if (span.start !== null && span.start < 0 && span.end === null) {
    return span.start === -1 ? 'the last day' : `the last ${-span.start} days`;
  }
  if (span.start === span.end) return valueName(unit, span.start as number);
  return `${valueName(unit, span.start as number)} through ${valueName(unit, span.end as number)}`;
}

function valueName(unit: Unit, value: number): string {
  if (unit === 'M' && value >= 1) return MONTHS[value - 1] as string;
  if (unit === 'E' && value >= 1) return WEEKDAYS[value - 1] as string;
  if (unit === 'Q') return `Q${value}`;
  if (value < 0) return `${ordinalWord(-value)}-to-last`;
  return String(value);
}

function describeTime(time: ITimeSelector): string {
  const r = time.ranges;
  const first = r[0];
  const last = r[1];
  if (
    r.length === 2 &&
    first &&
    last &&
    first.startMs === 0 &&
    last.endMs === MS_PER_DAY &&
    last.startMs > first.endMs
  ) {
    return `${clock(last.startMs)}–${clock(first.endMs)}`;
  }
  return r.map((range) => `${clock(range.startMs)}–${clock(range.endMs)}`).join(' and ');
}

function clock(ms: number): string {
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor(ms / 60_000) % 60;
  const ss = Math.floor(ms / 1000) % 60;
  const base = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return ss !== 0 ? `${base}:${String(ss).padStart(2, '0')}` : base;
}

function describeCadence(c: ICadence): string {
  const nouns: Record<string, string> = {
    Y: 'year',
    M: 'month',
    W: 'week',
    D: 'day',
    H: 'hour',
    m: 'minute'
  };
  const period = c.period === 1 ? nouns[c.periodUnit] : `${c.period} ${nouns[c.periodUnit]}s`;
  const isDefault = c.duration === 1 && c.durationUnit === c.periodUnit;
  const duration = isDefault
    ? ''
    : `, ${c.duration} ${nouns[c.durationUnit]}${c.duration === 1 ? '' : 's'} long`;
  return `every ${period} from ${dateWords(c.anchor)}${duration}`;
}

function describeBounds(bounds: IBounds): string {
  if (bounds.start && bounds.end) {
    const same = renderLiteral(bounds.start) === renderLiteral(bounds.end);
    if (same) return `on ${dateWords(bounds.start)}`;
    return `from ${dateWords(bounds.start)} through ${dateWords(bounds.end)}`;
  }
  if (bounds.start) return `from ${dateWords(bounds.start)}`;
  return `until ${dateWords(bounds.end as IDateLiteral)}`;
}

function dateWords(literal: IDateLiteral): string {
  const date = `${literal.year}-${String(literal.month).padStart(2, '0')}-${String(literal.day).padStart(2, '0')}`;
  if (literal.hour === undefined) return date;
  // the parser sets minute whenever it sets hour (Thhmm), so minute is defined here
  const minute = literal.minute as number;
  return `${date} ${String(literal.hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function ordinalWord(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}
