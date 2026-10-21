/** Thrown by `parse()` for a malformed or statically invalid DTRExp. */
export class DTRExpSyntaxError extends Error {
  /** Stable machine-readable error code (kebab-case). */
  readonly code: string;
  /**
   *  The 0-based offset, in code points, of the first character of the token at fault
   *  (spec §8, *Error positions*). Every character before it is ASCII, so it is also
   *  the string index.
   */
  readonly position: number;
  /** The offending expression, verbatim. */
  readonly expression: string;

  constructor(code: string, message: string, expression: string, position: number) {
    super(`${message} (at position ${position} in '${expression}')`);
    this.name = 'DTRExpSyntaxError';
    this.code = code;
    this.position = position;
    this.expression = expression;
  }
}
