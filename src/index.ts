/**
 *  dtrexp-js — reference implementation of the DTRExp specification.
 *  @see https://github.com/DTRExp/dtrexp
 */

export { DTRExp, parse, validate } from './DTRExp.js';
export { DTRExpSyntaxError } from './DTRExpSyntaxError.js';
export type {
  DateInput,
  IEpochHolder,
  IEvalOptions,
  IInterval,
  IIssue,
  IValidationResult
} from './types/index.js';

/** The DTRExp specification draft this package implements. */
export const SPEC_DRAFT = 2;
