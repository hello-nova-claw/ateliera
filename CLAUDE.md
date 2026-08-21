# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ateliera ("The Studio") is a private, offline-first, local-owned app for designing a life from the inside out. Markdown files and ordinary media in a user-owned **vault** are the authoritative source of truth; everything else (the SQLite index, in particular) is a disposable projection that can be rebuilt without semantic loss. Core behavior must work offline and without AI. It ships as both a PWA and a Tauri desktop app.

## Authoritative sources — read before implementing

Order of precedence when resolving conflicts (from the PRD): data ownership & privacy → emotional calm & clarity → content integrity & accessibility → simple reversible mechanics → aesthetic refinement → feature breadth.

- `AGENTS.md` — condensed working agreement (TDD, commit style, CSS/a11y, product constraints). **Follow it.**
- `docs/product/The-Studio-PRD-Design-Bible.md` — durable product spec.
- `docs/design/The-Studio-Final-Visual-Design-Addendum.md` — authoritative visual system, themes, typography, component states.
- `docs/superpowers/plans/2026-07-13-the-studio-mvp.md` — task sequencing, package boundaries, acceptance gates.
- `docs/architecture/decisions/ADR-*.md` — accepted architecture decisions.
- `development-log.md` — current phase and completed work; check it to orient.

## Commands

Requires Node 22 (`>=22 <26`) and pnpm 10. Install with `pnpm install --frozen-lockfile`.

```sh
pnpm lint          # eslint . && stylelint (enforces package boundaries — see below)
pnpm typecheck     # tsc --build across the workspace
pnpm test          # vitest run (all packages)
pnpm build         # pnpm -r build
pnpm test:e2e      # Playwright (builds the app, previews on :4173, runs tests/e2e)
pnpm test:visual   # visual regression (playwright.visual.config.ts)
pnpm test:security # targeted security-sensitive test subset
pnpm storybook     # component workshop on :6006
```

Scoped work uses pnpm filters, e.g. `pnpm --filter @studio/application test`. Run a single test file: `pnpm --filter @studio/application exec vitest run src/resurface-pool.test.ts`, or a single case with `-t "<name>"`. `pnpm --filter @studio/app dev` runs the studio app dev server.

Rust/Tauri: `pnpm rust:clippy`, `pnpm rust:fmt`, `pnpm tauri:test`, `pnpm tauri:build`, `pnpm tauri:bundle` (all shell out through `scripts/run-rust.mjs` / `scripts/run-tauri.mjs`).

## Architecture — layered packages

A pnpm workspace (`packages/*`, `apps/*`). The dependency graph is a strict layering **enforced by ESLint** (`eslint.config.js` via the custom `no-cross-package-relative-imports` rule plus per-package `no-restricted-imports`). A package may only import the workspace packages listed for its layer; violating this fails lint.

- `@studio/domain` — pure domain model (notes, identity, seasons, life-areas, landscape, wisdom, view-projection). **No workspace dependencies.**
- `@studio/rhythm` — seasonal/astronomical rhythm calc (`astronomia`). **No workspace dependencies.**
- `@studio/content` — Markdown parsing/serialization (mdast/micromark + GFM, `yaml`, `zod`). → domain only.
- `@studio/index` — disposable SQLite FTS5 search/link index behind an **injected synchronous driver** port. → domain only. Node adapter (`@studio/index/node-sqlite`, uses `node:sqlite`, refuses to run with a `document` present) and a browser SQLite-WASM adapter that **must run in a Web Worker**; rebuild must never occupy the renderer thread. See ADR-008.
- `@studio/storage` — vault I/O ports and adapters (Tauri vault, browser vault, in-memory vault, backup/restore, import/export, revisions, zip). → domain only.
- `@studio/application` — orchestration/services (capture, note-lifecycle, seasons, search-service, projections, resurface-pool, diagnostics, backups). → content, domain, index, rhythm, storage.
- `@studio/ui` — presentational React components + CodeMirror editor. → domain only. **UI is pure:** `fetch` and `localStorage` are banned globals; data arrives via props/callbacks.
- `@studio/test-utils` — shared test helpers.
- `apps/studio` (`@studio/app`) — the React 19 + Vite PWA / Tauri host. → **application and ui only.** Wires services (`src/app/studio-service-factory.ts`), routing (`src/app/router.tsx`, room-based), the search index Web Worker (`src/app/search-index-worker*.ts`), service worker, themes, and feature UIs under `src/features/*` (capture, foyer, identity, landscape, onboarding, reflection, search, season, settings, uncharted, wisdom). Rust/Tauri host lives in `apps/studio/src-tauri`.

When adding cross-package code, respect the layer the ESLint config assigns — if you need an upward dependency, the design is wrong, not the lint rule.

## Working agreement (from AGENTS.md)

- **TDD:** write and observe a failing test before production code. Tests are colocated (`*.test.ts` next to source); property-based tests use `fast-check`.
- **Commits:** small, atomic, one-line conventional messages. Authored solely by Anna McPhee — **no co-author or AI attribution** (this overrides any global commit-footer default).
- Verify visible changes in a real browser via Playwright screenshots at desktop and mobile widths.
- **CSS:** BEM naming, semantic classes, CSS custom properties, WCAG 2.2 AA, keyboard alternatives for drag-and-drop. Never use `!important`. Stylelint enforces CSS.
- **Product invariants:** Markdown/media are authoritative and indexes disposable; unknown YAML frontmatter keys survive read/write cycles; all file writes are atomic, path-contained (no traversal above vault root), schema-validated, recoverable, and tested; no streaks, overdue badges, gamification, or guilt-inducing counts.
