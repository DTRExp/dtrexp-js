import { DTRExpSyntaxError } from '../DTRExpSyntaxError.js';
import type {
  CadenceUnit,
  IBounds,
  ICadence,
  IDateLiteral,
  IDTRExpIR,
  IExpressionIR,
  IIssue,
  ISelector,
  ISpan,
  IStride,
  ITimeRange,
  Unit
} from '../types/index.js';
import { daysInMonth, daysInYear, epochDay, quarterOf, weeksInIsoYear } from '../utils/index.js';

const MS_PER_DAY = 86_400_000;
const SELECTOR_UNITS = 'YQMWDEHms';
const CADENCE_UNITS = 'YMWDHm';
/** The largest value an integer may have, however many leading zeros it carries (spec §8). */
const INTEGER_LIMIT = 2_147_483_647;

/**
 *  Conservative lengths in minutes for the cadence `duration < period` check across
 *  units (spec §5.2): the longest a duration unit can be and the shortest a period unit
 *  can be. Whole minutes keep the comparison exact, so `60m` equals `1H`.
 */
const MAX_MINUTES: Record<CadenceUnit, number> = {
  Y: 366 * 1440,
  M: 31 * 1440,
  W: 7 * 1440,
  D: 1440,
  H: 60,
  m: 1
};
const MIN_MINUTES: Record<CadenceUnit, number> = {
  Y: 365 * 1440,
  M: 28 * 1440,
  W: 7 * 1440,
  D: 1440,
  H: 60,
  m: 1
};

/** The largest value of each fixed-size domain (spec §2); `D` and `W` vary with the calendar. */
const FIXED_MAX: Partial<Record<Unit, number>> = {
  Y: 9999,
  Q: 4,
  M: 12,
  E: 7,
  H: 23,
  m: 59,
  s: 59
};
/** The day counts each month can have, and each quarter, for the unsatisfiability lint. */
const MONTH_DAYS = [[31], [28, 29], [31], [30], [31], [30], [31], [31], [30], [31], [30], [31]];
const QUARTER_DAYS = [[90, 91], [91], [92], [92]];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** A designator's domain: its smallest and largest value (spec §2). */
interface IDomain {
  min: number;
  max: number;
}

/** The domain of `unit`, `dayMax` being the largest day its scope allows. */
function domain(unit: Unit, dayMax: number): IDomain {
  switch (unit) {
    case 'Y':
      return { min: 1, max: 9999 };
    case 'Q':
      return { min: 1, max: 4 };
    case 'M':
      return { min: 1, max: 12 };
    case 'W':
      return { min: 1, max: 53 };
    case 'D':
      return { min: 1, max: dayMax };
    case 'E':
      return { min: 1, max: 7 };
    case 'H':
      return { min: 0, max: 23 };
    default:
      return { min: 0, max: 59 };
  }
}

export interface IParseResult {
  ir: IDTRExpIR;
  warnings: IIssue[];
}

/** Parses a DTRExp source string into its compiled IR. Throws `DTRExpSyntaxError`. */
export function parseToIR(source: string): IParseResult {
  return new Parser(source).parse();
}

interface IPositioned<T> {
  node: T;
  pos: number;
}

/** Where a span's start and end value tokens begin (the same token for a single value). */
interface ISpanAt {
  start: number;
  end: number;
}

/** A selector with the positions its static checks report (spec §8, *Error positions*). */
interface IParsedSelector extends IPositioned<ISelector> {
  /** Each written span's value tokens, in source order. */
  at: ISpanAt[];
  /** Where a stride's interval count begins. */
  stride?: { interval: number };
}

class Parser {
  private readonly src: string;
  private pos = 0;
  private readonly warnings: IIssue[] = [];
  /**
   *  The earliest rule error found so far in the branch. A rule error does not stop
   *  the parse: the branch reads on, and its earliest error wins, a later grammar error
   *  included (spec §8, *Error positions*).
   */
  private pending: DTRExpSyntaxError | undefined;

