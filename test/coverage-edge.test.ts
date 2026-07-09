import { parse } from '../src/index.js';

const iso = (d: Date | undefined): string | undefined => d?.toISOString();

describe('cadence — period/duration unit variety', () => {
  it('covers a week-period cadence', () => {
    const dtrexp = parse('20200106/2W'); // biweekly Mondays from 2020-01-06
    expect(dtrexp.covers('2020-01-06T12:00:00Z')).toBe(true);
    expect(dtrexp.covers('2020-01-13T12:00:00Z')).toBe(false);
    expect(dtrexp.covers('2020-01-20T12:00:00Z')).toBe(true);
  });

  it('covers a minute-period cadence', () => {
    const dtrexp = parse('20200106T0000/30m/1m');
    expect(dtrexp.covers('2020-01-06T00:00:30Z')).toBe(true);
    expect(dtrexp.covers('2020-01-06T00:30:30Z')).toBe(true);
    expect(dtrexp.covers('2020-01-06T00:15:00Z')).toBe(false);
  });

  it('covers a year-period / year-duration cadence', () => {
    const dtrexp = parse('20200101/3Y/1Y'); // one full year, every 3 years
    expect(dtrexp.covers('2020-06-15T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2021-06-15T00:00:00Z')).toBe(false);
    expect(dtrexp.covers('2023-06-15T00:00:00Z')).toBe(true);
  });

  it('covers a month-period / month-duration cadence', () => {
    const dtrexp = parse('20240131/3M/1M'); // one month long, every 3 months, from Jan 31
    expect(dtrexp.covers('2024-02-15T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2024-03-15T00:00:00Z')).toBe(false);
    expect(dtrexp.covers('2024-04-30T00:00:00Z')).toBe(true);
  });

  it('materializes a week-duration cadence window', () => {
    const intervals = parse('20200106/4W/1W').intersect(
      '2020-01-01T00:00:00Z',
      '2020-02-01T00:00:00Z'
    );
    expect(iso(intervals[0]?.start)).toBe('2020-01-06T00:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2020-01-13T00:00:00.000Z');
  });
});

describe('bounds — open-end window', () => {
  it('covers an on-and-after bound', () => {
    const dtrexp = parse('20150101-*');
    expect(dtrexp.covers('2015-01-01T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2030-06-15T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2014-12-31T23:59:59Z')).toBe(false);
  });
});

describe('toString() — open and excluded spans', () => {
  it('renders open-ended and open-start ranges', () => {
    expect(parse('D5-* M3').toString()).toBe('D5-* M3');
    expect(parse('M*-5').toString()).toBe('M*-5');
  });

  it('renders an exclude-all span verbatim', () => {
    expect(parse('M!*').toString()).toBe('M!*');
  });
});

describe('describe() — full-domain and single last-day', () => {
  it('describes a bare full-domain day selector', () => {
    expect(parse('D*').describe()).toBe('on day every day');
  });

  it('describes an open last-day range', () => {
    expect(parse('D-1-*').describe()).toBe('on the last day');
  });
});

describe('next()/intersect() — range algebra branches', () => {
  it('merges contiguous covered hours', () => {
    const intervals = parse('H9-17').intersect('2026-07-07T00:00:00Z', '2026-07-07T23:59:59Z');
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-07T18:00:00.000Z');
  });

  it('skips an earlier same-day window when seeking next', () => {
    const next = parse('T0900-1200,1400-1700').next('2026-07-07T13:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-07T14:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-07-07T17:00:00.000Z');
  });

  it('merges overlapping windows from union branches', () => {
    const intervals = parse('T0900-1200 | T1100-1400').intersect(
      '2026-07-07T00:00:00Z',
      '2026-07-08T00:00:00Z'
    );
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-07T14:00:00.000Z');
  });

  it('drops the day whose window falls entirely before a start-bound', () => {
    const intervals = parse('T0900-1000 20260707T1200-20260710').intersect(
      '2026-07-07T00:00:00Z',
      '2026-07-09T00:00:00Z'
    );
    // 07-07 window 09:00–10:00 is entirely before the 12:00 bound start → dropped;
    // 07-08 remains
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-08T09:00:00.000Z');
  });
});

describe('final branch mop-up', () => {
  it('renders a bounds literal carrying seconds', () => {
    expect(parse('20180101T120030').toString()).toBe('20180101T120030');
  });

  it('lints past an open/negative month span and a negative day', () => {
    // both reach the early-exit guards in the unsatisfiability lint (no warning)
    expect(parse('D15 M*').covers('2026-05-15T00:00:00Z')).toBe(true);
    expect(parse('D-5 M3').covers('2026-03-27T00:00:00Z')).toBe(true);
  });

  it('maps no RRULE for bounds whose start carries a time', () => {
    expect(parse('M3 20180120T1800-*').toRRule()).toBeNull();
  });

  it('materializes a sub-day cadence that drifts off the day boundary', () => {
    // 5h period does not divide 24h, so windows land mid-day on later days
    const intervals = parse('20200106T0000/5H/1H').intersect(
      '2020-01-07T00:00:00Z',
      '2020-01-08T00:00:00Z'
    );
    expect(iso(intervals[0]?.start)).toBe('2020-01-07T01:00:00.000Z');
  });
});

describe('stepper — horizon, clamp and interleave branches', () => {
  it('clamps a sub-day cadence window that reaches midnight', () => {
    const intervals = parse('20200106T0000/5H/4H').intersect(
      '2020-01-06T00:00:00Z',
      '2020-01-07T00:00:00Z'
    );
    const lastEnd = intervals[intervals.length - 1]?.end;
    expect(lastEnd?.toISOString()).toBe('2020-01-07T00:00:00.000Z');
  });

  it('returns a same-day window that ends before midnight', () => {
    const next = parse('T0900-1200').next('2026-07-07T08:00:00Z');
    expect(next?.start.toISOString()).toBe('2026-07-07T09:00:00.000Z');
    expect(next?.end.toISOString()).toBe('2026-07-07T12:00:00.000Z');
  });

  it('returns an interval that runs to the bounded horizon', () => {
    const next = parse('20260708-20260709').next('2026-07-07T12:00:00Z');
    expect(next?.start.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(next?.end.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  it('intersects a time window with a cadence spanning both range orderings', () => {
    const intervals = parse('T0700-1400 20200106T0000/6H/2H').intersect(
      '2020-01-06T00:00:00Z',
      '2020-01-07T00:00:00Z'
    );
    expect(intervals.map((i) => [i.start.toISOString(), i.end.toISOString()])).toEqual([
      ['2020-01-06T07:00:00.000Z', '2020-01-06T08:00:00.000Z'],
      ['2020-01-06T12:00:00.000Z', '2020-01-06T14:00:00.000Z']
    ]);
  });
});
