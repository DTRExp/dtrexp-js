import { DTRExpSyntaxError } from '../src/DTRExpSyntaxError.js';

/** Asserts a thrown error is a DTRExpSyntaxError with a real (non-empty) message. */
export function expectSyntaxError(fn: () => unknown): DTRExpSyntaxError {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DTRExpSyntaxError);
  const e = err as DTRExpSyntaxError;
  // the message begins with the specific reason, then the ` (at position …)` suffix;
  // an emptied message string would begin with that suffix instead
  expect(e.message.trimStart()).not.toMatch(/^\(at position/);
  // every error carries a non-empty kebab-case code
  expect(e.code).toMatch(/^[a-z][a-z-]*[a-z]$/);
  return e;
}
