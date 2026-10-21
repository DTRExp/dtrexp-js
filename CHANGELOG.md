# dtrexp-js - Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.3.0 — 2026-10-21

### Fixed

- Fixed an issue where a tab was accepted as whitespace between components, around `|` and at either end. Spec §1 allows only the ASCII space; a tab is a syntax error now (`M3\tD5`, `\tM3`).
- Fixed an issue where the zone-name cache, keyed on the name as given, grew without bound when callers passed many spellings of a zone (`'europe/berlin'`, `'EUROPE/BERLIN'`, …). It is cleared after 4096 names.
- Fixed an issue where `validate()` returned warnings that could be changed, while `parse()` froze the same warnings. Both are frozen now.
- Fixed an issue where the spec §9.1 warnings were missing on full-domain exclusions (`M!1:12`, `E!1:7`, `M!11:10`, `M!*:*`, `Y!1:9999`), on `D` scoped by `Q` (`D92 Q1`), on negative days their month never has (`D-30 M2`, `D-31 M4`), on ranges whose two negative ends resolve backwards (`D-1:-2`), on months and quarters that miss each other through an exclusion or a stride (`M!4:6 Q2`, `M1:2/2 Q2`), and on strided scopes (`W53 Y2021:2022/2`, `D31 M4:6/2`, `D366 Y2021:2023/2`). Each selector is now checked as the set of values it selects in every parent instance its scope allows; exclusions count as complements and strides as the values they select.
- Fixed an issue where a stride on a range ending at a literal 0 was accepted (`H22:0/2`, `m30:0/5`); that range wraps, and a wrap range takes no stride.
- Fixed an issue where `*:*` was rejected as a list item (`M*:*,5`, `M5,*:*`); it is the whole domain, like `M*`.
- Fixed an issue where `M!*` was accepted; an exclusion takes a value list, so it is a syntax error now. `M!*:*` excludes the whole domain.
- Fixed an issue where bounds of mixed precision were compared start to start, so `20240101T1800:20240101` was rejected and `20240101T1800:20240101T175959` accepted. The first literal's start is compared with the last literal's end now.
- Fixed an issue where a cadence's `H` and `m` lengths were compared in fractional days, so `20200101/60m/1H` was accepted though its duration equals its period. Lengths are compared in whole minutes.
- Fixed an issue where a cadence duration in the same unit as its period was compared with the conservative month and year lengths, so `20200101/11M/10M` and `20200101/366Y/365Y` were rejected. Same-unit lengths compare exactly now, as spec §5.2 says.
- Fixed an issue where a date literal in year 0 was accepted (`00000101`).
- Fixed an issue where an integer of any size was accepted where no domain bounds it (a `Y` stride interval, a cadence period or duration). Any integer above 2,147,483,647 is a syntax error at that integer now (code `integer-limit`); leading zeros still don't count.
- Fixed an issue where `toString()` dropped a `Y*` or `Q*` that sets the scope of `D` or an `E` ordinal, so `D-7:* Y*` became `D-7:*` (each month's last 7 days instead of each year's) and `D366 Y*` became `D366`, which does not parse.
- Fixed an issue where `toString()` rendered `M!*:*` as `M!*`, which does not parse.
- Fixed an issue where a string instant that is not a real date-time rolled over to another day: `'2020-02-30T00:00:00Z'` read as March 1, `'2020-01-01T24:00:00Z'` as January 2. It throws `TypeError` now. A date-time string without `Z` or an offset is still read in the host's zone until 2.0.
- Fixed an issue where a local date before year 1 read as a year 1 or later in a zone west of UTC: `0001-01-01T00:00:00Z` is still 31 December of 1 BCE in New York, so `Y1` does not cover it there.

### Changed

