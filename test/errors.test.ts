import { parse, validate } from '../src/index.js';
import { expectSyntaxError } from './helpers.js';

/** Each entry: expression → expected error code. Covers the paths not in vectors.json. */
const cases: Array<[string, string]> = [
  ['T12 T14', 'duplicate-designator'],
  ['E1:3#2', 'bad-ordinal'],
  ['E1,2#2', 'bad-ordinal'],
  ['E*#2', 'bad-ordinal'],
  ['M!3/2', 'stride-with-exclusion'],
  ['M-0', 'bad-value'],
  ['T1200:1200', 'empty-time-range'],
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
  ['M3:15/2', 'out-of-domain'],
  ['Y2030:2020', 'backwards-range'],
  ['M11:2/2', 'stride-on-wrap'],
  ['20180001', 'bad-date-literal'], // month 0
  ['20181301', 'bad-date-literal'], // month 13
  ['20180100', 'bad-date-literal'], // day 0
  ['20180230', 'bad-date-literal'], // Feb 30 does not exist
  ['20180301:20170301', 'backwards-bounds'],
  ['20200101/8D/9D', 'cadence-duration'], // duration >= period
  ['20200101/10D/1X', 'bad-cadence-unit'],
  ['Q0', 'out-of-domain'],
  ['H24', 'out-of-domain'],
  ['s60', 'out-of-domain'],
  ['20180101T120060', 'bad-date-literal'], // second 60
  ['T125960', 'bad-time-value'], // second 60 in a time value
  ['20200101/2H/120m', 'cadence-duration'] // duration equals period across units
];

