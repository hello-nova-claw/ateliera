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
- Independent review found ambiguous duplicate IDs/titles, above-root link normalization, orphan dictionaries, incomplete CommonMark parsing, and an unstated renderer-thread risk. The remediated implementation deterministically repairs duplicate IDs, preserves ambiguous wiki candidates, rejects absolute/escaping paths, normalizes NFC, cleans dictionaries, and derives links/search text from a CommonMark AST.
- The UI-safe package root no longer exports the concrete synchronous index. The Node adapter rejects document/UI contexts; production desktop execution belongs in a native/background process and future browser SQLite belongs in a Web Worker. Progress separately reports scanning, indexing, and the commit boundary.
- Added card-type filtering, safe tag/source match context, punctuation-only empty results, and conservative diacritic highlighting. Typo-tolerant title/tag ranking is explicitly deferred to Task 16 with tests and visible rationale required before the Search UI ships.
- Re-review then found unsafe transformed-string highlight offsets and missing reference-style links. The final remediation uses validated grapheme-aware mappings back to original UTF-16 offsets, keeps titles literal and consistent across FTS/snippets, resolves full/collapsed/shortcut references, and enables GFM table/plain-text semantics.
- Final CommonMark review added recursive definition discovery inside container nodes, first-definition precedence, and graceful unmatched-reference handling.
- The reproducible 10,000-note real-FTS benchmark rebuilt in 7.983 seconds and returned warmed filtered results in 9.76 ms on the reference development Mac, below the 200 ms target.
- Verified all 374 workspace tests, typecheck, lint, and production build. Task 7 remediation is complete and ready for independent re-review.

## 2026-07-13 — Application services and room projections

- Added an injected `StudioService` that captures with safe Inbox defaults and saves in the required order: validate, serialize, conditional atomic vault write, disposable-index upsert, then UI event publication.
- Preserved durable Markdown when indexing fails, exposed explicit ready/stale/rebuilding state, coalesced rebuild scheduling, and rebuilt the disposable index from canonical vault notes.
- Wrapped compare-and-swap conflicts with both the attempted note and the current durable text so concurrent edits remain available for resolution.
- Added vault-derived Foyer, room, Life Landscape, Current Season, Reflection, and Celebration projections with deterministic fallback sorting, archive/exclusion filtering, corrupt-note isolation, and canonical-ID de-duplication.
- Added a dedicated `.studio/views/*.json` repository for disposable per-view ordering without weakening the reserved `.studio-*` storage-control namespace.
- Added a browser-safe portable storage-contract export so application code does not pull Node-only adapters into the production PWA bundle.
- Independent review found that observer exceptions could enter the durable data path, index mutations were not sequenced against rebuilds, external vault changes had no lifecycle owner, multiple active seasons were silently collapsed, Inbox drafts leaked into philosophical rooms, timestamp strings were sorted lexically, stale recovery depended on another edit, and capture collision handling was incomplete.
- Added a failure-isolated subscriber bus with diagnostic reporting and unsubscribe/dispose cleanup. Event failures can no longer reject saves or rebuilds, suppress recovery scheduling, or prevent other listeners from receiving events.
- Serialized index upserts and rebuilds behind durable/index generations. A rebuild that overlaps a durable save remains stale until its queued upsert catches up, and a single later upsert cannot falsely heal an incomplete index.
- Added idempotent start/dispose lifecycle around vault watching, case-insensitive internal-path exclusion, coalesced create/modify/move/remove reconciliation, scan-race isolation, and bounded timer-backed recovery with injectable timers and backoff.
- Active-season projections now expose conflicts and a repair payload, Inbox drafts remain visible only in Inbox until triage, Foyer featured content excludes the dedicated season card, and chronological fallbacks compare parsed epochs with deterministic ties.
- Added bounded collision retries to StudioService and hardened the transitional shell capture adapter with draft/Inbox defaults and conditional writes; all production application files now participate in coverage.
- Added a separate external-change generation so an event arriving during watcher reconciliation keeps the index stale until a follow-up rebuild represents it.
- Final lifecycle review added hash-and-count-based suppression for self-published watcher events with bounded expiry, while mismatched or expired hashes remain external changes and force reconciliation.
- Recovery now survives a throwing injected scheduler and diagnostic callback by falling back to the bounded timer path. Disposal is terminal, suppresses late effects, closes delayed watcher registrations, and waits for both in-flight durable saves and queued index work.
- Vault scans and the transitional capture listing skip only files confirmed missing after a read race; storage and existence outages remain visible to callers instead of masquerading as empty or deleted content.
- Final race review replaced reusable path/hash suppression with a monotonically increasing per-path write generation and one consumable publication for only the latest operation. Ambiguous watcher events stay stale until their exact write settles, preventing an older hash from hiding an external ABA restoration.
- All concurrent disposal callers now receive the same terminal promise and wait for the same watcher, save, and index drain before cleanup completes.
- Verified 57 application tests at 100% statement/branch/function/line coverage, 431 workspace tests, lint, focused and workspace typecheck, and the production build. Task 8 remediation is complete and ready for re-review.

