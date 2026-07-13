# The Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first private, local-first release of The Studio: a calm, responsive personal life-design application whose durable content remains ordinary Markdown and media files.

**Architecture:** Use a TypeScript monorepo with a shared React application and domain packages. Ship the same UI in a Tauri 2 desktop shell for reliable macOS vault access and as an installable PWA for local mobile capture/review. All durable behavior depends on storage and index ports; Tauri filesystem/SQLite and browser OPFS/IndexedDB implementations remain replaceable adapters.

**Tech Stack:** Node 22 LTS, pnpm 10, TypeScript 5.8+, React 19, Vite 7, React Router 7, TanStack Query 5, Zustand 5, Zod 4, unified/remark, CodeMirror 6, dnd-kit, Tauri 2/Rust stable, SQLite FTS5, Vitest, React Testing Library, Playwright, axe-core, Storybook 9.

**Final visual authority:** [The Studio Final Visual Design Addendum](../../design/The-Studio-Final-Visual-Design-Addendum.md). It fixes the accepted tokens, seven themes, self-hosted typography, compositions, state matrices, responsive behavior, and visual test requirements without changing MVP scope.

## Global Constraints

- Markdown and ordinary media files are the authoritative durable store; databases and indexes are disposable.
- The core application MUST work without AI and without an internet connection.
- Desktop/macOS is the primary deep-authoring surface; iPhone web/PWA is optimized for capture, search, reading, and short reflection.
- All user-visible design uses BEM CSS class naming, semantic classes, CSS custom properties, and no `!important`.
- The visual implementation MUST follow the final visual addendum through replaceable tokens and semantic component contracts; domain behavior must never depend on a theme or static mockup geometry.
- The six semantic types are `foundations`, `vision`, `growth`, `reflection`, `celebration`, and `uncharted`; there is no Action semantic type.
- Fixed Landscape anchors are `vision`, `identity-values-feelings`, `decisions`, `practices`, and `structure-strategy`.
- WCAG 2.2 AA, full keyboard operation, reduced-motion behavior, 44 × 44px touch targets, and non-color semantic labels are release requirements.
- No streaks, overdue badges, red urgency states, gamification, compulsory check-ins, or guilt-inducing Inbox counts.
- All file writes MUST be atomic, path-contained, schema-validated, recoverable, and tested before release.
- Unknown YAML frontmatter keys MUST survive read/write cycles.
- Every visible implementation task requires Playwright screenshots at desktop and mobile widths before acceptance.
- Follow test-driven development: failing test, verified failure, minimal implementation, verified pass, then focused conventional commit.
- Commit messages are short, one-line, conventional commits authored only by Anna; no co-author or AI attribution.

---

## 1. Delivery strategy

This is a master implementation specification plus an executable vertical-slice plan. The product contains several independently testable subsystems; implement them in this order:

1. **Foundation:** monorepo, quality gates, tokens, fixtures.
2. **Content kernel:** schema, Markdown fidelity, IDs, paths, migrations.
3. **Storage:** in-memory contract, Tauri vault, browser local vault, atomic writes.
4. **Index:** parsed metadata, links, SQLite/FTS, rebuildability.
5. **Application shell:** navigation, room projections, responsive structure.
6. **Editing:** capture, autosave, recovery, archive/trash, history.
7. **Product rooms:** Foyer, Landscape, Current Season, Uncharted, Reflection.
8. **Retrieval and portability:** Search, export, restore.
9. **Release hardening:** accessibility, security, performance, packaging.
10. **Post-MVP:** Identity Studio, Wisdom Garden, sync, AI, Inner Studio.

Do not begin cross-device sync, AI, or Inner Studio until a clean installation can open, edit, export, destroy its index, rebuild, and restore a representative vault without semantic loss.

### 1.1 MVP definition

The executable MVP contains:

- Tauri desktop app for macOS.
- Responsive PWA running against a browser-local vault.
- Create/open vault.
- Foyer.
- Life Landscape overview and focused-area view.
- Current Season start/edit/close workflow.
- Uncharted.
- Reflection and Celebration.
- Inbox capture.
- Markdown/YAML files and attachments.
- Autosave and crash recovery.
- Search and filters.
- Archive, Trash, export, and restore.
- Offline operation.
- Keyboard, VoiceOver, responsive, security, and visual QA gates.

Identity Studio and Wisdom Garden are Phase 1.1. Their schemas are supported in MVP so data does not require migration when the richer rooms arrive.

### 1.2 Explicit MVP exclusions

- Cloud accounts and cross-device sync.
- Native iOS app.
- AI or embeddings.
- Audio generation and binaural beats.
- Inner Studio sessions.
- Public sharing.
- Collaboration.
- Arbitrary freeform canvas.
- Plugin system.
- General tasks, reminders, or calendar scheduling.

---

## 2. Repository and file map

Create this repository structure. A file should have one clear responsibility; do not collapse packages into a single app folder.

```text
the-studio/
├── AGENTS.md
├── README.md
├── development-log.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── prettier.config.mjs
├── playwright.config.ts
├── vitest.workspace.ts
├── .editorconfig
├── .gitignore
├── .github/workflows/quality.yml
├── apps/
│   ├── studio/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── app/App.tsx
│   │   │   ├── app/router.tsx
│   │   │   ├── app/providers.tsx
│   │   │   ├── app/error-boundary.tsx
│   │   │   ├── app/service-worker.ts
│   │   │   ├── features/capture/
│   │   │   ├── features/foyer/
│   │   │   ├── features/landscape/
│   │   │   ├── features/season/
│   │   │   ├── features/uncharted/
│   │   │   ├── features/reflection/
│   │   │   ├── features/search/
│   │   │   └── styles/
│   │   │       ├── tokens.css
│   │   │       ├── reset.css
│   │   │       ├── typography.css
│   │   │       └── utilities.css
│   │   └── src-tauri/
│   │       ├── Cargo.toml
│   │       ├── tauri.conf.json
│   │       ├── capabilities/default.json
│   │       └── src/
│   │           ├── main.rs
│   │           ├── commands/vault.rs
│   │           ├── commands/index.rs
│   │           └── security/path_guard.rs
│   └── storybook/
│       ├── package.json
│       └── .storybook/
├── packages/
│   ├── domain/src/
│   │   ├── note.ts
│   │   ├── season.ts
│   │   ├── semantic-type.ts
│   │   ├── landscape.ts
│   │   ├── life-area.ts
│   │   ├── room.ts
│   │   ├── view-projection.ts
│   │   └── errors.ts
│   ├── content/src/
│   │   ├── frontmatter-schema.ts
│   │   ├── parse-note.ts
│   │   ├── serialize-note.ts
│   │   ├── migrations.ts
│   │   ├── links.ts
│   │   └── filenames.ts
│   ├── storage/src/
│   │   ├── vault-port.ts
│   │   ├── in-memory-vault.ts
│   │   ├── browser-vault.ts
│   │   ├── tauri-vault.ts
│   │   ├── conflict.ts
│   │   └── export.ts
│   ├── index/src/
│   │   ├── index-port.ts
│   │   ├── in-memory-index.ts
│   │   ├── sqlite-index.ts
│   │   ├── query-parser.ts
│   │   └── rebuild.ts
│   ├── application/src/
│   │   ├── studio-service.ts
│   │   ├── capture-note.ts
│   │   ├── save-note.ts
│   │   ├── move-note.ts
│   │   ├── archive-note.ts
│   │   ├── season-service.ts
│   │   ├── search-service.ts
│   │   └── projections.ts
│   ├── ui/src/
│   │   ├── AppShell/
│   │   ├── Card/
│   │   ├── CardEditor/
│   │   ├── SemanticMark/
│   │   ├── EmptyState/
│   │   ├── Inspector/
│   │   ├── CommandPalette/
│   │   ├── Dialog/
│   │   └── VisuallyHidden/
│   └── test-utils/src/
│       ├── factories.ts
│       ├── fixtures.ts
│       ├── render.tsx
│       └── a11y.ts
├── fixtures/vaults/
│   ├── empty/
│   ├── anna-sample/
│   ├── malformed-frontmatter/
│   ├── broken-links/
│   └── large-generated/
├── docs/
│   ├── architecture/
│   │   ├── 0001-markdown-authoritative.md
│   │   ├── 0002-tauri-and-pwa.md
│   │   ├── 0003-disposable-index.md
│   │   └── 0004-structured-layouts.md
│   ├── schemas/note-frontmatter-v1.md
│   ├── security/threat-model.md
│   ├── testing/strategy.md
│   └── superpowers/plans/
└── tests/e2e/
    ├── onboarding.spec.ts
    ├── capture.spec.ts
    ├── landscape.spec.ts
    ├── season.spec.ts
    ├── search.spec.ts
    ├── portability.spec.ts
    └── accessibility.spec.ts
```