  constructor(source: string) {
    this.src = source;
  }

  parse(): IParseResult {
    const expressions: IExpressionIR[] = [];
    for (;;) {
      expressions.push(this.parseExpression());
      this.skipSpaces();
      if (this.pos >= this.src.length) break;
      // parseExpression only stops mid-string at '|'
      this.pos++;
    }
    return { ir: { expressions }, warnings: this.warnings };
  }

  // -------------------------------
  // expression = component ∩ …
  // -------------------------------

  private parseExpression(): IExpressionIR {
    const selectors: IParsedSelector[] = [];
    let time: ITimeRange[] | undefined;
    let cadence: IPositioned<ICadence> | undefined;
    let bounds: IPositioned<IBounds> | undefined;

    for (;;) {
      this.skipSpaces();
      const ch = this.src[this.pos];
      if (ch === undefined || ch === '|') break;
      if (ch === 'T') {
        if (time) this.record('duplicate-designator', 'Duplicate T component', this.pos);
        time = this.parseTime();
      } else if (SELECTOR_UNITS.includes(ch)) {
        const selector = this.parseSelector(ch as Unit);
        if (selectors.some((s) => s.node.unit === selector.node.unit)) {
          this.record(
            'duplicate-designator',
            `Duplicate designator '${selector.node.unit}'`,
            selector.pos
          );
        }
        selectors.push(selector);
      } else if (ch === '*' || isDigit(ch)) {
        const pos = this.pos;
        const node = this.parseDateComponent();
        if ('period' in node) {
          if (cadence) this.record('duplicate-cadence', 'More than one cadence', pos);
          cadence = { node, pos };
        } else {
          if (bounds) this.record('duplicate-bounds', 'More than one bounds component', pos);
          bounds = { node, pos };
        }
      } else if (ch === '!') {
        this.fail(
          'misplaced-exclusion',
          "'!' is valid only immediately after a designator",
          this.pos
        );
      } else {
        this.fail('unexpected-char', `Unexpected character '${ch}'`, this.pos);
      }
    }

    // the error sits where a component was required: past any spaces, at the `|` or the end
    if (!time && selectors.length === 0 && !cadence && !bounds) {
      this.fail('empty-expression', 'Empty expression', this.pos);
    }
    // the branch is complete: D's domain is known now, and the earliest error wins
    this.validateDays(selectors);
    if (this.pending) throw this.pending;
    this.lintUnsatisfiable(selectors);
    const expr: IExpressionIR = { selectors: selectors.map((s) => s.node) };
    if (time) expr.time = { ranges: time };
    if (cadence) expr.cadence = cadence.node;
    if (bounds) expr.bounds = bounds.node;
    return expr;
  }

  // -------------------------------
  // discrete selectors
  // -------------------------------

  private parseSelector(unit: Unit): IParsedSelector {
    const pos = this.pos;
    this.pos++;
    let exclude = false;
    if (this.src[this.pos] === '!') {
      exclude = true;
      this.pos++;
    }
    const items = [this.parseSpan(unit)];
    while (this.src[this.pos] === ',') {
      this.pos++;
      items.push(this.parseSpan(unit));
    }
    // a bare `*` is the whole domain on its own, never a list item: a list containing it
    // is just `M*`, and an exclusion takes a value list, so `M!*` excludes nothing
    // nameable; the range `M*:*` is no bare `*` and may stand in either (spec §3)
    const bare = items.find((item) => !item.isRange && item.span.start === null);
    if (bare && exclude) {
      this.fail(
        'star-in-exclusion',
        `An exclusion takes a value list, not a bare '*' — '${unit}!*:*' excludes the whole domain`,
        bare.at.start
      );
    }
    if (bare && items.length > 1) {
      this.fail(
        'star-in-list',
        `Bare '*' cannot appear in a list — '${unit}*' already covers the domain`,
        bare.at.start
      );
    }

    const first = items[0] as (typeof items)[number];
    const selector: ISelector = { unit, exclude, spans: items.map((item) => item.span) };
    const parsed: IParsedSelector = { node: selector, pos, at: items.map((item) => item.at) };
    const next = this.src[this.pos];
    if (next === '#') {
      if (exclude || items.length > 1 || first.isRange) {
        this.fail('bad-ordinal', 'Ordinal applies to a single plain value', this.pos);
      }
      selector.ordinal = this.parseOrdinal(unit, first.span);
    } else if (next === '/') {
      if (exclude)
        this.fail('stride-with-exclusion', 'A stride cannot follow an exclusion', this.pos);
      if (items.length > 1) this.fail('stride-on-list', 'A stride cannot follow a list', this.pos);
      parsed.stride = { interval: this.pos + 1 };
      selector.stride = this.parseStrideTail(unit, first.span, first.isRange);
      selector.spans = [];
    }
    return parsed;
  }

