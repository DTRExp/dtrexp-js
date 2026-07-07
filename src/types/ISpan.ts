/**
 *  An inclusive integer span over a discrete unit's domain, as authored.
 *  `null` means the domain edge (`*`); negative values count from the end of
 *  the parent's actual domain and resolve per parent instance (spec §9.1).
 */
export interface ISpan {
  start: number | null;
  end: number | null;
}
