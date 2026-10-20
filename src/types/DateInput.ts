/** Structural stand-in for `Temporal.ZonedDateTime` / `Temporal.Instant` — no hard dependency. */
export interface IEpochHolder {
  epochMilliseconds: number;
}

/**
 *  Accepted instant inputs: `Date`, epoch milliseconds, ISO 8601 string, or a
 *  Temporal object. A date-time string without `Z` or an offset
 *  (`'2026-07-07T09:30:00'`) is read in the host's zone, not the evaluation zone,
 *  as `Date.parse` reads it; give strings an offset.
 */
export type DateInput = Date | number | string | IEpochHolder;