## 2026-07-13 — Responsive shell and visual system

- Applied the accepted design handoff to a responsive, BEM-named Studio shell with a fixed desktop room rail, compact mobile navigation, calm onboarding, keyboard command palette, focus-trapped dialogs, route/provider boundaries, and accessible page-focus transitions.
- Added the seven approved themes—Chamomile, Fig Leaf, Sunrise, Wisteria, Deep Ocean, Sunset, and Forest—with local preference persistence, a keyboard radio menu, visible status announcements, and light/dark `color-scheme` integration.
- Preserved the handoff palette as the visual target. Component text that failed WCAG contrast uses the stronger semantic ink token, and theme `line-strong` values are deliberately strengthened where interactive boundaries require 3:1 non-text contrast; these are accessibility corrections rather than palette additions.
- Self-hosted Newsreader, Hanken Grotesk, and Caveat as reviewed WOFF2 subsets with local licenses and no external font requests.
- Kept browser onboarding on the IndexedDB/OPFS adapter while native onboarding dynamically loads the Tauri-only folder selector. Cancelling native selection leaves the welcome state intact and does not create a browser vault accidentally.
- Hardened offline readiness across service-worker update races, retained a visible compact readiness status on mobile, and restored dialog focus to the actual invoking control on both shell variants.
- Playwright review covered Chamomile at 1440×1000, Fig Leaf at 1024×768, Deep Ocean at 390×844, onboarding, an effective 720 CSS-pixel viewport representing 200% zoom on a 1440-pixel display, and unmistakable keyboard focus in light and dark themes. The corrected compact layout has no horizontal clipping and the dark inherited content remains readable.
- Independent review required six corrections before acceptance: complete radio-menu keyboard behavior, a full-size compact Search target, final Card baselines, canonical unknown-route replacement, real room code splitting, and an explicit browser Studio-selection boundary.
- Theme choices now use roving focus, focus the selected radio on open, support Arrow keys/Home/End, persist changes as selection moves, restore trigger focus on Escape, and close safely on unobscured outside pointer input. Compact Search remains at least 44×44 CSS pixels.
- Unknown URLs replace to `/foyer`; each room ships through its own lazy boundary with an accessible loading status. Final desktop/mobile Card snapshots were reviewed against the accepted production tokens rather than tolerated with a wider threshold.
- Browser launch no longer constructs or opens an implicit vault. Capture stays unavailable until Create or Open completes; Create uses a stable name-derived local vault, persists the chosen name, detects case-insensitive and orphaned-data duplicates, and offers Open Existing without overwriting. Open selects only a known local Studio. Native sessions still require fresh capability selection after every relaunch.
- Final offline re-review found that the readiness label covered only already-loaded resources, so a first visit to a lazy room could fail after the network disappeared. The Vite build now emits a revisioned precache manifest for every app document, JavaScript chunk, stylesheet, font, icon, and web manifest, and injects the same manifest into the single service worker. Installation caches the complete static set before activation; renderer readiness verifies every expected URL in the exact versioned cache instead of inferring completeness from performance entries.
- Production coverage now creates a fresh named Studio, never visits Current Season or Search while online, waits for verified readiness, removes network access, then opens both lazy rooms through desktop and mobile controls without page errors. Cache-privacy coverage remains green because only build outputs and public static assets enter Cache Storage; private note content remains exclusively in the vault.
- Reviewed the final Chamomile onboarding shell at desktop width after these changes. Its disabled Capture state, compact `No Studio selected` rail status, named Create/Open boundary, typography, spacing, and contrast match the intended calm handoff.
- Verified 450 workspace tests, typecheck, ESLint/stylelint, production build, all 45 production-server Playwright tests across desktop Chromium, mobile Chromium, and desktop WebKit, and all 5 focused visual/accessibility checks. Task 9 remediation is complete; room-specific Foyer composition remains Task 12.

