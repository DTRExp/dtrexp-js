import type { IBounds } from './IBounds.js';
import type { ICadence } from './ICadence.js';
import type { ISelector } from './ISelector.js';
import type { ITimeSelector } from './ITimeSelector.js';

/** One `|`-branch: the intersection of its components (spec §1). */
export interface IExpressionIR {
  selectors: ISelector[];
  time?: ITimeSelector;
  cadence?: ICadence;
  bounds?: IBounds;
}

/** A full compiled DTRE: the union of its expressions. */
export interface IDtreIR {
  expressions: IExpressionIR[];
}
