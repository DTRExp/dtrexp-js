import { parse } from '../src/index.js';

const pair = (i: { start: Date; end: Date }): [string, string] => [
  i.start.toISOString(),
  i.end.toISOString()
];
const berlin = { tz: 'Europe/Berlin' };

describe('covering()', () => {
  const businessHours = parse('T0900:1800 E1:5');

  it('returns the interval containing a covered instant', () => {
    expect(pair(businessHours.covering('2026-07-07T10:00:00Z')!)).toEqual([
      '2026-07-07T09:00:00.000Z',
      '2026-07-07T18:00:00.000Z'
    ]);
  });

  it('is null for an uncovered instant, and half-open at both ends', () => {
    expect(businessHours.covering('2026-07-07T08:59:59.999Z')).toBeNull();
    expect(businessHours.covering('2026-07-07T18:00:00Z')).toBeNull();
    expect(businessHours.covering('2026-07-11T10:00:00Z')).toBeNull();
    expect(pair(businessHours.covering('2026-07-07T09:00:00Z')!)[0]).toBe(
      '2026-07-07T09:00:00.000Z'
    );
  });

  it('extends across days in both directions (a weekend, a month)', () => {
    expect(pair(parse('E6:7').covering('2026-07-12T12:00:00Z')!)).toEqual([
      '2026-07-11T00:00:00.000Z',
      '2026-07-13T00:00:00.000Z'
    ]);
    expect(pair(parse('M3').covering('2024-03-15T12:00:00Z')!)).toEqual([
      '2024-03-01T00:00:00.000Z',
      '2024-04-01T00:00:00.000Z'
    ]);
  });

  it('does not chain into a previous day whose coverage ends before midnight', () => {
    expect(pair(parse('T0000:0100,2200:2300').covering('2026-07-07T00:30:00Z')!)).toEqual([
      '2026-07-07T00:00:00.000Z',
      '2026-07-07T01:00:00.000Z'
    ]);
  });

  it('stops at a same-day gap on either side', () => {
    const split = parse('T0900:1200,1400:1700');
    expect(pair(split.covering('2026-07-07T10:00:00Z')!)).toEqual([
      '2026-07-07T09:00:00.000Z',
      '2026-07-07T12:00:00.000Z'
    ]);
    expect(pair(split.covering('2026-07-07T16:00:00Z')!)).toEqual([
      '2026-07-07T14:00:00.000Z',
      '2026-07-07T17:00:00.000Z'
    ]);
  });

  it('stops at the year-1 floor and the year-9999 horizon', () => {
    expect(pair(parse('*:00010105').covering('0001-01-03T00:00:00Z')!)).toEqual([
      '0001-01-01T00:00:00.000Z',
      '0001-01-06T00:00:00.000Z'
    ]);
    expect(pair(parse('99991229:*').covering('9999-12-30T00:00:00Z')!)).toEqual([
      '9999-12-29T00:00:00.000Z',
      '+010000-01-01T00:00:00.000Z'
    ]);
  });

  it('stops at the end of bounded coverage without scanning on', () => {
    expect(pair(parse('T0900:1800 *:20260707T1000').covering('2026-07-07T09:30:00Z')!)).toEqual([
      '2026-07-07T09:00:00.000Z',
      '2026-07-07T10:01:00.000Z'
    ]);
    expect(pair(parse('T0900:1800 20260707T1000:*').covering('2026-07-07T12:00:00Z')!)).toEqual([
      '2026-07-07T10:00:00.000Z',
      '2026-07-07T18:00:00.000Z'
    ]);
  });

  it('returns a cadence occurrence window', () => {
    expect(pair(parse('20200106/10D/3D').covering('2020-01-17T12:00:00Z')!)).toEqual([
      '2020-01-16T00:00:00.000Z',
      '2020-01-19T00:00:00.000Z'
    ]);
    expect(parse('20200106/10D/3D').covering('2020-01-19T00:00:00Z')).toBeNull();
  });

  it('evaluates in the requested zone across DST', () => {
    // second pass of 02:30 on the fall-back day
    expect(pair(parse('T0230').covering('2026-10-25T01:30:15Z', berlin)!)).toEqual([
      '2026-10-25T01:30:00.000Z',
      '2026-10-25T01:31:00.000Z'
    ]);
    // the 25-hour Sunday
    expect(pair(parse('E7').covering('2026-10-25T12:00:00Z', berlin)!)).toEqual([
      '2026-10-24T22:00:00.000Z',
      '2026-10-25T23:00:00.000Z'
    ]);
    // a range cut by the spring-forward gap
    expect(pair(parse('T0130:0230').covering('2026-03-29T00:45:00Z', berlin)!)).toEqual([
      '2026-03-29T00:30:00.000Z',
      '2026-03-29T01:00:00.000Z'
    ]);
  });

  it('chains backward through transitions that land on local midnight', () => {
    // Cairo 2023-10-26 24:00 → 23:00: the 27th starts an hour after the transition
    expect(
      pair(parse('D26:27 M10 Y2023').covering('2023-10-27T10:00:00Z', { tz: 'Africa/Cairo' })!)
    ).toEqual(['2023-10-25T21:00:00.000Z', '2023-10-27T22:00:00.000Z']);
    // Santiago 2024-09-08 00:00 → 01:00: the 8th starts at the transition
    expect(
      pair(parse('D7:8 M9 Y2024').covering('2024-09-08T12:00:00Z', { tz: 'America/Santiago' })!)
    ).toEqual(['2024-09-07T04:00:00.000Z', '2024-09-09T03:00:00.000Z']);
    // Havana 2024-11-03 01:00 → 00:00: the 2nd ends at the first 00:00
    expect(
      pair(parse('D2:3 M11 Y2024').covering('2024-11-03T12:00:00Z', { tz: 'America/Havana' })!)
    ).toEqual(['2024-11-02T04:00:00.000Z', '2024-11-04T05:00:00.000Z']);
    // Apia 2011-12-30 never happened: the 29th and the 31st are one interval
    expect(
      pair(parse('D29:31 M12 Y2011').covering('2011-12-31T00:00:00Z', { tz: 'Pacific/Apia' })!)
    ).toEqual(['2011-12-29T10:00:00.000Z', '2011-12-31T10:00:00.000Z']);
    expect(
      pair(parse('D29:31 M12 Y2011').covering('2011-12-29T12:00:00Z', { tz: 'Pacific/Apia' })!)
    ).toEqual(['2011-12-29T10:00:00.000Z', '2011-12-31T10:00:00.000Z']);
    // the 30th is not in the expression at all, and still does not split the 29th from the 31st
    expect(
      pair(parse('D29,31 M12 Y2011').covering('2011-12-29T12:00:00Z', { tz: 'Pacific/Apia' })!)
    ).toEqual(['2011-12-29T10:00:00.000Z', '2011-12-31T10:00:00.000Z']);
    expect(
      pair(parse('D29,31 M12 Y2011').covering('2011-12-31T00:00:00Z', { tz: 'Pacific/Apia' })!)
    ).toEqual(['2011-12-29T10:00:00.000Z', '2011-12-31T10:00:00.000Z']);
  });

  it('agrees with covers() and next() around every transition', () => {
    const expressions = [
      'T0230',
      'T0130:0230',
      'T0230:0400',
      'T0230:0300',
      'H2',
      'T0900:1800 E1:5',
      '20260101/6H/1m',
      'E7',
      'E6:7',
      'T2330:0030'
    ];
    const windows: Array<[string, string, string]> = [
      ['2026-03-27T00:00:00Z', '2026-03-31T00:00:00Z', 'Europe/Berlin'],
      ['2026-10-23T00:00:00Z', '2026-10-27T00:00:00Z', 'Europe/Berlin'],
      ['2024-09-06T00:00:00Z', '2024-09-10T00:00:00Z', 'America/Santiago'],
      ['2024-11-01T00:00:00Z', '2024-11-05T00:00:00Z', 'America/Havana']
    ];
    for (const [from, to, tz] of windows) {
      for (const source of expressions) {
        const dtr = parse(source);
        for (let t = Date.parse(from); t < Date.parse(to); t += 17 * 60_000) {
          const w = dtr.covering(t, { tz });
          const tag = `${source} @ ${new Date(t).toISOString()} in ${tz}`;
          expect(w !== null, tag).toBe(dtr.covers(t, { tz }));
          if (!w) continue;
          const s = w.start.getTime();
          const e = w.end.getTime();
          expect(s <= t && t < e, tag).toBe(true);
          expect(dtr.covers(s - 1, { tz }), `${tag} covers(start-1ms)`).toBe(false);
          expect(dtr.covers(e, { tz }), `${tag} covers(end)`).toBe(false);
          expect(dtr.next(s - 1, { tz }), `${tag} next(start-1ms)`).toEqual(w);
        }
      }
    }
  });
});
