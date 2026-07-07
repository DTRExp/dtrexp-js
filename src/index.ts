/**
 *  dtre-js — reference implementation of the DTRE specification.
 *  @see https://github.com/DTRExp/dtre-spec
 */

export { DTRE, parse, validate } from './DTRE.js';
export { DTRESyntaxError } from './DTRESyntaxError.js';
export type {
  DateInput,
  IEpochHolder,
  IEvalOptions,
  IInterval,
  IIssue,
  IValidationResult
} from './types/index.js';

/** The DTRE specification draft this package implements. */
export const SPEC_DRAFT = 2;
