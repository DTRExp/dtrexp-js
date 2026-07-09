import { parse } from '../src/index.js';

describe('describe() — full branch coverage', () => {
  const cases: Array<[string, string]> = [
    ['T0900:1800 E1:5 M3', '09:00–18:00, from Monday to Friday, in March'],
    ['M1/5/2', 'every 5th month from January, 2 months long'],
    ['E7#-2 M5', 'the 2nd-to-last Sunday in May'],
    ['W16', 'in week 16'],
    ['H12', 'at hour 12'],
    ['m30', 'at minute 30'],
    ['s45', 'at second 45'],
    ['Q2', 'in Q2'],
    ['M-1', 'in 1st-to-last'],
    ['T2200:0600', '22:00–06:00'],
    ['T093015:093020', '09:30:15–09:30:20'],
    ['20180301/14M', 'every 14 months from 2018-03-01'],
    ['20180301/1M/1D', 'every month from 2018-03-01, 1 day long'],
    ['20200106/10D/2D', 'every 10 days from 2020-01-06, 2 days long'],
    ['20180120', 'on 2018-01-20'],
    ['20150101:*', 'from 2015-01-01'],
    ['20180301:20190425', 'from 2018-03-01 through 2019-04-25'],
    ['Y2000:2100/11', 'every 11th year from 2000 to 2100'],
    ['Y2000:2100/12', 'every 12th year from 2000 to 2100'],
    ['Y2000:2100/13', 'every 13th year from 2000 to 2100']
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => {
      expect(parse(input).describe()).toBe(expected);
    });
  }
});

describe('toRRule() — full branch coverage', () => {
  const cases: Array<[string, string | null]> = [
    ['Q2', 'RRULE:FREQ=YEARLY;BYMONTH=4,5,6'],
    ['Q*', null],
    ['E*', null],
    ['Y2020:2030', 'DTSTART;VALUE=DATE:20200101\nRRULE:FREQ=YEARLY;UNTIL=20301231'],
    ['Y2020,2025', null],
    ['Y*', null],
    ['W-1', null],
    ['D5 Q2', null],
    ['D60 Y2024', 'DTSTART;VALUE=DATE:20240101\nRRULE:FREQ=YEARLY;BYYEARDAY=60;UNTIL=20241231'],
    ['D15', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15'],
    ['W3 E5#2', null], // BYWEEKNO is YEARLY-only; ordinal BYDAY is MONTHLY/YEARLY-only
    ['E3 M3', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=WE'],
    ['M3 Y2018 20150101:*', null],
    ['M3 *:20180120T1800', null],
    [
      'M3 Y2018 *:20200101',
      'DTSTART;VALUE=DATE:20180101\nRRULE:FREQ=YEARLY;BYMONTH=3;UNTIL=20181231'
    ],
    ['M*', null],
    ['M3:*', null],
    ['M-1', null], // BYMONTH takes no negative values (RFC 5545)
    ['M-3:*', null],
    ['E7#2 Q1', null],
    ['M3:-1', null],
    ['M1/5/2', 'RRULE:FREQ=YEARLY;BYMONTH=1,2,6,7,11,12'],
    ['D*', null],
    ['D5:*', null],
    ['D-5:10', null],
    ['D1/5', null]
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → ${expected === null ? 'null' : 'rule'}`, () => {
      expect(parse(input).toRRule()).toBe(expected);
    });
  }
});

describe('toString() — remaining canonical branches', () => {
  it('renders a single-day bounds and an open-start bounds', () => {
    expect(parse('20180120').toString()).toBe('20180120');
    expect(parse('20150101:*').toString()).toBe('20150101:*');
  });

  it('renders a lone full-domain selector', () => {
    expect(parse('D*').toString()).toBe('D*');
  });
});

describe('covers() — sub-day cadence and ordinal scopes', () => {
  it('covers an hour-period cadence', () => {
    const dtrexp = parse('20200106T0000/6H/1H');
    expect(dtrexp.covers('2020-01-06T00:30:00Z')).toBe(true);
    expect(dtrexp.covers('2020-01-06T06:30:00Z')).toBe(true);
    expect(dtrexp.covers('2020-01-06T01:30:00Z')).toBe(false);
    expect(dtrexp.covers('2020-01-05T23:30:00Z')).toBe(false);
  });

  it('resolves weekday ordinals in quarter and year scope', () => {
    // first Sunday of Q1 2026 is Jan 4; year-scope last Sunday of 2026 is Dec 27
    expect(parse('E7#1 Q1').covers('2026-01-04T12:00:00Z')).toBe(true);
    expect(parse('E7#1 Q1').covers('2026-01-11T12:00:00Z')).toBe(false);
    expect(parse('E7#-1 Y2026').covers('2026-12-27T12:00:00Z')).toBe(true);
    expect(parse('E7#-1 Y2026').covers('2026-12-20T12:00:00Z')).toBe(false);
  });
});

describe('toRRule() — cadence and Y-stride branches', () => {
  const cases: Array<[string, string | null]> = [
    ['Y2020:2040/3', 'DTSTART;VALUE=DATE:20200101\nRRULE:FREQ=YEARLY;INTERVAL=3;UNTIL=20401231'],
    ['Y2020:*/3', 'DTSTART;VALUE=DATE:20200101\nRRULE:FREQ=YEARLY;INTERVAL=3'],
    ['Y2020:*', 'DTSTART;VALUE=DATE:20200101\nRRULE:FREQ=YEARLY'],
    ['20180301/14M Y2020', null],
    ['20200106/10D/3D', null],
    ['20200106T0000/6H/1H', null]
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' -> ${expected === null ? 'null' : 'rule'}`, () => {
      expect(parse(input).toRRule()).toBe(expected);
    });
  }
});

describe('toRRule() — bounds-driven fields', () => {
  const cases: Array<[string, string | null]> = [
    ['M3 20150101:*', 'DTSTART;VALUE=DATE:20150101\nRRULE:FREQ=YEARLY;BYMONTH=3'],
    ['M3 *:20200101', 'RRULE:FREQ=YEARLY;BYMONTH=3;UNTIL=20200101'],
    ['M1:6/2', 'RRULE:FREQ=YEARLY;BYMONTH=1,3,5'],
    ['M1:5/2', 'RRULE:FREQ=YEARLY;BYMONTH=1,3,5'],
    ['20240128/1M/1D', 'DTSTART;VALUE=DATE:20240128\nRRULE:FREQ=MONTHLY'],
    [
      '20240129/1M/1D',
      'DTSTART;VALUE=DATE:20240129\nRRULE:RSCALE=GREGORIAN;FREQ=MONTHLY;SKIP=BACKWARD'
    ],
    ['20200129/10D', 'DTSTART;VALUE=DATE:20200129\nRRULE:FREQ=DAILY;INTERVAL=10'],
    ['20180301:20190425', null]
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' -> ${expected === null ? 'null' : 'rule'}`, () => {
      expect(parse(input).toRRule()).toBe(expected);
    });
  }
});