- Targets spec draft 3: `SPEC_DRAFT` is `3`, and the suite runs the draft 3 vectors, checking the error position of every rejected expression.
- Error positions follow spec §8: a syntax error points at the first character of the token at fault. A value out of its domain points at the value (`M13` at 1, not 0), a bad stride or cadence count at that count (`M3/14` at 3), a stride on a wrap range at its `/`, a backwards range at its end, and a malformed date literal at its first digit. Code that reads `position` gets a different number for these.
- A time value's malformed fraction points at its `.` (`T090000.5` at 7), and an empty expression or union branch at the end of its spaces (`' '` at 1, `M3 | | M5` at 5).
- When more than one thing is wrong, the error is the one with the earliest position, a grammar error included: `M11:2/1` is at 5 (the stride on a wrap, before its interval of 1), and `M13 X` at 1 (the value, before the stray `X`). A value's domain is checked as the value is read, except a `D` value's, which waits for the scope the rest of the branch sets: `D40 X` is at 4, `D40 M13` at 1.
- A zone must be a tz database zone or link name, in any case. A fixed offset (`'+02:00'`), ICU's legacy IDs (`'PST'`, `'IST'`), `SystemV/…` names and names the tz database has removed (`'US/Pacific-New'`) throw `RangeError` now, as an unknown zone does.
- `M!*` and a bare `*` in an exclusion list throw with the code `star-in-exclusion`.
- The unsatisfiability warnings have new messages, one per expression.
- The README names both vector files the suite runs, the accepted zone names, where the zone data comes from, and the integer limit.

## 1.2.0 — 2026-10-20

### Added

- `withZone(tz)`: a copy of the expression whose evaluation defaults to `tz`, so code that evaluates one expression in one zone stops passing `{ tz }` to every call. The original is left as it is, and the copy's `source`, canonical form, description, RRULE and warnings are the same. A `{ tz }` passed to a call still wins. The zone is checked at once and stored as the platform names it, readable as `zone`; a missing zone (`withZone(undefined)`) throws `TypeError` rather than binding the host's zone.

### Fixed

- Fixed an issue where a bare zone string in the options slot, `covers(t, 'Europe/Berlin')`, was ignored and the call evaluated in UTC. It throws `TypeError` now; pass `{ tz: 'Europe/Berlin' }`.
- Fixed an issue where `intersect()` on an empty or reversed window returned `[]` without checking its zone, so an unknown zone went unnoticed there. Every call checks its zone first.
- Fixed an issue where `'utc'`, `'Etc/UTC'`, `'GMT'` and the other UTC aliases missed the UTC fast path (about 10 times slower), and where case variants of one zone filled separate cache entries. Zone names are canonicalized before use.

### Changed

- `DTRExp` instances, their `warnings` and the compiled expression are frozen, so the immutability the docs and types promise holds at runtime too. Code that wrote to an instance or pushed to its `warnings` throws `TypeError` now (in strict mode, which every ES module is). The internal `_create` and `_ir` members are no longer in the published type declarations.
- An unknown zone throws `RangeError: Unknown time zone: "…"` instead of the platform's own message; code that matched the old message has to match the new one.
- The README documents that a date-time string without `Z` or an offset is read in the host's zone, not the evaluation zone.

## 1.1.0 — 2026-09-11

### Added

- `covering(instant, opts?)`: the maximal covered interval containing an instant, or `null` when it is not covered; `covers(t)` holds iff `covering(t)` is not `null`. The "applies now, until …" half of a display (`next()` skips the interval in progress by design). Chains across days in both directions and is clipped at the year-1 floor and the year-9999 horizon.
- The spec's Extended (Tier 2) vectors, vendored at `test/vectors-extended.json`, drive `next()`, `covering()` and `intersect()` next to the Core suite; half of them sit on DST transitions. `SPEC_DRAFT` is `2.9`.

### Fixed

- Fixed an issue where `next()` split coverage around a local day that never happened (`Pacific/Apia` skipped 2011-12-30 crossing the date line) when the expression did not name that day: `D29,31 M12` returned the 29th alone, and `next()` from its end then skipped the 31st entirely, since the 31st starts exactly at the transition. The 29th and the 31st are one interval now, as `covers()` has always said. 1.0.2 carries the bug; 1.1.0 supersedes it.

### Changed

- Zone offsets are read through a per-zone index (7-day cells, one `Intl` probe per cell, one bisection per transition) instead of per-day probes. A continuous expression scanned to the horizon in a non-UTC zone takes about 2 s (1.0.2 took 12 s; 1.0.1 was faster and wrong).

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
