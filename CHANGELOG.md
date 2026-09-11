# dtrexp-js - Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.2 — 2026-09-11

### Fixed

- Fixed an issue where `next()` and `intersect()` disagreed with `covers()` on DST transition days in non-UTC zones. The stepper scanned each local day as a fixed 24-hour block and mapped its edges back one at a time; so a clock time inside a spring-forward gap produced an interval `covers()` denies (`T0230` in `Europe/Berlin` on 2026-03-29), the second pass of a fall-back hour was dropped, and a range straddling a transition started or ended off by the shift. Each local day is now mapped onto absolute time through its zone segments: gap times map to nothing, repeated times map to both passes, and a day swallowed whole by a transition (`Pacific/Apia` 2011-12-30) maps to nothing at all. The regression suite adds 26 cases across Berlin, Santiago, Lord Howe and Apia, plus a minute-sampled `covers()` cross-check of every `intersect()` result and every `next()` walk around each transition.

## 1.0.1 — 2026-07-16

### Changed

- Node.js floor lowered to `>=20.0.0` (was `>=22.0.0`). The library uses no API newer than Node 20 — no Node builtins at all, `Intl.DateTimeFormat` for zones, ES2022 output; the full test suite (1065 tests, conformance vectors included) and the built `lib/` are verified on Node 20, and the CI matrix now includes it.

## 1.0.0 — 2026-07-15

### Added

- **Full DTRExp draft-2 implementation**: `parse()` / `validate()` with positioned `DTRExpSyntaxError`s and the unsatisfiability lint; immutable `DTRExp` with `covers()`, `intersect()`, `next()`, `describe()` (en), `toRRule()` (RFC 5545 subset + RFC 7529 `SKIP=BACKWARD` for constrained cadences) and canonical `toString()`.
- **Coverage-first evaluator** — one calendar-field extraction + integer tests per component; constrain overflow arithmetic (spec §9.2); instant-based DST semantics (spec §9.3); tz as an evaluation parameter (default UTC) resolved via `Intl` with a UTC fast path.
- **Conformance suite** driven by the spec's shared `vectors.json` (vendored at `test/vectors.json`), plus unit suites for calendar math, parser IR, stepper and render layers.
- **Project scaffold** to the house standard: TypeScript (strict, ESM-only, `tsconfig-oy`), Biome (`biome-config-oy`), Vitest (100% coverage thresholds), Stryker mutation testing (`break: 100`), CI (Node 22/24/26 matrix + mutation job).
