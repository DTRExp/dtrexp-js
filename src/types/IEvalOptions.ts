/** Evaluation options — the time zone is always a parameter, never part of the expression. */
export interface IEvalOptions {
  /**
   *  IANA time zone for evaluation: a tz database zone or link name, in any case.
   *  Default: the expression's bound `zone` (see `withZone()`), else `'UTC'`. Anything
   *  else throws `RangeError`, a fixed offset such as `'+02:00'` included.
   */
  tz?: string;
}
