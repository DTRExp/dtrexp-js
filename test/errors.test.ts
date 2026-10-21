import { parse, validate } from '../src/index.js';
import { expectSyntaxError } from './helpers.js';

/**
 *  Each entry: expression → expected error code and position (spec §8, *Error positions*).
 *  Covers the paths not in vectors.json.
 */
const cases: Array<[string, string, number]> = [
  ['T12 T14', 'duplicate-designator', 4],
  ['E1:3#2', 'bad-ordinal', 4],
  ['E1,2#2', 'bad-ordinal', 4],
  ['E*#2', 'bad-ordinal', 2],
  ['M!3/2', 'stride-with-exclusion', 3],
  ['M-0', 'bad-value', 1],
  ['T1200:1200', 'empty-time-range', 6],
  ['T123', 'bad-time-value', 1],
  ['T093015.25', 'bad-time-value', 7], // the fraction is its own token
  ['T093015.', 'bad-time-value', 7],
  ['T2400', 'bad-time-value', 1],
  ['T120060', 'bad-time-value', 1],
  ['*20180101', 'bad-bounds', 1],
  ['2018', 'bad-date-literal', 0],
  ['20180101T1', 'bad-date-literal', 0],
  ['20180101T2500', 'bad-date-literal', 0],
  ['20200101/10D/1M', 'cadence-duration-unit', 13],
  ['20200101/0M', 'zero-cadence-period', 9],
  ['M-13', 'out-of-domain', 1],
  ['E-8', 'out-of-domain', 1],
  ['M3:15/2', 'out-of-domain', 3],
  ['M13/2', 'out-of-domain', 1],
  ['Y2030:2020', 'backwards-range', 6],
  ['Y2030:2020/2', 'backwards-range', 6], // the range is wrong before its stride
  ['M11:2/2', 'stride-on-wrap', 5],
  ['M11:2/1', 'stride-on-wrap', 5], // the wrap comes before its interval
  // the earliest error wins: a rule error reads on to the end of its branch (spec §8)
  ['M13,X', 'out-of-domain', 1], // before the selector is complete
  ['Y2020:2019,X', 'backwards-range', 6],
  ['M-0 X', 'bad-value', 1],
  ['E7#0 X', 'ordinal-zero', 3],
  ['M1/1 X', 'stride-interval-min', 3],
  ['M1/3/3 X', 'stride-duration', 5],
  ['H22:0/2 X', 'stride-on-wrap', 5],
  ['Y*/3 X', 'anchorless-stride', 2],
  ['T25 X', 'bad-time-value', 1],
  ['T0900:0900,X', 'empty-time-range', 6],
  ['20230229 X', 'bad-date-literal', 0],
  ['20200101/0D X', 'zero-cadence-period', 9],
  ['20200101/2D/3D X', 'cadence-duration', 12],
  ['20200101/1D/1M X', 'cadence-duration-unit', 12],
  ['20180301:20170301 X', 'backwards-bounds', 9],
  ['20200101 20200102 X', 'duplicate-bounds', 9],
  ['20200101/2D 20200101/2D X', 'duplicate-cadence', 12],
  ['T09 T10 X', 'duplicate-designator', 4],
  ['M2147483648 X', 'integer-limit', 1],
  // D's domain waits for its scope: a grammar error first wins, a complete branch competes
  ['D40 M3/1', 'out-of-domain', 1],
  ['D40 20230229', 'out-of-domain', 1],
  ['D2/40 X', 'unexpected-char', 6],
  ['D2/40 M1', 'stride-interval-domain', 3],
  ['D1:40 Q1 M13', 'out-of-domain', 3],
  ['D0 X', 'unexpected-char', 3], // even where no scope could hold the value
  ['D-0 X', 'bad-value', 1], // '-0' is no value in any domain, so it does not wait
  ['D40 M*5', 'out-of-domain', 1], // the '*' completes M, and the 5 is a malformed date literal
  ['M11:2/3/3', 'stride-on-wrap', 5], // and before its duration
  ['H22:0/1', 'stride-on-wrap', 5], // a literal 0 end wraps
  ['M13:2/1', 'out-of-domain', 1], // a wrap's values are checked before the wrap
  ['Y2030:2020/1', 'backwards-range', 6],
  ['M3:*/1', 'stride-interval-min', 5], // an open end never wraps
  ['D5:-1/1', 'stride-interval-min', 6], // nor does a negative end
  ['D5:-1/3/3', 'stride-duration', 8],
  ['20180001', 'bad-date-literal', 0], // month 0
  ['20181301', 'bad-date-literal', 0], // month 13
  ['20180100', 'bad-date-literal', 0], // day 0
  ['20180230', 'bad-date-literal', 0], // Feb 30 does not exist
  ['M3 00000101', 'bad-date-literal', 3], // year 0
  ['20180301:20170301', 'backwards-bounds', 9],
  ['*:00000101', 'bad-date-literal', 2],
  ['20200101/8D/9D', 'cadence-duration', 12], // duration >= period
  ['20200101/10D/0D', 'cadence-duration', 13],
  ['20200101/10D/10D', 'cadence-duration', 13], // same unit, equal length
  ['20200101/1Y/12M', 'cadence-duration', 12], // mixed units stay conservative
  ['20200101/13M/1Y', 'cadence-duration', 13], // 366 days ≥ 13 × 28
  ['20200101/7D/1W', 'cadence-duration', 12],
  ['20200101/10D/1X', 'bad-cadence-unit', 14],
  ['Q0', 'out-of-domain', 1],
  ['H24', 'out-of-domain', 1],
  ['s60', 'out-of-domain', 1],
  ['20180101T120060', 'bad-date-literal', 0], // second 60
  ['T125960', 'bad-time-value', 1], // second 60 in a time value
  ['20200101/2H/120m', 'cadence-duration', 12], // duration equals period across units
  ['M1/0', 'stride-interval-min', 3],
  ['M1/3/0', 'stride-duration', 5],
  ['E7#-6', 'ordinal-range', 3], // an ordinal's sign belongs to its token
  ['E7#-0', 'ordinal-zero', 3],
  ['M-', 'expected-value', 2],
  ['M*,5', 'star-in-list', 2], // a leading bare star is a whole selector: the ',' cannot follow
  ['M!1,*', 'star-in-exclusion', 4],
  ['M!*/2', 'star-in-exclusion', 2],
  // the integer limit, in every place an integer stands; a value's token begins at its sign
  ['M2147483648', 'integer-limit', 1],
  ['M-2147483648', 'integer-limit', 1],
  ['D99999999999999999999999', 'integer-limit', 1],
  ['E7#-2147483648', 'integer-limit', 3],
  ['M1/2147483648', 'integer-limit', 3],
  ['M1/2/2147483648', 'integer-limit', 5],
  ['20200101/1D/2147483648m', 'integer-limit', 12],
  // only ASCII tokens come before an error, so code points and UTF-16 offsets agree
  ['M3 😀', 'unexpected-char', 3],
  ['M1 | M😀', 'expected-value', 6]
];

