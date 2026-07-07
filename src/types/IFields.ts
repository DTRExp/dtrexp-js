/** Calendar fields of one instant in the evaluation time zone — extracted once per covers(). */
export interface IFields {
  year: number;
  quarter: number;
  month: number;
  day: number;
  dayOfQuarter: number;
  dayOfYear: number;
  /** ISO weekday, 1 (Mon) – 7 (Sun). */
  weekday: number;
  isoWeek: number;
  isoWeekYear: number;
  hour: number;
  minute: number;
  second: number;
  /** Milliseconds elapsed since local midnight. */
  msOfDay: number;
  /** Comparable local pseudo-epoch: epochDay × 86 400 000 + msOfDay (tz-local ordering). */
  pseudo: number;
}
