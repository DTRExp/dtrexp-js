import { selectedValues } from '../src/core/Parser.js';
import { DTRExp, parse, validate } from '../src/index.js';
import type { ISelector, ISpan, Unit } from '../src/types/index.js';

describe('DTRExp#warnings', () => {
  it('is empty for a clean expression', () => {
    expect(parse('M3 Y2018').warnings).toEqual([]);
  });

  it('carries the same content as validate().warnings', () => {
    expect(parse('D30 M2').warnings).toEqual(validate('D30 M2').warnings);
    expect(parse('D30 M2').warnings[0]?.code).toBe('unsatisfiable');
  });
});

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

  it('applies the day lint to strides by their anchor', () => {
    expect(validate('D30:*/2 M2').warnings[0]?.code).toBe('unsatisfiable'); // dead anchor — no Feb reaches day 30
    expect(validate('D5:*/2 M2').warnings).toEqual([]); // live anchor stays quiet
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

  it('warns on year-scoped D only when it misses every selected calendar year', () => {
    expect(validate('D366 Y2021').warnings[0]?.code).toBe('unsatisfiable');
    expect(validate('D366 Y2021').warnings[0]?.message).toMatch(/never occur/);
    expect(validate('D366 Y2021:2023').warnings[0]?.code).toBe('unsatisfiable'); // 2021–23 are all common years
    expect(validate('D366:* Y2021').warnings[0]?.code).toBe('unsatisfiable'); // 366:* resolves 366:365 — empty
    expect(validate('D-366 Y2021').warnings[0]?.code).toBe('unsatisfiable'); // 366th-from-last needs 366 days
    expect(validate('E1 D366 Y2021').warnings[0]?.code).toBe('unsatisfiable'); // E doesn't rescope D
    expect(validate('D366 Y2020').warnings).toEqual([]); // leap year has a day 366
    expect(validate('D366:* Y2020').warnings).toEqual([]);
    expect(validate('D-366 Y2020').warnings).toEqual([]);
    expect(validate('D366 Y2020:2021').warnings).toEqual([]);
    expect(validate('D366 Y2020:*').warnings).toEqual([]); // open span — statically undecidable
    expect(validate('D366 Y1000:3000').warnings).toEqual([]); // too wide to scan
    expect(validate('D366,1 Y2021').warnings).toEqual([]); // D1 always exists
    expect(validate('D!366 Y2021').warnings).toEqual([]); // the complement keeps days 1–365
    expect(validate('D*:5 Y2021').warnings).toEqual([]); // a star start resolves to day 1
    expect(validate('D366 W1 Y2025').warnings).toEqual([]); // Y is the week-year here — Dec 31 2024 is day 366 inside it
    expect(validate('D366 Y2021/2').warnings[0]?.code).toBe('unsatisfiable'); // odd years are never leap years
    expect(validate('D366 Y2020/4').warnings).toEqual([]); // an open stride still names its years
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
    expect(validate('D-1:350 Y*').warnings[0]?.code).toBe('unsatisfiable'); // year-scoped: day 365/366 is never ≤ 350
  });

  it('stays quiet when months and quarters do intersect', () => {
    expect(validate('M3 Q1').warnings).toEqual([]);
    expect(validate('M-1 Q4').warnings).toEqual([]);
    expect(validate('M11:2 Q1').warnings).toEqual([]); // wrap reaches Jan–Feb
    expect(validate('M* Q2').warnings).toEqual([]);
    expect(validate('M!3 Q1').warnings).toEqual([]); // the complement keeps January and February
    expect(validate('M1/3 Q2').warnings).toEqual([]); // the stride selects April
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

  it('rejects a string instant that is not a real date-time instead of rolling it over', () => {
    const all = parse('E1:7');
    for (const s of [
      '2020-02-30T00:00:00Z',
      '2021-02-29T00:00:00Z',
      '2020-04-31',
      '2020-01-01T24:00:00Z',
      '2020-01-01 24:00:00Z',
      '+002021-02-29T00:00:00Z',
      ' 2020-02-30',
      'Tue 2020-02-30',
      '2100-02-29T00:00:00Z' // not a leap year
    ]) {
      expect(() => all.covers(s)).toThrow(
        new TypeError(`Invalid instant: '${s}' is not a real date-time`)
      );
    }
    // the last day of each month, a leap day, the last hour and an extended year stay real
    for (const s of [
      '2020-02-29T00:00:00Z',
      '2021-02-28T23:59:59Z',
      '2020-04-30',
      '2020-12-31T23:00:00+02:00',
      '+002020-01-31T00:00:00Z',
      '2000-02-29T00:00:00Z'
    ]) {
      expect(all.covers(s)).toBe(true);
    }
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
    'E1 D30 M2',
    'W53:* Y2021'
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
    expect(validate('M-2:2').warnings[0]?.message).toMatch(/'M' selects no value/);
    expect(validate('W53 Y2021').warnings[0]?.message).toMatch(/week\(s\) never occur/);
    expect(validate('M-1 Q1').warnings[0]?.message).toMatch(/quarter/);
    expect(validate('D30 M2').warnings[0]?.message).toMatch(/day\(s\) never occur/);
    expect(validate('D30 M2').warnings[0]?.message).toMatch(/covers nothing$/);
  });
});

describe('validate() — the §9.1 required minimum as value-set emptiness', () => {
  const warnsAt: Array<[string, number]> = [
    ['H!0:23', 0], // full-domain exclusions on every fixed domain
    ['Q!*:*', 0],
    ['s!0:59', 0],
    ['E7 M!1:12', 3],
    ['Q2 M!4:6', 3], // the months left all fall outside Q2
    ['M1:9/3 Q4', 0], // the stride selects 1, 4 and 7
    ['M!*:* Q1', 0], // a dead M warns as itself, before M ∩ Q
    ['D92 Q2', 0], // Q2 has 91 days
    ['D-92 Q1', 0],
    ['D31 M4,6,7 Q2', 0], // M ∩ Q leaves April and June
    ['D31:*/2 M4,6', 0],
    ['D366 Y2021:2022', 0],
    ['D366 Y9997:*', 0], // an open span still names its years: 9997–9999 are common
    ['W53 Y2021:2025/2', 0],
    ['Y2021 W53', 6], // the warning names the dead selector
    ['M3 | D30 M2', 5],
    ['H!*:* M!1:12', 0] // one warning per expression
  ];
  for (const [e, position] of warnsAt) {
    it(`warns on '${e}' at ${position}`, () => {
      const { valid, warnings } = validate(e);
      expect(valid).toBe(true);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ code: 'unsatisfiable', position });
    });
  }

  it('stays quiet on the longest day of every month and quarter', () => {
    const longest = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    longest.forEach((day, i) => {
      expect(validate(`D${day} M${i + 1}`).warnings).toEqual([]);
    });
    [91, 91, 92, 92].forEach((day, i) => {
      expect(validate(`D${day} Q${i + 1}`).warnings).toEqual([]);
    });
  });

  const quiet = [
    'M2:5/3 Q2', // the stride selects May
    'M1:12/3 Q4', // and October
    'D92 Q3',
    'D91 Q1', // a leap Q1
    'D-91 Q1',
    'D92 Q1,3',
    'D31 M4:7 Q2', // May
    'D29:31/5 M2', // a leap February
    'D366 Y2020,2021',
    'D366 Y!2020', // the complement holds leap years
    'W53 Y!2020',
    'W53 Y2015:*/11', // 2015 has 53 weeks
    'D366 W1 Y2021', // W makes Y the week-year; day-of-year stays calendar
    'D366 W* Y2021'
  ];
  for (const e of quiet) {
    it(`stays quiet on '${e}'`, () => {
      expect(validate(e)).toEqual({ valid: true, errors: [], warnings: [] });
    });
  }
});

