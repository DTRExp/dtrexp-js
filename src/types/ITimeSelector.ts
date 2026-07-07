/** One half-open time-of-day range in milliseconds of the local day: `[startMs, endMs)`. */
export interface ITimeRange {
  startMs: number;
  endMs: number;
}

/** Compiled IR of a `T` component — midnight wraps are already split (spec §4). */
export interface ITimeSelector {
  ranges: ITimeRange[];
}
