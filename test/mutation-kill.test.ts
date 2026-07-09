import { midnightWrap } from '../src/core/Canonical.js';
import {
  boundsPseudoWindow,
  cadenceAbsWindows,
  cadencePseudoWindows,
  instanceDomain,
  isSubDayCadence,
  literalSpanEnd,
  selectorCoversValue
} from '../src/core/index.js';
import { parse } from '../src/index.js';
import type { ICadence, IFields, ISelector, Unit } from '../src/types/index.js';
import {
  daysInMonth,
  daysInQuarter,
  daysInYear,
  epochDay,
  fieldsFromInstant,
  weeksInIsoYear
} from '../src/utils/index.js';

const DAY = 86_400_000;

describe('midnightWrap — every condition', () => {
  const r = (startMs: number, endMs: number) => ({ startMs, endMs });

  it('returns null unless exactly two ranges', () => {
    expect(midnightWrap([r(0, DAY)])).toBeNull();
    expect(midnightWrap([r(0, 1), r(2, 3), r(4, 5)])).toBeNull();
  });

  it('requires the first range to start at midnight', () => {
    expect(midnightWrap([r(100, 200), r(300, DAY)])).toBeNull();
  });

  it('requires the second range to end at end-of-day', () => {
    expect(midnightWrap([r(0, 200), r(300, DAY - 1)])).toBeNull();
  });

  it('requires a genuine gap (adjacent ranges are not a wrap)', () => {
    // second.startMs === first.endMs → contiguous, not a wrap
    expect(midnightWrap([r(0, DAY / 2), r(DAY / 2, DAY)])).toBeNull();
  });

  it('fuses a real wrap', () => {
    expect(midnightWrap([r(0, 6 * 3_600_000), r(22 * 3_600_000, DAY)])).toEqual({
      startMs: 22 * 3_600_000,
      endMs: 6 * 3_600_000
    });
  });
});

describe('instanceDomain — every unit', () => {
  const f: IFields = fieldsFromInstant(Date.UTC(2024, 1, 15), 'UTC'); // Feb 2024, leap
  const dom = (unit: Unit, present: Unit[] = []) => instanceDomain(unit, f, new Set(present));

  it('returns the correct min/max per unit', () => {
    expect(dom('Y')).toEqual({ min: 1, max: 9999 });
    expect(dom('Q')).toEqual({ min: 1, max: 4 });
    expect(dom('M')).toEqual({ min: 1, max: 12 });
    expect(dom('W')).toEqual({ min: 1, max: weeksInIsoYear(f.isoWeekYear) });
    expect(dom('E')).toEqual({ min: 1, max: 7 });
    expect(dom('H')).toEqual({ min: 0, max: 23 });
    expect(dom('m')).toEqual({ min: 0, max: 59 });
    expect(dom('s')).toEqual({ min: 0, max: 59 });
  });

  it('scopes D to its nearest coarser unit', () => {
    expect(dom('D', ['M'])).toEqual({ min: 1, max: daysInMonth(2024, 2) }); // 29
    expect(dom('D', ['Q'])).toEqual({ min: 1, max: daysInQuarter(2024, 1) }); // 91
    expect(dom('D', ['Y'])).toEqual({ min: 1, max: daysInYear(2024) }); // 366
    expect(dom('D')).toEqual({ min: 1, max: daysInMonth(2024, 2) }); // defaults to month
  });
});

describe('selectorCoversValue — boundaries', () => {
  const sel = (over: Partial<ISelector>): ISelector => ({
    unit: 'M',
    exclude: false,
    spans: [],
    ...over
  });

  it('treats ranges as inclusive on both ends', () => {
    const s = sel({ spans: [{ start: 3, end: 7 }] });
    expect(selectorCoversValue(s, 3, 1, 12)).toBe(true);
    expect(selectorCoversValue(s, 7, 1, 12)).toBe(true);
    expect(selectorCoversValue(s, 2, 1, 12)).toBe(false);
    expect(selectorCoversValue(s, 8, 1, 12)).toBe(false);
  });

  it('resolves negative endpoints from the domain max', () => {
    const s = sel({ spans: [{ start: -1, end: -1 }] });
    expect(selectorCoversValue(s, 12, 1, 12)).toBe(true);
    expect(selectorCoversValue(s, 11, 1, 12)).toBe(false);
    // resolves against the actual max, not a fixed 12
    expect(selectorCoversValue(s, 28, 1, 28)).toBe(true);
  });

  it('inverts membership when excluded', () => {
    const s = sel({ exclude: true, spans: [{ start: 7, end: 7 }] });
    expect(selectorCoversValue(s, 7, 1, 12)).toBe(false);
    expect(selectorCoversValue(s, 8, 1, 12)).toBe(true);
  });

  it('applies stride interval and duration within its range', () => {
    const s = sel({ spans: [], stride: { start: 1, end: null, interval: 5, duration: 2 } });
    expect(selectorCoversValue(s, 1, 1, 12)).toBe(true); // offset 0 < 2
    expect(selectorCoversValue(s, 2, 1, 12)).toBe(true); // offset 1 < 2
    expect(selectorCoversValue(s, 3, 1, 12)).toBe(false); // offset 2 not < 2
    expect(selectorCoversValue(s, 6, 1, 12)).toBe(true); // offset 5 % 5 = 0
    expect(selectorCoversValue(s, 0, 1, 12)).toBe(false); // before start
  });

  it('stops a strided range at its explicit end', () => {
    const s = sel({ spans: [], stride: { start: 1, end: 6, interval: 2, duration: 1 } });
    expect(selectorCoversValue(s, 5, 1, 12)).toBe(true);
    expect(selectorCoversValue(s, 7, 1, 12)).toBe(false); // past end
  });
});