describe('selectedValues()', () => {
  const sel = (unit: Unit, spans: ISpan[], extra: Partial<ISelector> = {}): ISelector => ({
    unit,
    exclude: false,
    spans,
    ...extra
  });

  it('resolves negatives and `*` against the instance', () => {
    expect(selectedValues(sel('D', [{ start: -3, end: null }]), 28)).toEqual([26, 27, 28]);
    expect(selectedValues(sel('D', [{ start: null, end: 2 }]), 28)).toEqual([1, 2]);
    expect(selectedValues(sel('D', [{ start: 30, end: 30 }]), 29)).toEqual([]);
    expect(selectedValues(sel('D', [{ start: -30, end: -30 }]), 29)).toEqual([]);
    expect(selectedValues(sel('D', [{ start: -1, end: -2 }]), 31)).toEqual([]);
    expect(selectedValues(sel('H', [{ start: -1, end: -1 }]), 23)).toEqual([23]);
  });

  it('expands a stride to its values, with its duration and end', () => {
    const stride = { start: 1, end: null, interval: 5, duration: 2 };
    expect(selectedValues(sel('M', [], { stride }), 12)).toEqual([1, 2, 6, 7, 11, 12]);
    const clipped = { start: 2, end: -1, interval: 5, duration: 1 };
    expect(selectedValues(sel('D', [], { stride: clipped }), 30)).toEqual([2, 7, 12, 17, 22, 27]);
    const capped = { start: 0, end: 6, interval: 4, duration: 1 };
    expect(selectedValues(sel('H', [], { stride: capped }), 23)).toEqual([0, 4]);
  });

  it('takes an exclusion as the complement, from 0 on the 0-based domains', () => {
    const wrap = [
      { start: 22, end: null },
      { start: null, end: 0 }
    ];
    expect(selectedValues(sel('H', wrap, { exclude: true }), 23)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1)
    );
    expect(selectedValues(sel('M', [{ start: 2, end: 12 }], { exclude: true }), 12)).toEqual([1]);
  });
});
