# ADR-008: Disposable SQLite index adapters

- Status: accepted
- Date: 2026-07-13

## Context

Markdown and ordinary media files are The Studio's source of truth. Search, filters, and the link graph need a fast local projection that can be destroyed without semantic loss. Desktop and browser runtimes expose different SQLite implementations.

## Decision

`@studio/index` owns an injected synchronous SQLite driver boundary and a shared FTS5-backed implementation. The UI-safe root export exposes ports and rebuild orchestration, not the concrete synchronous index. The Node 22+ adapter uses the built-in `node:sqlite` module behind the explicit `@studio/index/node-sqlite` export and refuses to instantiate when a browser document is present. Production desktop work must run in a native/background process. A browser SQLite-WASM adapter must run in a Web Worker and implement the same driver without importing Node modules. An eight-second representative rebuild must never occupy the renderer thread.

Rebuild reads and parses all Markdown before opening the index transaction. Recoverable parse failures become repair items. Duplicate stable IDs choose the lexically first canonical path and report every later path for repair. Unexpected vault-read failures abort before publication. Valid entries are sorted by canonical path and replace all derived tables in one transaction; a failed transaction leaves the previous index intact. Progress distinguishes scanning from transactional indexing and announces committing only at the swap boundary.

Links remain visible when unresolved and are re-resolved whenever notes change. Relative paths may not traverse above the vault root and absolute paths remain unresolved. Titles and paths compare in NFC. Duplicate wiki titles remain unresolved with deterministic candidate IDs rather than selecting an arbitrary note.

Search text and links are derived from the same CommonMark AST. Destinations, code blocks, and HTML comments cannot create invisible matches. Search snippets are plain text with numeric highlight ranges. Diacritic-folded FTS matches omit highlights when there is no exact source offset. Tag- and source-only hits expose their metadata match context. Punctuation/emoji-only input returns no results, and filters include card type.

The PRD's typo-tolerant title/tag search remains deferred to Task 16. Task 7's executable interface specifies deterministic keyword search, and silently expanding terms here would make ranking and the 200 ms acceptance boundary ambiguous. Task 16 must add an explicit fuzzy strategy, ranking tests, and visible result rationale before shipping the Search UI.

## Consequences

- SQLite is disposable and never authoritative.
- Desktop/native and future browser-worker adapters share schema and behavior.
- `node:sqlite` currently emits an experimental API warning, so it remains an adapter rather than a domain dependency.
- SQLite must provide FTS5. Adapter construction fails visibly when it does not.
- The remediated 10,000-note fixture on the reference development Mac rebuilt in 8.071 seconds and returned the warmed two-term filtered search in 3.60 ms, comfortably below the 200 ms target. The benchmark is reproducible with `pnpm benchmark:index -- --notes=10000` and fails when warmed search reaches 200 ms.
