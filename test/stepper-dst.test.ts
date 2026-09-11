import { parse } from '../src/index.js';

// Europe/Berlin 2026: spring-forward 03-29 (02:00 CET → 03:00 CEST, at 01:00Z),
// fall-back 10-25 (03:00 CEST → 02:00 CET, at 01:00Z).
const berlin = { tz: 'Europe/Berlin' };
const iso = (d: Date | undefined): string | undefined => d?.toISOString();
const pair = (i: { start: Date; end: Date }): [string, string] => [
  i.start.toISOString(),
  i.end.toISOString()
];

describe('next() across DST transitions', () => {
  it('skips a clock time that falls inside the spring-forward gap', () => {
    // 02:30 does not exist on 03-29; the next 02:30 is on 03-30 (CEST, 00:30Z)
    const next = parse('T0230').next('2026-03-28T12:00:00Z', berlin);
    expect(pair(next!)).toEqual(['2026-03-30T00:30:00.000Z', '2026-03-30T00:31:00.000Z']);
  });

  it('ends a range at the gap when its end is swallowed by it', () => {
    // 01:30–02:30 on 03-29: only 01:30–02:00 CET exists → 00:30Z–01:00Z
    const next = parse('T0130:0230').next('2026-03-28T12:00:00Z', berlin);
    expect(pair(next!)).toEqual(['2026-03-29T00:30:00.000Z', '2026-03-29T01:00:00.000Z']);
  });

  it('starts a range at the gap end when its start is swallowed by it', () => {
    // 02:30–04:00 on 03-29: only 03:00–04:00 CEST exists → 01:00Z–02:00Z
    const next = parse('T0230:0400').next('2026-03-28T12:00:00Z', berlin);
    expect(pair(next!)).toEqual(['2026-03-29T01:00:00.000Z', '2026-03-29T02:00:00.000Z']);
  });

  it('never yields a zero-length interval for coverage that lies wholly in the gap', () => {
    // the last Sunday of March is always the transition day in Berlin
    expect(parse('E7#-1 M3 T0200:0300 *:20301231').next('2026-01-01T00:00:00Z', berlin)).toBeNull();
  });

  it('visits both passes of a repeated fall-back clock time', () => {
    const dtr = parse('T0230');
    const first = dtr.next('2026-10-24T12:00:00Z', berlin);
    expect(pair(first!)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T00:31:00.000Z']);
    const second = dtr.next(first!.end, berlin);
    expect(pair(second!)).toEqual(['2026-10-25T01:30:00.000Z', '2026-10-25T01:31:00.000Z']);
    const third = dtr.next(second!.end, berlin);
    expect(pair(third!)).toEqual(['2026-10-26T01:30:00.000Z', '2026-10-26T01:31:00.000Z']);
  });

  it('keeps the two passes apart when a range ends inside the repeated hour', () => {
    // 02:30–03:00 happens twice: CEST (00:30Z–01:00Z) and CET (01:30Z–02:00Z)
    const dtr = parse('T0230:0300');
    const first = dtr.next('2026-10-24T12:00:00Z', berlin);
    expect(pair(first!)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:00:00.000Z']);
    expect(pair(dtr.next(first!.end, berlin)!)).toEqual([
      '2026-10-25T01:30:00.000Z',
      '2026-10-25T02:00:00.000Z'
    ]);
  });

  it('returns a 25-hour fall-back day and a 23-hour spring-forward day as one interval each', () => {
    const sunday = parse('E7');
    expect(pair(sunday.next('2026-10-23T00:00:00Z', berlin)!)).toEqual([
      '2026-10-24T22:00:00.000Z',
      '2026-10-25T23:00:00.000Z'
    ]);
    expect(pair(sunday.next('2026-03-27T00:00:00Z', berlin)!)).toEqual([
      '2026-03-28T23:00:00.000Z',
      '2026-03-29T22:00:00.000Z'
    ]);
  });

  it('chains a fall-back day into the following day when both are covered', () => {
    // Sat+Sun: Sunday 10-25 is 25 hours long; the chain must still reach Monday 00:00 local
    expect(pair(parse('E6:7').next('2026-10-23T00:00:00Z', berlin)!)).toEqual([
      '2026-10-23T22:00:00.000Z',
      '2026-10-25T23:00:00.000Z'
    ]);
    // and out of the transition day into an ordinary one, in both directions
    expect(pair(parse('D25:26 M10').next('2026-10-01T00:00:00Z', berlin)!)).toEqual([
      '2026-10-24T22:00:00.000Z',
      '2026-10-26T23:00:00.000Z'
    ]);
    expect(pair(parse('D29:30 M3').next('2026-03-01T00:00:00Z', berlin)!)).toEqual([
      '2026-03-28T23:00:00.000Z',
      '2026-03-30T22:00:00.000Z'
    ]);
  });

  it('chains through a fall-back that lands on local midnight (America/Havana 2024-11-03)', () => {
    // 01:00 → 00:00: Sunday's 00:00–01:00 happens twice; Saturday ends at the FIRST 00:00 (04:00Z)
    expect(pair(parse('D2:3 M11').next('2024-10-20T00:00:00Z', { tz: 'America/Havana' })!)).toEqual(
      ['2024-11-02T04:00:00.000Z', '2024-11-04T05:00:00.000Z']
    );
  });

  it('chains through a spring-forward at local midnight (Asia/Damascus 2022-03-25)', () => {
    // 00:00 → 01:00: Thursday ends where the gap begins (22:00Z), and Friday starts there
    expect(
      pair(parse('D24:25 M3 Y2022').next('2022-03-01T00:00:00Z', { tz: 'Asia/Damascus' })!)
    ).toEqual(['2022-03-23T22:00:00.000Z', '2022-03-25T21:00:00.000Z']);
  });

  it('handles a gap that swallows local midnight (America/Santiago 2024-09-08)', () => {
    // 00:00 → 01:00 on 09-08: the day starts at 01:00 local = 04:00Z
    const santiago = { tz: 'America/Santiago' };
    const day = parse('D8 M9').next('2024-09-01T00:00:00Z', santiago);
    expect(pair(day!)).toEqual(['2024-09-08T04:00:00.000Z', '2024-09-09T03:00:00.000Z']);
    // and the previous day ends where the gap begins
    expect(iso(parse('D7 M9').next('2024-09-01T00:00:00Z', santiago)?.end)).toBe(
      '2024-09-08T04:00:00.000Z'
    );
  });
});

describe('a day swallowed whole by a transition (Pacific/Apia 2011-12-30)', () => {
  const apia = { tz: 'Pacific/Apia' };

  it('covers nothing on the skipped day and chains its neighbours', () => {
    expect(parse('D30 20111229:20111231').next('2011-12-01T00:00:00Z', apia)).toBeNull();
    // Dec 29 (UTC-10) runs straight into Dec 31 (UTC+14) at 2011-12-30T10:00Z
    expect(
      parse('D29:31 M12').intersect('2011-12-28T00:00:00Z', '2012-01-01T00:00:00Z', apia).map(pair)
    ).toEqual([['2011-12-29T10:00:00.000Z', '2011-12-31T10:00:00.000Z']]);
    expect(pair(parse('D29:31 M12').next('2011-12-01T00:00:00Z', apia)!)).toEqual([
      '2011-12-29T10:00:00.000Z',
      '2011-12-31T10:00:00.000Z'
    ]);
    // the 30th is not in the expression at all: the 29th and the 31st are still one interval
    expect(pair(parse('D29,31 M12').next('2011-12-01T00:00:00Z', apia)!)).toEqual([
      '2011-12-29T10:00:00.000Z',
      '2011-12-31T10:00:00.000Z'
    ]);
  });
});

describe('intersect() across DST transitions', () => {
  it('lists both passes of a fall-back clock time and drops a spring-forward one', () => {
    const dtr = parse('T0230');
    expect(dtr.intersect('2026-10-24T12:00:00Z', '2026-10-26T12:00:00Z', berlin).map(pair)).toEqual(
      [
        ['2026-10-25T00:30:00.000Z', '2026-10-25T00:31:00.000Z'],
        ['2026-10-25T01:30:00.000Z', '2026-10-25T01:31:00.000Z'],
        ['2026-10-26T01:30:00.000Z', '2026-10-26T01:31:00.000Z']
      ]
    );
    expect(dtr.intersect('2026-03-28T12:00:00Z', '2026-03-30T12:00:00Z', berlin).map(pair)).toEqual(
      [['2026-03-30T00:30:00.000Z', '2026-03-30T00:31:00.000Z']]
    );
  });

  it('keeps a wall-clock cadence window inside the local day across the gap', () => {
    // a 1-hour window at 02:30 local each day; on 03-29 only 03:00–03:30 CEST exists
    expect(
      parse('20260328T0230/1D/1H')
        .intersect('2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z', berlin)
        .map(pair)
    ).toEqual([
      ['2026-03-28T01:30:00.000Z', '2026-03-28T02:30:00.000Z'],
      ['2026-03-29T01:00:00.000Z', '2026-03-29T01:30:00.000Z']
    ]);
  });

  it('keeps an absolute-time cadence window that sits in the last hour of a 25-hour day', () => {
    // 23:30 CET on 10-25 = 22:30Z, inside the day (which ends at 23:00Z)
    expect(
      parse('20261025T2330/24H/1m')
        .intersect('2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z', berlin)
        .map(pair)
    ).toEqual([['2026-10-25T22:30:00.000Z', '2026-10-25T22:31:00.000Z']]);
  });

  it('keeps an absolute-time cadence window in the first hour of the day after spring-forward', () => {
    // anchored at 23:30 CET, every 24 elapsed hours: after the shift it lands at 00:30 CEST (22:30Z)
    expect(
      parse('20260101T2330/24H/1m')
        .intersect('2026-03-29T12:00:00Z', '2026-03-30T12:00:00Z', berlin)
        .map(pair)
    ).toEqual([['2026-03-29T22:30:00.000Z', '2026-03-29T22:31:00.000Z']]);
  });

  it('runs an absolute-time cadence straight through the fall-back hour', () => {
    // every 6 elapsed hours from 2026-10-24T22:00Z, one minute each
    expect(
      parse('20261025/6H/1m')
        .intersect('2026-10-24T20:00:00Z', '2026-10-25T12:00:00Z', berlin)
        .map((i) => iso(i.start))
    ).toEqual(['2026-10-24T22:00:00.000Z', '2026-10-25T04:00:00.000Z', '2026-10-25T10:00:00.000Z']);
  });
});

describe('next()/intersect() agree with covers() around every transition', () => {
  const expressions = [
    'T0230',
    'T0130:0230',
    'T0230:0400',
    'T0200:0300',
    'T0230:0300',
    'H2',
    'm0/30 H1:3',
    'T0900:1800 E1:5',
    '20260101/6H/1m',
    '20260328T0230/1D/1H',
    'E7',
    'T2330:0030'
  ];
  const windows: Array<[string, string, string]> = [
    ['2026-03-27T00:00:00Z', '2026-03-31T00:00:00Z', 'Europe/Berlin'],
    ['2026-10-23T00:00:00Z', '2026-10-27T00:00:00Z', 'Europe/Berlin'],
    ['2024-09-06T00:00:00Z', '2024-09-10T00:00:00Z', 'America/Santiago'],
    ['2024-10-04T00:00:00Z', '2024-10-08T00:00:00Z', 'Australia/Lord_Howe'],
    ['2024-11-01T00:00:00Z', '2024-11-05T00:00:00Z', 'America/Havana'],
    ['2023-10-24T00:00:00Z', '2023-10-28T00:00:00Z', 'Africa/Cairo'],
    ['2022-03-23T00:00:00Z', '2022-03-27T00:00:00Z', 'Asia/Damascus']
  ];

  for (const [from, to, tz] of windows) {
    it(`intersect() equals minute-sampled covers() in ${tz} from ${from.slice(0, 10)}`, () => {
      const start = Date.parse(from);
      const end = Date.parse(to);
      for (const source of expressions) {
        const dtr = parse(source);
        const intervals = dtr.intersect(start, end, { tz });
        for (let i = 1; i < intervals.length; i++) {
          // sorted, merged, non-empty
          expect(intervals[i]!.start.getTime()).toBeGreaterThan(intervals[i - 1]!.end.getTime());
        }
        for (let t = start; t < end; t += 60_000) {
          const inside = intervals.some((w) => t >= w.start.getTime() && t < w.end.getTime());
          expect(inside, `${source} @ ${new Date(t).toISOString()} in ${tz}`).toBe(
            dtr.covers(t, { tz })
          );
        }
      }
    });

    it(`next() walks maximal covered intervals in ${tz} from ${from.slice(0, 10)}`, () => {
      const end = Date.parse(to);
      for (const source of expressions) {
        const dtr = parse(source);
        let cursor = Date.parse(from);
        for (let n = 0; n < 40; n++) {
          const w = dtr.next(cursor, { tz });
          if (!w || w.start.getTime() >= end) break;
          const s = w.start.getTime();
          const e = w.end.getTime();
          const tag = `${source} → ${w.start.toISOString()}..${w.end.toISOString()} in ${tz}`;
          expect(s, tag).toBeGreaterThan(cursor);
          expect(e, tag).toBeGreaterThan(s);
          expect(dtr.covers(s, { tz }), `${tag} covers(start)`).toBe(true);
          expect(dtr.covers(e - 1, { tz }), `${tag} covers(end-1ms)`).toBe(true);
          expect(dtr.covers(s - 1, { tz }), `${tag} covers(start-1ms)`).toBe(false);
          expect(dtr.covers(e, { tz }), `${tag} covers(end)`).toBe(false);
          cursor = e;
        }
      }
    });
  }
});
