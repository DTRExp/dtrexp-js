import type { IEvalOptions } from '../src/index.js';
import { parse } from '../src/index.js';

// Tuesday 07:30 UTC is 09:30 in Berlin (CEST): inside 09:00–18:00 there, outside it in UTC.
const HOURS = 'T0900:1800 E1:5';
const T = '2026-07-07T07:30:00Z';
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

  it('reads UTC aliases and case variants as the zone they name', () => {
    for (const tz of ['utc', 'Etc/UTC', 'GMT']) expect(dtr.covers(T, { tz })).toBe(false);
    expect(dtr.covers(T, { tz: 'europe/berlin' })).toBe(true);
    expect(dtr.covers(T, { tz: 'europe/berlin' })).toBe(true); // second call: cached name
  });
});

describe('immutability', () => {
  const dtr = parse('D30 M2');

  it('freezes the expression', () => {
    expect(Object.isFrozen(dtr)).toBe(true);
    expect(() => {
      (dtr as { source: string }).source = 'M3';
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