  private parseSpan(unit: Unit): { span: ISpan; isRange: boolean; at: ISpanAt } {
    const startPos = this.pos;
    const start = this.parseEndpoint(unit);
    if (this.src[this.pos] === ':') {
      this.pos++;
      const endPos = this.pos;
      const end = this.parseEndpoint(unit);
      // Y is the one designator with no edge to wrap around: a range end before its
      // start is wrong at the end (spec §3)
      // Stryker disable next-line ConditionalExpression: equivalent — a null start coerces to 0, and 0 > end only for a negative end, already an error at the same token; the guard only narrows types.
      if (unit === 'Y' && start !== null && end !== null && start > end) {
        this.record('backwards-range', `Backwards range in 'Y' — years cannot wrap`, endPos);
      }
      return { span: { start, end }, isRange: true, at: { start: startPos, end: endPos } };
    }
    return { span: { start, end: start }, isRange: false, at: { start: startPos, end: startPos } };
  }

  private parseEndpoint(unit: Unit): number | null {
    if (this.src[this.pos] === '*') {
      this.pos++;
      return null;
    }
    // the value token begins at its sign (spec §8, *Error positions*)
    const pos = this.pos;
    let sign = 1;
    if (this.src[this.pos] === '-') {
      sign = -1;
      this.pos++;
    }
    const value = this.readInt(`a value for '${unit}'`, pos);
    if (sign === -1 && value === 0) this.record('bad-value', "'-0' is not a value", pos);
    // D's domain depends on its scope, which may come later in the branch
    if (unit !== 'D') this.checkValue(unit, sign * value, pos, domain(unit, 31));
    return sign * value;
  }

  private parseOrdinal(unit: Unit, span: ISpan): number {
    this.pos++;
    if (unit !== 'E')
      this.fail('ordinal-not-weekday', "Ordinal '#' is valid only on 'E'", this.pos - 1);
    if (span.start === null)
      this.fail('bad-ordinal', "Ordinal requires a weekday value, not '*'", this.pos - 1);
    const pos = this.pos;
    let sign = 1;
    if (this.src[this.pos] === '-') {
      sign = -1;
      this.pos++;
    }
    const n = this.readInt('an ordinal', pos);
    if (n === 0) this.record('ordinal-zero', 'Ordinal cannot be zero', pos);
    if (n > 5) this.record('ordinal-range', 'Ordinal must be within -5…-1 or 1…5', pos);
    return sign * n;
  }

