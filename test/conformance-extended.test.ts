// Extended (Tier 2) conformance suite driven by the shared spec vectors.
// test/vectors-extended.json is vendored verbatim from DTRExp/dtrexp — do not edit here.
import { parse } from '../src/index.js';
import vectors from './vectors-extended.json' with { type: 'json' };

type Edge = string | null;
type Expected = [Edge, Edge] | null;

const iso = (d: Date): string => d.toISOString().replace('.000Z', 'Z');
// Groups that scan to the domain edge (ids marked `continuous` / `open-ended`) take seconds under
// mutation instrumentation; the Stryker config sets DTREXP_SKIP_HORIZON to leave them to the normal run.
const skipHorizon = process.env.DTREXP_SKIP_HORIZON === '1';
const scansToEdge = (id: string): boolean => /continuous|open-ended/.test(id);

function expectInterval(actual: { start: Date; end: Date } | null, expected: Expected): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  const [start, end] = expected;
  if (start !== null) expect(iso(actual!.start)).toBe(start);
  if (end !== null) expect(iso(actual!.end)).toBe(end);
}

for (const op of ['next', 'covering'] as const) {
  describe(`conformance (extended): ${op}()`, () => {
    for (const group of vectors[op]) {
      if (skipHorizon && scansToEdge(group.id)) continue;
      describe(`${group.id} — '${group.expression}' [${group.tz}]`, () => {
        const dtrexp = parse(group.expression);
        for (const [instant, expected] of Object.entries(group.cases as Record<string, Expected>)) {
          it(`${instant} → ${JSON.stringify(expected)}`, () => {
            expectInterval(dtrexp[op](instant, { tz: group.tz }), expected);
          });
        }
      });
    }
  });
}

describe('conformance (extended): intersect()', () => {
  for (const group of vectors.intersect) {
    it(`${group.id} — '${group.expression}' [${group.tz}] over ${group.window.join(' … ')}`, () => {
      const [start, end] = group.window as [string, string];
      const actual = parse(group.expression)
        .intersect(start, end, { tz: group.tz })
        .map((i) => [iso(i.start), iso(i.end)]);
      expect(actual).toEqual(group.expected);
    });
  }
});