describe('literalSpanEnd — span granularity', () => {
  it('spans a whole day for a date-only literal', () => {
    const base = literalSpanEnd({ year: 2018, month: 1, day: 20 });
    expect(base - literalSpanEnd({ year: 2018, month: 1, day: 19 })).toBe(DAY);
  });

  it('spans a minute for a Thhmm literal and a second for Thhmmss', () => {
    const minute = literalSpanEnd({ year: 2018, month: 1, day: 20, hour: 18, minute: 0 });
    const secnd = literalSpanEnd({
      year: 2018,
      month: 1,
      day: 20,
      hour: 18,
      minute: 0,
      second: 30
    });
    const dayStart = literalSpanEnd({ year: 2018, month: 1, day: 19 });
    expect(minute - (dayStart + 18 * 3_600_000)).toBe(60_000);
    expect(secnd - (dayStart + 18 * 3_600_000 + 30_000)).toBe(1000);
  });
});

describe('boundsPseudoWindow — open ends', () => {
  it('uses ±Infinity for missing edges', () => {
    expect(boundsPseudoWindow({ start: null, end: null })).toEqual({
      lo: Number.NEGATIVE_INFINITY,
      hi: Number.POSITIVE_INFINITY
    });
    const w = boundsPseudoWindow({ start: { year: 2015, month: 1, day: 1 }, end: null });
    expect(w.lo).toBeGreaterThan(Number.NEGATIVE_INFINITY);
    expect(w.hi).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('cadence windows — boundaries', () => {
  const dayCadence: ICadence = {
    anchor: { year: 2020, month: 1, day: 6 },
    period: 10,
    periodUnit: 'D',
    duration: 3,
    durationUnit: 'D'
  };

  it('classifies sub-day cadences by period unit', () => {
    expect(isSubDayCadence({ ...dayCadence, periodUnit: 'H' })).toBe(true);
    expect(isSubDayCadence({ ...dayCadence, periodUnit: 'm' })).toBe(true);
    expect(isSubDayCadence(dayCadence)).toBe(false);
    expect(isSubDayCadence({ ...dayCadence, periodUnit: 'W' })).toBe(false);
  });

  it('returns no windows before the anchor', () => {
    const anchor = epochDay(2020, 1, 6) * DAY;
    expect(cadencePseudoWindows(dayCadence, anchor - DAY, anchor)).toEqual([]);
  });

  it('produces day-cadence windows only where they overlap the query', () => {
    const anchor = epochDay(2020, 1, 6) * DAY;
    const windows = cadencePseudoWindows(dayCadence, anchor, anchor + 20 * DAY);
    expect(windows).toEqual([
      [anchor, anchor + 3 * DAY],
      [anchor + 10 * DAY, anchor + 13 * DAY]
    ]);
  });

  it('returns no absolute windows before an H-period anchor', () => {
    const c: ICadence = {
      anchor: { year: 2020, month: 1, day: 6, hour: 0, minute: 0 },
      period: 6,
      periodUnit: 'H',
      duration: 1,
      durationUnit: 'H'
    };
    const anchor = Date.UTC(2020, 0, 6);
    expect(cadenceAbsWindows(c, anchor - 3_600_000, anchor, 'UTC')).toEqual([]);
    const w = cadenceAbsWindows(c, anchor, anchor + 6 * 3_600_000, 'UTC');
    expect(w[0]).toEqual([anchor, anchor + 3_600_000]);
  });
});

describe('describe/toString — branch outputs', () => {
  const d = (s: string) => parse(s).describe();
  const ts = (s: string) => parse(s).toString();

  it('renders every describe phrasing branch', () => {
    expect(d('E7#3 M6')).toBe('the 3rd Sunday in June');
    expect(d('E7#-2 M6')).toBe('the 2nd-to-last Sunday in June');
    expect(d('W16')).toBe('in week 16');
    expect(d('H0/4')).toBe('every 4th hour from 0');
    expect(d('D-3:*')).toBe('on the last 3 days');
    expect(d('D-1:*')).toBe('on the last day');
    expect(d('M-2')).toBe('in 2nd-to-last');
    expect(d('20200106/2W/1D')).toBe('every 2 weeks from 2020-01-06, 1 day long');
  });

  it('renders every toString branch', () => {
    expect(ts('M3')).toBe('M3');
    expect(ts('D*')).toBe('D*');
    expect(ts('T0900:1800')).toBe('T0900:1800'); // non-wrap T keeps its 'T' prefix
    expect(ts('T0900:1200,1300:1800')).toBe('T0900:1200,1300:1800'); // multi-range join + separator
    expect(ts('T120000:130000')).toBe('T1200:1300'); // whole-hour bounds drop the seconds
    expect(ts('T093015:093016')).toBe('T093015:093016');
    expect(ts('T093015.250:093015.500')).toBe('T093015.250:093015.500');
    expect(ts('T120000.250:120000.251')).toBe('T120000.250:120000.251'); // ss=0 but frac≠0 → seconds still shown
    expect(ts('T093015.050:093015.051')).toBe('T093015.050:093015.051'); // frac<100 → needs zero-padding
    expect(ts('20200106/10D/3D')).toBe('20200106/10D/3D');
    expect(ts('20200106/10D')).toBe('20200106/10D');
    expect(ts('20180120')).toBe('20180120'); // bare date literal
    expect(ts('09990101')).toBe('09990101'); // year<1000 → needs zero-padding
  });

  it('drops a full-domain span only when the selector is a lone full domain', () => {
    expect(() => ts('M*,5')).toThrow(/list/); // bare '*' in a list is rejected (spec §3)
    expect(ts('M5:*')).toBe('M5:*'); // open-end span → not full-domain
    expect(ts('M*:5')).toBe('M*:5'); // open-start span → not full-domain
  });
});

describe('ordinal from the end — last occurrence is the last day', () => {
  it('covers a last-weekday that is also the month-end', () => {
    expect(parse('E7#-1 M5').covers('2026-05-31T12:00:00Z')).toBe(true);
    expect(parse('E7#-1 M5').covers('2026-05-24T12:00:00Z')).toBe(false);
  });
});

describe('describe — exhaustive names and ordinal suffixes', () => {
  const d = (s: string) => parse(s).describe();
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  it('names every month', () => {
    for (const [i, name] of MONTHS.entries()) expect(d(`M${i + 1}`)).toBe(`in ${name}`);
  });

  it('names every weekday', () => {
    for (const [i, name] of WEEKDAYS.entries()) expect(d(`E${i + 1}`)).toBe(`on ${name}`);
  });

  it('names every cadence period/duration unit noun', () => {
    expect(d('20200101/3Y/1D')).toBe('every 3 years from 2020-01-01, 1 day long');
    expect(d('20200101/3M/1D')).toBe('every 3 months from 2020-01-01, 1 day long');
    expect(d('20200101/3W/1D')).toBe('every 3 weeks from 2020-01-01, 1 day long');
    expect(d('20200101/3D/1H')).toBe('every 3 days from 2020-01-01, 1 hour long');
    expect(d('20200101T0000/3H/1m')).toBe('every 3 hours from 2020-01-01 00:00, 1 minute long');
  });

  it('renders ordinal suffixes for teens and non-teens', () => {
    expect(d('Y2000:2100/11')).toBe('every 11th year from 2000 to 2100');
    expect(d('Y2000:2100/12')).toBe('every 12th year from 2000 to 2100');
    expect(d('Y2000:2100/13')).toBe('every 13th year from 2000 to 2100');
    expect(d('Y2000:2100/21')).toBe('every 21st year from 2000 to 2100');
    expect(d('Y2000:2100/22')).toBe('every 22nd year from 2000 to 2100');
    expect(d('Y2000:2100/23')).toBe('every 23rd year from 2000 to 2100');
  });

  it('describes a positive day-of-month, week and time-with-seconds', () => {
    expect(d('D5 M3')).toBe('on day 5 in March');
    expect(d('T093015:100000')).toBe('09:30:15–10:00'); // seconds on start
    expect(d('s30')).toBe('at second 30');
    expect(d('H12')).toBe('at hour 12');
  });
});

describe('matchOrdinal — quarter and year scope actually differ from month', () => {
  it('resolves the 5th Sunday of Q1 (a 1st-Sunday date in month scope)', () => {
    // Q1 2026 Sundays: Jan 4,11,18,25 then Feb 1 → 5th of the quarter = 2026-02-01
    // in month scope Feb 1 is the 1st Sunday of February, so scope must be the quarter
    expect(parse('E7#5 Q1').covers('2026-02-01T12:00:00Z')).toBe(true);
    expect(parse('E7#5 Q1').covers('2026-01-04T12:00:00Z')).toBe(false);
  });

  it('resolves the 5th Sunday of the year (a 1st-Sunday date in month scope)', () => {
    // 5th Sunday of 2026 = 2026-02-01; month scope would call it the 1st Sunday of Feb
    expect(parse('E7#5 Y2026').covers('2026-02-01T12:00:00Z')).toBe(true);
    expect(parse('E7#5 Y2026').covers('2026-01-04T12:00:00Z')).toBe(false);
  });
});
