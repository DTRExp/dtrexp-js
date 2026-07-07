import { coversInstant } from './core/Evaluator.js';
import { parseToIR } from './core/Parser.js';
import { DTRESyntaxError } from './DTRESyntaxError.js';
import type { DateInput, IDtreIR, IEvalOptions, IIssue, IValidationResult } from './types/index.js';

/**
 *  A parsed, immutable DTRE expression. Construct via {@link parse}; parse once
 *  at write-time, evaluate per-request — `covers()` is O(#components).
 */
export class DTRE {
  /** The original expression, verbatim. */
  readonly source: string;
  private readonly ir: IDtreIR;

  private constructor(source: string, ir: IDtreIR) {
    this.source = source;
    this.ir = ir;
  }

  /** @internal Used by {@link parse} — not part of the public API. */
  static _create(source: string, ir: IDtreIR): DTRE {
    return new DTRE(source, ir);
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

  /** @internal The compiled IR — consumed by the evaluator layers. */
  get _ir(): IDtreIR {
    return this.ir;
  }
}

/**
 *  Parses a DTRE expression. The only way to construct a {@link DTRE}.
 *  Throws {@link DTRESyntaxError} with a position and stable `code` on invalid input.
 *
 *  @example
 *  const businessHours = parse('T0900-1800 E1-5');
 */
export function parse(expression: string): DTRE {
  return DTRE._create(expression, parseToIR(expression).ir);
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
    const e = err as DTRESyntaxError;
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
