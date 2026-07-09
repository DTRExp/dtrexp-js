import { parse } from '../src/index.js';

describe('toString() — canonical form', () => {
  const cases: Array<[string, string]> = [
    ['E2M3,5', 'E2 M3,5'],
    ['M3 Y*', 'M3'],
    ['M*', 'M*'],
    ['T2200:0600 E5', 'T2200:0600 E5'],
    ['M1/5/2', 'M1/5/2'],
    ['Y2020:2040/3', 'Y2020:2040/3'],
    ['20180301/14M', '20180301/14M'],
    ['20240131/3M/1D', '20240131/3M/1D'],
    ['*:20180120T1800', '*:20180120T1800'],
    ['20180120', '20180120'],
    ['D-7:* Y2020', 'D-7:* Y2020'],
    ['M11:2', 'M11:2'],
    ['M11:*,*:2', 'M11:2'],
    ['M*:2,11:*', 'M11:2'], // fusion is order-independent
    ['H22:6 E5', 'H22:6 E5'],
    ['M3:*,*:7', 'M3:*,*:7'],
    // no fusion when up-start does not exceed down-end: the pair is not a wrap
    ['M7:*,*:7', 'M7:*,*:7'],
    // a down-half must end past the domain start (H*:0 is just hour 0's edge case)
    ['H5:*,*:0', 'H5:*,*:0'],
    // a closed span alongside an open one is a list, never half of a wrap
    ['M5:*,3', 'M5:*,3'],
    ['M3,*:2', 'M3,*:2'],
    // a negative down-end is per-instance (§9.1), never a wrap half
    ['M5:*,*:-3', 'M5:*,*:-3'],
    // wrap inside a longer list stays split (3 spans never fuse)
    ['M11:2,5', 'M11:*,*:2,5'],
    ['E7#-1 M4', 'E7#-1 M4'],
    ['T093015.250', 'T093015.250:093015.251'],
    ['E5#1 | E5#3', 'E5#1 | E5#3']
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => {
      expect(parse(input).toString()).toBe(expected);
    });
  }
});

describe('describe()', () => {
  const cases: Array<[string, string]> = [
    ['T0900:1800 E1:5', '09:00–18:00 from Monday to Friday'],
    ['E7#-1 M4', 'the last Sunday in April'],
    ['E7#2 M5', 'the 2nd Sunday in May'],
    ['D25 M12', 'on day 25 in December'],
    ['M!7', 'every month except July'],
    ['D-7:* Y*', 'on the last 7 days in every year'],
    ['Y2020:2040/3', 'every 3rd year from 2020 to 2040'],
    ['20200106/10D/3D', 'every 10 days from 2020-01-06, 3 days long'],
    ['*:20180120T1800', 'until 2018-01-20 18:00'],
    ['M3 | Q2', 'in March, or in Q2'],
    // ranges are from/to phrases; open ends name the domain edge (spec §3.1)
    ['M3:7', 'from March to July'],
    ['D1:15', 'from day 1 to day 15'],
    ['D25:*', 'from day 25 to end of month'],
    ['D25:* Q2', 'from day 25 to end of quarter in Q2'],
    ['D*:5', 'from day 1 to day 5'],
    ['M*:6', 'from January to June'],
    ['M3:*', 'from March to December'],
    ['Q2:*', 'from Q2 to Q4'],
    ['H20:*', 'from hour 20 to hour 23'],
    ['W10:*', 'from week 10 to end of year'],
    ['E2:*', 'from Tuesday to Sunday'],
    ['s0:*', 'from second 0 to second 59'],
    ['Y2020:*', 'from 2020 onwards'],
    ['Y*:2020', 'up to 2020'],
    ['Y2018:2020', 'from 2018 to 2020'],
    ['Y2018,2021:*', 'in 2018 and 2021 onwards'],
    ['Y*:2000,2024', 'in up to 2000 and 2024'],
    // mixed-sign ranges resolve per instance (spec §9.1); endpoints keep their nth-to-last names
    ['D25:-1', 'from day 25 to 1st-to-last'],
    ['D-7:-3', 'from 7th-to-last to 3rd-to-last'],
    // wrap ranges read as a plain from/to crossing the boundary
    ['M11:2', 'from November to February'],
    ['E6:1', 'from Saturday to Monday'],
    ['M!11:2', 'every month except November to February'],
    // lists keep their prefix, ranges inline as "X to Y"
    ['M1,3,7:9', 'in January and March and July to September'],
    ['D1,20:*', 'on day 1 and 20 to end of month']
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => {
      expect(parse(input).describe()).toBe(expected);
    });
  }

  it('rejects unsupported locales', () => {
    expect(() => parse('M3').describe('de')).toThrow(RangeError);
  });
});

