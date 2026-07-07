import { parseToIR } from '../src/core/Parser.js';
import { DTRESyntaxError } from '../src/DTRESyntaxError.js';
import vectors from './vectors.json' with { type: 'json' };

/** Asserts a thrown error is a DTRESyntaxError with a real (non-empty) message. */
export function expectSyntaxError(fn: () => unknown): DTRESyntaxError {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DTRESyntaxError);
  const e = err as DTRESyntaxError;
  // the message begins with the specific reason, then the ` (at position …)` suffix;
  // an emptied message string would begin with that suffix instead
  expect(e.message.trimStart()).not.toMatch(/^\(at position/);
  // every error carries a non-empty kebab-case code
  expect(e.code).toMatch(/^[a-z][a-z-]*[a-z]$/);
  return e;
}

describe('parser: conformance — rejection vectors', () => {
  for (const { expression, reason } of vectors.invalid) {
    it(`rejects '${expression}' (${reason})`, () => {
      expectSyntaxError(() => parseToIR(expression));
    });
  }
});

describe('parser: conformance — warning vectors', () => {
  for (const { expression, warning } of vectors.warnings) {
    it(`warns on '${expression}' (${warning})`, () => {
      const { warnings } = parseToIR(expression);
      expect(warnings.length).toBeGreaterThan(0);
    });
  }
});

describe('parser: conformance — coverage expressions all parse', () => {
  for (const group of vectors.coverage) {
    it(`parses '${group.expression}' (${group.id})`, () => {
      expect(() => parseToIR(group.expression)).not.toThrow();
    });
  }
});

describe('parser: IR shapes', () => {
  it('compiles a selector with list spans', () => {
    const { ir } = parseToIR('M1,3,7-9');
    expect(ir.expressions).toHaveLength(1);
    const [expr] = ir.expressions;
    expect(expr?.selectors[0]).toEqual({
      unit: 'M',
      exclude: false,
      spans: [
        { start: 1, end: 1 },
        { start: 3, end: 3 },
        { start: 7, end: 9 }
      ]
    });
  });

  it('compiles exclusions, negatives and open ranges', () => {
    const { ir } = parseToIR('M!5,7-9 D-7-*');
    const [expr] = ir.expressions;
    expect(expr?.selectors[0]?.exclude).toBe(true);
    expect(expr?.selectors[1]?.spans).toEqual([{ start: -7, end: null }]);
  });

  it('compiles strides with defaults', () => {
    const { ir } = parseToIR('M1/5/2');
    expect(ir.expressions[0]?.selectors[0]?.stride).toEqual({
      start: 1,
      end: null,
      interval: 5,
      duration: 2
    });
    const open = parseToIR('Y2020-*/3').ir.expressions[0]?.selectors[0]?.stride;
    expect(open).toEqual({ start: 2020, end: null, interval: 3, duration: 1 });
  });

  it('compiles ordinals', () => {
    const { ir } = parseToIR('E7#-1 M4');
    expect(ir.expressions[0]?.selectors[0]?.ordinal).toBe(-1);
  });

  it('splits midnight-wrapping time ranges within the day', () => {
    const { ir } = parseToIR('T2200-0600');
    expect(ir.expressions[0]?.time?.ranges).toEqual([
      { startMs: 0, endMs: 6 * 3_600_000 },
      { startMs: 22 * 3_600_000, endMs: 24 * 3_600_000 }
    ]);
  });

  it('compiles time lists and precisions', () => {
    const { ir } = parseToIR('T0900-1200,1300-1800');
    expect(ir.expressions[0]?.time?.ranges).toHaveLength(2);
    const single = parseToIR('T12').ir.expressions[0]?.time?.ranges;
    expect(single).toEqual([{ startMs: 12 * 3_600_000, endMs: 13 * 3_600_000 }]);
    const ms = parseToIR('T093015.250').ir.expressions[0]?.time?.ranges;
    expect(ms?.[0]?.endMs).toBe((ms?.[0]?.startMs as number) + 1);
    const fullDay = parseToIR('T0000-2400').ir.expressions[0]?.time?.ranges;
    expect(fullDay).toEqual([{ startMs: 0, endMs: 86_400_000 }]);
  });

  it('compiles cadences with default and explicit durations', () => {
    const { ir } = parseToIR('20180301/14M');
    expect(ir.expressions[0]?.cadence).toEqual({
      anchor: { year: 2018, month: 3, day: 1 },
      period: 14,
      periodUnit: 'M',
      duration: 1,
      durationUnit: 'M'
    });
    const explicit = parseToIR('20240131/3M/1D').ir.expressions[0]?.cadence;
    expect(explicit?.duration).toBe(1);
    expect(explicit?.durationUnit).toBe('D');
  });

  it('compiles bounds in all four forms', () => {
    expect(parseToIR('20150101-*').ir.expressions[0]?.bounds).toEqual({
      start: { year: 2015, month: 1, day: 1 },
      end: null
    });
    expect(parseToIR('*-20291231').ir.expressions[0]?.bounds?.start).toBeNull();
    const single = parseToIR('20180120').ir.expressions[0]?.bounds;
    expect(single?.start).toEqual(single?.end);
    const withTime = parseToIR('*-20180120T1800').ir.expressions[0]?.bounds?.end;
    expect(withTime).toEqual({ year: 2018, month: 1, day: 20, hour: 18, minute: 0 });
  });

  it('parses unions and tolerates missing spaces', () => {
    expect(parseToIR('E5#1 | E5#3').ir.expressions).toHaveLength(2);
    expect(parseToIR('E2M3,5').ir.expressions[0]?.selectors).toHaveLength(2);
  });

  it('reports position and code on errors', () => {
    try {
      parseToIR('M3 X5');
      expect.unreachable();
    } catch (err) {
      const e = err as DTRESyntaxError;
      expect(e.code).toBe('unexpected-char');
      expect(e.position).toBe(3);
      expect(e.expression).toBe('M3 X5');
    }
  });
});
