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
import { daysInMonth, epochDay } from '../utils/index.js';

const MS_PER_DAY = 86_400_000;
const SELECTOR_UNITS = 'YQMWDEHms';
const CADENCE_UNITS = 'YMWDHm';

/** Conservative day-lengths for the cadence `duration < period` check (spec §5.2). */
const MAX_DAYS: Record<CadenceUnit, number> = { Y: 366, M: 31, W: 7, D: 1, H: 1 / 24, m: 1 / 1440 };
const MIN_DAYS: Record<CadenceUnit, number> = { Y: 365, M: 28, W: 7, D: 1, H: 1 / 24, m: 1 / 1440 };

/** Longest instance of each month across all years, for the unsatisfiability lint. */
const MONTH_MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

class Parser {
  private readonly src: string;
  private pos = 0;
  private readonly warnings: IIssue[] = [];

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
    const startPos = this.pos;
    const selectors: IPositioned<ISelector>[] = [];
    let time: ITimeRange[] | undefined;
    let cadence: IPositioned<ICadence> | undefined;
    let bounds: IPositioned<IBounds> | undefined;

    for (;;) {
      this.skipSpaces();
      const ch = this.src[this.pos];
      if (ch === undefined || ch === '|') break;
      if (ch === 'T') {
        if (time) this.fail('duplicate-designator', 'Duplicate T component', this.pos);
        time = this.parseTime();
      } else if (SELECTOR_UNITS.includes(ch)) {
        const pos = this.pos;
        const selector = this.parseSelector(ch as Unit);
        if (selectors.some((s) => s.node.unit === selector.unit)) {
          this.fail('duplicate-designator', `Duplicate designator '${selector.unit}'`, pos);
        }
        selectors.push({ node: selector, pos });
      } else if (ch === '*' || isDigit(ch)) {
        const pos = this.pos;
        const parsed = this.parseDateComponent();
        if ('period' in parsed) {
          if (cadence) this.fail('duplicate-cadence', 'More than one cadence', pos);
          cadence = { node: parsed, pos };
        } else {
          if (bounds) this.fail('duplicate-bounds', 'More than one bounds component', pos);
          bounds = { node: parsed, pos };
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

    if (!time && selectors.length === 0 && !cadence && !bounds) {
      this.fail('empty-expression', 'Empty expression', startPos);
    }
    this.validateExpression(selectors, bounds);
    const expr: IExpressionIR = { selectors: selectors.map((s) => s.node) };
    if (time) expr.time = { ranges: time };
    if (cadence) expr.cadence = cadence.node;
    if (bounds) expr.bounds = bounds.node;
    return expr;
  }

  // -------------------------------
  // discrete selectors
  // -------------------------------

  private parseSelector(unit: Unit): ISelector {
    this.pos++;
    let exclude = false;
    if (this.src[this.pos] === '!') {
      exclude = true;
      this.pos++;
    }
    const spans: ISpan[] = [];
    const first = this.parseSpan(unit);
    spans.push(first.span);
    while (this.src[this.pos] === ',') {
      this.pos++;
      spans.push(this.parseSpan(unit).span);
    }

    const selector: ISelector = { unit, exclude, spans };
    const next = this.src[this.pos];
    if (next === '#') {
      if (exclude || spans.length > 1 || first.isRange) {
        this.fail('bad-ordinal', 'Ordinal applies to a single plain value', this.pos);
      }
      selector.ordinal = this.parseOrdinal(unit, first.span);
    } else if (next === '/') {
      if (exclude)
        this.fail('stride-with-exclusion', 'A stride cannot follow an exclusion', this.pos);
      if (spans.length > 1) this.fail('stride-on-list', 'A stride cannot follow a list', this.pos);
      selector.stride = this.parseStrideTail(first.span, first.isRange);
      selector.spans = [];
    }
    return selector;
  }

  private parseSpan(unit: Unit): { span: ISpan; isRange: boolean } {
    const start = this.parseEndpoint(unit);
    if (this.src[this.pos] === '-') {
      this.pos++;
      return { span: { start, end: this.parseEndpoint(unit) }, isRange: true };
    }
    return { span: { start, end: start }, isRange: false };
  }

  private parseEndpoint(unit: Unit): number | null {
    if (this.src[this.pos] === '*') {
      this.pos++;
      return null;
    }
    let sign = 1;
    if (this.src[this.pos] === '-') {
      sign = -1;
      this.pos++;
    }
    const startPos = this.pos;
    const value = this.readInt(`a value for '${unit}'`);
    if (sign === -1 && value === 0) this.fail('bad-value', "'-0' is not a value", startPos);
    return sign * value;
  }

  private parseOrdinal(unit: Unit, span: ISpan): number {
    this.pos++;
    if (unit !== 'E')
      this.fail('ordinal-not-weekday', "Ordinal '#' is valid only on 'E'", this.pos - 1);
    if (span.start === null)
      this.fail('bad-ordinal', "Ordinal requires a weekday value, not '*'", this.pos - 1);
    let sign = 1;
    if (this.src[this.pos] === '-') {
      sign = -1;
      this.pos++;
    }
    const pos = this.pos;
    const n = this.readInt('an ordinal');
    if (n === 0) this.fail('ordinal-zero', 'Ordinal cannot be zero', pos);
    if (n > 5) this.fail('ordinal-range', 'Ordinal must be within -5…-1 or 1…5', pos);
    return sign * n;
  }

  private parseStrideTail(span: ISpan, isRange: boolean): IStride {
    const opPos = this.pos;
    this.pos++;
    // 0 is a legal anchor for the 0-based units (H0/4); domain checks catch it elsewhere
    if (span.start === null || span.start < 0) {
      this.fail(
        'anchorless-stride',
        'A stride start must be an explicit non-negative value',
        opPos
      );
    }
    const interval = this.readInt('a stride interval');
    if (interval < 2) this.fail('stride-interval-min', 'Stride interval must be at least 2', opPos);
    let duration = 1;
    if (this.src[this.pos] === '/') {
      this.pos++;
      duration = this.readInt('a stride duration');
      if (duration < 1 || duration >= interval) {
        this.fail(
          'stride-duration',
          'Stride duration must be ≥ 1 and smaller than the interval',
          opPos
        );
      }
    }
    return { start: span.start, end: isRange ? span.end : null, interval, duration };
  }

  // -------------------------------
  // time of day — T
  // -------------------------------

  private parseTime(): ITimeRange[] {
    this.pos++;
    const ranges: ITimeRange[] = [];
    for (;;) {
      const start = this.parseTimeValue(false);
      if (this.src[this.pos] === '-') {
        this.pos++;
        const opPos = this.pos;
        const end = this.parseTimeValue(true);
        if (end.ms === start.ms) this.fail('empty-time-range', 'Empty time range', opPos);
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
      this.fail('bad-time-value', 'Time values are hh, hhmm or hhmmss[.sss]', pos);
    }
    const hh = Number(digits.slice(0, 2));
    const mm = digits.length >= 4 ? Number(digits.slice(2, 4)) : 0;
    const ss = digits.length === 6 ? Number(digits.slice(4, 6)) : 0;
    let msPart = 0;
    let unitMs = digits.length === 2 ? 3_600_000 : digits.length === 4 ? 60_000 : 1000;
    if (digits.length === 6 && this.src[this.pos] === '.') {
      this.pos++;
      const frac = this.readDigits();
      if (frac.length !== 3)
        this.fail('bad-time-value', 'Milliseconds are exactly 3 digits', this.pos);
      msPart = Number(frac);
      unitMs = 1;
    }
    const is24 = hh === 24 && mm === 0 && ss === 0 && msPart === 0;
    if (is24 && !isEnd) this.fail('bad-time-value', "'2400' is valid only as a range end", pos);
    if (!is24 && hh > 23) this.fail('bad-time-value', `Hour out of range: ${hh}`, pos);
    if (mm > 59) this.fail('bad-time-value', `Minute out of range: ${mm}`, pos);
    if (ss > 59) this.fail('bad-time-value', `Second out of range: ${ss}`, pos);
    return { ms: hh * 3_600_000 + mm * 60_000 + ss * 1000 + msPart, unitMs };
  }

  // -------------------------------
  // date literals: bounds & cadences
  // -------------------------------

  private parseDateComponent(): ICadence | IBounds {
    if (this.src[this.pos] === '*') {
      this.pos++;
      if (this.src[this.pos] !== '-') this.fail('bad-bounds', "Expected '-' after '*'", this.pos);
      this.pos++;
      return { start: null, end: this.parseDateLiteral() };
    }
    const start = this.parseDateLiteral();
    const next = this.src[this.pos];
    if (next === '/') return this.parseCadenceTail(start);
    if (next === '-') {
      this.pos++;
      if (this.src[this.pos] === '*') {
        this.pos++;
        return { start, end: null };
      }
      return { start, end: this.parseDateLiteral() };
    }
    return { start, end: start };
  }

  private parseDateLiteral(): IDateLiteral {
    const pos = this.pos;
    const digits = this.readDigits();
    if (digits.length !== 8) {
      this.fail('bad-date-literal', 'Date literals are YYYYMMDD[Thhmm[ss]]', pos);
    }
    const literal: IDateLiteral = {
      year: Number(digits.slice(0, 4)),
      month: Number(digits.slice(4, 6)),
      day: Number(digits.slice(6, 8))
    };
    if (this.src[this.pos] === 'T') {
      this.pos++;
      const timePos = this.pos;
      const time = this.readDigits();
      if (time.length !== 4 && time.length !== 6) {
        this.fail('bad-date-literal', 'Date-literal time is Thhmm or Thhmmss', timePos);
      }
      literal.hour = Number(time.slice(0, 2));
      literal.minute = Number(time.slice(2, 4));
      if (time.length === 6) literal.second = Number(time.slice(4, 6));
      if (
        literal.hour > 23 ||
        literal.minute > 59 ||
        (literal.second !== undefined && literal.second > 59)
      ) {
        this.fail('bad-date-literal', 'Time of day out of range in date literal', timePos);
      }
    }
    if (
      literal.month < 1 ||
      literal.month > 12 ||
      literal.day < 1 ||
      literal.day > daysInMonth(literal.year, literal.month)
    ) {
      this.fail('bad-date-literal', `'${digits}' is not a real calendar date`, pos);
    }
    return literal;
  }

  private parseCadenceTail(anchor: IDateLiteral): ICadence {
    const opPos = this.pos;
    this.pos++;
    const period = this.readInt('a cadence period');
    if (period < 1) this.fail('zero-cadence-period', 'Cadence period must be at least 1', opPos);
    const periodUnit = this.readCadenceUnit();
    let duration = 1;
    let durationUnit = periodUnit;
    if (this.src[this.pos] === '/') {
      this.pos++;
      duration = this.readInt('a cadence duration');
      durationUnit = this.readCadenceUnit();
    }
    const monthish = (u: CadenceUnit): boolean => u === 'M' || u === 'Y';
    if (monthish(durationUnit) && !monthish(periodUnit)) {
      this.fail(
        'cadence-duration-unit',
        'A month/year duration requires a month/year period',
        opPos
      );
    }
    if (duration < 1 || duration * MAX_DAYS[durationUnit] >= period * MIN_DAYS[periodUnit]) {
      this.fail(
        'cadence-duration',
        'Cadence duration must be smaller than its period (a 1-unit period needs an explicit smaller-unit duration)',
        opPos
      );
    }
    return { anchor, period, periodUnit, duration, durationUnit };
  }

  private readCadenceUnit(): CadenceUnit {
    const ch = this.src[this.pos];
    if (ch === undefined || !CADENCE_UNITS.includes(ch)) {
      this.fail('bad-cadence-unit', 'Cadence units are Y, M, W, D, H or m', this.pos);
    }
    this.pos++;
    return ch as CadenceUnit;
  }

  // -------------------------------
  // post-parse static validation
  // -------------------------------

  private validateExpression(
    selectors: IPositioned<ISelector>[],
    bounds: IPositioned<IBounds> | undefined
  ): void {
    const present = new Set(selectors.map((s) => s.node.unit));
    const dayMax = present.has('M') ? 31 : present.has('Q') ? 92 : present.has('Y') ? 366 : 31;
    const domain = (unit: Unit): { min: number; max: number } => {
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
    };

    for (const { node, pos } of selectors) {
      const { min, max } = domain(node.unit);
      const size = max - min + 1;
      const checkValue = (v: number | null): void => {
        if (v === null) return;
        const ok = v < 0 ? v >= -size : v >= min && v <= max;
        if (!ok) this.fail('out-of-domain', `Value ${v} out of domain for '${node.unit}'`, pos);
      };
      for (const span of node.spans) {
        checkValue(span.start);
        checkValue(span.end);
        if (
          span.start !== null &&
          span.end !== null &&
          span.start > 0 &&
          span.end > 0 &&
          span.start > span.end
        ) {
          this.fail('backwards-range', `Backwards range in '${node.unit}'`, pos);
        }
      }
      if (node.stride) {
        checkValue(node.stride.start);
        checkValue(node.stride.end);
        if (node.unit !== 'Y' && node.stride.interval > size) {
          this.fail(
            'stride-interval-domain',
            `Stride interval ${node.stride.interval} exceeds the '${node.unit}' domain — use a cadence`,
            pos
          );
        }
      }
    }

    if (bounds?.node.start && bounds.node.end) {
      if (literalPseudo(bounds.node.start) > literalPseudo(bounds.node.end)) {
        this.fail('backwards-bounds', 'Bounds range is backwards', bounds.pos);
      }
    }
    this.lintUnsatisfiableDay(selectors);
  }

  /** `D30 M2` parses but can never match — spec §9.1 says warn, don't error. */
  private lintUnsatisfiableDay(selectors: IPositioned<ISelector>[]): void {
    const daySel = selectors.find((s) => s.node.unit === 'D' && !s.node.exclude);
    const monthSel = selectors.find((s) => s.node.unit === 'M' && !s.node.exclude);
    if (!daySel || !monthSel || daySel.node.stride || monthSel.node.stride) return;
    let maxDays = 0;
    for (const span of monthSel.node.spans) {
      if (span.start === null || span.end === null || span.start < 0 || span.end < 0) return;
      for (let mo = span.start; mo <= span.end; mo++) {
        maxDays = Math.max(maxDays, MONTH_MAX_DAYS[mo - 1] as number);
      }
    }
    const starts = daySel.node.spans.map((s) => s.start);
    if (starts.some((v) => v === null || v < 0)) return;
    const minDay = Math.min(...(starts as number[]));
    if (minDay > maxDays) {
      this.warnings.push({
        code: 'unsatisfiable',
        message: `Day ${minDay} never occurs in the selected month(s) — this expression covers nothing`,
        position: daySel.pos
      });
    }
  }

  // -------------------------------
  // scanning primitives
  // -------------------------------

  private skipSpaces(): void {
    while (this.src[this.pos] === ' ' || this.src[this.pos] === '\t') this.pos++;
  }

  private readDigits(): string {
    const start = this.pos;
    while (isDigit(this.src[this.pos])) this.pos++;
    return this.src.slice(start, this.pos);
  }

  private readInt(what: string): number {
    const pos = this.pos;
    const digits = this.readDigits();
    if (digits.length === 0) this.fail('expected-value', `Expected ${what}`, pos);
    return Number(digits);
  }

  private fail(code: string, message: string, position: number): never {
    throw new DTRExpSyntaxError(code, message, this.src, position);
  }
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
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
