import type { IDateLiteral } from './IDateLiteral.js';

/**
 *  Compiled IR of an absolute-bounds component (spec §6). `null` = open end.
 *  The end literal is span-inclusive: the window runs through the end of its span.
 */
export interface IBounds {
  start: IDateLiteral | null;
  end: IDateLiteral | null;
}
