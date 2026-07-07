import type { IDateLiteral } from './IDateLiteral.js';
import type { CadenceUnit } from './Unit.js';

/** Compiled IR of an anchored cadence `<date>/<n><unit>[/<n><unit>]` (spec §5.2). */
export interface ICadence {
  anchor: IDateLiteral;
  period: number;
  periodUnit: CadenceUnit;
  duration: number;
  durationUnit: CadenceUnit;
}
