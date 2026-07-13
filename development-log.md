# Development log

## 2026-07-13 — Planning baseline

- Product requirements and design bible completed.
- Implementation plan and technical specification completed.
- Current phase: repository foundation and Task 1 scaffolding.
- Final visual design is in progress separately; implementation treats visual tokens as replaceable.

## 2026-07-13 — Repository foundation

- Scaffolded the pnpm monorepo and `@studio/*` package boundaries.
- Added strict TypeScript, ESLint layer rules, CSS `!important` rejection, unit, build, and Playwright gates.
- Added the minimal accessible Studio shell; visual tokens remain provisional and replaceable.
- Task 1 is complete; current phase: ready for Task 2 design primitives.

## 2026-07-13 — Design primitives

- Added provisional, replaceable design tokens for color, typography, spacing, focus, contrast, and motion.
- Added accessible SemanticMark and Card primitives with explicit non-color labels and named regions.
- Added Storybook, axe checks, and reviewed desktop/mobile visual baselines.
- Task 2 is complete; current phase: ready for Task 3 content kernel.

## 2026-07-13 — Markdown content kernel

- Added the version 1 note domain schema and explicit YAML snake_case to domain camelCase mapping.
- Added recoverable Markdown parsing, deterministic serialization, unknown-key preservation, stable note IDs, and portable filename suggestions.
- Added representative vault fixtures plus enum, malformed metadata, fidelity, and property-based coverage.
- Task 3 is complete; current phase: ready for Task 4 migrations and links.

## 2026-07-13 — Desktop vault security remediation

- Added an initial Tauri vault adapter, conditional SHA-256 writes, same-directory atomic replacement, filesystem watching, and a TypeScript bridge.
- Security review found pathname time-of-check/time-of-use exposure, raw temporary watcher events, non-atomic expected-hash/move behavior against external writers, and watcher lifecycle gaps.
- Task 5 is not complete. It is under security remediation to use native folder selection, a retained open-directory capability, opaque webview tokens, descriptor-relative operations, logical watcher events, and lifecycle revocation.
- Task 6 browser-vault contract work may proceed independently; Task 5 remains a release blocker until re-reviewed.

## 2026-07-13 — Final visual design handoff

- Accepted Anna's final Studio design-system ZIP as the visual source of truth.
- Added the implementation-grade visual addendum covering exact tokens, seven themes, self-hosted typography, room compositions, component states, responsive behavior, accessibility, interaction gaps, and authority rules.
- Added architecture decisions for token-override themes and self-hosted Newsreader, Hanken Grotesk, and Caveat.
- Retained the original mockup and artifact checksums as durable provenance; the bespoke `.dc.html` prototype runtime is reference-only and will not ship.
- Updated the product bible and executable plan without changing MVP scope.