### 2.1 Package dependency rule

Allowed dependency direction:

```text
domain ← content
domain ← storage
domain ← index
domain + content + storage + index ← application
domain ← ui
application + ui ← apps/studio
```

`domain` imports no workspace package. `ui` receives data and callbacks; it does not access filesystem, Tauri, browser storage, SQLite, or network APIs. Enforce this with ESLint restricted-import rules.

---

## 3. Core contracts

These signatures are stable interfaces used throughout the tasks.

### 3.1 Domain note

```ts
export type SemanticType =
  | 'foundations'
  | 'vision'
  | 'growth'
  | 'reflection'
  | 'celebration'
  | 'uncharted';

export type NoteStatus = 'draft' | 'active' | 'resting' | 'archived' | 'trashed';

export type LandscapeAnchor =
  | 'vision'
  | 'identity-values-feelings'
  | 'decisions'
  | 'practices'
  | 'structure-strategy';

export interface StudioNote {
  schemaVersion: 1;
  id: string;
  title?: string;
  body: string;
  cardType: string;
  semanticType: SemanticType;
  status: NoteStatus;
  rooms: string[];
  lifeAreas: string[];
  landscapeAnchor?: LandscapeAnchor;
  seasons: string[];
  tags: string[];
  created: string;
  updated: string;
  source?: { title?: string; creator?: string; url?: string };
  attachments: string[];
  display: { cover?: string; featured: boolean };
  privacy: {
    sensitivity: 'private' | 'sensitive';
    aiAccess: 'never' | 'ask' | 'selected' | 'scoped';
  };
  extraFrontmatter: Record<string, unknown>;
}
```

### 3.2 Vault port

```ts
export interface VaultEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  contentHash?: string;
}

export interface WriteCondition {
  expectedHash?: string;
}

export interface VaultPort {
  list(prefix?: string): Promise<VaultEntry[]>;
  readText(path: string): Promise<{ text: string; hash: string }>;
  writeTextAtomic(path: string, text: string, condition?: WriteCondition): Promise<{ hash: string }>;
  readBinary(path: string): Promise<Uint8Array>;
  writeBinaryAtomic(path: string, bytes: Uint8Array): Promise<{ hash: string }>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  watch(listener: (event: VaultChange) => void): Promise<() => void>;
}
```

### 3.3 Index port

```ts
export interface SearchFilters {
  rooms?: string[];
  semanticTypes?: SemanticType[];
  lifeAreas?: string[];
  seasons?: string[];
  statuses?: NoteStatus[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchHit {
  id: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
}

export interface IndexPort {
  upsert(note: StudioNote, path: string, hash: string): Promise<void>;
  remove(id: string): Promise<void>;
  getById(id: string): Promise<{ note: StudioNote; path: string } | null>;
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
  backlinks(id: string): Promise<string[]>;
  rebuild(entries: Array<{ note: StudioNote; path: string; hash: string }>): Promise<void>;
  clear(): Promise<void>;
}
```

### 3.4 Application service

```ts
export interface StudioService {
  capture(input: CaptureNoteInput): Promise<StudioNote>;
  save(note: StudioNote, expectedHash?: string): Promise<StudioNote>;
  get(id: string): Promise<StudioNote | null>;
  search(query: string, filters?: SearchFilters): Promise<SearchHit[]>;
  projectRoom(room: string): Promise<CardProjection[]>;
  archive(id: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
```

---

## 4. Milestones and release gates

| Milestone | Working software produced | Gate |
|---|---|---|
| M0 | Repository and tokenized shell | CI green; responsive shell visually inspected |
| M1 | Markdown content kernel | 100% fixture round-trip; unknown keys preserved |
| M2 | Local vault and index | atomic-write, conflict, rebuild, path-security tests pass |
| M3 | Capture/edit lifecycle | crash recovery, archive, Trash, autosave E2E pass |
| M4 | Foyer + Landscape | sparse/dense desktop/mobile visual and a11y gates pass |
| M5 | Season + Uncharted + Reflection | complete seasonal workflow and no-pressure language review |
| M6 | Search + portability | export, destroy, clean restore and index rebuild pass |
| M7 | MVP release candidate | offline, security, performance, VoiceOver, packaging gates pass |

---

## 5. Executable task plan

### Task 1: Scaffold the monorepo and quality gates

**Files:**
- Create: root configuration files listed in Section 2.
- Create: `apps/studio/src/main.tsx`, `apps/studio/src/app/App.tsx`.
- Create: `.github/workflows/quality.yml`.
- Test: `apps/studio/src/app/App.test.tsx`.

