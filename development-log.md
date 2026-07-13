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
- Added 131 contract cases covering path validation, conditional text/binary create and replace conflicts, conditional remove, failed-write atomicity, move/remove edge cases, and normalized logical watcher events.
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
- Aligned every vault adapter on conditional text, binary, and remove semantics. The Tauri bridge now forwards `expectedHash` and `expectedMissing`; native writes revalidate under the cooperative lock, use exclusive rename for missing-only creates, and conditional remove validates before unlink.
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
- Hardened the portability boundary after adversarial review: imports cap the source blob before allocation, stream-inflate within declared limits, publish and roll back conditionally so another tab's edit is never overwritten, and restore move destinations when source removal fails. Browser exports use an explicit ZIP32 profile of 9,999 user files, 64 MiB per entry, and 512 MiB for expanded data and the final archive; these are transport limits rather than vault-capacity limits.
- Added a production PWA manifest, local icons, a single root-scoped service worker, content-derived cache versions, stale-cache cleanup, and an app-shell-only cache boundary that excludes private note content.
- Added a native 180×180 Apple touch icon and made the readiness message conditional on actual service-worker support and shell-cache preparation.
- Added a production-only browser contract harness and Playwright coverage for CAS conflicts, failed-write preservation, moves, removes, backend stability, cross-tab watch events, offline capture reload, IndexedDB fallback, focus restoration, cache privacy, and desktop/mobile presentation.
- Chromium proves full offline navigation. Because Playwright's WebKit offline toggle can cause transient origin-storage failures unrelated to the app, WebKit proves cached-subresource failure plus reload with its normal document and origin-storage access; the separate WebKit contract continues to exercise persistent IndexedDB reload behavior.
- Verified 332 unit/contract tests, typecheck, lint, production build, and 21 production-server Playwright tests across desktop Chromium, mobile Chromium, and desktop WebKit. Task 6 is ready for independent re-review before Task 7 begins.

## 2026-07-13 — Disposable search index and link graph

- Added a shared, injected SQLite driver boundary and a real FTS5-backed index, with Node 22+ `node:sqlite` isolated behind a desktop/test export so a browser SQLite-WASM adapter can reuse the schema and behavior.
- Added deterministic filtered keyword search, plain-text snippets with highlight ranges, stable-ID/path/title link resolution, forward links, backlinks, late-target repair, and complete derived-row cleanup.
- Added a deterministic vault rebuild that ignores non-Markdown files, isolates recoverable parse failures as repair items, reports progress, and publishes the replacement index in one transaction only after every source note has been read.
- Proved failed-rebuild rollback and clear/rebuild equivalence against real SQLite, plus 100% statement/branch/function/line coverage for the Markdown link parser.
- The reproducible 10,000-note real-FTS benchmark rebuilt in 8.424 seconds and returned warmed filtered results in 3.37 ms on the reference development Mac, below the 200 ms target.
- Verified all 350 workspace tests, typecheck, lint, and production build. Task 7 is complete; current phase: ready for Task 8 application services after independent review.