describe('toRRule()', () => {
  const cases: Array<[string, string | null]> = [
    ['E7#-1 M4', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1SU'],
    ['D25 M12', 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25'],
    ['E1', 'RRULE:FREQ=WEEKLY;BYDAY=MO'],
    ['E5#2', 'RRULE:FREQ=MONTHLY;BYDAY=2FR'],
    ['M1/3', 'RRULE:FREQ=YEARLY;BYMONTH=1,4,7,10'],
    ['D-1', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['D-7:*', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-7,-6,-5,-4,-3,-2,-1'],
    ['20200106/10D', 'DTSTART;VALUE=DATE:20200106\nRRULE:FREQ=DAILY;INTERVAL=10'],
    ['20200106/2W', 'DTSTART;VALUE=DATE:20200106\nRRULE:FREQ=WEEKLY;INTERVAL=2'],
    [
      '20240229/1Y/1D',
      'DTSTART;VALUE=DATE:20240229\nRRULE:RSCALE=GREGORIAN;FREQ=YEARLY;SKIP=BACKWARD'
    ],
    ['M3 Y2018', 'DTSTART;VALUE=DATE:20180101\nRRULE:FREQ=YEARLY;BYMONTH=3;UNTIL=20181231'],
    ['W1:10', 'RRULE:FREQ=YEARLY;BYWEEKNO=1,2,3,4,5,6,7,8,9,10'],
    ['T0900:1800 E1:5', null],
    ['M3 | Q2', null],
    ['M!7', null],
    ['m0:19 H0/4', null]
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → ${expected === null ? 'null' : `'${expected.replace('\n', '\\n')}'`}`, () => {
      expect(parse(input).toRRule()).toBe(expected);
    });
  }
});

describe('describe() — scope nouns, list edges, and time formatting', () => {
  const cases: Array<[string, string]> = [
    // D's edge noun follows the nearest of M/Q/Y — M wins over Q, Y stands alone
    ['D25:* M4 Q2', 'from day 25 to end of month, in April, in Q2'],
    ['D25:* Y2020', 'from day 25 to end of year in 2020'],
    // open endpoints inside lists resolve to concrete edge names
    ['M3,*:2', 'in March and January to February'],
    ['M1,10:*', 'in January and October to December'],
    ['Y2018,2021:2023', 'in 2018 and 2021 to 2023'],
    ['H0:*,5', 'at hour 0 to 23 and 5'],
    // hour 0 is a value, not "the last 0 hours"
    ['D-1,5', 'on day 1st-to-last and 5'],
    ['E-1', 'on 1st-to-last'],
    // time lists join with "and"; sub-minute clocks pad their seconds
    ['T0900:1200,1300:1800', '09:00–12:00 and 13:00–18:00'],
    ['T090005:120000', '09:00:05–12:00'],
    // unit nouns survive in stride and exclusion phrasings
    ['Q1:4/2', 'every 2nd quarter from Q1 to Q4'],
    ['E!6:7', 'every weekday except Saturday to Sunday']
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => {
      expect(parse(input).describe()).toBe(expected);
    });
  }
});
