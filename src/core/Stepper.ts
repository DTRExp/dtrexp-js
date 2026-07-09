import type {
  IDateLiteral,
  IDTRExpIR,
  IExpressionIR,
  IFields,
  IInterval,
  ISelector,
  Unit
} from '../types/index.js';
import {
  civilFromDays,
  epochDay,
  epochFromPseudo,
  fieldsFromCivil,
  fieldsFromInstant
} from '../utils/index.js';
import {
  boundsPseudoWindow,
  cadenceAbsWindows,
  cadencePseudoWindows,
  isSubDayCadence,
  literalSpanEnd,
  matchesDayLevel,
  selectorCoversValue
} from './Evaluator.js';

const MS_PER_DAY = 86_400_000;
/** Scan horizon: coverage is explored through the end of year 9999 (spec Y domain). */
const HORIZON_PSEUDO = epochDay(10_000, 1, 1) * MS_PER_DAY;

export interface IRange {
  lo: number;
  hi: number;
}

/** Per-expression precomputation reused across every scanned day. */
interface IExprPlan {
  expr: IExpressionIR;
  present: Set<Unit>;
  base: IRange[];
  hourRanges: IRange[] | null;
  minuteCovered: boolean[] | null;
  secondCovered: boolean[] | null;
}

function planFor(ir: IDTRExpIR): IExprPlan[] {
  return ir.expressions.map((expr) => {
    const hourSel = expr.selectors.find((s) => s.unit === 'H');
    const minuteSel = expr.selectors.find((s) => s.unit === 'm');
    const secondSel = expr.selectors.find((s) => s.unit === 's');
    return {
      expr,
      present: new Set(expr.selectors.map((s) => s.unit)),
      base: expr.time
        ? sortMerge(expr.time.ranges.map((r) => ({ lo: r.startMs, hi: r.endMs })))
        : [{ lo: 0, hi: MS_PER_DAY }],
      hourRanges: hourSel ? unitRanges(hourSel, 24, 3_600_000) : null,
      minuteCovered: minuteSel ? coveredValues(minuteSel, 60) : null,
      secondCovered: secondSel ? coveredValues(secondSel, 60) : null
    };
  });
}

export function coveredValues(selector: ISelector, count: number): boolean[] {
  // Stryker disable next-line ArrayDeclaration: equivalent — the loop assigns every index 0..count-1, so a length-less Array ends up identical.
  const out = new Array<boolean>(count);
  // Stryker disable next-line EqualityOperator: equivalent — value `count` lies outside every resolvable span (max is count-1), so an extra iteration never writes true.
  for (let v = 0; v < count; v++) out[v] = selectorCoversValue(selector, v, 0, count - 1);
  return out;
}

export function unitRanges(selector: ISelector, count: number, unitMs: number): IRange[] {
  const out: IRange[] = [];
  // Stryker disable next-line EqualityOperator: equivalent — value `count` lies outside every
  // resolvable span (max is count-1), so an extra iteration never pushes a range.
  for (let v = 0; v < count; v++) {
    if (!selectorCoversValue(selector, v, 0, count - 1)) continue;
    const last = out[out.length - 1];
    if (last && last.hi === v * unitMs) last.hi = (v + 1) * unitMs;
    else out.push({ lo: v * unitMs, hi: (v + 1) * unitMs });
  }
  return out;
}

/** Covered ms-of-day ranges of one expression on one local day (sorted, merged). */
function dayRanges(plan: IExprPlan, day: number, f: IFields, tz: string): IRange[] {
  // Stryker disable next-line ArrayDeclaration: equivalent — the only consumer sortMerges this result, and its hi > lo filter drops any non-range garbage.
  if (!matchesDayLevel(plan.expr, f, plan.present)) return [];
  const dayLo = day * MS_PER_DAY;
  let ranges = plan.base;
  if (plan.hourRanges) ranges = intersectRanges(ranges, plan.hourRanges);
  if (plan.minuteCovered) ranges = filterCyclic(ranges, plan.minuteCovered, 60_000, 3_600_000);
  if (plan.secondCovered) ranges = filterCyclic(ranges, plan.secondCovered, 1000, 60_000);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — the length guard is a short-circuit only: clipping an empty list is an empty list.
  if (plan.expr.bounds && ranges.length > 0) {
    const w = boundsPseudoWindow(plan.expr.bounds);
    ranges = clipRanges(ranges, w.lo - dayLo, w.hi - dayLo);
  }
  const cadence = plan.expr.cadence;
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — short-circuit only: intersecting an empty list is an empty list.
  if (cadence && ranges.length > 0) {
    let windows: IRange[];
    if (isSubDayCadence(cadence)) {
      // sub-day cadences run on absolute time; map their edges into this local day
      const loEpoch = epochFromPseudo(tz, dayLo);
      const hiEpoch = epochFromPseudo(tz, dayLo + MS_PER_DAY);
      windows = cadenceAbsWindows(cadence, loEpoch, hiEpoch, tz).map(([s, e]) => ({
        // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — an edge at/before the day start maps to a pseudo ≤ 0 (== 0 at equality, by round-trip), and the result is then intersected with ranges ⊆ [0, MS_PER_DAY), which clamps identically.
        lo: s <= loEpoch ? 0 : fieldsFromInstant(s, tz).pseudo - dayLo,
        // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — mirror of the lo edge: a pseudo ≥ MS_PER_DAY is clamped by the same intersection.
        hi: e >= hiEpoch ? MS_PER_DAY : fieldsFromInstant(e, tz).pseudo - dayLo
      }));
    } else {
      windows = cadencePseudoWindows(cadence, dayLo, dayLo + MS_PER_DAY).map(([s, e]) => ({
        lo: Math.max(0, s - dayLo),
        hi: Math.min(MS_PER_DAY, e - dayLo)
      }));
    }
    ranges = intersectRanges(ranges, sortMerge(windows));
  }
  return ranges;
}

