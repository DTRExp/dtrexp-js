import { DTRExp, parse, validate } from '../src/index.js';

describe('validate()', () => {
  it('accepts a valid expression with no warnings', () => {
    expect(validate('M3 Y2018')).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('accepts but warns on a statically unsatisfiable expression', () => {
    const result = validate('D30 M2');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]?.code).toBe('unsatisfiable');
  });

  it('warns when the selected months never fall inside the selected quarters', () => {
    // negatives resolve against their own scope: M-1 is December (spec §2, §9.1)
    expect(validate('M-1 Q1').warnings[0]?.code).toBe('unsatisfiable');
    expect(validate('M-2 Q2').warnings[0]?.code).toBe('unsatisfiable');
    expect(validate('M12,1 Q2:3').warnings[0]?.code).toBe('unsatisfiable');
  });

  it('warns on W53 only when every selected year is a 52-week year', () => {
    expect(validate('W53 Y2021').warnings[0]?.code).toBe('unsatisfiable');
    expect(validate('W53 Y2021:2023').warnings[0]?.code).toBe('unsatisfiable'); // 2021–23 are all 52-week years
    expect(validate('W53 Y2020:2021').warnings).toEqual([]); // 2020 has 53 weeks
    expect(validate('W53 Y2020:*').warnings).toEqual([]); // open span — statically undecidable
    expect(validate('W53 Y1000:3000').warnings).toEqual([]); // too wide to scan
    expect(validate('W53,1 Y2021').warnings).toEqual([]); // W1 always exists
  });

  it('treats a zero end as an ordinary wrap endpoint on 0-based domains', () => {
    // H22:0 wraps (spec §3: literal non-negative endpoints) — hours 22, 23, 0; no warning
    expect(validate('H22:0').valid).toBe(true);
    expect(validate('H22:0').warnings).toEqual([]);
    expect(validate('H0:5').warnings).toEqual([]);
    expect(validate('H22:6').warnings).toEqual([]); // a true wrap stays quiet
  });

  it('resolves zero endpoints literally when the other endpoint is negative', () => {
    // negative endpoints never wrap (spec §3); the zero side resolves as the literal 0
    expect(validate('H0:-1').warnings).toEqual([]); // hours 0–23 in every instance — quiet
    expect(validate('H-1:0').warnings[0]?.code).toBe('unsatisfiable'); // 23:0 backwards everywhere
  });

  it('stays quiet when months and quarters do intersect', () => {
    expect(validate('M3 Q1').warnings).toEqual([]);
    expect(validate('M-1 Q4').warnings).toEqual([]);
    expect(validate('M11:2 Q1').warnings).toEqual([]); // wrap reaches Jan–Feb
    expect(validate('M* Q2').warnings).toEqual([]);
    expect(validate('M!3 Q1').warnings).toEqual([]); // exclusions are skipped
    expect(validate('M1/3 Q2').warnings).toEqual([]); // strides are skipped
  });

  it('reports errors without throwing', () => {
    const result = validate('M13');
    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors[0]).toMatchObject({ code: 'out-of-domain', position: expect.any(Number) });
  });
});

describe('parse() / DTRExp surface', () => {
  it('exposes the original source verbatim', () => {
    expect(parse('  M3   Y2018 ').source).toBe('  M3   Y2018 ');
  });

  it('exposes the compiled IR via the internal accessor', () => {
    const dtrexp = parse('M3');
    expect(dtrexp._ir.expressions).toHaveLength(1);
  });

  it('is an instance of DTRExp', () => {
    expect(parse('M3')).toBeInstanceOf(DTRExp);
  });
});

