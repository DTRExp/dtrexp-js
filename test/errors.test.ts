import { DTRESyntaxError } from '../src/DTRESyntaxError.js';
import { parse } from '../src/index.js';

/** Each entry: expression → expected error code. Covers the paths not in vectors.json. */
const cases: Array<[string, string]> = [
  ['T12 T14', 'duplicate-designator'],
  ['E1-3#2', 'bad-ordinal'],
  ['E1,2#2', 'bad-ordinal'],
  ['E*#2', 'bad-ordinal'],
  ['M!3/2', 'stride-with-exclusion'],
  ['M-0', 'bad-value'],
  ['T1200-1200', 'empty-time-range'],
  ['T123', 'bad-time-value'],
  ['T093015.25', 'bad-time-value'],
  ['T2400', 'bad-time-value'],
  ['T120060', 'bad-time-value'],
  ['*20180101', 'bad-bounds'],
  ['2018', 'bad-date-literal'],
  ['20180101T1', 'bad-date-literal'],
  ['20180101T2500', 'bad-date-literal'],
  ['20200101/10D/1M', 'cadence-duration-unit'],
  ['20200101/0M', 'zero-cadence-period'],
  ['M-13', 'out-of-domain'],
  ['E-8', 'out-of-domain'],
  ['M3-15/2', 'out-of-domain'],
  ['M5-3', 'backwards-range']
];

describe('parser: exhaustive error paths', () => {
  for (const [expression, code] of cases) {
    it(`'${expression}' → ${code}`, () => {
      try {
        parse(expression);
        expect.unreachable(`expected '${expression}' to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(DTRESyntaxError);
        expect((err as DTRESyntaxError).code).toBe(code);
      }
    });
  }
});

describe('parser: valid edge forms that must parse', () => {
  it('accepts a bounds literal with seconds precision', () => {
    const bounds = parse('20180101T120030').source;
    expect(bounds).toBe('20180101T120030');
    expect(parse('20180101T120030').covers('2018-01-01T12:00:30Z')).toBe(true);
  });

  it('accepts a full-day time range and a bare hour', () => {
    expect(parse('T0000-2400').covers('2026-07-07T23:59:00Z')).toBe(true);
    expect(parse('T12').covers('2026-07-07T12:30:00Z')).toBe(true);
  });
});