  private parseStrideTail(unit: Unit, span: ISpan, isRange: boolean): IStride {
    const opPos = this.pos;
    this.pos++;
    // 0 is a legal anchor for the 0-based units (H0/4); domain checks catch it elsewhere
    if (span.start === null || span.start < 0) {
      this.record(
        'anchorless-stride',
        'A stride start must be an explicit non-negative value',
        opPos
      );
    }
    // a literal 0 end wraps like any other on 0-based domains (`H22:0/2`), and a wrap
    // range takes no stride (spec §3); Y's backwards range is already wrong at its end,
    // which comes first
    if (
      // Stryker disable next-line ConditionalExpression: equivalent — a null start already failed as anchorless above, and `null > end` is false for every end ≥ 0; the guard only narrows types.
      span.start !== null &&
      span.end !== null &&
      span.end >= 0 &&
      span.start > span.end
    ) {
      this.record('stride-on-wrap', 'A stride range cannot wrap', opPos);
    }
    const intervalPos = this.pos;
    const interval = this.readInt('a stride interval');
    if (interval < 2) {
      this.record('stride-interval-min', 'Stride interval must be at least 2', intervalPos);
    }
    // D's domain size depends on its scope, so its interval waits for the branch
    if (unit !== 'Y' && unit !== 'D')
      this.checkInterval(unit, interval, intervalPos, domain(unit, 31));
    let duration = 1;
    if (this.src[this.pos] === '/') {
      this.pos++;
      const durationPos = this.pos;
      duration = this.readInt('a stride duration');
      if (duration < 1 || duration >= interval) {
        this.record(
          'stride-duration',
          'Stride duration must be ≥ 1 and smaller than the interval',
          durationPos
        );
      }
    }
    return { start: span.start as number, end: isRange ? span.end : null, interval, duration };
  }

  // -------------------------------
  // time of day — T
  // -------------------------------

  private parseTime(): ITimeRange[] {
    this.pos++;
    const ranges: ITimeRange[] = [];
    for (;;) {
      const start = this.parseTimeValue(false);
      if (this.src[this.pos] === ':') {
        this.pos++;
        const opPos = this.pos;
        const end = this.parseTimeValue(true);
        if (end.ms === start.ms) this.record('empty-time-range', 'Empty time range', opPos);
        // Stryker disable next-line EqualityOperator: equivalent — equal endpoints are recorded as empty-time-range above, which the branch then throws.
        if (end.ms > start.ms) {
          ranges.push({ startMs: start.ms, endMs: end.ms });
        } else {
          // midnight wrap, split within the same day (spec §4)
          ranges.push({ startMs: 0, endMs: end.ms });
          ranges.push({ startMs: start.ms, endMs: MS_PER_DAY });
        }
      } else {
        ranges.push({ startMs: start.ms, endMs: start.ms + start.unitMs });
      }
      if (this.src[this.pos] !== ',') break;
      this.pos++;
    }
    return ranges;
  }

  private parseTimeValue(isEnd: boolean): { ms: number; unitMs: number } {
    const pos = this.pos;
    const digits = this.readDigits();
    if (digits.length !== 2 && digits.length !== 4 && digits.length !== 6) {
      this.record('bad-time-value', 'Time values are hh, hhmm or hhmmss[.sss]', pos);
    }
    const hh = Number(digits.slice(0, 2));
    // Stryker disable next-line ConditionalExpression: equivalent — for 2-digit values slice(2,4) is '' and Number('') is 0, the same fallback.
    const mm = digits.length >= 4 ? Number(digits.slice(2, 4)) : 0;
    // Stryker disable next-line ConditionalExpression: equivalent — same '' → 0 coincidence for the seconds slice.
    const ss = digits.length === 6 ? Number(digits.slice(4, 6)) : 0;
    let msPart = 0;
    let unitMs = digits.length === 2 ? 3_600_000 : digits.length === 4 ? 60_000 : 1000;
    if (digits.length === 6 && this.src[this.pos] === '.') {
      // the fraction is its own token, from its '.'
      const fracPos = this.pos;
      this.pos++;
      const frac = this.readDigits();
      if (frac.length !== 3)
        this.record('bad-time-value', 'Milliseconds are exactly 3 digits', fracPos);
      msPart = Number(frac);
      unitMs = 1;
    }
    // hour 24 exists only as the exact 4-digit token '2400' in range-end position (spec §4)
    const is24 = isEnd && hh === 24 && digits.length === 4 && mm === 0;
    if (!is24 && hh > 23) {
      this.record(
        'bad-time-value',
        `Hour out of range: ${hh} (hour 24 is written exactly '2400', and only as a range end)`,
        pos
      );
    }
    if (mm > 59) this.record('bad-time-value', `Minute out of range: ${mm}`, pos);
    if (ss > 59) this.record('bad-time-value', `Second out of range: ${ss}`, pos);
    return { ms: hh * 3_600_000 + mm * 60_000 + ss * 1000 + msPart, unitMs };
  }