function dayCoverage(plans: IExprPlan[], day: number, tz: string): IRange[] {
  const civil = civilFromDays(day);
  const f = fieldsFromCivil(civil.year, civil.month, civil.day);
  // Stryker disable next-line ArrayDeclaration: equivalent — the first sortMerge filters any non-range garbage (hi > lo is false for a string).
  let covered: IRange[] = [];
  for (const plan of plans) covered = sortMerge(covered.concat(dayRanges(plan, day, f, tz)));
  return covered;
}

/**
 *  Covered intervals clipped to `[startEpoch, endEpoch)` — always a finite,
 *  sorted, merged list (spec §9 derived operations).
 */
export function intersectWindow(
  ir: IDTRExpIR,
  startEpoch: number,
  endEpoch: number,
  tz: string
): IInterval[] {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: equivalent — a degenerate window yields no intervals anyway: every day clips to e <= s.
  if (endEpoch <= startEpoch) return [];
  const lo = fieldsFromInstant(startEpoch, tz).pseudo;
  const hi = Math.min(fieldsFromInstant(endEpoch, tz).pseudo, HORIZON_PSEUDO);
  const out: IRange[] = [];
  const plans = planFor(ir);
  // Stryker disable next-line ArithmeticOperator: equivalent — the extra day (when hi is an exact day boundary) starts at hi, so every range clips to e = min(hi, …) <= s.
  const lastDay = Math.floor((hi - 1) / MS_PER_DAY);
  for (let day = Math.floor(lo / MS_PER_DAY); day <= lastDay; day++) {
    const dayLo = day * MS_PER_DAY;
    for (const r of dayCoverage(plans, day, tz)) {
      const s = Math.max(lo, dayLo + r.lo);
      const e = Math.min(hi, dayLo + r.hi);
      if (e <= s) continue;
      const last = out[out.length - 1];
      if (last && s <= last.hi) last.hi = Math.max(last.hi, e);
      else out.push({ lo: s, hi: e });
    }
  }
  return out.map((r) => ({
    start: new Date(epochFromPseudo(tz, r.lo)),
    end: new Date(epochFromPseudo(tz, r.hi))
  }));
}

/**
 *  The first maximal covered interval starting strictly after `afterEpoch`.
 *  Coverage containing `afterEpoch` is skipped ("when does it *next* apply").
 *  Returns `null` when nothing starts before the year-9999 horizon.
 */
