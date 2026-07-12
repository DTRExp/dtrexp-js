/** Thrown by `parse()` for a malformed or statically invalid DTRExp. */
export class DTRExpSyntaxError extends Error {
  /** Stable machine-readable error code (kebab-case). */
  readonly code: string;
  /** 0-based character offset into the expression, where known. */
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