  // -------------------------------
  // date literals: bounds & cadences
  // -------------------------------

  private parseDateComponent(): ICadence | IBounds {
    if (this.src[this.pos] === '*') {
      this.pos++;
      if (this.src[this.pos] !== ':') this.fail('bad-bounds', "Expected ':' after '*'", this.pos);
      this.pos++;
      return { start: null, end: this.parseDateLiteral() };
    }
    const start = this.parseDateLiteral();
    const next = this.src[this.pos];
    if (next === '/') return this.parseCadenceTail(start);
    if (next === ':') {
      this.pos++;
      if (this.src[this.pos] === '*') {
        this.pos++;
        return { start, end: null };
      }
      const endPos = this.pos;
      const end = this.parseDateLiteral();
      // backwards when the first literal's span begins at or after the last one's span
      // ends; mixed precision compares those two edges, never the two starts (spec §6)
      if (literalPseudo(start) >= literalSpanEnd(end)) {
        this.record('backwards-bounds', 'Bounds range is backwards', endPos);
      }
      return { start, end };
    }
    return { start, end: start };
  }

  /** A date literal is exactly 8 digits, its `T` part included in the token (spec §8). */
  private parseDateLiteral(): IDateLiteral {
    const pos = this.pos;
    const digits = this.readDigits();
    if (digits.length !== 8) {
      this.record('bad-date-literal', 'Date literals are YYYYMMDD[Thhmm[ss]]', pos);
    }
    const literal: IDateLiteral = {
      year: Number(digits.slice(0, 4)),
      month: Number(digits.slice(4, 6)),
      day: Number(digits.slice(6, 8))
    };
    if (this.src[this.pos] === 'T') {
      this.pos++;
      const time = this.readDigits();
      if (time.length !== 4 && time.length !== 6) {
        this.record('bad-date-literal', 'Date-literal time is Thhmm or Thhmmss', pos);
      }
      literal.hour = Number(time.slice(0, 2));
      literal.minute = Number(time.slice(2, 4));
      if (time.length === 6) literal.second = Number(time.slice(4, 6));
      if (
        literal.hour > 23 ||
        literal.minute > 59 ||
        // Stryker disable next-line ConditionalExpression: equivalent — `undefined > 59` is false, so the guard only narrows types.
        (literal.second !== undefined && literal.second > 59)
      ) {
        this.record('bad-date-literal', 'Time of day out of range in date literal', pos);
      }
    }
    if (
      literal.year < 1 ||
      literal.month < 1 ||
      literal.month > 12 ||
      literal.day < 1 ||
      literal.day > daysInMonth(literal.year, literal.month)
    ) {
      this.record('bad-date-literal', `'${digits}' is not a real calendar date`, pos);
    }
    return literal;
  }

