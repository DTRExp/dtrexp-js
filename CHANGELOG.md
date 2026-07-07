# dtre-js - Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- **Full DTRE draft-2 implementation**: `parse()` / `validate()` with positioned `DTRESyntaxError`s and the unsatisfiability lint; immutable `DTRE` with `covers()`, `intersect()`, `next()`, `describe()` (en), `toRRule()` (RFC 5545 subset + RFC 7529 `SKIP=BACKWARD` for constrained cadences) and canonical `toString()`.
- **Coverage-first evaluator** — one calendar-field extraction + integer tests per component; constrain overflow arithmetic (spec §9.2); instant-based DST semantics (spec §9.3); tz as an evaluation parameter (default UTC) resolved via `Intl` with a UTC fast path.
- **Conformance suite** driven by the spec's shared `vectors.json` (vendored at `test/vectors.json`), plus unit suites for calendar math, parser IR, stepper and render layers.
- **Project scaffold** to the house standard: TypeScript (strict, ESM-only, `tsconfig-oy`), Biome (`biome-config-oy`), Vitest (100% coverage thresholds), Stryker mutation testing (`break: 100`), CI (Node 22/24/26 matrix + mutation job).
