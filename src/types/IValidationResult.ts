/** One diagnostic produced by `validate()`. */
export interface IIssue {
  code: string;
  message: string;
  /** 0-based character offset into the expression, where known. */
  position?: number;
}

/** Result of `validate()` — non-throwing counterpart of `parse()`. */
export interface IValidationResult {
  valid: boolean;
  errors: IIssue[];
  warnings: IIssue[];
}
