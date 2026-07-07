import { parse } from '../src/index.js';

describe('toString() — canonical form', () => {
  const cases: Array<[string, string]> = [
    ['E2M3,5', 'E2 M3,5'],
    ['M3 Y*', 'M3'],
    ['M*', 'M*'],
    ['T2200-0600 E5', 'T2200-0600 E5'],
    ['M1/5/2', 'M1/5/2'],
    ['Y2020-2040/3', 'Y2020-2040/3'],
    ['20180301/14M', '20180301/14M'],
    ['20240131/3M/1D', '20240131/3M/1D'],
    ['*-20180120T1800', '*-20180120T1800'],
    ['20180120', '20180120'],
    ['D-7-* Y2020', 'D-7-* Y2020'],
    ['E7#-1 M4', 'E7#-1 M4'],
    ['T093015.250', 'T093015.250-093015.251'],
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
    ['T0900-1800 E1-5', '09:00–18:00 on Monday through Friday'],
    ['E7#-1 M4', 'the last Sunday in April'],
    ['E7#2 M5', 'the 2nd Sunday in May'],
    ['D25 M12', 'on day 25 in December'],
    ['M!7', 'every month except July'],
    ['D-7-* Y*', 'on the last 7 days in every year'],
    ['Y2020-2040/3', 'every 3rd year from 2020 through 2040'],
    ['20200106/10D/3D', 'every 10 days from 2020-01-06, 3 days long'],
    ['*-20180120T1800', 'until 2018-01-20 18:00'],
    ['M3 | Q2', 'in March, or in Q2']
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
    ['D-7-*', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-7,-6,-5,-4,-3,-2,-1'],
    ['20200106/10D', 'DTSTART;VALUE=DATE:20200106\nRRULE:FREQ=DAILY;INTERVAL=10'],
    ['20200106/2W', 'DTSTART;VALUE=DATE:20200106\nRRULE:FREQ=WEEKLY;INTERVAL=2'],
    [
      '20240229/1Y/1D',
      'DTSTART;VALUE=DATE:20240229\nRRULE:RSCALE=GREGORIAN;FREQ=YEARLY;SKIP=BACKWARD'
    ],
    ['M3 Y2018', 'DTSTART;VALUE=DATE:20180101\nRRULE:FREQ=YEARLY;BYMONTH=3;UNTIL=20181231'],
    ['W1-10', 'RRULE:FREQ=YEARLY;BYWEEKNO=1,2,3,4,5,6,7,8,9,10'],
    ['T0900-1800 E1-5', null],
    ['M3 | Q2', null],
    ['M!7', null],
    ['m0-19 H0/4', null]
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → ${expected === null ? 'null' : `'${expected.replace('\n', '\\n')}'`}`, () => {
      expect(parse(input).toRRule()).toBe(expected);
    });
  }
});
