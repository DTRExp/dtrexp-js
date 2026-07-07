/** Discrete calendar-unit designators (everything except `T`, bounds and cadences). */
export type Unit = 'Y' | 'Q' | 'M' | 'W' | 'D' | 'E' | 'H' | 'm' | 's';

/** Units accepted as a cadence period/duration. */
export type CadenceUnit = 'Y' | 'M' | 'W' | 'D' | 'H' | 'm';
