import { DTRExp, parse, validate } from '../src/index.js';

describe('validate()', () => {
  it('accepts a valid expression with no warnings', () => {
    expect(validate('M3 Y2018')).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('accepts but warns on a statically unsatisfiable expression', () => {
    const result = validate('D30 M2');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]?.code).toBe('unsatisfiable');
  });

  it('reports errors without throwing', () => {
    const result = validate('M13');
    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors[0]).toMatchObject({ code: 'out-of-domain', position: expect.any(Number) });
  });
});

describe('parse() / DTRExp surface', () => {
  it('exposes the original source verbatim', () => {
    expect(parse('  M3   Y2018 ').source).toBe('  M3   Y2018 ');
  });

  it('exposes the compiled IR via the internal accessor', () => {
    const dtrexp = parse('M3');
    expect(dtrexp._ir.expressions).toHaveLength(1);
  });

  it('is an instance of DTRExp', () => {
    expect(parse('M3')).toBeInstanceOf(DTRExp);
  });
});

describe('covers() — instant input forms', () => {
  const dtrexp = parse('M3');
  const march = '2024-03-15T00:00:00Z';
  const april = '2024-04-15T00:00:00Z';

  it('accepts a Date', () => {
    expect(dtrexp.covers(new Date(march))).toBe(true);
    expect(dtrexp.covers(new Date(april))).toBe(false);
  });

  it('accepts epoch milliseconds', () => {
    expect(dtrexp.covers(Date.parse(march))).toBe(true);
  });

  it('accepts an ISO 8601 string', () => {
    expect(dtrexp.covers(march)).toBe(true);
  });

  it('accepts a Temporal-like object with epochMilliseconds', () => {
    expect(dtrexp.covers({ epochMilliseconds: Date.parse(march) })).toBe(true);
  });

  it('defaults the time zone to UTC', () => {
    // 2024-03-01T00:30 in UTC is March; would still be Feb in a negative-offset zone
    expect(dtrexp.covers('2024-03-01T00:30:00Z')).toBe(true);
  });

  it('rejects an unsupported input type with a specific message', () => {
    // these casts exercise the runtime type guard from untyped callers
    expect(() => dtrexp.covers(true as unknown as number)).toThrow(/Expected a Date/);
    expect(() => dtrexp.covers(null as unknown as number)).toThrow(/Expected a Date/);
    // an object lacking epochMilliseconds is not a Temporal instant
    expect(() => dtrexp.covers({} as unknown as number)).toThrow(/Expected a Date/);
  });

  it('rejects a non-finite instant with a specific message', () => {
    expect(() => dtrexp.covers(Number.NaN)).toThrow(/Invalid instant/);
    expect(() => dtrexp.covers(new Date('not a date'))).toThrow(/Invalid instant/);
    expect(() => dtrexp.covers('not a date')).toThrow(/Invalid instant/);
    // a Temporal-like object carrying a non-finite epoch
    expect(() => dtrexp.covers({ epochMilliseconds: Number.POSITIVE_INFINITY })).toThrow(
      /Invalid instant/
    );
  });
});

describe('describe() — locale guard', () => {
  it('supports en by default', () => {
    expect(parse('M3').describe()).toBe('in March');
    expect(parse('M3').describe('en')).toBe('in March');
  });

  it('throws on an unsupported locale with a specific message', () => {
    expect(() => parse('M3').describe('fr')).toThrow(/Unsupported locale/);
  });
});
