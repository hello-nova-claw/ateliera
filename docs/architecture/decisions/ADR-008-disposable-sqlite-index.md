# ADR-008: Disposable SQLite index adapters

- Status: accepted
- Date: 2026-07-13

## Context

Markdown and ordinary media files are The Studio's source of truth. Search, filters, and the link graph need a fast local projection that can be destroyed without semantic loss. Desktop and browser runtimes expose different SQLite implementations.

## Decision

`@studio/index` owns an injected synchronous SQLite driver boundary and a shared FTS5-backed `SqliteIndex`. The Node 22+ adapter uses the built-in `node:sqlite` module for desktop tests and benchmarks. A browser SQLite-WASM adapter can implement the same driver without importing Node modules; `node:sqlite` is isolated behind the `@studio/index/node-sqlite` export.

Rebuild reads and parses all Markdown before opening the index transaction. Recoverable parse failures become repair items. Unexpected vault-read failures abort before publication. Valid entries are sorted by canonical path and replace all derived tables in one transaction; a failed transaction leaves the previous index intact. Links remain visible when unresolved and are re-resolved whenever notes change.

Search snippets are plain text with numeric highlight ranges. Imported HTML is stripped from the snippet, so consumers never need to render index-provided markup.

## Consequences

- SQLite is disposable and never authoritative.
- Desktop and future browser adapters share schema and behavior.
- `node:sqlite` currently emits an experimental API warning, so it remains an adapter rather than a domain dependency.
- SQLite must provide FTS5. Adapter construction fails visibly when it does not.
- The first 10,000-note fixture on the reference development Mac rebuilt in 8.424 seconds and returned the warmed two-term filtered search in 3.37 ms, comfortably below the 200 ms target. The benchmark is reproducible with `pnpm benchmark:index -- --notes=10000` and fails when warmed search reaches 200 ms.
