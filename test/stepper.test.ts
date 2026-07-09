import { parse } from '../src/index.js';

const iso = (d: Date | undefined): string | undefined => d?.toISOString();

describe('next()', () => {
  const businessHours = parse('T0900:1800 E1:5');

  it('skips the window containing `after` and returns the following one', () => {
    // Tue 2026-07-07 10:00 UTC is inside business hours → next is Wednesday
    const next = businessHours.next('2026-07-07T10:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-08T09:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-07-08T18:00:00.000Z');
  });

  it('skips a window starting exactly at `after`', () => {
    const next = businessHours.next('2026-07-07T09:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-08T09:00:00.000Z');
  });

  it('finds the upcoming window from uncovered time', () => {
    // Sat 2026-07-11 → Monday 2026-07-13
    const next = businessHours.next('2026-07-11T10:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-13T09:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-07-13T18:00:00.000Z');
  });

  it('returns a maximal multi-day interval (weekends merge across midnight)', () => {
    const next = parse('E6:7').next('2026-07-07T00:00:00Z');
    expect(iso(next?.start)).toBe('2026-07-11T00:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-07-13T00:00:00.000Z');
  });

  it('finds calendar ordinals months ahead', () => {
    const next = parse('E7#-1 M4').next('2026-01-01T00:00:00Z');
    expect(iso(next?.start)).toBe('2026-04-26T00:00:00.000Z');
    expect(iso(next?.end)).toBe('2026-04-27T00:00:00.000Z');
  });

  it('returns null for an unsatisfiable bounded expression', () => {
    expect(parse('D30 M2 *:20301231').next('2026-01-01T00:00:00Z')).toBeNull();
  });

  it('returns null once bounds are exhausted', () => {
    expect(parse('M3 *:20261231').next('2026-04-01T00:00:00Z')).toBeNull();
  });

  it('evaluates in the requested time zone', () => {
    // Monday 09:00 Berlin = 07:00 UTC in summer
    const next = parse('T0900:1000 E1').next('2026-07-07T00:00:00Z', { tz: 'Europe/Berlin' });
    expect(iso(next?.start)).toBe('2026-07-13T07:00:00.000Z');
  });
});