## 2026-07-13 — Capture, Markdown editing, autosave, and recovery

- Migrated production capture from the transitional string-only adapter to `StudioService.capture`, while retaining the legacy adapter only as an injected shell-test seam.
- Added body-first Quick Capture with immediate focus, empty-submit protection, retained text on failure, a quiet expiring “Remembered.” status, invoking-control focus restoration, and the established local-persistence messaging.
- Added a CodeMirror 6 Markdown focus editor as a separately loaded production chunk. The editor exposes title and body first, keeps metadata in a disclosure, supports keyboard-only use, and adapts to the full-screen mobile inspector.
- Added a session-scoped draft-recovery port and browser adapter. Recovery is written synchronously before durable save; reload offers explicit Restore or Discard and never silently replaces the durable note.
- Added the complete save-state model: idle, dirty, saving, saved, conflict, and error. Autosave waits 750ms, serializes writes, carries the latest exact hash forward, flushes on blur and Escape/close, and never publishes overlapping or out-of-order saves.
- Ordinary save failures retain recovery and pause in the error state; autosave retries only after a later edit instead of entering an eager retry loop.
- On exact-hash conflict, autosave stops and retains both versions. The editor exposes Keep mine as a sibling, Keep other, and Merge manually; none overwrites automatically.
- Connected each opened Studio to the application lifecycle: the shell starts and subscribes to its `StudioService`, reprojects cards after durable edits and conflict choices, and unsubscribes before disposal. Studio replacement and unmount let editor cleanup enqueue its last save before terminal disposal drains pending work.
- Scoped browser recovery to the stable vault ID and native or injected recovery to a stable session ID. Optional Quick Capture meaning is applied with a conditional follow-up save after the safe default Inbox capture.
- Production Playwright proved capture within the 15-second budget, lazy editor loading, axe-clean desktop/mobile presentation, reload interruption recovery, Escape flush with focus restoration, existing offline capture behavior, and a real external OPFS mutation conflict. Screenshots were inspected at desktop and mobile sizes.
- Verified lint, typecheck, 472 workspace tests, production build, and 55 of 57 all-project Playwright checks before the WebKit focus correction; the only failure was WebKit focus restoration and the remaining conflict case was intentionally browser-scoped. After retaining the exact invoking card across the async close boundary, the focused WebKit suite passed 3 with the conflict integration proof skipped as designed. Task 10 is ready for independent review.
- Independent review found unsafe stale-draft restoration, cross-Studio recovery keys, silent typing after conflict, lossy sibling creation, unavailable-storage crashes, incomplete service lifecycle ownership, and under-specified conflict failures. Recovery is now scoped by stable Studio ID and path, storage failures degrade visibly, stale drafts enter an explicit read-only comparison, and every resolution preserves both versions until its durable action succeeds.
- Keep Mine now clones the complete local `StudioNote`, including unknown frontmatter, privacy, display, attachment, line-ending, and classification metadata, while assigning a fresh ID and bounded collision-safe `expectedMissing` path. Keep Other and successful edits trigger projection refresh through the started/subscribed service; switching and unmount unsubscribe and dispose only after pending editor saves drain.
- Conflict actions now expose busy, disabled, detailed failure, and retry states; failed close flushes keep the editor open. Optional Quick Capture meaning retains the safe body-first `Place later` default, with semantic selection applied through a conditional follow-up save.
- Removed the unused Markdown language parser from the separately loaded CodeMirror editor while retaining editing, history, keyboard, wrapping, and plain-Markdown behavior. The lazy editor chunk fell from 504.67 kB minified / 174.38 kB gzip to 275.93 kB / 89.99 kB, below the 500 kB production warning budget; the 477.88 kB main chunk remains below that same limit.
- Post-remediation workspace verification passed 491 tests, lint, typecheck, and the production build before final browser re-verification.