/** Template / readInt messages must retain their interpolated, meaningful text. */
const messageWords: Array<[string, string]> = [
  ['M-13', 'domain'],
  ['Y2030:2020', 'Backwards'],
  ['20180230', 'calendar date'],
  ['T2500', 'Hour'],
  ['M3/14', 'exceeds'],
  ['M3 X5', 'Unexpected'],
  ['M2147483648', 'limit of 2147483647'],
  ['M!*', "'M!*:*'"],
  ['M*,5', "'M*'"],
  // readInt `what` labels surface when a required number is missing
  ['M', 'value'],
  ['E7#', 'ordinal'],
  ['M1/', 'interval'],
  ['M1/5/', 'duration'],
  ['20200101/', 'period'],
  ['20200101/5M/', 'duration']
];

describe('parser: exhaustive error paths', () => {
  for (const [expression, code, position] of cases) {
    it(`'${expression}' → ${code} at ${position}`, () => {
      const err = expectSyntaxError(() => parse(expression));
      expect(err.code).toBe(code);
      expect(err.position).toBe(position);
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
  });

  it('takes only the ASCII space as whitespace (spec §1)', () => {
    for (const [s, at] of [
      ['M3\tY2018', 2],
      ['\tM3', 0],
      ['M3\t', 2],
      ['M3|\tM5', 3],
      ['M3\nD5', 2],
      ['M3\u00a0D5', 2]
    ] as const) {
      expect(validate(s).errors[0]).toMatchObject({
        position: at,
        message: expect.stringMatching(/^Unexpected character/)
      });
    }
    expect(validate('  M3   D5 |  M6  ').valid).toBe(true); // runs of spaces, anywhere
  });
});

describe('bounds: minute-precision span ends', () => {
  it('runs through the end of the bound minute, and no further', () => {
    expect(parse('*:20240101T1230').covers('2024-01-01T12:30:59Z')).toBe(true);
    expect(parse('*:20240101T1230').covers('2024-01-01T12:31:00Z')).toBe(false);
  });
});

describe('parser: forms at the edges of the draft 3 rules that must parse', () => {
  it('reads leading zeros without limit and the largest integer', () => {
    expect(parse('M00000000000000000003').toString()).toBe('M3');
    expect(() => parse('Y1:*/2147483647')).not.toThrow();
    expect(() => parse('20200101/2147483647m')).not.toThrow();
    expect(() => parse('20200101/0002147483647D/1D')).not.toThrow();
  });

  it('accepts `*:*` as a list item at either end, as the whole domain', () => {
    for (const e of ['M*:*,5', 'M5,*:*']) {
      expect(parse(e).toString()).toBe('M*');
      expect(parse(e).covers('2026-01-15T00:00:00Z')).toBe(true);
    }
  });

  it('compares mixed-precision bounds by the first start and the last end', () => {
    // the coarse end's span runs to the end of the day, past the fine start
    expect(parse('20240101T1800:20240101').covers('2024-01-01T23:59:59Z')).toBe(true);
    // a second-precision start inside the end's minute (spec §6)
    expect(parse('20180120T180000:20180120T1800').covers('2018-01-20T18:00:59Z')).toBe(true);
    expect(() => parse('20240101T1759:20240101T175959')).not.toThrow(); // a one-second window
  });

  it('compares H and m cadence lengths exactly', () => {
    expect(() => parse('20200101/61m/1H')).not.toThrow(); // 60 < 61
    expect(() => parse('20200101/1H/59m')).not.toThrow();
    expect(() => parse('20200101/1D/1439m')).not.toThrow();
    expect(validate('20200101/1D/1440m').errors[0]?.code).toBe('cadence-duration');
  });

  it('compares same-unit cadence lengths exactly', () => {
    expect(() => parse('20200101/11M/10M')).not.toThrow(); // 10 × 31 days ≥ 11 × 28, yet 10 < 11
    expect(() => parse('20200101/366Y/365Y')).not.toThrow();
    expect(() => parse('20200101/2W/13D')).not.toThrow();
    expect(() => parse('20200101/14M/1Y')).not.toThrow(); // 366 days < 14 × 28
    expect(() => parse('20200101/8D/1W')).not.toThrow();
  });

  it('strides a range whose end is 0 only when it does not wrap', () => {
    expect(() => parse('H0:0/2')).not.toThrow();
    expect(() => parse('D2:-1/5')).not.toThrow(); // a negative end clips, never wraps
  });

  it('names D in its deferred domain errors', () => {
    expect(validate('D40').errors[0]?.message).toContain("Value 40 out of domain for 'D'");
    expect(validate('D2/40 M1').errors[0]?.message).toContain("exceeds the 'D' domain");
  });

  it('takes a Y range whose end equals its start', () => {
    expect(() => parse('Y2020:2020')).not.toThrow();
    expect(() => parse('Y2020:2020/2')).not.toThrow();
  });
});
