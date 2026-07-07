import type {
  IBounds,
  ICadence,
  IDateLiteral,
  IDtreIR,
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
export function toCanonicalString(ir: IDtreIR): string {
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
    const end = s.end !== null ? `-${s.end}` : '';
    const duration = s.duration !== 1 ? `/${s.duration}` : '';
    return `${selector.unit}${s.start}${end}/${s.interval}${duration}`;
  }
  // full-domain plain selectors (`Y*`) are redundant — dropped unless alone.
  // (an ordinal selector always carries a concrete weekday, so it is never full-domain)
  if (!selector.exclude && isFullDomain(selector)) return '';
  const spans = selector.spans.map(renderSpan).join(',');
  const ordinal = selector.ordinal !== undefined ? `#${selector.ordinal}` : '';
  return `${selector.unit}${selector.exclude ? '!' : ''}${spans}${ordinal}`;
}

function isFullDomain(selector: ISelector): boolean {
  if (selector.spans.length !== 1) return false;
  const first = selector.spans[0] as ISpan;
  return first.start === null && first.end === null;
}

function renderSpan(span: { start: number | null; end: number | null }): string {
  if (span.start === null && span.end === null) return '*';
  if (span.start === span.end) return String(span.start);
  return `${span.start ?? '*'}-${span.end ?? '*'}`;
}

function renderTime(time: ITimeSelector): string {
  const wrap = midnightWrap(time.ranges);
  if (wrap) return `T${fmtTime(wrap.startMs)}-${fmtTime(wrap.endMs)}`;
  return `T${time.ranges.map((range) => `${fmtTime(range.startMs)}-${fmtTime(range.endMs)}`).join(',')}`;
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
  return `${start}-${end}`;
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
