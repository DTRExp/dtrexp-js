/** Structural stand-in for `Temporal.ZonedDateTime` / `Temporal.Instant` — no hard dependency. */
export interface IEpochHolder {
  epochMilliseconds: number;
}

/** Accepted instant inputs: `Date`, epoch milliseconds, ISO 8601 string, or a Temporal object. */
export type DateInput = Date | number | string | IEpochHolder;
