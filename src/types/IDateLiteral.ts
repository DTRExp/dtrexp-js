/** A parsed date literal `YYYYMMDD[Thhmm[ss]]` — local calendar fields, tz-agnostic. */
export interface IDateLiteral {
  year: number;
  month: number;
  day: number;
  /** Present iff the literal carries a `T…` part. */
  hour?: number;
  minute?: number;
  second?: number;
}
