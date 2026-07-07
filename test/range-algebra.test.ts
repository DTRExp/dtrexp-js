import { expandDaySpans, expandSpans } from '../src/core/RRule.js';
import {
  clipRanges,
  coveredValues,
  filterCyclic,
  type IRange,
  intersectRanges,
  sortMerge,
  unitRanges
} from '../src/core/Stepper.js';
import type { ISelector } from '../src/types/index.js';

const rng = (lo: number, hi: number): IRange => ({ lo, hi });
const sel = (over: Partial<ISelector>): ISelector => ({
  unit: 'M',
  exclude: false,
  spans: [],
  ...over
});

describe('sortMerge', () => {
  it('drops zero- and negative-width ranges', () => {
    expect(sortMerge([rng(5, 5)])).toEqual([]);
    expect(sortMerge([rng(5, 3)])).toEqual([]);
  });

  it('sorts by lower bound before merging', () => {
    expect(sortMerge([rng(0, 5), rng(10, 20)])).toEqual([rng(0, 5), rng(10, 20)]);
    // out of order → sorted, not merged (disjoint)
    expect(sortMerge([rng(10, 20), rng(0, 5)])).toEqual([rng(0, 5), rng(10, 20)]);
  });

  it('merges overlapping and adjacent ranges', () => {
    expect(sortMerge([rng(0, 10), rng(5, 15)])).toEqual([rng(0, 15)]);
    expect(sortMerge([rng(0, 10), rng(10, 20)])).toEqual([rng(0, 20)]); // adjacent → merged
  });

  it('keeps disjoint ranges separate', () => {
    expect(sortMerge([rng(0, 5), rng(10, 15)])).toEqual([rng(0, 5), rng(10, 15)]);
  });
});

describe('intersectRanges', () => {
  it('intersects overlapping ranges', () => {
    expect(intersectRanges([rng(0, 10)], [rng(5, 15)])).toEqual([rng(5, 10)]);
  });

  it('excludes adjacent (zero-overlap) ranges', () => {
    expect(intersectRanges([rng(0, 5)], [rng(5, 10)])).toEqual([]);
  });

  it('returns empty for disjoint ranges', () => {
    expect(intersectRanges([rng(0, 5)], [rng(10, 15)])).toEqual([]);
  });

  it('advances the pointer of whichever range ends first (both directions)', () => {
    // a-ranges end first → i advances
    expect(intersectRanges([rng(0, 10), rng(20, 30)], [rng(5, 25)])).toEqual([
      rng(5, 10),
      rng(20, 25)
    ]);
    // b-ranges end first → j advances
    expect(intersectRanges([rng(0, 30)], [rng(5, 10), rng(20, 25)])).toEqual([
      rng(5, 10),
      rng(20, 25)
    ]);
  });
});

describe('clipRanges', () => {
  it('clips to the window and drops what falls outside', () => {
    expect(clipRanges([rng(0, 10)], 5, 8)).toEqual([rng(5, 8)]);
    expect(clipRanges([rng(0, 10)], 15, 20)).toEqual([]); // window past the range
    expect(clipRanges([rng(0, 10)], -5, -1)).toEqual([]); // window before the range
  });
});

describe('unitRanges / coveredValues', () => {
  it('merges consecutive covered slots into one range', () => {
    const s = sel({ unit: 'H', spans: [{ start: 9, end: 17 }] });
    expect(unitRanges(s, 24, 1000)).toEqual([rng(9000, 18_000)]);
  });

  it('keeps non-consecutive covered slots separate', () => {
    const s = sel({
      unit: 'H',
      spans: [],
      stride: { start: 0, end: null, interval: 4, duration: 1 }
    });
    const ranges = unitRanges(s, 24, 1000);
    expect(ranges).toHaveLength(6); // 0,4,8,12,16,20
    expect(ranges[0]).toEqual(rng(0, 1000));
    expect(ranges[1]).toEqual(rng(4000, 5000));
  });

  it('maps each slot to a boolean per value', () => {
    const s = sel({ unit: 'm', spans: [{ start: 0, end: 19 }] });
    const covered = coveredValues(s, 60);
    expect(covered).toHaveLength(60);
    expect(covered[0]).toBe(true);
    expect(covered[19]).toBe(true);
    expect(covered[20]).toBe(false);
  });
});

describe('filterCyclic', () => {
  it('keeps only the sub-slices whose cyclic slot is covered', () => {
    // minutes 0–19 covered, over the hour [0, 3_600_000)
    const covered = coveredValues(sel({ unit: 'm', spans: [{ start: 0, end: 19 }] }), 60);
    const result = filterCyclic([rng(0, 3_600_000)], covered, 60_000, 3_600_000);
    expect(result).toEqual([rng(0, 20 * 60_000)]);
  });
});

describe('expandSpans (RRULE)', () => {
  it('expands a plain positive range inclusively', () => {
    expect(expandSpans(sel({ spans: [{ start: 3, end: 7 }] }), 12)).toEqual([3, 4, 5, 6, 7]);
  });

  it('expands a strided range up to and including the end', () => {
    expect(
      expandSpans(sel({ spans: [], stride: { start: 1, end: 5, interval: 2, duration: 1 } }), 12)
    ).toEqual([1, 3, 5]);
  });

  it('expands a strided block duration', () => {
    expect(
      expandSpans(sel({ spans: [], stride: { start: 1, end: null, interval: 5, duration: 2 } }), 12)
    ).toEqual([1, 2, 6, 7, 11, 12]);
  });

  it('expands negative ranges to negative indices', () => {
    expect(expandSpans(sel({ spans: [{ start: -3, end: -1 }] }), 12)).toEqual([-3, -2, -1]);
  });

  it('rejects unmappable spans', () => {
    expect(expandSpans(sel({ spans: [{ start: null, end: null }] }), 12)).toBeNull(); // *
    expect(expandSpans(sel({ spans: [{ start: 3, end: null }] }), 12)).toBeNull(); // open positive
    expect(expandSpans(sel({ spans: [{ start: -3, end: 5 }] }), 12)).toBeNull(); // mixed sign
    expect(expandSpans(sel({ spans: [{ start: -1, end: -1 }] }), 53, false)).toBeNull(); // negatives disallowed
  });
});

describe('expandDaySpans (RRULE)', () => {
  it('keeps positive day ranges', () => {
    expect(expandDaySpans(sel({ unit: 'D', spans: [{ start: 5, end: 8 }] }))).toEqual([5, 6, 7, 8]);
  });

  it('keeps negative day ranges as-is', () => {
    expect(expandDaySpans(sel({ unit: 'D', spans: [{ start: -7, end: -1 }] }))).toEqual([
      -7, -6, -5, -4, -3, -2, -1
    ]);
  });

  it('rejects strides, open, mixed-sign and unbounded day spans', () => {
    expect(
      expandDaySpans(
        sel({ unit: 'D', spans: [], stride: { start: 1, end: null, interval: 2, duration: 1 } })
      )
    ).toBeNull();
    expect(expandDaySpans(sel({ unit: 'D', spans: [{ start: null, end: 5 }] }))).toBeNull();
    expect(expandDaySpans(sel({ unit: 'D', spans: [{ start: -5, end: 10 }] }))).toBeNull(); // neg→pos
    expect(expandDaySpans(sel({ unit: 'D', spans: [{ start: 5, end: null }] }))).toBeNull(); // open positive
  });
});
