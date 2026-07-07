import { parse } from '../src/index.js';
import { expectSyntaxError } from './parser.test.js';

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
  ['M5-3', 'backwards-range'],
  ['20180001', 'bad-date-literal'], // month 0
  ['20181301', 'bad-date-literal'], // month 13
  ['20180100', 'bad-date-literal'], // day 0
  ['20180230', 'bad-date-literal'], // Feb 30 does not exist
  ['20180301-20170301', 'backwards-bounds'],
  ['20200101/8D/9D', 'cadence-duration'], // duration >= period
  ['20200101/10D/1X', 'bad-cadence-unit'],
  ['Q0', 'out-of-domain'],
  ['H24', 'out-of-domain'],
  ['s60', 'out-of-domain']
];

/** Template messages must retain their interpolated, meaningful text. */
const messageWords: Array<[string, string]> = [
  ['M-13', 'domain'],
  ['M5-3', 'Backwards'],
  ['20180230', 'calendar date'],
  ['T2500', 'Hour'],
  ['M3/14', 'exceeds'],
  ['M3 X5', 'Unexpected']
];

describe('parser: exhaustive error paths', () => {
  for (const [expression, code] of cases) {
    it(`'${expression}' → ${code}`, () => {
      const err = expectSyntaxError(() => parse(expression));
      expect(err.code).toBe(code);
      // the reported position lies within the expression
      expect(err.position).toBeGreaterThanOrEqual(0);
      expect(err.position).toBeLessThanOrEqual(expression.length);
    });
  }
});

describe('parser: template error messages keep their text', () => {
  for (const [expression, word] of messageWords) {
    it(`'${expression}' message contains "${word}"`, () => {
      const err = expectSyntaxError(() => parse(expression));
      expect(err.message).toContain(word);
    });
  }
});

describe('DTRESyntaxError shape', () => {
  it('carries a name, code, position and a message quoting the expression', () => {
    const err = expectSyntaxError(() => parse('M3 X5'));
    expect(err.name).toBe('DTRESyntaxError');
    expect(err.message).toContain("'M3 X5'");
    expect(err.message).toContain(String(err.position));
    expect(err.message).toContain('Unexpected');
  });
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

  it('accepts values exactly at each domain boundary', () => {
    // upper/lower domain edges must NOT be rejected (kills off-by-one validation mutants)
    for (const exp of [
      'M1',
      'M12',
      'Q1',
      'Q4',
      'E1',
      'E7',
      'W1',
      'W53',
      'H0',
      'H23',
      's0',
      's59'
    ]) {
      expect(() => parse(exp)).not.toThrow();
    }
    // date-literal field maxima
    expect(() => parse('20241231')).not.toThrow(); // Dec 31
    expect(() => parse('20240229')).not.toThrow(); // leap Feb 29
    expect(() => parse('20180101T235959')).not.toThrow(); // 23:59:59
    expect(parse('20180101T120059').covers('2018-01-01T12:00:59Z')).toBe(true); // second 59
  });
});
