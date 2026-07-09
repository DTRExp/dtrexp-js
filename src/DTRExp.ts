import { toCanonicalString } from './core/Canonical.js';
import { describeIR } from './core/Describe.js';
import { coversInstant } from './core/Evaluator.js';
import { parseToIR } from './core/Parser.js';
import { toRRuleString } from './core/RRule.js';
import { intersectWindow, nextInterval } from './core/Stepper.js';
import { DTRExpSyntaxError } from './DTRExpSyntaxError.js';
import type {
  DateInput,
  IDTRExpIR,
  IEvalOptions,
  IInterval,
  IIssue,
  IValidationResult
} from './types/index.js';

/**
 *  A parsed, immutable DTRExp expression. Construct via {@link parse}; parse once
 *  at write-time, evaluate per-request — `covers()` is O(#components).
 */
export class DTRExp {
  /** The original expression, verbatim. */
  readonly source: string;
  private readonly ir: IDTRExpIR;

  private constructor(source: string, ir: IDTRExpIR) {
    this.source = source;
    this.ir = ir;
  }

  /** @internal Used by {@link parse} — not part of the public API. */
  static _create(source: string, ir: IDTRExpIR): DTRExp {
    return new DTRExp(source, ir);
  }

  /**
   *  Whether the expression covers the given instant, evaluated in `opts.tz`
   *  (default `'UTC'`).
   *
   *  @example
   *  parse('T0900-1800 E1-5').covers(new Date(), { tz: 'Europe/Berlin' });
   */
  covers(instant: DateInput, opts?: IEvalOptions): boolean {
    return coversInstant(this.ir, toEpochMs(instant), opts?.tz ?? 'UTC');
  }

  /**
   *  The covered intervals clipped to `[start, end)` — always a finite, sorted,
   *  merged list of half-open intervals.
   *
   *  @example
   *  parse('M3').intersect('2017-01-01', '2018-01-01');
   *  // → [ { start: 2017-03-01T00:00:00Z, end: 2017-04-01T00:00:00Z } ]
   */
  intersect(start: DateInput, end: DateInput, opts?: IEvalOptions): IInterval[] {
    return intersectWindow(this.ir, toEpochMs(start), toEpochMs(end), opts?.tz ?? 'UTC');
  }

  /**
   *  The first maximal covered interval starting strictly after `after`;
   *  coverage that already contains `after` is skipped. Returns `null` when
   *  no further interval starts before the year-9999 horizon.
   *
   *  @example
   *  parse('T0900-1800 E1-5').next('2026-07-07T10:00:00Z');
   *  // → { start: 2026-07-08T09:00:00Z, end: 2026-07-08T18:00:00Z }
   */
  next(after: DateInput, opts?: IEvalOptions): IInterval | null {
    return nextInterval(this.ir, toEpochMs(after), opts?.tz ?? 'UTC');
  }

  /**
   *  Human-readable description. v1 supports `'en'` only; the parameter is
   *  reserved for future locales.
   *
   *  @example
   *  parse('E7#-1 M4').describe(); // → 'the last Sunday in April'
   */
  describe(locale = 'en'): string {
    if (locale !== 'en') throw new RangeError(`Unsupported locale: ${locale}`);
    return describeIR(this.ir);
  }

  /**
   *  RFC 5545 RRULE (with `DTSTART` line when anchored) for the losslessly
   *  mappable subset, else `null`. Constrained cadences require RFC 7529
   *  (`SKIP=BACKWARD`) on the consuming side.
   */
  toRRule(): string | null {
    return toRRuleString(this.ir);
  }

  /** Canonical normalized form of the expression. */
  toString(): string {
    return toCanonicalString(this.ir);
  }

  /** @internal The compiled IR — consumed by the evaluator layers. */
  get _ir(): IDTRExpIR {
    return this.ir;
  }
}

/**
 *  Parses a DTRExp expression. The only way to construct a {@link DTRExp}.
 *  Throws {@link DTRExpSyntaxError} with a position and stable `code` on invalid input.
 *
 *  @example
 *  const businessHours = parse('T0900-1800 E1-5');
 */
export function parse(expression: string): DTRExp {
  return DTRExp._create(expression, parseToIR(expression).ir);
}

/**
 *  Non-throwing validation. Errors make `valid` false; warnings (e.g. the
 *  spec §9.1 unsatisfiability lint) do not.
 *
 *  @example
 *  validate('D30 M2'); // { valid: true, errors: [], warnings: [{ code: 'unsatisfiable', … }] }
 */
export function validate(expression: string): IValidationResult {
  try {
    const { warnings } = parseToIR(expression);
    return { valid: true, errors: [], warnings };
  } catch (err) {
    const e = err as DTRExpSyntaxError;
    const issue: IIssue = { code: e.code, message: e.message, position: e.position };
    return { valid: false, errors: [issue], warnings: [] };
  }
}

function toEpochMs(input: DateInput): number {
  if (input instanceof Date) return checkFinite(input.getTime());
  if (typeof input === 'number') return checkFinite(input);
  if (typeof input === 'string') return checkFinite(Date.parse(input));
  if (typeof input === 'object' && input !== null && 'epochMilliseconds' in input) {
    return checkFinite(input.epochMilliseconds);
  }
  throw new TypeError('Expected a Date, epoch milliseconds, ISO 8601 string or Temporal instant');
}

function checkFinite(ms: number): number {
  if (!Number.isFinite(ms)) throw new TypeError('Invalid instant');
  return ms;
}
