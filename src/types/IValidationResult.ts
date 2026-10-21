/** One diagnostic produced by `validate()`. */
export interface IIssue {
  code: string;
  message: string;
  /**
   *  The 0-based offset, in code points, of the token at fault (an error) or of the
   *  component concerned (a warning), per spec §8.
   */
  position?: number;
}

/** Result of `validate()` — non-throwing counterpart of `parse()`. */
export interface IValidationResult {
  valid: boolean;
  errors: IIssue[];
  warnings: IIssue[];
}
