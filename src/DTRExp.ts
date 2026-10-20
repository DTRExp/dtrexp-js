import { toCanonicalString } from './core/Canonical.js';
import { describeIR } from './core/Describe.js';
import { coversInstant } from './core/Evaluator.js';
import { parseToIR } from './core/Parser.js';
import { toRRuleString } from './core/RRule.js';
import { coveringInterval, intersectWindow, nextInterval } from './core/Stepper.js';
import { DTRExpSyntaxError } from './DTRExpSyntaxError.js';
import type {
  DateInput,
  IDTRExpIR,
  IEvalOptions,
  IInterval,
  IIssue,
  IValidationResult
} from './types/index.js';
import { resolveZone } from './utils/calendar.js';

/**
 *  A parsed, immutable DTRExp. Construct via {@link parse}; parse once
 *  at write-time, evaluate per-request — `covers()` is O(#components).
 */
export class DTRExp {
  /** The original expression, verbatim. */
  readonly source: string;
  /**
   *  The spec §9.1 unsatisfiability warnings of this expression — same content
   *  as `validate(source).warnings`, exposed here so code that parses directly
   *  doesn't lose them. Empty for a clean expression.
   */
  readonly warnings: readonly IIssue[];
  /**
   *  The bound evaluation zone, in the platform's canonical form, or `undefined`
   *  when none is bound (then evaluation defaults to `'UTC'`). Set with
   *  {@link DTRExp.withZone}; a `{ tz }` passed to a call still wins.
   */
  readonly zone: string | undefined;
  private readonly ir: IDTRExpIR;

  private constructor(
    source: string,
    ir: IDTRExpIR,
    warnings: readonly IIssue[],
    zone: string | undefined
  ) {
    this.source = source;
    this.ir = ir;
    this.warnings = warnings;
    this.zone = zone;
    Object.freeze(this);
  }

  /** @internal Used by {@link parse} — not part of the public API. */
  static _create(source: string, ir: IDTRExpIR, warnings: readonly IIssue[]): DTRExp {
    return new DTRExp(source, ir, warnings, undefined);
  }

  /**
   *  A copy of this expression whose evaluation defaults to `tz`; this one is
   *  left as it is. The copy has the same `source`, canonical form, description,
   *  RRULE and warnings: the zone belongs to evaluation, never to the expression.
   *  A `{ tz }` passed to a call still wins. Throws `RangeError` at once on an
   *  unknown zone, and `TypeError` when `tz` is not a string.
   *
   *  @example
   *  const hours = parse('T0900:1800 E1:5').withZone('Europe/Berlin');
   *  hours.covers(new Date()); // evaluated in Berlin
   */
  withZone(tz: string): DTRExp {
    return new DTRExp(this.source, this.ir, this.warnings, resolveZone(tz));
  }

  /**
   *  Whether the expression covers the given instant, evaluated in `opts.tz`,
   *  else the bound {@link DTRExp.zone}, else `'UTC'`.
   *
   *  @example
   *  parse('T0900:1800 E1:5').covers(new Date(), { tz: 'Europe/Berlin' });
   */
  covers(instant: DateInput, opts?: IEvalOptions): boolean {
    return coversInstant(this.ir, toEpochMs(instant), this.zoneFor(opts));
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
    return intersectWindow(this.ir, toEpochMs(start), toEpochMs(end), this.zoneFor(opts));
  }

  /**
   *  The first maximal covered interval starting strictly after `after`;
   *  coverage that already contains `after` is skipped. Returns `null` when
   *  no further interval starts before the year-9999 horizon: the coverage is
   *  exhausted, or it is continuous from `after` on (`E1:7` covers every
   *  instant, so nothing ever starts). Neither means "never applies"; ask
   *  `covers(after)` for the current state. Transition days follow §9.3 like
   *  `covers()`: a gap time yields no interval, a repeated one yields two.
   *
   *  @example
   *  parse('T0900:1800 E1:5').next('2026-07-07T10:00:00Z');
   *  // → { start: 2026-07-08T09:00:00Z, end: 2026-07-08T18:00:00Z }
   */
  next(after: DateInput, opts?: IEvalOptions): IInterval | null {
    return nextInterval(this.ir, toEpochMs(after), this.zoneFor(opts));
  }

  /**
   *  The maximal covered interval containing `instant`, or `null` when the
   *  instant is not covered; `covers(t)` holds iff `covering(t)` is not null.
   *  Coverage that runs to the edge of the year 1–9999 domain starts or ends
   *  there. This is the "applies now, until …" half of a display; `next()` is
   *  the "next applies at …" half.
   *
   *  @example
   *  parse('T0900:1800 E1:5').covering('2026-07-07T10:00:00Z');
   *  // → { start: 2026-07-07T09:00:00Z, end: 2026-07-07T18:00:00Z }
   */
  covering(instant: DateInput, opts?: IEvalOptions): IInterval | null {
    return coveringInterval(this.ir, toEpochMs(instant), this.zoneFor(opts));
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

  /** The zone a call evaluates in: its own `{ tz }`, else the bound zone, else UTC. */
  private zoneFor(opts: IEvalOptions | undefined): string {
    if (typeof opts === 'string') {
      throw new TypeError(`Pass the time zone as { tz: '${opts}' }`);
    }
    // `null` from JSON or a database means no zone, as it did in 1.1.0
    const tz = opts?.tz;
    return tz == null ? (this.zone ?? 'UTC') : resolveZone(tz);
  }
}

/**
 *  Parses a DTRExp. The only way to construct a {@link DTRExp}.
 *  Throws {@link DTRExpSyntaxError} with a position and stable `code` on invalid input.
 *
 *  @example
 *  const businessHours = parse('T0900:1800 E1:5');
 */
export function parse(expression: string): DTRExp {
  const { ir, warnings } = parseToIR(expression);
  return DTRExp._create(expression, deepFreeze(ir), deepFreeze(warnings));
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

/** Freezes a plain object or array and everything it holds. The IR has no cycles and no typed arrays. */
function deepFreeze<T>(value: T): T {
  for (const child of Object.values(value as object)) {
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
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