  private parseCadenceTail(anchor: IDateLiteral): ICadence {
    this.pos++;
    const periodPos = this.pos;
    const period = this.readInt('a cadence period');
    if (period < 1) {
      this.record('zero-cadence-period', 'Cadence period must be at least 1', periodPos);
    }
    const periodUnit = this.readCadenceUnit();
    let duration = 1;
    let durationUnit = periodUnit;
    // an implied duration has no token of its own, so its period answers for it
    let durationPos = periodPos;
    if (this.src[this.pos] === '/') {
      this.pos++;
      durationPos = this.pos;
      duration = this.readInt('a cadence duration');
      durationUnit = this.readCadenceUnit();
    }
    const monthish = (u: CadenceUnit): boolean => u === 'M' || u === 'Y';
    if (monthish(durationUnit) && !monthish(periodUnit)) {
      this.record(
        'cadence-duration-unit',
        'A month/year duration requires a month/year period',
        durationPos
      );
    }
    // same-unit lengths compare exactly (`11M/10M`); mixed units conservatively (spec §5.2)
    const tooLong =
      durationUnit === periodUnit
        ? duration >= period
        : duration * MAX_MINUTES[durationUnit] >= period * MIN_MINUTES[periodUnit];
    if (duration < 1 || tooLong) {
      this.record(
        'cadence-duration',
        'Cadence duration must be smaller than its period (a 1-unit period needs an explicit smaller-unit duration)',
        durationPos
      );
    }
    return { anchor, period, periodUnit, duration, durationUnit };
  }

  private readCadenceUnit(): CadenceUnit {
    const ch = this.src[this.pos];
    // Stryker disable next-line ConditionalExpression: equivalent — includes(undefined) is false, so the undefined guard is redundant at runtime.
    if (ch === undefined || !CADENCE_UNITS.includes(ch)) {
      this.fail('bad-cadence-unit', 'Cadence units are Y, M, W, D, H or m', this.pos);
    }
    this.pos++;
    return ch as CadenceUnit;
  }

  // -------------------------------
  // static validation
  // -------------------------------

  /** A value out of its domain is an error at the value (spec §3.1). */
  private checkValue(unit: Unit, v: number, at: number, { min, max }: IDomain): void {
    // Y has no edge to count back from (spec §3.1) — negatives are meaningless there
    if (v < 0 && unit === 'Y') {
      this.record('out-of-domain', `Negative values are not valid for 'Y'`, at);
      return;
    }
    const ok = v < 0 ? v >= -(max - min + 1) : v >= min && v <= max;
    if (!ok) this.record('out-of-domain', `Value ${v} out of domain for '${unit}'`, at);
  }

  /** A stride interval wider than its domain is an error at the interval (spec §5.1). */
  private checkInterval(unit: Unit, interval: number, at: number, { min, max }: IDomain): void {
    if (interval > max - min + 1) {
      this.record(
        'stride-interval-domain',
        `Stride interval ${interval} exceeds the '${unit}' domain — use a cadence`,
        at
      );
    }
  }

  /**
   *  The checks that wait for the whole branch: D's domain, set by a co-present M, Q or
   *  Y (spec §2), and every selector's wrap ranges split at the domain edge.
   */
  private validateDays(selectors: IParsedSelector[]): void {
    const present = new Set(selectors.map((s) => s.node.unit));
    const days = domain(
      'D',
      present.has('M') ? 31 : present.has('Q') ? 92 : present.has('Y') ? 366 : 31
    );
    for (const sel of selectors) {
      const { node } = sel;
      const isDay = node.unit === 'D';
      const check = (v: number | null, at: number): void => {
        if (isDay && v !== null) this.checkValue('D', v, at, days);
      };
      const spans: ISpan[] = [];
      node.spans.forEach((span, i) => {
        const at = sel.at[i] as ISpanAt;
        check(span.start, at.start);
        check(span.end, at.end);
        if (
          // Stryker disable next-line ConditionalExpression: equivalent — a null start coerces to 0 in `span.start > span.end`, and 0 > end is false for every end that passed `end >= 0`; the guard only narrows types.
          span.start !== null &&
          span.end !== null &&
          // wrap is decided on literal non-negative endpoints only (spec §3): a negative
          // endpoint resolves per instance and never wraps. `start > end >= 0` implies
          // `start > 0`, so no separate start check is needed — and on 0-based domains a
          // literal 0 end wraps like any other (`H22:0` = hours 22, 23, 0).
          span.end >= 0 &&
          span.start > span.end
        ) {
          // wrap range (spec §3): start → domain edge, plus domain start → end
          spans.push({ start: span.start, end: null }, { start: null, end: span.end });
        } else {
          spans.push(span);
        }
      });
      // `*:*` is the whole domain wherever it stands, so a list holding it is `M*`
      // (or, excluded, `M!*:*`) — the one shape the rest of the library knows (spec §3.1)
      node.spans = spans.some((s) => s.start === null && s.end === null)
        ? [{ start: null, end: null }]
        : spans;
      if (isDay && node.stride) {
        const at = sel.at[0] as ISpanAt;
        check(node.stride.start, at.start);
        check(node.stride.end, at.end);
        this.checkInterval(
          'D',
          node.stride.interval,
          (sel.stride as { interval: number }).interval,
          days
        );
      }
    }
  }

