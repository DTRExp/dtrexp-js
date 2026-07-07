/** Evaluation options — the time zone is always a parameter, never part of the expression. */
export interface IEvalOptions {
  /** IANA time zone for evaluation. Default: `'UTC'`. */
  tz?: string;
}