describe('intersect()', () => {
  it('clips a month selector to a year window', () => {
    const intervals = parse('M3').intersect('2017-01-01T00:00:00Z', '2018-01-01T00:00:00Z');
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2017-03-01T00:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2017-04-01T00:00:00.000Z');
  });

  it('returns one interval per business day over a week', () => {
    const intervals = parse('T0900:1800 E1:5').intersect(
      '2026-07-06T00:00:00Z',
      '2026-07-13T00:00:00Z'
    );
    expect(intervals).toHaveLength(5);
    expect(iso(intervals[0]?.start)).toBe('2026-07-06T09:00:00.000Z');
    expect(iso(intervals[4]?.end)).toBe('2026-07-10T18:00:00.000Z');
  });

  it('clips the first interval to the window start', () => {
    const intervals = parse('T0900:1800').intersect('2026-07-06T10:00:00Z', '2026-07-06T23:00:00Z');
    expect(iso(intervals[0]?.start)).toBe('2026-07-06T10:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-06T18:00:00.000Z');
  });

  it('materializes cadence occurrences with durations', () => {
    const intervals = parse('20200106/10D/3D').intersect(
      '2020-01-01T00:00:00Z',
      '2020-02-01T00:00:00Z'
    );
    expect(intervals.map((i) => [iso(i.start), iso(i.end)])).toEqual([
      ['2020-01-06T00:00:00.000Z', '2020-01-09T00:00:00.000Z'],
      ['2020-01-16T00:00:00.000Z', '2020-01-19T00:00:00.000Z'],
      ['2020-01-26T00:00:00.000Z', '2020-01-29T00:00:00.000Z']
    ]);
  });

  it('materializes sub-day (hour-period) cadence windows', () => {
    const intervals = parse('20200106/6H/1H').intersect(
      '2020-01-06T00:00:00Z',
      '2020-01-07T00:00:00Z'
    );
    expect(intervals.map((i) => iso(i.start))).toEqual([
      '2020-01-06T00:00:00.000Z',
      '2020-01-06T06:00:00.000Z',
      '2020-01-06T12:00:00.000Z',
      '2020-01-06T18:00:00.000Z'
    ]);
    expect(iso(intervals[0]?.end)).toBe('2020-01-06T01:00:00.000Z');
  });

  it('intersects H strides with minute selectors (Einstein nap)', () => {
    const intervals = parse('m0:19 H0/4').intersect('2026-07-07T00:00:00Z', '2026-07-07T09:00:00Z');
    expect(intervals.map((i) => [iso(i.start), iso(i.end)])).toEqual([
      ['2026-07-07T00:00:00.000Z', '2026-07-07T00:20:00.000Z'],
      ['2026-07-07T04:00:00.000Z', '2026-07-07T04:20:00.000Z'],
      ['2026-07-07T08:00:00.000Z', '2026-07-07T08:20:00.000Z']
    ]);
  });

  it('maps local-time coverage back to absolute instants per tz', () => {
    const intervals = parse('T0900:1000 E1').intersect(
      '2026-07-06T00:00:00Z',
      '2026-07-07T00:00:00Z',
      { tz: 'Europe/Berlin' }
    );
    expect(intervals).toHaveLength(1);
    expect(iso(intervals[0]?.start)).toBe('2026-07-06T07:00:00.000Z');
    expect(iso(intervals[0]?.end)).toBe('2026-07-06T08:00:00.000Z');
  });

  it('handles seconds selectors and empty windows', () => {
    const intervals = parse('s0:29').intersect('2026-07-07T10:00:00Z', '2026-07-07T10:02:00Z');
    expect(intervals.map((i) => [iso(i.start), iso(i.end)])).toEqual([
      ['2026-07-07T10:00:00.000Z', '2026-07-07T10:00:30.000Z'],
      ['2026-07-07T10:01:00.000Z', '2026-07-07T10:01:30.000Z']
    ]);
    expect(parse('M3').intersect('2026-07-07T10:00:00Z', '2026-07-07T10:00:00Z')).toEqual([]);
  });

  it('unions | branches', () => {
    const intervals = parse('E5#1 | E5#3').intersect(
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z'
    );
    expect(intervals.map((i) => iso(i.start))).toEqual([
      '2026-07-03T00:00:00.000Z',
      '2026-07-17T00:00:00.000Z'
    ]);
  });
});

describe('next()/intersect() — remaining branches', () => {
  const iso2 = (d: Date | undefined): string | undefined => d?.toISOString();

  it('returns the first window when a same-day gap ends it', () => {
    // from 08:00, the 09:00–12:00 window is returned, not merged with 14:00–17:00
    const next = parse('T0900:1200,1400:1700').next('2026-07-07T08:00:00Z');
    expect(iso2(next?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso2(next?.end)).toBe('2026-07-07T12:00:00.000Z');
  });

  it('skips a multi-day window that contains `after`, across its midnight seam', () => {
    // inside Saturday of a weekend → skip the whole Sat–Sun block, return the next
    const next = parse('E6:7').next('2026-07-11T12:00:00Z');
    expect(iso2(next?.start)).toBe('2026-07-18T00:00:00.000Z');
    expect(iso2(next?.end)).toBe('2026-07-20T00:00:00.000Z');
  });

  it('clips covered days against a bounds component', () => {
    const intervals = parse('T0900:1800 *:20260707T1000').intersect(
      '2026-07-07T00:00:00Z',
      '2026-07-08T00:00:00Z'
    );
    expect(intervals).toHaveLength(1);
    expect(iso2(intervals[0]?.start)).toBe('2026-07-07T09:00:00.000Z');
    expect(iso2(intervals[0]?.end)).toBe('2026-07-07T10:01:00.000Z');
  });
});