  /**
   *  The spec §9.1 required minimum, as one test: a selector warns when the values it
   *  selects are empty in every parent instance its co-present selectors allow, and
   *  `M` warns when its months miss every selected quarter. Exclusions resolve as
   *  complements and strides expand to their values, so `M!1:12`, `M1:2/2 Q2`,
   *  `D-30 M2` and `W53 Y2021:2022/2` all fall out of the same check. The selected
   *  years narrow `W` and year-scoped `D` whatever their spans (the spec requires it
   *  over closed spans of at most 1,000 years and allows it beyond), but never `D`
   *  while `W` makes `Y` the week-year: `D366 W1 Y2025` covers Dec 31 2024.
   *  At most one warning per expression: once one selector is dead, all of it is.
   */
  private lintUnsatisfiable(selectors: IParsedSelector[]): void {
    const of = (unit: Unit): IParsedSelector | undefined =>
      selectors.find((s) => s.node.unit === unit);
    const warn = (sel: IParsedSelector, message: string): void => {
      this.warnings.push({
        code: 'unsatisfiable',
        message: `${message} — this expression covers nothing`,
        position: sel.pos
      });
    };
    const dead = (sel: IParsedSelector, maxima: Iterable<number>): boolean =>
      [...maxima].every((max) => selectedValues(sel.node, max).length === 0);

    for (const sel of selectors) {
      const max = FIXED_MAX[sel.node.unit];
      if (max !== undefined && dead(sel, [max])) {
        return warn(sel, `'${sel.node.unit}' selects no value in its domain`);
      }
    }

    const month = of('M');
    const quarter = of('Q');
    const quarters = quarter ? selectedValues(quarter.node, 4) : [1, 2, 3, 4];
    const months = (month ? selectedValues(month.node, 12) : ALL_MONTHS).filter((m) =>
      quarters.includes(quarterOf(m))
    );
    if (months.length === 0) {
      return warn(
        month as IParsedSelector,
        'The selected month(s) never fall inside the selected quarter(s)'
      );
    }

    const year = of('Y');
    const week = of('W');
    // the sizes the selected years give a unit, read only where a W or D asks
    const overYears = (size: (year: number) => number): Set<number> =>
      sizesOver(selectedValues((year as IParsedSelector).node, 9999), size);
    if (week && dead(week, year ? overYears(weeksInIsoYear) : [52, 53])) {
      return warn(week, 'The selected week(s) never occur in the selected year(s)');
    }

    const day = of('D');
    if (!day) return;
    // D's scope is the nearest of M, Q and Y present, else the month (spec §2)
    const maxima =
      month || (!quarter && !year)
        ? months.flatMap((m) => MONTH_DAYS[m - 1] as number[])
        : quarter
          ? quarters.flatMap((q) => QUARTER_DAYS[q - 1] as number[])
          : week
            ? [365, 366]
            : overYears(daysInYear);
    if (dead(day, new Set(maxima))) {
      warn(day, 'The selected day(s) never occur in the selected scope');
    }
  }

  // -------------------------------
  // scanning primitives
  // -------------------------------

  private skipSpaces(): void {
    while (this.src[this.pos] === ' ') this.pos++;
  }