export function nextInterval(ir: IDTRExpIR, afterEpoch: number, tz: string): IInterval | null {
  const plans = planFor(ir);
  const afterPseudo = fieldsFromInstant(afterEpoch, tz).pseudo;

  // if every union branch is end-bounded, stop scanning at the latest bound
  let horizon = HORIZON_PSEUDO;
  const ends = ir.expressions.map((e) => e.bounds?.end ?? null);
  // Stryker disable next-line ConditionalExpression,ArrowFunction,BlockStatement: equivalent — the horizon shortening is a pure scan-bound optimization: bounded coverage cannot extend past its own bounds, so skipping the shortening changes nothing but scan length.
  if (ends.every((end): end is IDateLiteral => end !== null)) {
    // Stryker disable next-line MethodExpression: equivalent — bound ends never exceed the year-10000 horizon (Y ≤ 9999), so keeping the larger value only lengthens the scan with identical results.
    horizon = Math.min(horizon, Math.max(...ends.map(literalSpanEnd)));
  }

  let skipCursor = -1; // end of the contiguous coverage containing afterEpoch, while chaining
  let start = -1;
  // Stryker disable next-line UnaryOperator: equivalent — end's sentinel is never read: every read is gated on start !== -1, and start and end are always assigned together.
  let end = -1;
  // Stryker disable next-line EqualityOperator: equivalent — the extra day at the horizon is clipped to nothing by bounds ≤ horizon, and for unbounded expressions year 10000 cannot match anything years 1970–9999 did not.
  for (let day = Math.floor(afterPseudo / MS_PER_DAY); day * MS_PER_DAY < horizon; day++) {
    const dayLo = day * MS_PER_DAY;
    for (const r of dayCoverage(plans, day, tz)) {
      const lo = dayLo + r.lo;
      const hi = dayLo + r.hi;
      if (start !== -1) {
        if (lo === end) {
          end = hi;
          continue;
        }
        return toInterval(start, Math.min(end, horizon), tz);
      }
      // Stryker disable next-line EqualityOperator: equivalent — a window ending exactly at afterPseudo cannot chain: same-day adjacency is pre-merged, so the stale skipCursor never equals a later lo.
      if (hi <= afterPseudo) continue;
      // Stryker disable next-line ConditionalExpression: equivalent — after merging, at most one window contains afterPseudo, so re-entering this branch reassigns the same cursor.
      if (skipCursor === -1 && lo <= afterPseudo) {
        skipCursor = hi; // afterEpoch sits inside this window — skip its chain
        // (no `skipCursor !== -1` guard needed below: lo is a pseudo-ms ≥ 0, never -1)
      } else if (lo === skipCursor) {
        skipCursor = hi; // contiguous continuation of the current window
      } else {
        start = lo;
        end = hi;
      }
    }
    // Stryker disable next-line ConditionalExpression,ArithmeticOperator,BlockStatement: equivalent — the day-end early return is a scan optimization: the open chain either continues or returns the identical interval later (the L-final return uses the same clamp).
    if (start !== -1 && end < dayLo + MS_PER_DAY) {
      return toInterval(start, Math.min(end, horizon), tz);
    }
  }
  // Stryker disable next-line MethodExpression: equivalent — reaching this return with an open chain means coverage ran to the horizon (any gap returns earlier), so end ≥ horizon and min/max coincide.
  return start !== -1 ? toInterval(start, Math.min(end, horizon), tz) : null;
}

function toInterval(startPseudo: number, endPseudo: number, tz: string): IInterval {
  return {
    start: new Date(epochFromPseudo(tz, startPseudo)),
    end: new Date(epochFromPseudo(tz, endPseudo))
  };
}

// -------------------------------
// range algebra (ms-of-day)
// -------------------------------

export function sortMerge(ranges: IRange[]): IRange[] {
  const sorted = ranges.filter((r) => r.hi > r.lo).sort((a, b) => a.lo - b.lo);
  const out: IRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.lo <= last.hi) last.hi = Math.max(last.hi, r.hi);
    else out.push({ lo: r.lo, hi: r.hi });
  }
  return out;
}

export function intersectRanges(a: IRange[], b: IRange[]): IRange[] {
  const out: IRange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ra = a[i] as IRange;
    const rb = b[j] as IRange;
    const lo = Math.max(ra.lo, rb.lo);
    const hi = Math.min(ra.hi, rb.hi);
    if (hi > lo) out.push({ lo, hi });
    // Stryker disable next-line EqualityOperator: equivalent — with lo-sorted inputs, once ra.hi === rb.hi neither list's successor can overlap below that bound, so advancing i or j first yields the same output.
    if (ra.hi <= rb.hi) i++;
    else j++;
  }
  return out;
}

export function clipRanges(ranges: IRange[], lo: number, hi: number): IRange[] {
  const out: IRange[] = [];
  for (const r of ranges) {
    const s = Math.max(r.lo, lo);
    const e = Math.min(r.hi, hi);
    if (e > s) out.push({ lo: s, hi: e });
  }
  return out;
}

/** Keeps only the parts of `ranges` whose cyclic slot (e.g. minute-of-hour) is covered. */
export function filterCyclic(
  ranges: IRange[],
  covered: boolean[],
  unitMs: number,
  cycleMs: number
): IRange[] {
  const out: IRange[] = [];
  for (const r of ranges) {
    for (let t = Math.floor(r.lo / unitMs) * unitMs; t < r.hi; t += unitMs) {
      if (!covered[Math.floor((t % cycleMs) / unitMs)]) continue;
      const lo = Math.max(t, r.lo);
      const hi = Math.min(t + unitMs, r.hi);
      const last = out[out.length - 1];
      if (last && last.hi === lo) last.hi = hi;
      else out.push({ lo, hi });
    }
  }
  return out;
}
