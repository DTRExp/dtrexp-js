# dtrexp-js

<p align="center">
  <a href="https://github.com/DTRExp/dtrexp-js/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/DTRExp/dtrexp-js/ci.yml?branch=main&style=flat" alt="build" /></a>
  <img src="https://img.shields.io/badge/coverage-100%25-2BB150?style=flat" alt="coverage 100%" />
  <img src="https://img.shields.io/badge/mutation-100%25-2BB150?style=flat" alt="mutation 100%" />
  <a href="https://www.npmjs.com/package/dtrexp"><img src="https://img.shields.io/npm/v/dtrexp?style=flat&label=&logo=npm&color=C6234B" alt="npm" /></a>
  <img src="https://img.shields.io/badge/dependencies-zero-2BB150?style=flat" alt="zero dependencies" />
  <img src="https://img.shields.io/badge/module-ESM-F7DF1E?style=flat" alt="ESM" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3260C7?style=flat" alt="TypeScript" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="MIT license" /></a>
</p>

> This module is **ESM** 🔆. Please [**read this**](https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7).

Reference TypeScript implementation of **[DTRExp](https://github.com/DTRExp/dtrexp-spec)** — a compact string expression for date-time ranges and recursion, evaluated by **coverage** rather than enumeration.

```
T0900-1800 E1-5          Mon–Fri, 09:00–18:00
E7#-1 M4                 last Sunday of April, every year
20200106/10D             every 10 days from 2020-01-06 (cron can't say this)
D-7-* Y*                 last 7 days of every year
M!7                      every month except July
```

A DTRExp denotes a — possibly infinite — set of time intervals. You don't expand it into dates; you ask it questions: *does it cover this instant?* *What does it cover between these two dates?* *When does it next apply?* That makes it the right shape for storing **"when does this apply?" as data** — permission windows, price rules, maintenance schedules, availability — in a database column, an ACL grant, or a config value.

## Install

```sh
npm i dtrexp
```

Requires Node.js ≥ 22. Zero runtime dependencies.

## Quick start

```ts
import { parse } from 'dtrexp';

const businessHours = parse('T0900-1800 E1-5');

// coverage — O(#components), built for per-request hot paths
businessHours.covers(new Date(), { tz: 'Europe/Berlin' });
// → true (weekday, 09:00–18:00 Berlin local time)

// enumeration on demand — a finite window is always a finite list
businessHours.intersect('2026-07-06T00:00:00Z', '2026-07-13T00:00:00Z');
// → 5 intervals, one per business day

// "when does it next apply?"
businessHours.next('2026-07-11T10:00:00Z');
// → { start: 2026-07-13T09:00:00Z, end: 2026-07-13T18:00:00Z }

parse('E7#-1 M4').describe();
// → 'the last Sunday in April'

parse('D25 M12').toRRule();
// → 'RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25'
```

> [!IMPORTANT]
> Parse **once** (at write/config time), evaluate **many** — `DTRExp` instances are immutable, and `covers()` performs a single calendar-field extraction followed by integer comparisons. No occurrence iteration, ever.

## API

### Functions

| Function | Description |
| --- | --- |
| `parse(expression)` | Parses a DTRExp string into an immutable `DTRExp`. Throws `DTRExpSyntaxError` with a stable `code` and character `position` on invalid input. The only way to construct a `DTRExp`. |
| `validate(expression)` | Non-throwing variant. Returns `{ valid, errors, warnings }` — warnings include the spec's *unsatisfiability lint* (`D30 M2` parses but can never match). |

### `DTRExp` instance

| Member | Description |
| --- | --- |
| `covers(instant, opts?)` | Whether the expression covers the instant. O(#components) integer tests after one field extraction. |
| `intersect(start, end, opts?)` | Covered intervals clipped to `[start, end)` — a finite, sorted, merged list of half-open `{ start: Date, end: Date }` intervals. |
| `next(after, opts?)` | The first **maximal** covered interval starting strictly after `after` (coverage containing `after` is skipped). `null` when nothing starts before the year-9999 horizon. |
| `describe(locale?)` | Human-readable English rendering (`'E7#-1 M4'` → *"the last Sunday in April"*). v1 supports `'en'`; the parameter is reserved. |
| `toRRule()` | RFC 5545 RRULE (+ `DTSTART` line when anchored) for the losslessly-mappable subset, else `null`. Constrained cadences emit RFC 7529 `SKIP=BACKWARD`. |
| `toString()` | Canonical normalized form (redundant components dropped, canonical order, wraps re-fused). |
| `source` | The original expression, verbatim. |

### Inputs & options

- **Instants** (`DateInput`): `Date`, epoch milliseconds, ISO 8601 string, or any Temporal-like object exposing `epochMilliseconds` — no Temporal dependency.
- **`opts.tz`**: IANA time zone for evaluation, default `'UTC'`. The zone is always an **evaluation parameter**, never part of the expression — `T0900-1800` means local business hours wherever you evaluate it. DST is handled per spec §9.3: spring-forward gap times cover nothing; repeated fall-back times are covered on both passes.

## Expression syntax (spec draft 2)

The full grammar and semantics live in the **[specification](https://github.com/DTRExp/dtrexp-spec/blob/main/draft-2.md)**; the essentials:

| Component | Example | Meaning |
| --- | --- | --- |
| Selectors | `M3-7`, `E1-5`, `D1,15`, `W53`, `Q2`, `Y2018` | inclusive values/ranges/lists per calendar unit |
| Negative index | `D-1`, `D-7-*` | from the end of the actual parent (last day — leap-safe) |
| Exclusion | `M!5,7-9` | domain minus the set |
| Ordinal | `E7#2`, `E7#-1` | nth / nth-from-last weekday in scope |
| Time of day | `T0900-1200,1300-1800`, `T2200-0600` | half-open clock ranges; midnight wrap stays within the day |
| Stride | `H0/4`, `M1/5/2`, `Y2020-2040/3` | calendar-locked repetition — `/interval[/duration]` |
| Cadence | `20200106/10D/3D`, `20180301/14M` | anchor-based repetition that drifts across the calendar |
| Bounds | `20150101-*`, `*-20291231`, `20180120` | absolute window / single day |
| Union | `E5#1 \| E5#3` | either expression |

Components in one expression **intersect**; `T0900-1800 E1-5 M!8` reads naturally as *"9–18, on weekdays, except in August."*

## Quality

- **Conformance-first:** the test suite is driven by the shared [`vectors.json`](https://github.com/DTRExp/dtrexp-spec/blob/main/vectors.json) from the spec repo — every coverage, rejection and warning vector, including the calendar traps (Feb 29 in 2000/2024/**2100**, `W53` existence, DST gap/overlap in `Europe/Berlin`, constrain arithmetic on month-end anchors).
- **100% coverage** on all four metrics (lines, statements, functions, branches), enforced as hard thresholds in CI.
- **100% mutation score** ([Stryker](https://stryker-mutator.io/), `break: 100`) — inclusivity mutants (`<` vs `<=`) are exactly the class of bug a date-range library must not ship, and line coverage alone can't catch them.
- **CI matrix** on Node 22 / 24 / 26, gate ladder `typecheck → lint → build → cover` plus a dedicated mutation job.
- Pure integer calendar math (Hinnant civil-date algorithms, ISO week arithmetic) — the only platform dependency is `Intl` for IANA zone offsets, with a fast path for UTC.

## Related projects

- [**dtrexp-spec**](https://github.com/DTRExp/dtrexp-spec) — the DTRExp specification (grammar, semantics, conformance vectors) this package implements.

## License

© 2026, Onur Yıldırım. [**MIT**](LICENSE) License.
