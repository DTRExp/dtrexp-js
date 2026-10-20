/** Evaluation options — the time zone is always a parameter, never part of the expression. */
export interface IEvalOptions {
  /**
   *  IANA time zone for evaluation. Default: the expression's bound `zone`
   *  (see `withZone()`), else `'UTC'`. An unknown zone throws `RangeError`.
   */
  tz?: string;
}
