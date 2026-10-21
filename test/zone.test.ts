import type { DTRExp, IEvalOptions } from '../src/index.js';
import { parse, validate } from '../src/index.js';
import { ZONE_NAME_CAP } from '../src/utils/calendar.js';

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

describe('accepted zone identifiers', () => {
  const dtr = parse(HOURS);

  it('accepts tz zone and link names in any case, canonicalized', () => {
    expect(dtr.withZone('US/Eastern').zone).toBe('America/New_York');
    expect(dtr.withZone('us/eastern').zone).toBe('America/New_York');
    expect(dtr.withZone('Etc/GMT+5').zone).toBe('Etc/GMT+5');
    // tz links that look like ICU's legacy IDs but are real tz names
    for (const tz of ['EST', 'MST', 'HST', 'EST5EDT', 'CST6CDT', 'GMT0', 'Zulu']) {
      expect(() => dtr.withZone(tz)).not.toThrow();
    }
  });

  it('refuses fixed offsets, names only ICU knows and zoneinfo files that name no zone', () => {
    for (const tz of [
      '+02:00',
      '-0500',
      '+02',
      'UTC+2',
      'Z',
      'posixrules',
      'Factory',
      'localtime',
      'SystemV/AST4',
      'systemv/est5edt',
      'Canada/East-Saskatchewan',
      'US/Pacific-New',
      // ICU's legacy three-letter IDs, which no tz release has had
      ...'ACT AET AGT ART AST BET BST CAT CNT CST CTT EAT ECT IET IST JST MIT NET NST PLT PNT PRT PST SST VST'.split(
        ' '
      ),
      'pst',
      'Ist'
    ]) {
      const err = new RangeError(`Unknown time zone: "${tz}"`);
      expect(() => dtr.withZone(tz)).toThrow(err);
      expect(() => dtr.covers(T, { tz })).toThrow(err);
    }
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

describe('zone-name cache', () => {
  it('keeps answering correctly after the cap clears it', () => {
    const dtr = parse(HOURS);
    // Each case variant fills an entry of its own; 2 × 4096 of them pass the cap.
    const variants = (name: string) => {
      const letters = [...name].filter((c) => c !== '/').length;
      return Array.from({ length: 2 ** letters }, (_, i) => {
        let k = 0;
        return [...name].map((c) => (c !== '/' && (i >> k++) & 1 ? c.toUpperCase() : c)).join('');
      });
    };
    const names = [...variants('europe/berlin'), ...variants('europe/london')];
    expect(names.length).toBeGreaterThan(ZONE_NAME_CAP);
    for (const tz of names)
      expect(dtr.covers(T, { tz })).toBe(tz.toLowerCase() === 'europe/berlin');
    expect(dtr.withZone('EUROPE/BERLIN').zone).toBe('Europe/Berlin');
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

  it('freezes the warnings validate() returns, as parse() does', () => {
    const { warnings } = validate('D30 M2');
    expect(Object.isFrozen(warnings)).toBe(true);
    expect(Object.isFrozen(warnings[0])).toBe(true);
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

describe('the year edge in a zone', () => {
  it('is the local year: year 1 has not begun in New York at 0001-01-01T00:00Z', () => {
    const y1 = parse('Y1');
    expect(y1.covers('0001-01-01T00:00:00Z')).toBe(true);
    expect(y1.covers('0001-01-01T00:00:00Z', { tz: 'America/New_York' })).toBe(false);
    expect(y1.covers('0001-01-01T05:00:00Z', { tz: 'America/New_York' })).toBe(true);
  });
});