  private readDigits(): string {
    const start = this.pos;
    while (isDigit(this.src[this.pos])) this.pos++;
    return this.src.slice(start, this.pos);
  }

  /**
   *  Reads an integer at the cursor. `tokenPos` is where its token begins when a sign
   *  leads it; an integer above the limit is an error there (spec §8).
   */
  private readInt(what: string, tokenPos = this.pos): number {
    const pos = this.pos;
    const digits = this.readDigits();
    if (digits.length === 0) this.fail('expected-value', `Expected ${what}`, pos);
    const value = Number(digits);
    if (value > INTEGER_LIMIT) {
      this.record('integer-limit', `Integer above the limit of ${INTEGER_LIMIT}`, tokenPos);
    }
    return value;
  }

  /**
   *  Spec §8 counts positions in code points, and this one is a UTF-16 index. The two
   *  agree: the parser steps only over ASCII tokens, so the first character outside
   *  them is itself the error, and every character before a position is ASCII.
   */
  private fail(code: string, message: string, position: number): never {
    this.record(code, message, position);
    throw this.pending;
  }

  /** Notes a rule error and reads on; the earliest one the branch finds is its error. */
  private record(code: string, message: string, position: number): void {
    if (!this.pending || position < this.pending.position) {
      this.pending = new DTRExpSyntaxError(code, message, this.src, position);
    }
  }
}

function isDigit(ch: string | undefined): boolean {
  // Stryker disable next-line ConditionalExpression: equivalent — `undefined >= '0'` is false; the guard only narrows types.
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/**
 *  The values a selector picks in one parent instance whose largest value is `max`:
 *  `*` and negatives resolved against that instance, a stride expanded to its values,
 *  an exclusion taken as the complement (spec §3, §5.1). Wrap ranges were split at
 *  parse, so a span whose resolved start passes its end selects nothing there.
 */
export function selectedValues(selector: ISelector, max: number): number[] {
  const min = 'Hms'.includes(selector.unit) ? 0 : 1;
  const resolve = (v: number | null, edge: number): number =>
    v === null ? edge : v < 0 ? max + 1 + v : v;
  const hit = new Uint8Array(max + 1);
  const stride = selector.stride;
  if (stride) {
    const end = Math.min(resolve(stride.end, max), max);
    for (let v = stride.start; v <= end; v++) {
      if ((v - stride.start) % stride.interval < stride.duration) hit[v] = 1;
    }
  } else {
    for (const span of selector.spans) {
      const end = Math.min(resolve(span.end, max), max);
      for (let v = Math.max(resolve(span.start, min), min); v <= end; v++) hit[v] = 1;
    }
  }
  const out: number[] = [];
  for (let v = min; v <= max; v++) {
    if ((hit[v] === 1) !== selector.exclude) out.push(v);
  }
  return out;
}

/**
 *  The distinct sizes `size` gives the selected years: 52 or 53 weeks, 365 or 366 days.
 *  There are two at most, so the scan stops once it has both.
 */
function sizesOver(years: number[], size: (year: number) => number): Set<number> {
  const out = new Set<number>();
  for (const year of years) {
    out.add(size(year));
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — an early exit only; a size already in the set is never added twice.
    if (out.size === 2) break;
  }
  return out;
}

/** Comparable local pseudo-epoch of a date literal's start. */
export function literalPseudo(literal: IDateLiteral): number {
  return (
    epochDay(literal.year, literal.month, literal.day) * MS_PER_DAY +
    (literal.hour ?? 0) * 3_600_000 +
    (literal.minute ?? 0) * 60_000 +
    (literal.second ?? 0) * 1000
  );
}

/** End of a literal's span, exclusive: whole day, or minute/second with a T-part (spec §6). */
export function literalSpanEnd(literal: IDateLiteral): number {
  const spanMs =
    literal.hour === undefined ? MS_PER_DAY : literal.second === undefined ? 60_000 : 1000;
  return literalPseudo(literal) + spanMs;
}