**Interfaces:**
- Consumes: none.
- Produces: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`; workspace packages resolvable as `@studio/*`.

- [ ] **Step 1: Create the workspace manifests and failing shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Studio landmark', () => {
  render(<App />);
  expect(screen.getByRole('main', { name: 'The Studio' })).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify the unimplemented component fails**

Run: `pnpm --filter @studio/app test -- App.test.tsx`  
Expected: FAIL because `App` or its accessible main landmark does not exist.

- [ ] **Step 3: Implement the minimal accessible app shell**

```tsx
export function App() {
  return <main aria-label="The Studio">The Studio</main>;
}
```

- [ ] **Step 4: Add strict quality configuration**

Configure TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`. Configure ESLint to reject cross-layer imports and CSS linting to reject `!important`. Configure CI to run install with frozen lockfile, lint, typecheck, unit tests, production build, and Playwright.

- [ ] **Step 5: Verify all gates**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`  
Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold studio workspace"
```

### Task 2: Establish design tokens and accessible component primitives

**Files:**
- Create: `apps/studio/src/styles/tokens.css`, `reset.css`, `typography.css`.
- Create: `packages/ui/src/SemanticMark/SemanticMark.tsx` and `.css`.
- Create: `packages/ui/src/Card/Card.tsx` and `.css`.
- Create: Storybook stories and visual tests.
- Test: `packages/ui/src/SemanticMark/SemanticMark.test.tsx`, `Card.test.tsx`.

**Interfaces:**
- Consumes: `SemanticType` from `@studio/domain`; the final visual token and state contracts.
- Produces: `<SemanticMark type labelMode />`, `<Card semanticType title excerpt actions />`; all theme changes flow through root token overrides and component CSS.

- [ ] **Step 1: Write failing semantic-label and card tests**

```tsx
it('does not rely on color to communicate Vision', () => {
  render(<SemanticMark type="vision" labelMode="visible" />);
  expect(screen.getByText('Vision')).toBeVisible();
});

it('exposes a named card region', () => {
  render(<Card semanticType="reflection" title="What I learned" excerpt="Small steps count." />);
  expect(screen.getByRole('article', { name: 'What I learned' })).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/ui test -- SemanticMark.test.tsx Card.test.tsx`  
Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement minimal semantic primitives using BEM classes**

```tsx
const labels: Record<SemanticType, string> = {
  foundations: 'Foundations', vision: 'Vision', growth: 'Growth',
  reflection: 'Reflection', celebration: 'Celebration', uncharted: 'Uncharted',
};

export function SemanticMark({ type, labelMode = 'hidden' }: Props) {
  return (
    <span className={`semantic-mark semantic-mark--${type}`}>
      <span aria-hidden="true" className="semantic-mark__heart">♥</span>
      <span className={labelMode === 'hidden' ? 'visually-hidden' : 'semantic-mark__label'}>
        {labels[type]}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Implement the accepted primitive token contract**

Use semantic CSS variables and BEM classes. Establish focus, forced-colors, reduced-motion, spacing, type scale, radii, shadows, and breakpoint variables. The complete seven-theme maps and self-hosted fonts are integrated when the shell/room vertical slice can verify them in context; primitive contracts and semantic meanings remain stable.

- [ ] **Step 5: Run unit, axe, Storybook, and screenshot checks**

Run: `pnpm --filter @studio/ui test && pnpm storybook:build && pnpm test:visual --project=chromium`  
Expected: PASS; no axe violations; empty, full, selected, editing, dragging, saving, offline, error, and archived card states reviewed at 1440×1000 and 390×844.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/styles packages/ui
git commit -m "feat: add studio design primitives"
```

### Task 3: Implement the domain schema and Markdown round-trip kernel

**Files:**
- Create: `packages/domain/src/*.ts` listed in Section 2.
- Create: `packages/content/src/frontmatter-schema.ts`, `parse-note.ts`, `serialize-note.ts`, `filenames.ts`.
- Test: matching `.test.ts` files and `fixtures/vaults/*` notes.

**Interfaces:**
- Consumes: raw UTF-8 Markdown text.
- Produces: `parseNote(text: string): ParseResult`; `serializeNote(note: StudioNote): string`; `createNoteId(): string`; `suggestFilename(note): string`.

- [ ] **Step 1: Write failing parser fidelity tests**

```ts
it('preserves unknown frontmatter keys across a round trip', () => {
  const input = `---\nschema_version: 1\nid: 01JTEST\ncard_type: vision\nsemantic_type: vision\nstatus: active\nrooms: []\nlife_areas: []\nseasons: []\ntags: []\ncreated: 2026-07-13T10:00:00+10:00\nupdated: 2026-07-13T10:00:00+10:00\nattachments: []\ndisplay: { featured: false }\nprivacy: { sensitivity: private, ai_access: ask }\ncustom_key: keep-me\n---\n\n# Hello\n`;
  const parsed = parseNote(input);
  expect(parsed.note.extraFrontmatter).toEqual({ custom_key: 'keep-me' });
  expect(parseNote(serializeNote(parsed.note)).note.extraFrontmatter).toEqual({ custom_key: 'keep-me' });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/content test -- parse-note.test.ts`  
Expected: FAIL because `parseNote` and `serializeNote` do not exist.

- [ ] **Step 3: Implement Zod schemas and explicit key mapping**

Implement snake_case YAML ↔ camelCase domain mapping. Split recognized and unknown keys before validation. Return structured recoverable errors with the Markdown body retained when frontmatter is invalid.

```ts
export type ParseResult =
  | { ok: true; note: StudioNote; warnings: ParseWarning[] }
  | { ok: false; rawBody: string; recoverable: true; errors: ParseError[] };
```

- [ ] **Step 4: Add tests for all enums and malformed inputs**

Cover invalid semantic type, missing ID, optional title, Unicode, CRLF preservation policy, YAML aliases disabled, raw HTML body preserved as text, and unknown keys. Add a property-based test generating valid notes and asserting semantic equality after parse/serialize.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @studio/domain test && pnpm --filter @studio/content test`  
Expected: PASS with 100% branch coverage for schema mapping and error classification.

- [ ] **Step 6: Commit**

```bash
git add packages/domain packages/content fixtures/vaults
git commit -m "feat: add markdown content kernel"
```

### Task 4: Define and contract-test storage adapters

**Files:**
- Create: `packages/storage/src/vault-port.ts`, `in-memory-vault.ts`, `conflict.ts`.
- Create: `packages/storage/src/__contract__/vault-contract.ts`.
- Test: `in-memory-vault.test.ts`.

**Interfaces:**
- Consumes: relative normalized vault paths and bytes/text.
- Produces: `VaultPort`; typed `VaultConflictError`, `PathEscapeError`, `VaultUnavailableError`.

- [ ] **Step 1: Write a reusable failing contract suite**

```ts
export function vaultContract(name: string, createVault: () => Promise<VaultPort>) {
  describe(name, () => {
    it('rejects paths outside the vault', async () => {
      const vault = await createVault();
      await expect(vault.writeTextAtomic('../secret.md', 'x')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('prevents lost updates with expected hashes', async () => {
      const vault = await createVault();
      const first = await vault.writeTextAtomic('Inbox/a.md', 'one');
      await vault.writeTextAtomic('Inbox/a.md', 'two', { expectedHash: first.hash });
      await expect(vault.writeTextAtomic('Inbox/a.md', 'three', { expectedHash: first.hash }))
        .rejects.toBeInstanceOf(VaultConflictError);
    });
  });
}
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/storage test -- in-memory-vault.test.ts`  
Expected: FAIL because the port and adapter do not exist.

- [ ] **Step 3: Implement normalized path validation, SHA-256 hashes, and in-memory atomic semantics**

Reject absolute paths, `..`, NUL bytes, platform separators after normalization, and symlink-equivalent escapes at platform adapters. Make writes appear whole to readers. Emit watcher events after durability.

- [ ] **Step 4: Run contract suite**

Run: `pnpm --filter @studio/storage test`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage
git commit -m "feat: define vault storage contract"
```

### Task 5: Implement the Tauri macOS vault adapter

**Files:**
- Create: `apps/studio/src-tauri/src/commands/vault.rs`.
- Create: `apps/studio/src-tauri/src/security/path_guard.rs`.
- Create: `packages/storage/src/tauri-vault.ts`.
- Modify: `apps/studio/src-tauri/capabilities/default.json`.
- Test: Rust unit/integration tests and TypeScript contract invocation.

**Interfaces:**
- Consumes: a directory selected through a native Tauri folder dialog and retained as a capability-scoped open directory handle.
- Produces: `selectTauriVault(): Promise<VaultPort | null>`; native selection returns a random opaque token that remains private to the adapter.

- [ ] **Step 1: Write failing Rust path and atomic-write tests**

```rust
#[test]
fn rejects_parent_traversal() {
    assert!(validate_relative_path("../secret.md").is_err());
}

#[test]
fn replacing_a_parent_with_a_symlink_cannot_escape_the_open_root() {
    // Operate through the retained directory capability after the hostile swap.
    // The write must fail or remain beneath the originally opened directory.
}

#[test]
fn temp_file_is_replaced_atomically() {
    let dir = tempfile::tempdir().unwrap();
    atomic_write(dir.path(), "note.md", b"complete").unwrap();
    assert_eq!(std::fs::read(dir.path().join("note.md")).unwrap(), b"complete");
}
```

- [ ] **Step 2: Verify failure**

Run: `cd apps/studio/src-tauri && cargo test`  
Expected: FAIL because the retained capability registry, descriptor-relative operations, and atomic writer do not exist.

- [ ] **Step 3: Implement native selection and capability-scoped commands**

Open/select the vault through the native desktop flow. Retain a `cap_std::fs::Dir` or equivalent open-directory capability in Rust and return only a random opaque token to the webview. Every list/read/write/move/remove/watch operation resolves relative components and opens files descriptor-relative from that retained root; validation must not return an ambient absolute path for later reopening. Reject absolute, parent, NUL, symlink, special-file, and invalid-token inputs. Revoke tokens and stop watchers when the owning window/app closes. Do not grant blanket filesystem scope.

- [ ] **Step 4: Connect TypeScript adapter and normalize logical changes**

Expose native `vault_select`, plus token-scoped `list`, `read_text`, `write_text_atomic`, `move`, `remove`, and `watch` commands. Convert Rust error codes to typed domain errors without leaking full external paths. Conditional writes compare hashes through the same retained capability used for mutation. All Studio desktop mutations acquire both an in-process mutex and a vault-level `.studio-write.lock` advisory lock; this is the exact linearizability boundary shared by Studio processes and other cooperating writers. A second hash check immediately before publication detects ordinary non-cooperating edits without ever publishing a known-failed candidate, but an arbitrary external tool that ignores the lock can still race that final check and rename and is explicitly outside the exact compare-and-replace guarantee. Moves use an atomic no-clobber rename. The watcher roots itself at the retained directory descriptor, emits debounced logical `created | modified | moved | removed` vault changes, and suppresses temporary and lock artifacts.

- [ ] **Step 5: Verify Rust and desktop integration**

Run: `pnpm tauri:test && pnpm --filter @studio/storage test:tauri`  
Expected: PASS against the real Tauri IPC boundary and macOS watcher; hostile parent/symlink replacement cannot escape or retarget the selected directory; deliberate interruption leaves old or complete new content; stale expected hashes fail; a cooperating concurrent writer is never lost; watcher output contains no temp/lock files or duplicate logical events; closing the app revokes tokens and watchers. The test contract does not claim exact CAS against writers that ignore `.studio-write.lock`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src-tauri packages/storage/src/tauri-vault.ts
git commit -m "feat: add secure desktop vault"
```

### Task 6: Implement the browser-local PWA vault

**Files:**
- Create: `packages/storage/src/browser-vault.ts`.
- Create: `apps/studio/src/app/service-worker.ts`.
- Modify: `apps/studio/vite.config.ts`.
- Test: browser adapter contract and offline Playwright spec.

**Interfaces:**
- Consumes: browser OPFS/IndexedDB APIs.
- Produces: `createBrowserVault(name: string): VaultPort`; ZIP import/export boundary for portability.

- [ ] **Step 1: Add failing browser contract and offline test**

```ts
test('captured note survives reload while offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.getByRole('textbox', { name: 'What would you like remembered?' }).fill('The hill');
  await page.getByRole('button', { name: 'Remember' }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('The hill')).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test:e2e -- capture-offline.spec.ts`  
Expected: FAIL because browser persistence/service worker is absent.

- [ ] **Step 3: Implement browser storage and app-shell caching**

Store durable browser-vault files in OPFS where supported and use IndexedDB as the compatibility adapter. Cache only versioned application assets in the service worker; do not put private note content in Cache Storage.

- [ ] **Step 4: Run adapter and offline tests**

Run: `pnpm --filter @studio/storage test:browser && pnpm test:e2e -- capture-offline.spec.ts`  
Expected: PASS in Chromium and WebKit projects.

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/browser-vault.ts apps/studio
git commit -m "feat: add offline browser vault"
```

### Task 7: Build the disposable index and link graph

**Files:**
- Create: `packages/index/src/*` listed in Section 2.
- Create: `packages/content/src/links.ts`.
- Test: `sqlite-index.test.ts`, `rebuild.test.ts`, `links.test.ts`.

**Interfaces:**
- Consumes: parsed `StudioNote`, canonical path, content hash.
- Produces: `IndexPort`; deterministic rebuild; parsed forward links and backlinks.

- [ ] **Step 1: Write failing search, backlink, and rebuild tests**

```ts
it('returns identical search results after index deletion and rebuild', async () => {
  const before = await index.search('calm', { semanticTypes: ['reflection'] });
  await index.clear();
  await rebuildIndex(index, vault, parser);
  expect(await index.search('calm', { semanticTypes: ['reflection'] })).toEqual(before);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/index test`  
Expected: FAIL because index operations are absent.

- [ ] **Step 3: Implement FTS schema and deterministic indexing**

Create tables for notes, note_fts, tags, note_tags, life_areas, note_life_areas, links, and index_state. Use stable note IDs as identity and paths as mutable attributes. Sanitize snippets before rendering.

- [ ] **Step 4: Implement rebuild with progress and corrupt-note isolation**

One malformed note must produce a repair item but not stop the rest of the vault. Rebuild into a new index file/transaction and swap only after success.

- [ ] **Step 5: Verify tests and performance fixture**

Run: `pnpm --filter @studio/index test && pnpm benchmark:index -- --notes=10000`  
Expected: tests PASS; first keyword results under 200ms on the reference development Mac after warm-up.

- [ ] **Step 6: Commit**

```bash
git add packages/index packages/content/src/links.ts
git commit -m "feat: add rebuildable studio index"
```

### Task 8: Implement application services and room projections

**Files:**
- Create: `packages/application/src/*` listed in Section 2.
- Test: `capture-note.test.ts`, `save-note.test.ts`, `projections.test.ts`.

**Interfaces:**
- Consumes: `VaultPort`, `IndexPort`, clock, ID generator.
- Produces: `createStudioService(dependencies): StudioService`; projection functions for rooms and Landscape cells.

- [ ] **Step 1: Write failing capture/projection tests**

```ts
it('captures an unclassified fragment into Inbox with safe defaults', async () => {
  const note = await service.capture({ body: 'A thought worth keeping' });
  expect(note).toMatchObject({ status: 'draft', rooms: ['inbox'], semanticType: 'reflection' });
  expect(await vault.exists(expect.stringMatching(/^Inbox\//))).toBe(true);
});

it('projects one canonical note into multiple rooms without duplication', async () => {
  await seedNote({ id: 'n1', rooms: ['uncharted'], lifeAreas: ['business'], semanticType: 'uncharted' });
  expect((await service.projectRoom('uncharted')).map(x => x.noteId)).toEqual(['n1']);
  expect((await projectLifeArea(service, 'business')).map(x => x.noteId)).toEqual(['n1']);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/application test`  
Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement save ordering and compensating behavior**

Validate → serialize → atomic vault write → index upsert → publish UI event. If index upsert fails, preserve the durable file, mark index stale, and schedule rebuild; never roll back valid user content because a disposable cache failed.

- [ ] **Step 4: Implement projections**

Derive Foyer featured content, room membership, Landscape cell membership, active season, and Reflection/ Celebration streams from metadata. Store incidental manual order in `.studio/views/*.json` through a dedicated view-state repository.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @studio/application test`  
Expected: PASS, including simulated index failure and concurrent-save conflict.

- [ ] **Step 6: Commit**

```bash
git add packages/application
git commit -m "feat: add studio application services"
```

### Task 9: Build the responsive application shell and onboarding

**Files:**
- Create: `packages/ui/src/AppShell/*`, `CommandPalette/*`, `Dialog/*`.
- Modify: `apps/studio/src/app/router.tsx`, `providers.tsx`.
- Create: `apps/studio/src/features/onboarding/*`.
- Test: component tests and `tests/e2e/onboarding.spec.ts`.

**Interfaces:**
- Consumes: configured `StudioService`, vault status, route definitions.
- Produces: desktop navigation rail; mobile Home/Capture/Search/More navigation; open/create-vault flow.

- [ ] **Step 1: Write failing onboarding and keyboard tests**

```ts
test('creates a local Studio and enters the Foyer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a Studio' }).click();
  await page.getByLabel('Studio name').fill('The Studio');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'The Studio' })).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test:e2e -- onboarding.spec.ts`  
Expected: FAIL because onboarding and routes are absent.

- [ ] **Step 3: Implement responsive shell and route boundaries**

Routes: `/foyer`, `/landscape`, `/landscape/:lifeArea`, `/season`, `/uncharted`, `/reflection`, `/search`, `/inbox`, `/settings`. Lazy-load room bundles. Desktop uses the 248px rail, 60px sticky top bar, and 440px modal inspector contract. Mobile replaces the rail with Home/Capture/Search/More bottom navigation and uses full-screen editor/inspector surfaces. Use landmarks, skip link, logical focus order, focus restoration, and route-title announcements. Design System, States Gallery, and Mobile Preview stay development-only.

- [ ] **Step 4: Implement command palette and mobile navigation**

Support open room, capture, search, and settings. Keyboard shortcuts must avoid editor conflicts. Mobile Capture remains one tap from every primary screen. Implement the seven-theme radio menu using the accepted override maps, local preference, `color-scheme`, Escape/outside close, and a polite selection announcement. Self-host Newsreader, Hanken Grotesk, and Caveat with licenses and offline fallbacks.

- [ ] **Step 5: Browser visual verification**

Run: `pnpm test:e2e -- onboarding.spec.ts accessibility.spec.ts && pnpm test:visual`  
Expected: PASS at 1440×1000, 1024×768, 390×844; no horizontal overflow except the named Landscape region; visible focus and 44px targets; font-ready screenshots; Chamomile, Fig Leaf, and Deep Ocean visually reviewed; reduced-motion theme change is instant.

- [ ] **Step 6: Commit**

```bash
git add apps/studio packages/ui
git commit -m "feat: add responsive studio shell"
```

### Task 10: Implement capture, editor, autosave, and recovery

**Files:**
- Create: `apps/studio/src/features/capture/*`.
- Create: `packages/ui/src/CardEditor/*`.
- Create: `packages/application/src/draft-recovery.ts`.
- Test: `tests/e2e/capture.spec.ts`, unit tests for debounce/recovery.

**Interfaces:**
- Consumes: `StudioService.capture`, `.save`; recovery-store adapter.
- Produces: quick capture under 15 seconds; full Markdown editor; save-state model `idle | dirty | saving | saved | conflict | error`.

- [ ] **Step 1: Write failing autosave and recovery tests**

```ts
vi.useFakeTimers();
it('autosaves once after 750ms of inactivity', async () => {
  const save = vi.fn().mockResolvedValue(note);
  const { result } = renderHook(() => useAutosave(note, save));
  act(() => result.current.updateBody('Changed'));
  await vi.advanceTimersByTimeAsync(749);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- use-autosave.test.ts draft-recovery.test.ts`  
Expected: FAIL because hooks/services do not exist.

- [ ] **Step 3: Implement quick capture and full editor**

Quick capture requires body only. Default to Inbox/draft/reflection but allow optional semantic selection and “Place later.” Use CodeMirror for Markdown focus mode. Preserve unsaved text in a session recovery store before durable save.

- [ ] **Step 4: Implement conflict UI**

On expected-hash conflict, stop autosave, keep local draft, load remote version, and show side-by-side choices: keep mine as sibling, keep other, or manually merge. Never overwrite automatically.

- [ ] **Step 5: Verify E2E and interruption behavior**

Run: `pnpm test && pnpm test:e2e -- capture.spec.ts`  
Expected: PASS; reload during typing offers recovered draft; capture completes within the 15-second scripted performance budget.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/capture packages/ui/src/CardEditor packages/application
git commit -m "feat: add capture and autosave"
```

### Task 11: Implement Archive, Trash, restore, and local revision snapshots

**Files:**
- Create: `packages/application/src/archive-note.ts`, `trash-note.ts`, `restore-note.ts`.
- Create: `packages/storage/src/revisions.ts`.
- Test: lifecycle unit and E2E tests.

**Interfaces:**
- Consumes: note path/status, VaultPort, IndexPort.
- Produces: recoverable archive/trash lifecycle; `.studio/Trash/manifest.json`; revision snapshots.

- [ ] **Step 1: Write failing lifecycle test**

```ts
it('restores a trashed note to its previous path and metadata', async () => {
  await service.trash('n1');
  expect(await service.get('n1')).toBeNull();
  await service.restore('n1');
  expect(await service.get('n1')).toMatchObject({ id: 'n1', status: 'active' });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/application test -- trash-note.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement lifecycle transactions**

Trash records original path, hash, status, deletion date, and attachments considered. Restore resolves occupied paths with a safe suffix and reports it. Permanent deletion requires an exact confirmation action and is not exposed in card menus.

- [ ] **Step 4: Implement bounded snapshots**

Before migrations, multi-file renames, and conflict resolutions, write a dated snapshot manifest. Retain daily snapshots for 30 days by default without deleting user-authored Archive content.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm test:e2e -- lifecycle.spec.ts`  
Expected: PASS for restore, occupied path, missing attachment, and partial-failure recovery.

- [ ] **Step 6: Commit**

```bash
git add packages/application packages/storage tests/e2e
git commit -m "feat: add recoverable note lifecycle"
```

### Task 12: Build the Foyer vertical slice

**Files:**
- Create: `apps/studio/src/features/foyer/FoyerPage.tsx`, `FoyerPage.css`, `use-foyer.ts`.
- Create: component files for Becoming, SeasonPreview, Feelings, Principles, ReturnCard, Legend.
- Test: component, projection, visual, and accessibility tests.

**Interfaces:**
- Consumes: `projectFoyer()` output.
- Produces: composed Foyer across empty, partial, and full data states.

- [ ] **Step 1: Write failing empty and populated tests**

```tsx
it('invites only three starting choices in an empty Foyer', () => {
  render(<FoyerPage model={emptyFoyer} />);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.getByText('What are you currently becoming?')).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/app test -- FoyerPage.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement the accepted Foyer composition**

Use the 1.55fr/1fr desktop composition with at least 35% negative space: title/motto, currently becoming, current season, and principles on the wide side; one optional taped polaroid, desired-feeling note chips, and one resurfaced celebration on the narrow side; compact six-meaning legend below. Stack into the specified mobile reading order. Do not introduce arbitrary dashboard widgets.

- [ ] **Step 4: Apply the final design authority**

Apply the final addendum's tokens, Newsreader/Hanken Grotesk hierarchy, note stock, spacing, polaroid treatment, imagery rules, and component states. Preserve landmarks, logical DOM order, empty states, and interactions. Personal imagery is optional and removable; decorative tape/sprig is hidden from assistive technology. Record deliberate deviations from the accepted design.

- [ ] **Step 5: Inspect in Playwright**

Run: `pnpm test:visual -- foyer && pnpm test:e2e -- accessibility.spec.ts`  
Expected: PASS and manual approval for empty/partial/full/dense at desktop and mobile, missing image, all three save states, 200% zoom, forced/high contrast, dark theme, and reduced motion.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/foyer packages/ui apps/studio/src/styles
git commit -m "feat: build the foyer"
```

### Task 13: Build Life Landscape overview and focused view

**Files:**
- Create: `apps/studio/src/features/landscape/*`.
- Create: `packages/domain/src/landscape.ts`.
- Test: `tests/e2e/landscape.spec.ts`, visual and keyboard-reorder tests.

**Interfaces:**
- Consumes: `projectLandscape()`, life-area configuration, view-order repository.
- Produces: matrix overview on desktop; one-area focus editor; anchor-by-area lens; accessible reorder/move actions.

- [ ] **Step 1: Write failing projection and mobile tests**

```ts
test('mobile opens one life area without shrinking the whole matrix', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/landscape/home');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vision' })).toBeVisible();
  await expect(page.locator('.life-landscape__matrix')).toBeHidden();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test:e2e -- landscape.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement overview and focus projections**

Desktop matrix uses the accepted architectural grid: 184px sticky anchor rail plus 5–10 sticky life-area columns at a minimum 132px, with Matrix/Focus/Lens segmented control and horizontal scrolling contained to a named region. Cells show one featured note plus additional count. Focus uses a horizontal area switcher and five spacious stacked anchors with serif prompts. Mobile never renders a shrunken matrix and routes directly to the focused stack.

- [ ] **Step 4: Implement drag and keyboard movement**

Use dnd-kit for pointer/touch. Provide menu/keyboard commands “Move within section,” “Move to another anchor,” and “Add to another life area.” Preview metadata changes and expose Undo. A linked multi-area note remains one canonical note.

- [ ] **Step 5: Validate density and accessibility**

Run: `pnpm test:e2e -- landscape.spec.ts accessibility.spec.ts && pnpm test:visual -- landscape`  
Expected: PASS for empty, 5-area sparse, 10-area dense, matrix/focus/lens views, three-line matrix clamping with accessible full titles, touch drag, keyboard move, 200% zoom, and no page-level horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/landscape packages/domain packages/application
git commit -m "feat: build life landscape"
```

### Task 14: Implement Current Season domain and workflow

**Files:**
- Create: `packages/domain/src/season.ts`.
- Create: `packages/application/src/season-service.ts`.
- Create: `apps/studio/src/features/season/*`.
- Test: `tests/e2e/season.spec.ts` and unit tests.

**Interfaces:**
- Consumes: notes and existing seasons.
- Produces: exactly one active season; `beginSeason`, `updateSeason`, `closeSeason`; one-page read view.

- [ ] **Step 1: Write failing domain tests**

```ts
it('requires an explicit override before adding a fourth priority', () => {
  expect(() => addPriority(seasonWithThree, 'n4')).toThrow(PriorityLimitError);
  expect(addPriority(seasonWithThree, 'n4', { override: true }).priorities).toHaveLength(4);
});

it('never carries notes into the next season automatically', () => {
  expect(closeSeason(activeSeason).carryForward).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/application test -- season-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement seasonal state and wizard**

Begin steps: name/dates, previous reflection/skip, feelings, priorities, decisions/experiments, practices, constraints/support, enough, Not now, confirmation. Persist after every step so interruptions are safe.

The read view follows the accepted editorial cover: title and range, “This is a season of…”, up to three priority note cards, feeling chips, Enough, 30/60/90 decision tags, practices, constraints/support, and a collapsed Not now shelf. It becomes a single calm reading flow on mobile.

- [ ] **Step 4: Implement close workflow**

Capture celebration, learning, identity change, and disposition per linked item: celebrate, archive, return to Landscape, explicitly invite forward, or release. Produce a Markdown season letter and archive the season.

- [ ] **Step 5: Verify complete workflow**

Run: `pnpm test && pnpm test:e2e -- season.spec.ts`  
Expected: PASS, including abandoned wizard recovery, changed dates, four-priority override, and zero automatic carry-forward.

- [ ] **Step 6: Commit**

```bash
git add packages/domain packages/application apps/studio/src/features/season tests/e2e/season.spec.ts
git commit -m "feat: add seasonal planning workflow"
```

### Task 15: Build Uncharted and Reflection Garden

**Files:**
- Create: `apps/studio/src/features/uncharted/*`.
- Create: `apps/studio/src/features/reflection/*`.
- Test: room component tests and E2E flows.

**Interfaces:**
- Consumes: semantic room projections and capture service.
- Produces: no-pressure What-if capture; Reflection/Celebration chronological streams; manual cross-links.

- [ ] **Step 1: Write failing language and behavior tests**

```tsx
it('does not render execution pressure in Uncharted', () => {
  render(<UnchartedPage model={sampleUncharted} />);
  expect(screen.getByText('What if…?')).toBeVisible();
  expect(screen.queryByText(/due|overdue|progress/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/app test -- UnchartedPage.test.tsx ReflectionPage.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement Uncharted**

Use the accepted spacious composition: a large purple “What if…” composer, two-column near-possibility notes, a “Beyond the gate” divider, and dashed genuinely-unknowable cards; stack to one column on mobile. Support optional invitation into a season as a link; never change semantic type automatically. Exclude dates, progress, pressure, and status gamification.

- [ ] **Step 4: Implement Reflection Garden**

Views: Garden, Reflection, Celebration, Themes. Use the accepted chronological stream with blue reflections, orange celebrations, linked evidence, an optional Then & now pair, and one optional taped image—not a heatmap. Allow one-sentence quick reflection and full editor. Connect celebrations to identity/season/life-area cards through links.

- [ ] **Step 5: Visual and content QA**

Run: `pnpm test:e2e -- uncharted.spec.ts reflection.spec.ts && pnpm test:visual -- uncharted reflection`  
Expected: PASS; editorial whitespace remains intact at sparse and dense states; two-column layouts stack below 720px; optional imagery can be absent; semantic meaning includes text/icon labels; no streak, date, or progress language appears in Uncharted.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/uncharted apps/studio/src/features/reflection
git commit -m "feat: add imagination and reflection rooms"
```

### Task 16: Implement Search, filters, backlinks, and repair states

**Files:**
- Create: `apps/studio/src/features/search/*`.
- Create: `packages/ui/src/Inspector/*`.
- Create: `packages/application/src/search-service.ts`.
- Test: `tests/e2e/search.spec.ts`.

**Interfaces:**
- Consumes: `IndexPort.search`, backlinks, parse warnings.
- Produces: local keyword search, typed filters, highlighted safe snippets, repair queue.

- [ ] **Step 1: Write failing search tests**

```ts
test('filters calm reflections without exposing unrelated notes', async ({ page }) => {
  await page.goto('/search?q=calm');
  await page.getByRole('checkbox', { name: 'Reflection' }).check();
  await expect(page.getByRole('article', { name: 'A quiet morning that worked' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'What if I created a retreat?' })).toBeHidden();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test:e2e -- search.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement search and inspector**

Filters: room, semantic type, life area, season, status, tag, and date. Inspector shows metadata/backlinks only on request. Sanitize all highlighted snippets and never render raw imported HTML.

- [ ] **Step 4: Implement repair view**

Malformed frontmatter appears as recoverable content with exact validation messages, raw body preview, and a metadata form. Broken links remain visible with relink/remove options.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm test:e2e -- search.spec.ts repair.spec.ts`  
Expected: PASS; warm search results under 200ms against the large fixture.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/search packages/ui/src/Inspector packages/application
git commit -m "feat: add studio search and repair"
```

### Task 17: Implement portable export, import, backup, and restore

**Files:**
- Create: `packages/storage/src/export.ts`, `import.ts`, `backup.ts`.
- Create: `apps/studio/src/features/settings/PortabilitySettings.tsx`.
- Test: `tests/e2e/portability.spec.ts` and integrity tests.

**Interfaces:**
- Consumes: VaultPort and schema manifest.
- Produces: ZIP export/import with Markdown, assets, `.studio` settings excluding disposable index, checksums, and schema version.

- [ ] **Step 1: Write failing clean-restore test**

```ts
it('restores a complete export into an empty vault with the same semantic notes', async () => {
  const archive = await exportVault(sourceVault);
  await importVault(emptyVault, archive);
  expect(await semanticSnapshot(emptyVault)).toEqual(await semanticSnapshot(sourceVault));
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @studio/storage test -- export.test.ts import.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement deterministic manifest and checksum validation**

Include export version, schema versions, generated time, file list, SHA-256 hashes, and excluded cache list. Reject zip-slip paths and executable active content. Import preview classifies create, overwrite, conflict, and skip.

- [ ] **Step 4: Implement backup and restore UI**

Desktop supports user-chosen ZIP destination; browser downloads locally. Restore never mutates the target until validation and preview confirmation complete. Automatically back up before migrations.

- [ ] **Step 5: Destructive recovery drill**

Run: `pnpm test:e2e -- portability.spec.ts && pnpm verify:restore -- fixtures/vaults/anna-sample`  
Expected: PASS after deleting the test vault and index, restoring only the ZIP, and rebuilding all views.

- [ ] **Step 6: Commit**

```bash
git add packages/storage apps/studio/src/features/settings tests/e2e/portability.spec.ts
git commit -m "feat: add portable vault backups"
```

### Task 18: Security, privacy, and diagnostics hardening

**Files:**
- Create: `docs/security/threat-model.md`.
- Create: `packages/application/src/diagnostics.ts`.
- Modify: Tauri capabilities, CSP, Markdown renderer, logging.
- Test: security regression suite.

**Interfaces:**
- Consumes: app errors and operation metadata.
- Produces: content-redacted local diagnostics export; hardened import/render/write surfaces.

- [ ] **Step 1: Write failing security tests**

```ts
it('removes scripts and event handlers from rendered markdown', () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script>');
  expect(html).not.toMatch(/onerror|script/i);
});

it('never includes note bodies in diagnostics', () => {
  const report = buildDiagnostics({ operation: 'save', noteBody: 'private words' });
  expect(JSON.stringify(report)).not.toContain('private words');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- security`  
Expected: FAIL.

- [ ] **Step 3: Implement mitigations**

Disable raw HTML by default, sanitize allowed Markdown output, enforce CSP, validate URLs, scope Tauri capabilities, prevent path traversal/zip slip, keep secrets in platform secure storage, and redact titles/body/absolute external paths from logs.

- [ ] **Step 4: Document threat boundaries**

Cover lost/shared device, malicious import, cloud/AI exposure, filesystem escape, XSS, backup leakage, Git secrets, and dependency compromise. List mitigations and residual risks without claiming perfect security.

- [ ] **Step 5: Verify**

Run: `pnpm test:security && cargo audit --manifest-path apps/studio/src-tauri/Cargo.toml && pnpm audit --prod`  
Expected: security suite PASS; no unresolved high/critical runtime advisories.

- [ ] **Step 6: Commit**

```bash
git add docs/security packages/application apps/studio
git commit -m "security: harden private studio data"
```

### Task 19: Accessibility, performance, offline, and packaging release gate

**Files:**
- Modify: all visible components as findings require.
- Create: `docs/testing/release-checklist.md`.
- Create: `.github/workflows/release-candidate.yml`.
- Test: complete E2E, visual, axe, performance, and desktop packaging flows.

**Interfaces:**
- Consumes: completed MVP.
- Produces: signed/notarization-ready macOS artifact; installable PWA; release evidence bundle.

- [ ] **Step 1: Add failing budgets and end-to-end release story**

```ts
test('complete local-first story survives index destruction', async ({ page }) => {
  await createSampleStudio(page);
  await captureAndPlaceVision(page);
  await beginSeason(page);
  await addCelebration(page);
  await destroyDisposableIndex();
  await page.reload();
  await expect(page.getByText('Rebuilding your Studio')).toBeVisible();
  await expect(page.getByText('A calm home')).toBeVisible();
});
```

- [ ] **Step 2: Run full suite and record failures**

Run: `pnpm verify:release`  
Expected initially: FAIL until all release budgets and manual gates are satisfied.

- [ ] **Step 3: Fix accessibility and responsive defects**

Complete keyboard-only and VoiceOver journeys for onboarding, capture, edit, drag alternative, search, season, archive, export, and conflict resolution. Verify the final addendum's full component/state matrix at 200% zoom, reduced motion, increased/forced contrast, 44px touch targets, text scaling, missing images, long international strings, and full-screen mobile sheets.

- [ ] **Step 4: Meet performance and offline budgets**

Warm shell interactive under 1.5s on reference Mac; note open under 100ms after warm-up; room transitions under 150ms perceived; search under 200ms; durable save under 1s. Throttle CPU/network in Playwright and confirm local functions remain available offline.

- [ ] **Step 5: Build and visually inspect real artifacts**

Run: `pnpm tauri build && pnpm build:pwa && pnpm test:e2e && pnpm test:visual`  
Expected: PASS. Install the macOS artifact and PWA fresh; inspect every screen with realistic fixtures rather than trusting snapshots alone. Run screenshot and contrast coverage across all seven themes at 1440×1000, 1024×768, and 390×844, waiting for self-hosted fonts before capture. Confirm no production route or bundle contains the design prototype runtime.

- [ ] **Step 6: Update documentation and development log**

Record architecture decisions, known limitations, storage behavior, backup/restore instructions, privacy behavior, design deviations, and exact release verification results.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "release: prepare studio mvp"
```

---

## 6. Phase 1.1 follow-on specifications

These are separate implementation plans after MVP acceptance.

### 6.1 Identity Studio

Add projections and views for currently becoming, already true, becoming, values/principles, desired feelings, beliefs in practice, embodiment cues, and dated identity shifts. Evidence links point to Celebration/Reflection notes. No new durable entity is required; use existing notes, card types, links, and room projections.

Acceptance gate: identity statements can be revised with history, linked to evidence, and displayed without treating aspirational identity as a compulsory emotional performance.

### 6.2 Wisdom Garden

Add editable themes, source fields, thematic reading view, multi-select synthesis creation, wiki links, and “Make it mine” prompts. Preserve sources while browsing primarily by ideas. Do not add collection counts or course-completion metrics.

Acceptance gate: selected source notes can create one synthesis note with backlinks; all source attribution survives export.

### 6.3 Desktop/mobile continuity

Design a separate encrypted sync protocol only after local data integrity is proven. Required elements: per-file stable IDs and hashes, encrypted object manifest, device keys, common-ancestor revisions, three-way merge, attachment chunking, offline queue, conflict UI, deletion tombstones, key recovery decision, and independent security review.

Do not use “last write wins” for concurrent Markdown edits.

### 6.4 Gentle AI

Build behind an `AiPort` with providers disabled by default. Enforce `privacy.ai_access` locally before payload construction. First functions: summarize selected notes, suggest links, draft seasonal letter, and answer scoped retrieval with citations. Every write is a diff preview requiring confirmation.

AI acceptance gate: exact scope is previewed; `never` notes cannot enter payloads even through backlinks; responses cite stable note IDs; the product remains complete with the provider removed.

### 6.5 Inner Studio

Create a separate plan and safety review for places, figures, dreams, symbols, sessions, scripts, and optional audio. Store observation separately from interpretation. Never provide authoritative dream meanings or supernatural claims. Include visible exit, grounding/aftercare, transcript, reduced-sensory mode, and distress guidance.

---

## 7. Final design integration contract

The final design is accepted and transcribed into [The Studio Final Visual Design Addendum](../../design/The-Studio-Final-Visual-Design-Addendum.md). Do not rewrite architecture around static mockup geometry. Implement it through this order:

1. Treat the addendum's screen, component, state, and breakpoint inventory as the visual acceptance contract.
2. Implement its tokens through semantic CSS custom properties, not copied inline prototype values.
3. Map each design component to existing semantic UI components and BEM classes.
4. Identify missing states: empty, partial, dense, hover, focus, selected, editing, dragging, saving, offline, conflict, error, archived, reduced motion, high contrast.
5. Resolve any accessibility conflict in favor of WCAG and document the visual adaptation.
6. Implement tokens and primitives in Storybook first.
7. Update room compositions.
8. Run Playwright visual comparisons at all supported widths.
9. Inspect the running app directly on Mac and iPhone-sized Safari/WebKit.
10. Record accepted deviations and update the PRD/design bible and development log.

The design addendum is authoritative for visual intent. The PRD remains authoritative for product behavior, MVP scope, data ownership, privacy, safety, and emotional boundaries. The prototype runtime is reference-only and must not ship.

---

## 8. Test data specification

The `anna-sample` fixture must contain at least:

- 6 semantic types.
- 10 life areas.
- All 5 Landscape anchors.
- 1 active and 2 archived seasons.
- 3 priorities plus a Not now shelf.
- 30 reflections and 15 celebrations across 18 months.
- 12 Uncharted notes.
- 8 Wisdom source notes and 2 synthesis notes.
- 4 Identity cards with evidence links.
- Wiki links, standard Markdown links, images, PDF, missing attachment, broken link.
- Unknown frontmatter key.
- Sensitive note with `ai_access: never`.
- Unicode, apostrophes, ampersands, long title, untitled fragment.

The large fixture generator creates 10,000 deterministic notes and never enters version control as generated output. Tests use a fixed seed.

---

## 9. Definition of done for every task

A task is not complete until:

- The failing test was observed before implementation.
- Unit/integration tests pass.
- Typecheck and lint pass.
- User-visible changes have Playwright screenshots at relevant breakpoints.
- Keyboard behavior and accessible names are verified.
- No content leaks into logs or test snapshots.
- Documentation and `development-log.md` are updated when behavior or architecture changed.
- The commit contains only the focused task and uses a one-line conventional message.
- There are no placeholder comments, skipped tests, unexplained snapshots, or ignored TypeScript errors.

---

## 10. Self-review against the design bible

### Covered in the executable MVP

- Vision, philosophy, calm/no-urgency constraints: Global Constraints, Tasks 2, 9, 12–15.
- Final visual language and handoff: Task 2, Task 9, Task 12, Section 7, and the visual addendum.
- Information architecture: Tasks 8–9.
- Foyer: Task 12.
- Life Landscape: Task 13.
- Current Season: Task 14.
- Uncharted: Task 15.
- Reflection Garden and Celebration: Task 15.
- Interaction/card model: Tasks 2, 8, 10, 13.
- Markdown/frontmatter: Task 3.
- Storage/file structure: Tasks 4–6.
- Search/backlinks: Tasks 7 and 16.
- Data model: Tasks 3, 7, 8.
- Sync strategy boundary: Section 6.3.
- Privacy/security: Task 18.
- Import/export/restore: Task 17.
- Accessibility/visual/performance QA: Tasks 2, 9, 12–16, 19.
- Engineering architecture: Sections 2–5.

### Deliberately scheduled after MVP

- Full Identity Studio: Section 6.1.
- Full Wisdom Garden: Section 6.2.
- Seamless sync: Section 6.3.
- AI pattern recognition: Section 6.4.
- Inner Studio: Section 6.5.

These are not omissions: each is isolated so the local-first core produces working, testable software before higher-risk subsystems are introduced.

---

## 11. Recommended execution method

Execute Tasks 1–19 sequentially using `superpowers:subagent-driven-development` with a fresh implementation worker per task and two review gates:

1. **Specification review:** confirm the task’s interfaces and acceptance criteria were met without scope expansion.
2. **Quality review:** inspect code structure, tests, security, accessibility, and visible browser output.

Do not parallelize tasks that touch the same package or depend on unfinished contracts. Safe parallel work is limited to documentation or independent visual-state fixtures after the corresponding interfaces are merged.

---

*This plan is the implementation companion to “The Studio — Product Requirements & Design Bible,” version 1.0. Update both documents when a product or architecture decision changes.*
