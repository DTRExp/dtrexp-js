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
    const dtrexp = parse('20150101:*');
    expect(dtrexp.covers('2015-01-01T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2030-06-15T00:00:00Z')).toBe(true);
    expect(dtrexp.covers('2014-12-31T23:59:59Z')).toBe(false);
  });
});

describe('toString() — open and excluded spans', () => {
  it('renders open-ended and open-start ranges', () => {
    expect(parse('D5:* M3').toString()).toBe('D5:* M3');
    expect(parse('M*:5').toString()).toBe('M*:5');
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
    expect(parse('D-1:*').describe()).toBe('on the last day');
  });
});

describe('next()/intersect() — range algebra branches', () => {
  it('merges contiguous covered hours', () => {
    const intervals = parse('H9:17').intersect('2026-07-07T00:00:00Z', '2026-07-07T23:59:59Z');
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-07T18:00:00.000Z');
  });

  it('skips an earlier same-day window when seeking next', () => {
    const next = parse('T0900:1200,1400:1700').next('2026-07-07T13:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-07T14:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-07-07T17:00:00.000Z');
  });

  it('merges overlapping windows from union branches', () => {
    const intervals = parse('T0900:1200 | T1100:1400').intersect(
      '2026-07-07T00:00:00Z',
      '2026-07-08T00:00:00Z'
    );
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-07T14:00:00.000Z');
  });

  it('drops the day whose window falls entirely before a start-bound', () => {
    const intervals = parse('T0900:1000 20260707T1200:20260710').intersect(
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
    expect(parse('M3 20180120T1800:*').toRRule()).toBeNull();
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
    const next = parse('T0900:1200').next('2026-07-07T08:00:00Z');
    expect(next?.start.toISOString()).toBe('2026-07-07T09:00:00.000Z');
    expect(next?.end.toISOString()).toBe('2026-07-07T12:00:00.000Z');
  });

  it('returns an interval that runs to the bounded horizon', () => {
    const next = parse('20260708:20260709').next('2026-07-07T12:00:00Z');
    expect(next?.start.toISOString()).toBe('2026-07-08T00:00:00.000Z');
    expect(next?.end.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  it('intersects a time window with a cadence spanning both range orderings', () => {
    const intervals = parse('T0700:1400 20200106T0000/6H/2H').intersect(
      '2020-01-06T00:00:00Z',
      '2020-01-07T00:00:00Z'
    );
    expect(intervals.map((i) => [i.start.toISOString(), i.end.toISOString()])).toEqual([
      ['2020-01-06T07:00:00.000Z', '2020-01-06T08:00:00.000Z'],
      ['2020-01-06T12:00:00.000Z', '2020-01-06T14:00:00.000Z']
    ]);
  });
});

describe('cadence window edges and D-scoping with coexisting coarser selectors', () => {
  const c = (e: string, i: string, tz?: string) => parse(e).covers(i, tz ? { tz } : undefined);

  // D follows the nearest of M/Q/Y — with M present, Q must not steal the scope
  it('keeps D month-scoped when M and Q are both present', () => {
    expect(c('D5 M2 Q1', '2024-02-05T12:00:00Z')).toBe(true);
    expect(c('D-1 M2 Q1', '2024-02-29T12:00:00Z')).toBe(true); // domain max = 29, not 91
    expect(c('E7#-1 M4 Q2', '2024-04-28T12:00:00Z')).toBe(true); // last Sunday of April, not of Q2
    expect(c('E7#-1 M4 Q2', '2024-06-30T12:00:00Z')).toBe(false); // last Sunday of Q2 must NOT match
  });

  it('stops a stride at its explicit end', () => {
    expect(c('M1:6/2', '2024-05-15T12:00:00Z')).toBe(true);
    expect(c('M1:6/2', '2024-07-15T12:00:00Z')).toBe(false); // resolved end must clamp, not leak
  });

  // occurrence search starts at k = 0: nothing is covered before the anchor,
  // in any of the three window generators (month, day-pseudo, absolute)
  it('covers nothing before the anchor', () => {
    expect(c('20240301/3M/1M', '2023-12-15T12:00:00Z')).toBe(false);
    expect(c('20200106/10D', '2019-12-27T12:00:00Z')).toBe(false);
    expect(c('20200106T0000/6H/1H', '2020-01-05T18:30:00Z')).toBe(false);
  });

  it('treats window boundaries as half-open in every generator', () => {
    expect(c('20200106T0000/6H/1H', '2020-01-06T06:00:00Z')).toBe(true); // exact start covered
    expect(c('20200106T0000/6H/1H', '2020-01-06T01:00:00Z')).toBe(false); // exact end not covered
    expect(c('20240301/3M/1M', '2024-03-01T00:00:00Z')).toBe(true);
    expect(c('20240301/3M/1M', '2024-02-29T23:59:59.999Z')).toBe(false); // 1 ms before the window
  });

  it('honours a time-of-day anchor in day-period windows', () => {
    expect(c('20200106T0600/2D/1D', '2020-01-06T03:00:00Z')).toBe(false); // before 06:00 start
    expect(c('20200106T0600/2D/1D', '2020-01-07T03:00:00Z')).toBe(true); // inside [Jan6 06:00, Jan7 06:00)
    const nx = parse('20200106T0600/2D/1D').next('2020-01-06T00:00:00Z');
    expect(nx?.start.toISOString()).toBe('2020-01-06T06:00:00.000Z');
    expect(nx?.end.toISOString()).toBe('2020-01-07T06:00:00.000Z');
  });

  it('returns real interval pairs from the month-window generator', () => {
    const iv = parse('20240131/3M/1D').intersect('2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z');
    expect(iv.map((x) => x.start.toISOString().slice(0, 10))).toEqual([
      '2024-01-31',
      '2024-04-30',
      '2024-07-31',
      '2024-10-31'
    ]);
  });

  it('aligns sub-day windows to the local clock of the evaluation zone', () => {
    // anchored at Berlin local midnight = 2020-01-05T23:00Z; every 6th local hour
    const iv = parse('20200106T0000/6H/1H').intersect(
      '2020-01-06T03:30:00Z',
      '2020-01-06T15:00:00Z',
      { tz: 'Europe/Berlin' }
    );
    expect(iv.map((x) => `${x.start.toISOString()}..${x.end.toISOString()}`)).toEqual([
      '2020-01-06T05:00:00.000Z..2020-01-06T06:00:00.000Z',
      '2020-01-06T11:00:00.000Z..2020-01-06T12:00:00.000Z'
    ]);
  });
});

describe('month-period windows honour a time-of-day anchor', () => {
  it('starts each occurrence at the anchor clock time', () => {
    // windows [Jan 1 12:00, Jan 2 12:00), [Feb 1 12:00, Feb 2 12:00), …
    expect(parse('20240101T1200/1M/1D').covers('2024-02-01T06:00:00Z')).toBe(false);
    expect(parse('20240101T1200/1M/1D').covers('2024-02-01T18:00:00Z')).toBe(true);
  });

  it('ends a month-long duration at the anchor clock time', () => {
    // window [Jan 1 12:00, Feb 1 12:00): Feb 1 06:00 in, Feb 1 18:00 out
    expect(parse('20240101T1200/3M/1M').covers('2024-02-01T06:00:00Z')).toBe(true);
    expect(parse('20240101T1200/3M/1M').covers('2024-02-01T18:00:00Z')).toBe(false);
  });
});
