import type { ISpan } from './ISpan.js';
import type { Unit } from './Unit.js';

/** Stride tail on a selector: `<start>[-<end>]/<interval>[/<duration>]` (spec §5.1). */
export interface IStride {
  start: number;
  end: number | null;
  interval: number;
  duration: number;
}

/** Compiled IR of one discrete-unit selector component. */
export interface ISelector {
  unit: Unit;
  /** `true` for the `!` form: covered iff the value is NOT in `spans`. */
  exclude: boolean;
  spans: ISpan[];
  stride?: IStride;
  /** `E` only: nth (1…5) / nth-from-last (−1…−5) occurrence within the scope. */
  ordinal?: number;
}
