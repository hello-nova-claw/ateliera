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

## 2026-07-13 — Storage adapter contract

- Defined the adapter-neutral `VaultPort` contract and in-memory conformance harness across list, read, atomic conditional write, move, remove, and watch behavior.
- Added 129 contract cases covering path validation, expected-hash conflicts, failed-write atomicity, move/remove edge cases, and normalized logical watcher events.
- Task 4 is complete; its shared contract is the acceptance boundary for desktop and browser storage adapters.

## 2026-07-13 — Desktop vault security remediation

- Added an initial Tauri vault adapter, conditional SHA-256 writes, same-directory atomic replacement, filesystem watching, and a TypeScript bridge.
- Security review found pathname time-of-check/time-of-use exposure, raw temporary watcher events, non-atomic expected-hash/move behavior against external writers, and watcher lifecycle gaps.
- Replaced the pathname API with native folder selection, retained `cap_std` directory capabilities, random window-owned tokens, and component-relative no-follow operations.
- The first macOS compare-and-swap attempt used a swap-then-validate sequence. Re-review rejected it because failed content was transiently published and rollback could overwrite a concurrent external change.
- Replaced that sequence with a documented linearizability boundary: Studio mutations serialize through an in-process mutex and the vault-level `.studio-write.lock` advisory lock. Conditional writes validate before publication, never swap failed content into place, and preserve cooperating concurrent writers. Arbitrary tools that ignore the advisory lock remain outside the exact CAS guarantee.
- Rooted filesystem watching at the retained directory descriptor, coalesced logical watcher projections that hide write-temporary/lock files, cleaned up native watchers after subscription failure, and routed window destruction through the production lifecycle handler.
- Reserved every ASCII case variant of a `.studio-*` path component from the public vault API so renderer calls cannot replace lock, temporary, or future control files even on case-insensitive macOS volumes. Added a two-selection concurrency proof for the shared advisory lock.
- Added post-registration device/inode verification and retry for ordinary `F_GETPATH`-to-`notify` replacement. Pathname ABA remains possible, so native events are treated only as rescan hints and an independent two-second reconciliation always snapshots through the retained capability. ABA can delay delivery but cannot disclose outside content.
- Made direct reads nonblocking and reject non-regular targets from opened-descriptor metadata; FIFO coverage proves text and binary reads cannot hang.
- Added a complete runnable Tauri bootstrap plus real invoke-handler and macOS watcher-to-Tauri event tests. Task 5 is implemented and awaiting independent security re-review.

## 2026-07-13 — Final visual design handoff

- Accepted Anna's final Studio design-system ZIP as the visual source of truth.
- Transcribed the implementation-grade visual authority: exact base and per-theme target values, picker chips/swatches, quiet-action overrides, self-hosted typography, token-name migration, room compositions, component states, responsive behavior, accessibility, interaction gaps, and authority rules.
- Task 2's current CSS remains the reviewed provisional high-contrast primitive baseline. Applying all final theme/type values to production tokens is scheduled through the shell and Foyer visual tasks and requires contrast/Playwright verification.
- Added architecture decisions for token-override themes and self-hosted Newsreader, Hanken Grotesk, and Caveat.
- Retained the original mockup, byte-identical `.dc.html` source, artifact checksums, and security boundary as durable provenance; no compatible prototype runtime is retained or shipped.
- Updated the product bible and executable plan without changing MVP scope.

## 2026-07-13 — Browser-local PWA vault

- Added a browser `VaultPort` that selects OPFS when supported, records that backend choice per named vault, and uses IndexedDB only as the compatibility backend rather than as a silent runtime-error fallback.
- Added conditional-write serialization, cross-instance and cross-tab watcher events, persistent-storage requests with calm best-effort messaging, and WebKit-safe IndexedDB transaction completion handling.
- Added portable ZIP export plus typed, bounded, checksum-verified import previews. Imports require explicit confirmation, stage every file, preserve replacements, and roll back the target after failures; stored and deflate-compressed ZIPs are supported.
- Added a production PWA manifest, local icons, a single root-scoped service worker, content-derived cache versions, stale-cache cleanup, and an app-shell-only cache boundary that excludes private note content.
- Added a production-only browser contract harness and Playwright coverage for CAS conflicts, failed-write preservation, moves, removes, backend stability, cross-tab watch events, offline capture reload, IndexedDB fallback, focus restoration, cache privacy, and desktop/mobile presentation.
- Verified 325 unit/contract tests, typecheck, lint, production build, and 18 production-server Playwright tests across desktop Chromium, mobile Chromium, and desktop WebKit. Task 6 is complete; current phase: ready for Task 7 disposable index and link graph.
