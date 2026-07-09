import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDTRExpIR,
  IExpressionIR,
  ISelector,
  ISpan,
  ITimeSelector,
  Unit
} from '../types/index.js';
import { midnightWrap, spanWrap } from './Canonical.js';

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
export function describeIR(ir: IDTRExpIR): string {
  return ir.expressions.map(describeExpression).join(', or ');
}

function describeExpression(expr: IExpressionIR): string {
  const present = new Set(expr.selectors.map((s) => s.unit));
  const parts: Array<{ order: number; text: string }> = [];
  for (const selector of expr.selectors) {
    parts.push({
      order: ORDER[selector.unit] as number,
      text: describeSelector(selector, present)
    });
  }
  if (expr.time) parts.push({ order: ORDER.T as number, text: describeTime(expr.time) });
  parts.sort((a, b) => a.order - b.order);
  const rendered = parts.map((p) => p.text);
  if (expr.cadence) rendered.push(describeCadence(expr.cadence));
  if (expr.bounds) rendered.push(describeBounds(expr.bounds));
  return rendered.join(rendered.length > 2 ? ', ' : ' ').replace(/, (until|from|on) /g, ', $1 ');
}

function describeSelector(selector: ISelector, present: ReadonlySet<Unit>): string {
  const noun = UNIT_NOUNS[selector.unit];
  const scope = scopeNoun(selector.unit, present);
  if (selector.stride) {
    const s = selector.stride;
    const from = valueName(selector.unit, s.start);
    const to = s.end !== null ? ` to ${valueName(selector.unit, s.end)}` : '';
    const block = s.duration !== 1 ? `, ${s.duration} ${noun}s long` : '';
    return `every ${ordinalWord(s.interval)} ${noun} from ${from}${to}${block}`;
  }
  const wrap = spanWrap(selector.spans);
  if (wrap && !selector.exclude) {
    return `from ${endpointName(selector.unit, wrap.start)} to ${endpointName(selector.unit, wrap.end)}`;
  }
  const values = wrap
    ? `${valueName(selector.unit, wrap.start)} to ${valueName(selector.unit, wrap.end)}`
    : selector.spans.map((span) => spanName(selector.unit, span, scope)).join(' and ');
  if (selector.exclude) return `every ${noun} except ${values}`;
  if (selector.ordinal !== undefined) {
    const nth =
      selector.ordinal === -1
        ? 'last'
        : // Stryker disable next-line EqualityOperator: ordinal is never 0, so < and <= are equivalent
          selector.ordinal < 0
          ? `${ordinalWord(-selector.ordinal)}-to-last`
          : ordinalWord(selector.ordinal);
    return `the ${nth} ${values}`;
  }
  // a lone true range reads as a from/to phrase with no in/on prefix (spec-locked wording)
  const only = selector.spans.length === 1 ? (selector.spans[0] as ISpan) : undefined;
  if (
    only &&
    only.start !== only.end &&
    // Stryker disable next-line ConditionalExpression: equivalent — the null guard is for the type
    // checker; `null < 0` is false, so the negated conjunction decides identically without it.
    !(only.start !== null && only.start < 0 && only.end === null)
  ) {
    return rangePhrase(selector.unit, only, scope);
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

/**
 *  Names the edge of an open range for the units whose domain edge moves per instance.
 *  Only `D` and `W` ever ask (every other unit has a fixed, concretely-nameable maximum
 *  in DOMAIN_MAX): `W` is always year-scoped; `D` follows the nearest of M/Q/Y present.
 */
function scopeNoun(unit: Unit, present: ReadonlySet<Unit>): string {
  if (unit === 'W') return 'year';
  return present.has('M')
    ? 'month'
    : present.has('Q')
      ? 'quarter'
      : present.has('Y')
        ? 'year'
        : 'month';
}

/** A single-range selector as a standalone "from X to Y" phrase. */
function rangePhrase(unit: Unit, span: ISpan, scope: string): string {
  if (unit === 'Y') {
    // Stryker disable next-line ConditionalExpression: equivalent — a {null, null} span has start === end
    // and never reaches rangePhrase, so the null guards here only narrow types.
    if (span.start !== null && span.end === null) return `from ${span.start} onwards`;
    // Stryker disable next-line ConditionalExpression: equivalent — same unreachable {null, null} case.
    if (span.start === null && span.end !== null) return `up to ${span.end}`;
    return `from ${span.start} to ${span.end}`;
  }
  const start =
    span.start === null
      ? endpointName(unit, DOMAIN_MIN[unit] as number)
      : endpointName(unit, span.start);
  if (span.end === null) {
    // fixed-domain units name their edge concretely; D and W have moving edges
    const max = DOMAIN_MAX[unit];
    return max === undefined
      ? `from ${start} to end of ${scope}`
      : `from ${start} to ${endpointName(unit, max)}`;
  }
  return `from ${start} to ${endpointName(unit, span.end)}`;
}

const DOMAIN_MIN: Partial<Record<Unit, number>> = {
  Q: 1,
  M: 1,
  W: 1,
  D: 1,
  E: 1,
  H: 0,
  m: 0,
  s: 0
};
/** Only fixed-size domains have a nameable max; D and W vary per instance. */
const DOMAIN_MAX: Partial<Record<Unit, number>> = { Q: 4, M: 12, E: 7, H: 23, m: 59, s: 59 };

/** An endpoint with enough words to stand alone in a from/to phrase. */
function endpointName(unit: Unit, value: number): string {
  if (value < 0) return valueName(unit, value);
  switch (unit) {
    case 'M':
    case 'E':
    case 'Q':
      return valueName(unit, value);
    default:
      return `${UNIT_NOUNS[unit]} ${value}`;
  }
}

function isFullNegative(selector: ISelector): boolean {
  const span = selector.spans[0];
  // Stryker disable next-line ConditionalExpression: equivalent — this runs only on the plain-selector
  // path, where the parser guarantees at least one span; the undefined guard narrows types.
  return selector.spans.length === 1 && span !== undefined && (span.start ?? 0) < 0;
}

function spanName(
  unit: Unit,
  span: { start: number | null; end: number | null },
  scope: string
): string {
  if (span.start === null && span.end === null) return `every ${UNIT_NOUNS[unit]}`;
  // `D-7:*` reads as "the last 7 days"
  // Stryker disable next-line ConditionalExpression: equivalent — `null < 0` is false, so dropping
  // the null guard selects the same branch; it exists for the type checker.
  if (span.start !== null && span.start < 0 && span.end === null) {
    const plural = `${UNIT_NOUNS[unit]}s`;
    return span.start === -1 ? `the last ${UNIT_NOUNS[unit]}` : `the last ${-span.start} ${plural}`;
  }
  if (span.start === span.end) return valueName(unit, span.start as number);
  // Y has no domain edge to name — open list items read "2021 onwards" / "up to 2000"
  if (unit === 'Y' && span.end === null) return `${span.start} onwards`;
  if (unit === 'Y' && span.start === null) return `up to ${span.end}`;
  const start =
    span.start === null ? valueName(unit, DOMAIN_MIN[unit] as number) : valueName(unit, span.start);
  const end =
    span.end === null
      ? DOMAIN_MAX[unit] === undefined
        ? `end of ${scope}`
        : valueName(unit, DOMAIN_MAX[unit] as number)
      : valueName(unit, span.end);
  return `${start} to ${end}`;
}

function valueName(unit: Unit, value: number): string {
  if (unit === 'M' && value >= 1) return MONTHS[value - 1] as string;
  if (unit === 'E' && value >= 1) return WEEKDAYS[value - 1] as string;
  if (unit === 'Q') return `Q${value}`;
  if (value < 0) return `${ordinalWord(-value)}-to-last`;
  return String(value);
}

function describeTime(time: ITimeSelector): string {
  const wrap = midnightWrap(time.ranges);
  if (wrap) return `${clock(wrap.startMs)}–${clock(wrap.endMs)}`;
  return time.ranges.map((range) => `${clock(range.startMs)}–${clock(range.endMs)}`).join(' and ');
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
  // the parser gives a bare date literal the same object for start and end
  if (bounds.start && bounds.start === bounds.end) return `on ${dateWords(bounds.start)}`;
  if (bounds.start && bounds.end) {
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
