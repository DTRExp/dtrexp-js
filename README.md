# dtre-js

<p align="center">
  <a href="https://github.com/DTRExp/dtre-js/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/DTRExp/dtre-js/ci.yml?branch=main&style=flat" alt="build" /></a>
  <a href="https://www.npmjs.com/package/dtre-js"><img src="https://img.shields.io/npm/v/dtre-js?style=flat&label=&logo=npm&color=C6234B" alt="npm" /></a>
  <img src="https://img.shields.io/badge/dependencies-zero-2BB150?style=flat" alt="zero dependencies" />
  <img src="https://img.shields.io/badge/module-ESM-F7DF1E?style=flat" alt="ESM" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3260C7?style=flat" alt="TypeScript" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="MIT license" /></a>
</p>

> This module is **ESM** 🔆. Please [**read this**](https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7).

Reference TypeScript implementation of **[DTRE](https://github.com/DTRExp/dtre-spec)** — a compact string expression for date-time ranges and recursion, evaluated by *coverage* rather than enumeration.

```
T0900-1800 E1-5          Mon–Fri, 09:00–18:00
E7#-1 M4                 last Sunday of April, every year
20200106/10D             every 10 days from 2020-01-06
M!7                      every month except July
```

> [!NOTE]
> **Pre-release.** The public API is being implemented against [spec draft 2](https://github.com/DTRExp/dtre-spec/blob/main/draft-2.md) and its conformance vectors. Nothing below is published to npm yet.

## Install

```sh
npm i dtre-js
```

## Quick start

```ts
import { parse } from 'dtre-js';

const businessHours = parse('T0900-1800 E1-5');

businessHours.covers(new Date(), { tz: 'Europe/Istanbul' });   // → boolean
```

## API

| Member | Description |
| --- | --- |
| `parse(expression)` | Parse a DTRE string into an immutable `DTRE` instance. Throws `DTRESyntaxError` with position info. |
| `validate(expression)` | Non-throwing variant; returns a result with errors/warnings (incl. unsatisfiability lints). |
| `DTRE#covers(instant, opts?)` | Whether the expression covers the given instant. O(1) — no occurrence iteration. |
| `DTRE#intersect(start, end, opts?)` | The covered intervals clipped to a finite window. |
| `DTRE#next(after, opts?)` | The first covered interval after an instant, or `null`. |
| `DTRE#describe(locale?)` | Human-readable description of the expression. |
| `DTRE#toRRule()` | RFC 5545 RRULE for the losslessly-mappable subset, else `null`. |

Time zone is always an **evaluation parameter** (`opts.tz`, default `'UTC'`) — never part of the expression.

## Related projects

- [**dtre-spec**](https://github.com/DTRExp/dtre-spec) — the DTRE specification (grammar, semantics, conformance vectors) this package implements.

## License

© 2026, Onur Yıldırım. [**MIT**](LICENSE) License.
