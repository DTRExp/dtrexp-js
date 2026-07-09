import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDTRExpIR,
  IExpressionIR,
  ISelector,
  ISpan,
  ITimeRange,
  ITimeSelector
} from '../types/index.js';

const MS_PER_DAY = 86_400_000;

/**
 *  Detects a parser-split midnight wrap (`[0, e)` + `[s, 24h)` with `s > e`) and
 *  returns the fused `s-e` range, else `null`. Shared by canonical and describe.
 */
export function midnightWrap(ranges: ITimeRange[]): ITimeRange | null {
  if (ranges.length !== 2) return null;
  const [first, second] = ranges as [ITimeRange, ITimeRange];
  if (first.startMs === 0 && second.endMs === MS_PER_DAY && second.startMs > first.endMs) {
    return { startMs: second.startMs, endMs: first.endMs };
  }
  return null;
}
/** Canonical component order: smallest unit first (spec §1). */
const ORDER: Record<string, number> = {
  s: 0,
  m: 1,
  H: 2,
  T: 3,
  E: 4,
  D: 5,
  W: 6,
  M: 7,
  Q: 8,
  Y: 9
};

/** Renders the compiled IR back to its canonical string form. */
export function toCanonicalString(ir: IDTRExpIR): string {
  return ir.expressions.map(renderExpression).join(' | ');
}

function renderExpression(expr: IExpressionIR): string {
  const parts: Array<{ order: number; text: string }> = [];
  for (const selector of expr.selectors) {
    const text = renderSelector(selector);
    if (text) parts.push({ order: ORDER[selector.unit] as number, text });
  }
  if (expr.time) parts.push({ order: ORDER.T as number, text: renderTime(expr.time) });
  parts.sort((a, b) => a.order - b.order);
  const rendered = parts.map((p) => p.text);
  if (expr.cadence) rendered.push(renderCadence(expr.cadence));
  if (expr.bounds) rendered.push(renderBounds(expr.bounds));
  // a lone redundant selector (e.g. `M*`) must still render something
  if (rendered.length === 0 && expr.selectors[0]) return `${expr.selectors[0].unit}*`;
  return rendered.join(' ');
}

function renderSelector(selector: ISelector): string {
  if (selector.stride) {
    const s = selector.stride;
    const end = s.end !== null ? `:${s.end}` : '';
    const duration = s.duration !== 1 ? `/${s.duration}` : '';
    return `${selector.unit}${s.start}${end}/${s.interval}${duration}`;
  }
  // full-domain plain selectors (`Y*`) are redundant — dropped unless alone.
  // (an ordinal selector always carries a concrete weekday, so it is never full-domain)
  if (!selector.exclude && isFullDomain(selector)) return '';
  const wrap = spanWrap(selector.spans);
  const spans = wrap ? `${wrap.start}:${wrap.end}` : selector.spans.map(renderSpan).join(',');
  const ordinal = selector.ordinal !== undefined ? `#${selector.ordinal}` : '';
  return `${selector.unit}${selector.exclude ? '!' : ''}${spans}${ordinal}`;
}

/**
 *  Detects a parser-split wrap range (`[s, edge]` + `[domain start, e]` with `s > e`)
 *  and returns the fused `s:e` pair, else `null`. Shared by canonical and describe.
 */
export function spanWrap(spans: ISpan[]): { start: number; end: number } | null {
  if (spans.length !== 2) return null;
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: equivalent — a mutant
  // can only admit extra up-candidates with a null, zero or negative start; the fuse guard below requires
  // up.start > down.end where down.end ≥ 1, which such a start can never satisfy, and candidate-order
  // changes never alter the outcome (the alternative candidate fails the same guard).
  const up = spans.find((s) => s.start !== null && s.start > 0 && s.end === null);
  // Stryker disable next-line ConditionalExpression: equivalent — dropping `s.end !== null` only admits
  // {null, null}, which the parser's star-in-list rejection guarantees never coexists with a second span.
  const down = spans.find((s) => s.start === null && s.end !== null && s.end > 0);
  if (up && down && (up.start as number) > (down.end as number)) {
    return { start: up.start as number, end: down.end as number };
  }
  return null;
}

function isFullDomain(selector: ISelector): boolean {
  // Stryker disable next-line ConditionalExpression: equivalent — spans[0] can only be {null, null} when it
  // is the sole span (star-in-list is rejected at parse), so multi-span selectors return false either way.
  if (selector.spans.length !== 1) return false;
  const first = selector.spans[0] as ISpan;
  return first.start === null && first.end === null;
}

function renderSpan(span: { start: number | null; end: number | null }): string {
  if (span.start === null && span.end === null) return '*';
  if (span.start === span.end) return String(span.start);
  return `${span.start ?? '*'}:${span.end ?? '*'}`;
}

function renderTime(time: ITimeSelector): string {
  const wrap = midnightWrap(time.ranges);
  if (wrap) return `T${fmtTime(wrap.startMs)}:${fmtTime(wrap.endMs)}`;
  return `T${time.ranges.map((range) => `${fmtTime(range.startMs)}:${fmtTime(range.endMs)}`).join(',')}`;
}

function fmtTime(ms: number): string {
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor(ms / 60_000) % 60;
  const ss = Math.floor(ms / 1000) % 60;
  const frac = ms % 1000;
  let out = `${pad2(hh)}${pad2(mm)}`;
  if (ss !== 0 || frac !== 0) out += pad2(ss);
  if (frac !== 0) out += `.${String(frac).padStart(3, '0')}`;
  return out;
}

function renderCadence(c: ICadence): string {
  const isDefault = c.duration === 1 && c.durationUnit === c.periodUnit;
  const duration = isDefault ? '' : `/${c.duration}${c.durationUnit}`;
  return `${renderLiteral(c.anchor)}/${c.period}${c.periodUnit}${duration}`;
}

function renderBounds(bounds: IBounds): string {
  // the parser gives a bare date literal the same object for start and end
  if (bounds.start && bounds.start === bounds.end) return renderLiteral(bounds.start);
  const start = bounds.start ? renderLiteral(bounds.start) : '*';
  const end = bounds.end ? renderLiteral(bounds.end) : '*';
  return `${start}:${end}`;
}

export function renderLiteral(literal: IDateLiteral): string {
  let out = `${String(literal.year).padStart(4, '0')}${pad2(literal.month)}${pad2(literal.day)}`;
  if (literal.hour !== undefined) {
    // the parser sets minute whenever it sets hour (Thhmm), so minute is defined here
    out += `T${pad2(literal.hour)}${pad2(literal.minute as number)}`;
    if (literal.second !== undefined) out += pad2(literal.second);
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