describe('covers() — instant input forms', () => {
  const dtrexp = parse('M3');
  const march = '2024-03-15T00:00:00Z';
  const april = '2024-04-15T00:00:00Z';

  it('accepts a Date', () => {
    expect(dtrexp.covers(new Date(march))).toBe(true);
    expect(dtrexp.covers(new Date(april))).toBe(false);
  });

  it('accepts epoch milliseconds', () => {
    expect(dtrexp.covers(Date.parse(march))).toBe(true);
  });

  it('accepts an ISO 8601 string', () => {
    expect(dtrexp.covers(march)).toBe(true);
  });

  it('accepts a Temporal-like object with epochMilliseconds', () => {
    expect(dtrexp.covers({ epochMilliseconds: Date.parse(march) })).toBe(true);
  });

  it('defaults the time zone to UTC', () => {
    // 2024-03-01T00:30 in UTC is March; would still be Feb in a negative-offset zone
    expect(dtrexp.covers('2024-03-01T00:30:00Z')).toBe(true);
  });

  it('rejects an unsupported input type with a specific message', () => {
    // these casts exercise the runtime type guard from untyped callers
    expect(() => dtrexp.covers(true as unknown as number)).toThrow(/Expected a Date/);
    expect(() => dtrexp.covers(null as unknown as number)).toThrow(/Expected a Date/);
    // an object lacking epochMilliseconds is not a Temporal instant
    expect(() => dtrexp.covers({} as unknown as number)).toThrow(/Expected a Date/);
  });

  it('rejects a non-finite instant with a specific message', () => {
    expect(() => dtrexp.covers(Number.NaN)).toThrow(/Invalid instant/);
    expect(() => dtrexp.covers(new Date('not a date'))).toThrow(/Invalid instant/);
    expect(() => dtrexp.covers('not a date')).toThrow(/Invalid instant/);
    // a Temporal-like object carrying a non-finite epoch
    expect(() => dtrexp.covers({ epochMilliseconds: Number.POSITIVE_INFINITY })).toThrow(
      /Invalid instant/
    );
  });
});

describe('describe() — locale guard', () => {
  it('supports en by default', () => {
    expect(parse('M3').describe()).toBe('in March');
    expect(parse('M3').describe('en')).toBe('in March');
  });

  it('throws on an unsupported locale with a specific message', () => {
    expect(() => parse('M3').describe('fr')).toThrow(/Unsupported locale/);
  });
});

describe('validate() — inverted-range warnings across every unit scope', () => {
  const warns = [
    'M12:-2',
    'D-1:26 M1',
    'D-1:80 Q2',
    'Q-1:2',
    'E-1:2',
    'H-1:5',
    'm-1:5',
    's-1:55',
    'W-1:10',
    'W-1:40',
    'D-1:26',
    'D-1:300 Y2024',
    'D-25:20 Q1',
    'M-2:10',
    'E5 W53 Y2021',
    'E1 M-1 Q1',
    'E1 D30 M2'
  ];
  for (const e of warns) {
    it(`warns on '${e}'`, () => {
      expect(validate(e).warnings[0]?.code).toBe('unsatisfiable');
    });
  }

  const quiet = [
    'H-24:5',
    'E-7:1',
    'Q-4:1',
    'M!-2:2',
    'H22:*',
    'D-7:*',
    'W1:53 Y2021',
    'W53:* Y2021',
    'W53 Y2021:2026',
    'M-3 Q4',
    'M4 Q2',
    'M5 Q2',
    'M6 Q2',
    'D5 M3',
    'D31 M4:5',
    'D31 M1,2',
    'D5,30 M2',
    'D29 M2',
    'D-25:20 M1 Q1'
  ];
  for (const e of quiet) {
    it(`stays quiet on '${e}'`, () => {
      expect(validate(e).warnings).toEqual([]);
    });
  }

  it('carries a meaningful message on every lint', () => {
    expect(validate('M-2:2').warnings[0]?.message).toMatch(/backwards/);
    expect(validate('W53 Y2021').warnings[0]?.message).toMatch(/Week 53/);
    expect(validate('M-1 Q1').warnings[0]?.message).toMatch(/quarter/);
    expect(validate('D30 M2').warnings[0]?.message).toMatch(/Day 30/);
  });
});
