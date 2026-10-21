// parse(x.toString()) must mean x: the canonical form covers the same instants and
// warns the same, over every valid expression the shared vectors carry.
import { parse } from '../src/index.js';
import vectors from './vectors.json' with { type: 'json' };

const expressions = [
  ...new Set([
    ...vectors.coverage.map((group) => group.expression),
    ...vectors.warnings.map((entry) => entry.expression),
    ...vectors.quiet.map((entry) => entry.expression)
  ])
];
const instants = [...new Set(vectors.coverage.flatMap((group) => Object.keys(group.cases)))];
const zones = [...new Set(vectors.coverage.map((group) => group.tz))];

describe('toString() round trip over the vectors', () => {
  for (const source of expressions) {
    it(`'${source}'`, () => {
      const original = parse(source);
      const canonical = parse(original.toString());
      expect(canonical.warnings.map((w) => w.code)).toEqual(original.warnings.map((w) => w.code));
      const coverage = (dtr: typeof original) =>
        zones.flatMap((tz) => instants.map((t) => dtr.covers(t, { tz })));
      expect(coverage(canonical)).toEqual(coverage(original));
    });
  }
});

describe('toString() keeps a full-domain selector that scopes D or an E ordinal', () => {
  const cases: Array<[string, string]> = [
    ['D-7:* Y*', 'D-7:* Y*'],
    ['D366 Y*', 'D366 Y*'],
    ['E1#-1 Y*', 'E1#-1 Y*'],
    ['D40 Q*', 'D40 Q*'],
    ['D5 Q* Y*', 'D5 Q*'], // Q is the scope; Y* scopes nothing
    ['D5 M* Y*', 'D5'], // the month is the default scope
    ['D5 M* Y2020', 'D5 M* Y2020'], // without M*, Y2020 would take the scope
    ['D5 M* Q!1', 'D5 M* Q!1'],
    ['E1#2 M*', 'E1#2'],
    ['E1 Y*', 'E1'], // no ordinal: E's scope is the week
    ['H5 Y*', 'H5']
  ];
  for (const [source, canonical] of cases) {
    it(`'${source}' → '${canonical}'`, () => {
      expect(parse(source).toString()).toBe(canonical);
    });
  }
});
