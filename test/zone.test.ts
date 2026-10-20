import type { DTRExp, IEvalOptions } from '../src/index.js';
import { parse } from '../src/index.js';

// Tuesday 07:30 UTC is 09:30 in Berlin (CEST): inside 09:00–18:00 there, outside it in UTC.
const HOURS = 'T0900:1800 E1:5';
const T = '2026-07-07T07:30:00Z';
const BERLIN_DAY = { start: '2026-07-07T07:00:00.000Z', end: '2026-07-07T16:00:00.000Z' };

const iso = (i: { start: Date; end: Date } | null) =>
  i && { start: i.start.toISOString(), end: i.end.toISOString() };

describe('evaluation zone — per call', () => {
  const dtr = parse(HOURS);

  it('rejects a bare string in the options slot instead of evaluating in UTC', () => {
    const bare = 'Europe/Berlin' as unknown as IEvalOptions;
    const msg = "Pass the time zone as { tz: 'Europe/Berlin' }";
    expect(() => dtr.covers(T, bare)).toThrow(new TypeError(msg));
    expect(() => dtr.intersect(T, T, bare)).toThrow(new TypeError(msg));
    expect(() => dtr.next(T, bare)).toThrow(new TypeError(msg));
    expect(() => dtr.covering(T, bare)).toThrow(new TypeError(msg));
  });

  it('reports an unknown zone with its own message, before any early return', () => {
    const err = new RangeError('Unknown time zone: "Mars/Olympus"');
    expect(() => dtr.covers(T, { tz: 'Mars/Olympus' })).toThrow(err);
    expect(() => dtr.intersect(T, T, { tz: 'Mars/Olympus' })).toThrow(err); // empty window
    expect(() => dtr.covers(T, { tz: '' })).toThrow(new RangeError('Unknown time zone: ""'));
  });

  it('reads a null zone as no zone, as 1.1.0 did, and rejects a zone that is not a string', () => {
    const tz = null as unknown as string;
    expect(dtr.covers(T, { tz })).toBe(false); // UTC
    expect(dtr.withZone('Europe/Berlin').covers(T, { tz })).toBe(true); // the bound zone
    const num = { tz: 42 as unknown as string };
    expect(() => dtr.covers(T, num)).toThrow(
      new TypeError('Expected a time zone name, got number')
    );
  });

  it('reads UTC aliases and case variants as the zone they name', () => {
    for (const tz of ['utc', 'Etc/UTC', 'GMT']) expect(dtr.covers(T, { tz })).toBe(false);
    expect(dtr.covers(T, { tz: 'europe/berlin' })).toBe(true);
    expect(dtr.covers(T, { tz: 'europe/berlin' })).toBe(true); // second call: cached name
  });
});

describe('withZone()', () => {
  const dtr = parse(HOURS);
  const berlin = dtr.withZone('Europe/Berlin');

  it('returns a new expression and leaves the original unbound', () => {
    expect(berlin).not.toBe(dtr);
    expect(berlin.zone).toBe('Europe/Berlin');
    expect(dtr.zone).toBeUndefined();
    expect(dtr.covers(T)).toBe(false);
  });

  it('evaluates all four operations in the bound zone', () => {
    expect(berlin.covers(T)).toBe(true);
    expect(iso(berlin.covering(T))).toEqual(BERLIN_DAY);
    expect(iso(berlin.next('2026-07-07T00:00:00Z'))).toEqual(BERLIN_DAY);
    expect(berlin.intersect('2026-07-07T00:00:00Z', '2026-07-08T00:00:00Z').map(iso)).toEqual([
      BERLIN_DAY
    ]);
  });

  it('lets a { tz } passed to a call win over the bound zone', () => {
    expect(berlin.covers(T, { tz: 'UTC' })).toBe(false);
    expect(berlin.covers(T, {})).toBe(true);
    expect(dtr.withZone('UTC').covers(T, { tz: 'Europe/Berlin' })).toBe(true);
  });

  it('rebinds a bound copy', () => {
    const tokyo = berlin.withZone('Asia/Tokyo');
    expect(tokyo.zone).toBe('Asia/Tokyo');
    expect(tokyo.covers('2026-07-07T09:30:00Z')).toBe(false); // 18:30 Tokyo
    expect(berlin.covers('2026-07-07T09:30:00Z')).toBe(true); // 11:30 Berlin
  });

  it('stores the canonical zone name', () => {
    expect(dtr.withZone('utc').zone).toBe('UTC');
    expect(dtr.withZone('europe/berlin').zone).toBe('Europe/Berlin');
  });

  it('throws at once on an unknown zone', () => {
    expect(() => dtr.withZone('Mars/Olympus')).toThrow(
      new RangeError('Unknown time zone: "Mars/Olympus"')
    );
  });

  it('refuses a missing zone instead of binding the host zone', () => {
    const none = (v: unknown) => () => dtr.withZone(v as string);
    expect(none(undefined)).toThrow(new TypeError('Expected a time zone name, got undefined'));
    expect(none(null)).toThrow(new TypeError('Expected a time zone name, got null'));
  });

  it('leaves everything about the expression itself unchanged', () => {
    const lint = parse('D30 M2');
    const bound = lint.withZone('Europe/Berlin');
    for (const [a, b] of [
      [dtr, berlin],
      [lint, bound]
    ] as [DTRExp, DTRExp][]) {
      expect(b.source).toBe(a.source);
      expect(b.toString()).toBe(a.toString());
      expect(b.describe()).toBe(a.describe());
      expect(b.toRRule()).toBe(a.toRRule());
      expect(b.warnings).toBe(a.warnings);
    }
  });
});

describe('immutability', () => {
  const dtr = parse('D30 M2');

  it('freezes the expression, bound or not', () => {
    expect(Object.isFrozen(dtr)).toBe(true);
    expect(Object.isFrozen(dtr.withZone('Europe/Berlin'))).toBe(true);
    expect(() => {
      (dtr as { zone: string | undefined }).zone = 'Europe/Berlin';
    }).toThrow(TypeError);
  });

  it('freezes the warnings and the compiled IR all the way down', () => {
    expect(Object.isFrozen(dtr.warnings)).toBe(true);
    expect(Object.isFrozen(dtr.warnings[0])).toBe(true);
    const expr = dtr._ir.expressions[0];
    expect(Object.isFrozen(dtr._ir.expressions)).toBe(true);
    expect(Object.isFrozen(expr?.selectors)).toBe(true);
    expect(Object.isFrozen(expr?.selectors[0])).toBe(true);
    expect(Object.isFrozen(expr?.selectors[0]?.spans)).toBe(true);
  });
});
