// Conformance suite driven by the shared spec vectors.
// test/vectors.json is vendored verbatim from DTRExp/dtrexp — do not edit here.
import { parse } from '../src/index.js';
import vectors from './vectors.json' with { type: 'json' };

describe('conformance: covers()', () => {
  for (const group of vectors.coverage) {
    describe(`${group.id} — '${group.expression}' [${group.tz}]`, () => {
      const dtrexp = parse(group.expression);
      for (const [instant, expected] of Object.entries(group.cases)) {
        it(`${instant} → ${expected}`, () => {
          expect(dtrexp.covers(instant, { tz: group.tz })).toBe(expected);
        });
      }
    });
  }
});
