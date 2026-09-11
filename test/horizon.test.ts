// Scans that run to the edge of the year 1–9999 domain: a few hundred ms each
// here, minutes under mutation instrumentation. Excluded from the Stryker run
// (vitest.stryker.config.ts); the chain logic they exercise is covered by the
// bounded cases in covering.test.ts and stepper.test.ts.
import { parse } from '../src/index.js';

const pair = (i: { start: Date; end: Date }): [string, string] => [
  i.start.toISOString(),
  i.end.toISOString()
];

describe('scans to the domain edge', () => {
  it('clips continuous coverage at the year-1 floor and the year-9999 horizon', () => {
    expect(pair(parse('E1:7').covering('2026-09-11T00:00:00Z')!)).toEqual([
      '0001-01-01T00:00:00.000Z',
      '+010000-01-01T00:00:00.000Z'
    ]);
    expect(pair(parse('Y2030:*').covering('2035-06-01T00:00:00Z')!)).toEqual([
      '2030-01-01T00:00:00.000Z',
      '+010000-01-01T00:00:00.000Z'
    ]);
    expect(pair(parse('*:20261231').covering('2026-06-01T00:00:00Z')!)).toEqual([
      '0001-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z'
    ]);
  });

  it('returns null from next() for continuous coverage, in a zone too', () => {
    expect(parse('E1:7').next('2026-09-11T00:00:00Z')).toBeNull();
    expect(parse('T0000:2400').next('2026-09-11T00:00:00Z', { tz: 'Europe/Berlin' })).toBeNull();
  });

  it("clips at the zone's own edge instants when evaluated in a zone", () => {
    const w = parse('Y2030:*').covering('2035-06-01T00:00:00Z', { tz: 'America/New_York' })!;
    expect(pair(w)).toEqual(['2030-01-01T05:00:00.000Z', '+010000-01-01T05:00:00.000Z']);
  });
});