/** Template / readInt messages must retain their interpolated, meaningful text. */
const messageWords: Array<[string, string]> = [
  ['M-13', 'domain'],
  ['Y2030:2020', 'Backwards'],
  ['20180230', 'calendar date'],
  ['T2500', 'Hour'],
  ['M3/14', 'exceeds'],
  ['M3 X5', 'Unexpected'],
  // readInt `what` labels surface when a required number is missing
  ['M', 'value'],
  ['E7#', 'ordinal'],
  ['M1/', 'interval'],
  ['M1/5/', 'duration'],
  ['20200101/', 'period'],
  ['20200101/5M/', 'duration']
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

describe('DTRExpSyntaxError shape', () => {
  it('carries a name, code, position and a message quoting the expression', () => {
    const err = expectSyntaxError(() => parse('M3 X5'));
    expect(err.name).toBe('DTRExpSyntaxError');
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
    expect(parse('T0000:2400').covers('2026-07-07T23:59:00Z')).toBe(true);
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
    // negative indices exactly at the domain size (E-7 → 7 days back from the week end)
    expect(() => parse('E-7')).not.toThrow();
    expect(() => parse('D-31 M1')).not.toThrow();
    // date-literal field maxima
    expect(() => parse('20241231')).not.toThrow(); // Dec 31
    expect(() => parse('20240229')).not.toThrow(); // leap Feb 29
    expect(() => parse('20180101T235959')).not.toThrow(); // 23:59:59
    expect(parse('20180101T120059').covers('2018-01-01T12:00:59Z')).toBe(true); // second 59
  });

  it('accepts time values at each precision and hour/minute/second maxima', () => {
    expect(() => parse('T23')).not.toThrow();
    expect(() => parse('T1259')).not.toThrow();
    expect(() => parse('T125959')).not.toThrow();
    expect(parse('T12').covers('2026-07-07T12:59:00Z')).toBe(true); // 1-hour unit
    expect(parse('T12').covers('2026-07-07T13:00:00Z')).toBe(false);
    expect(parse('T1230').covers('2026-07-07T12:30:30Z')).toBe(true); // 1-minute unit
    expect(parse('T1230').covers('2026-07-07T12:31:00Z')).toBe(false);
    expect(parse('T123015').covers('2026-07-07T12:30:15.500Z')).toBe(true); // 1-second unit
    expect(parse('T123015').covers('2026-07-07T12:30:16Z')).toBe(false);
  });

  it('accepts a cross-unit cadence duration just under its period', () => {
    // 119 minutes < 2 hours → valid; 120 would equal the period (rejected above)
    expect(() => parse('20200101/2H/119m')).not.toThrow();
    expect(parse('20200101T0000/2H/119m').covers('2020-01-01T01:58:00Z')).toBe(true);
    expect(parse('20200101T0000/2H/119m').covers('2020-01-01T01:59:30Z')).toBe(false);
  });
});

describe('parser: exact domain boundaries per unit', () => {
  const bad: Array<[string]> = [
    ['Q5'],
    ['Q-5'],
    ['W54'],
    ['W-54'],
    ['H24'],
    ['H-25'],
    ['m60'],
    ['m-61'],
    ['s60'],
    ['D32'],
    ['D-32'],
    ['D93 Q2'],
    ['D367 Y2020'],
    ['E0']
  ];
  for (const [e] of bad) {
    it(`rejects '${e}' as out-of-domain`, () => {
      expect(validate(e).errors[0]?.code).toBe('out-of-domain');
    });
  }

  const good = [
    'Q-4',
    'W-53',
    'H-24',
    'm-60',
    'D-31',
    'D92 Q2',
    'D366 Y2020',
    'M1:12/12',
    'M1/12',
    'Y2000:*/10000',
    '20200101/10D/36H'
  ];
  for (const e of good) {
    it(`accepts '${e}' at its boundary`, () => {
      expect(validate(e).valid).toBe(true);
    });
  }

  it('reports exact error positions for misplaced ordinals', () => {
    expect(validate('D5#2').errors[0]).toMatchObject({ code: 'ordinal-not-weekday', position: 2 });
    expect(validate('E*#2').errors[0]).toMatchObject({ code: 'bad-ordinal', position: 2 });
  });
});

describe('parser: time-value edges', () => {
  it('rejects an empty time range', () => {
    expect(validate('T1200:1200').errors[0]?.code).toBe('empty-time-range');
  });

  it("hour 24 is exactly the 4-digit '2400', in range-end position only", () => {
    expect(validate('T0000:2401').errors[0]?.code).toBe('bad-time-value');
    expect(validate('T0000:240030').errors[0]?.code).toBe('bad-time-value');
    expect(validate('T22:24').errors[0]?.code).toBe('bad-time-value'); // 2-digit 24
    expect(validate('T2300:24').errors[0]?.code).toBe('bad-time-value');
    expect(validate('T0000:240000').errors[0]?.code).toBe('bad-time-value'); // seconds precision
    expect(validate('T0000:2430').errors[0]?.code).toBe('bad-time-value');
    expect(validate('T2400:0100').errors[0]?.code).toBe('bad-time-value'); // range start
    expect(validate('T0900:2500').errors[0]?.code).toBe('bad-time-value'); // hour 25 in end position
    expect(validate('T2200:2400').errors).toEqual([]); // the one valid spelling
    expect(validate('T2300:2400').errors).toEqual([]); // hour 23 stays an ordinary value
  });

  it('allows fractional seconds only after six digits', () => {
    expect(validate('T1230.250').errors[0]?.code).toBe('unexpected-char');
    expect(validate('T12.5').errors[0]?.code).toBe('unexpected-char');
  });

  it('gives 2- and 4-digit values their implied unit interval', () => {
    expect(parse('T12').covers('2024-03-05T12:30:00Z')).toBe(true);
    expect(parse('T12').covers('2024-03-05T13:00:00Z')).toBe(false);
    expect(parse('T12').toString()).toBe('T1200:1300');
    expect(parse('T1230').covers('2024-03-05T12:30:30Z')).toBe(true);
    expect(parse('T1230').covers('2024-03-05T12:31:00Z')).toBe(false);
  });
});

describe('parser: exact codes, messages and positions (mutation hardening)', () => {
  const codes: Array<[string, string]> = [
    ['M3!5', 'misplaced-exclusion'],
    ['T0960:1000', 'bad-time-value'],
    ['20240101T1260', 'bad-date-literal'],
    ['T0000:240000.500', 'bad-time-value'],
    ['202401011', 'bad-date-literal'],
    ['20240101T1230:20240101T1215', 'backwards-bounds'],
    ['20240102T0000:20240101T2300', 'backwards-bounds'],
    ['M1/3/0', 'stride-duration'],
    ['20200101/3D/0D', 'cadence-duration'],
    ['20200101/3D/3D', 'cadence-duration'],
    ['20200106T0000/90m/2H', 'cadence-duration'],
    ['D40 M1 Q1', 'out-of-domain']
  ];
  for (const [e, code] of codes) {
    it(`'${e}' → ${code}`, () => {
      expect(validate(e).errors[0]?.code).toBe(code);
    });
  }

  it('keeps the specific messages of shape-vs-value failures', () => {
    expect(validate('202401').errors[0]?.message).toMatch(/YYYYMMDD/);
    expect(validate('Y0').errors[0]?.message).toMatch(/out of domain/);
  });

  it('accepts the boundary forms the checks must not swallow', () => {
    expect(validate('M3:3/2').valid).toBe(true); // a degenerate range is not a wrap
    expect(validate('M1/3/1').valid).toBe(true); // duration 1 is legal
    expect(validate('M3\tY2018').valid).toBe(true); // tab is whitespace
  });
});

describe('bounds: minute-precision span ends', () => {
  it('runs through the end of the bound minute, and no further', () => {
    expect(parse('*:20240101T1230').covers('2024-01-01T12:30:59Z')).toBe(true);
    expect(parse('*:20240101T1230').covers('2024-01-01T12:31:00Z')).toBe(false);
  });
});
