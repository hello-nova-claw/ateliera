# Ateliera Native Parity — Reconciled Build Plan (P1–P9)

Status: authoritative (2026-08-28). This document reconciles the nine per-phase
specs (`P1-spec.md` … `P9-spec.md`) and the roadmap
(`2026-08-28-ateliera-native-parity.md`). Its single purpose is to guarantee the
phases **do not contradict or oppose each other**: one note-editing API, one index,
one frontmatter vocabulary, one theme mechanism, one discipline for the files many
phases touch. Where a spec's local text conflicts with a shared contract below,
**this document wins** — update the spec, don't fork the contract.

Grounding facts (verified against source, not just specs):
- `StudioNote` already carries every field P1–P9 need (`landscapeAnchor`, `source`,
  `sourceNoteIds`, `resurface*`, `display`, `privacy`, `extraFrontmatter`), and
  serializes byte-identically (`StudioNote.swift`).
- `NoteParser.recognizedKeys` already reads `landscape_anchor`, `source_notes`,
  `resurface_*`. It does **not** promote `decision_horizon` or `related_notes` —
  those currently land in `extraFrontmatter` (the P5/P7 shims are real).
- `NoteSummary` today has 6 fields only: `id, title, snippet, meaning, timestamp,
  rooms`. Every "extend NoteSummary" instruction below is additive to this.
- `VaultStore.vault` is `private`. `capture(title:body:room:)` and
  `saveEdit(_:title:body:)` are the only write entry points. `search()` delegates
  to `NoteSearch`. `Room.all` has 3 rooms.

---

## 1. Build order — serial spine vs safe overlap

### The serial spine (each unblocks the next; do in order)

```
P1  →  P4-core  →  P5  →  P6  →  P7  →  P8-export
(note depth)  (index/graph)  (landscape/identity)  (season/uncharted/wisdom/reflection)  (classified capture+media)  (zip)
```

- **P1 is first and blocking.** It owns the note-editing API, the `NoteSummary`
  extension, `WikilinkParser`, and promotes `decision_horizon`/`related_notes` to
  first-class model fields. P4, P5, P6, P7, P9 all consume P1 contracts. Nothing
  ships those contracts before P1.
- **P4's pure core** (LinkExtractor → LinkGraph → SearchIndex) is next on the spine
  because P5 (evidence linking), P6 (backlink evidence), and P8 (RepairQueue) reuse
  the link graph. P4's *rich result chips + repair metadata form* need P1, but the
  pure core does not — build the core immediately after P1.
- **P5 before P6 before P7**: P7's classified-capture UI pre-selects destinations
  from P5/P6 room context, so P7's *UI* is last; its *pure logic* is not (see below).
- **P8-export** sits late (the vault is already plain files; low urgency), but
  **P8-conflict-merge is pulled early** (see overlap).

### Safe parallel / pull-early tracks

| Track | May run | Constraint |
|---|---|---|
| **P2 (themes)** | Any time after P1 lands the `NoteSummary` extension merge. Recommended pulled early as a visible win. | Must land the `StudioTheme` environment mechanism (§3.4) that every later view reads. Do this **once**, before P5 builds many views, or those views will hardcode `Studio.*` and need rework. |
| **P3 (The Gift)** | In parallel with P4-core (both are post-P1, independent of each other). | P3 does **not** depend on P1's *editor UI*, but MUST consume P1's extended `NoteSummary` (`resurface*` fields) rather than adding its own — see conflict C1. |
| **P8 conflict-merge + draft-recovery** | Immediately after P1 (no Rust FFI needed). | Pull early: it stops silent edit loss. Independent of the ZIP/export work. |
| **P8 Rust FFI (`write_batch_atomic`/`remove`/`move_file`/`read_binary`) + P7 Rust FFI (`write_binary`/`read_binary`)** | Batch **all Rust core additions into one coordinated change** (see §3.5) before either P7 media or P8 export/revisions. | `read_binary` is requested by BOTH P7 and P8 — add it once. |
| **P9 room/section/rhythm toggles** | Skeleton (visibility resolvers + Settings panel) any time after P2; the **rich Foyer cards** must wait for P5 (identity) + P6 (season) + P1 projection. | The Settings *container* is shared with P2 (theme switcher) and P8 (Data & Backups) and P3 (gift toggle) — build one Settings root (§3.3), everyone adds a section. |

**Must be serial (no overlap):** P1→P4-core→P5→P6→P7-UI. **Freely parallel after
P1+P2-mechanism:** P3, P4-core, P8-conflict-merge, P9-skeleton.

---

## 2. Shared contracts (every phase MUST align to these)

### 2.1 Note-metadata editing API (owned by P1)

P1 defines the canonical full-note write path. **No phase invents its own metadata
writer.** The contract:

```swift
// VaultStore — the ONE full-note save. saveEdit(_:title:body:) becomes a thin
// wrapper over this. P3's saveResurfaceSchedule, P5's move(), P6's invite/connect,
// P7's classified capture-edit all route through it.
@discardableResult
func saveEdit(_ editable: EditableNote, updatedNote: StudioNote) -> Bool
// Preconditions: writes via vault.writeText(expectedHash: editable.baseHash,
// createNew: false); bumps updatedNote.updated; re-serializes the full model so
// unknown frontmatter survives; on VaultError.Conflict does NOT overwrite —
// surfaces the conflict (P8 ConflictMergeView consumes this).
```

Resolution of the API-shape drift across specs (conflict C2):
- P3 proposes `saveResurfaceSchedule(path:baseHash:note:due:intervalDays:)`,
  P6 proposes `saveNoteMetadata(path:hash:updates:)`, P5 calls `vault.writeText`
  directly, P8 wants a package-internal `vault` accessor.
- **Canonical:** all of these are implemented as **thin wrappers over
  `saveEdit(_:updatedNote:)`** — parse/mutate-struct/re-serialize. `saveResurfaceSchedule`
  and any `saveNoteMetadata` helper exist only as convenience shims that build the
  mutated `StudioNote` and call `saveEdit(_:updatedNote:)`. This keeps one
  atomic/expected-hash/reload rail and one conflict surface.

### 2.2 The index / link-graph interface (owned by P4)

One in-memory, rebuilt-on-`reload()`, disposable index. P3's resurface pool, P5/P6
evidence, and P8 RepairQueue consume it; none builds a second index.

```swift
// Built in VaultStore.reload() AFTER parsing notes. Disposable; no persistence.
enum LinkKind: String { case wiki, path, id }
struct ParsedLink: Equatable { let kind: LinkKind; let target, label: String }
struct EditableLink: Equatable { let index: Int; let kind: LinkKind
  let target, label: String; let start, end: Int }   // UTF-16 offsets
enum LinkState: Equatable { case resolved(String); case broken; case ambiguous([String]) }

final class SearchIndex {                 // pure, rebuildable
  func rebuild(_ notes: [IndexedNote])
  func search(_ q: String, filters: SearchFilters) -> [SearchHit]
  func facets(_ q: String, filters: SearchFilters) -> SearchFacets
  func backlinks(_ id: String) -> [Backlink]
  func forwardLinks(_ id: String) -> [ForwardLink]
}
```

Interim rule (before P4 lands): P3 builds its resurface pool by scanning
`VaultStore.notes` (the extended `NoteSummary`) directly, as its spec says — this is
**allowed** and does not fork the index (the pool is a filter, not an index). P6's
naive O(n) evidence scan is likewise allowed pre-P4 and is later swapped for
`SearchIndex.backlinks` **without an API change**. Golden-parity for P4 binds to the
pure TS algorithms (`links.ts`/`link-edit.ts`/`markdownToPlainText`/`sqlite-index.ts`/
`search-service.ts`), asserting membership+ordering+offsets, NOT bm25 scores.

### 2.3 Frontmatter / card-type / semantic-type vocabulary (cite @studio/domain)

**One vocabulary, hard-coded from `@studio/domain`, asserted by golden tests.** These
enums appear in P1, P3, P5, P6, P7 — define each raw-value list ONCE and reuse.

- `SemanticType` (`packages/domain/src/semantic-type.ts`):
  `foundations, vision, growth, reflection, celebration, uncharted`.
- `NoteStatus` (`packages/domain/src/note.ts`):
  `draft, active, resting, archived, trashed`.
- `Sensitivity`: `private, sensitive`. `AiAccess`: `never, ask, selected, scoped`.
- `LandscapeAnchor` (`packages/domain/src/landscape.ts`):
  `vision, identity-values-feelings, decisions, practices, structure-strategy`.
- `DecisionHorizon` (`landscape.ts`): raw values **`30d, 60d, 90d, someday`**
  (P5 spec's `d30` case names are fine; the **rawValue strings must be `"30d"…`**).
- `IdentitySection` (`packages/domain/src/identity.ts`):
  `already-true, practicing-now, values-principles, desired-feelings,
  beliefs-practice, embodiment-cues, identity-shifts`.
- `WisdomKind` (`packages/domain/src/wisdom.ts`):
  `insight, quote, principle, practice, question, resource, synthesis`.
- **Anchor→semanticType** and **wisdomKind→semanticType** and
  **identitySection→cardType** and **identitySectionForCardType** mapping tables:
  the versions in P5 §3, P6 §3, and P7 §3 must be **identical**. P7's
  `CaptureDestination.swift` is the **single authority** for anchor→semanticType,
  wisdomKind→semanticType, section→cardType; P5's `LandscapeTypes`/`IdentityTypes`
  and P6's domain files import/duplicate from a shared `NoteMetadata`-level source
  rather than re-deriving. See conflict C3.

Ownership: **P1 creates `Note/NoteMetadata.swift`** holding `SemanticType`,
`NoteStatus`, `Sensitivity`, `AiAccess`, `LandscapeAnchor`, `defaultLifeAreas`,
`knownCardTypes`. P5/P6/P7 **extend** that file (or add sibling files that import
those enums); they do **not** redeclare `LandscapeAnchor`, `SemanticType`, etc.
(Swift will hard-error on redeclaration — this is a compile-time guardrail, use it.)

The **`life_areas`** default set (10, `packages/domain/src/life-area.ts`), the
**config file byte-format** (`.studio/config/landscape-areas.json` v1 key order
`hidden,id,order,title`; `.studio/config/wisdom-themes.json` v1), and the
**view-state file format** (`.studio/views/<enc-key>.json` v1) are shared byte
contracts — golden-captured once (§5).

### 2.4 Theme mechanism (owned by P2)

`StudioTheme` palette injected via SwiftUI `@Environment(\.studioTheme)`, backed by a
`ThemeStore` (`@Observable`, UserDefaults key `ateliera.theme`). **Every view built
in P3–P9 reads colours from the environment `StudioTheme`, never from a static
`Studio.*` global.** P2 keeps a backward-compatible `Studio` default so pre-P2 code
compiles, but new views (P3 gift, P5 rooms, P6 rooms, P7 sheets, P9 foyer/settings)
use the environment accessor from day one. Theme is client-side only (UserDefaults),
never vault frontmatter.

### 2.5 `resurface_*` fields (owned by P3, consumed by P4/P8)

`resurface_kind ∈ {evidence,reframe,wish,dream}`, `resurface_due` ISO `YYYY-MM-DD`,
`resurface_interval_days` positive int. Pool inclusion needs all three plus
`rooms ∩ {reflection-garden, uncharted}`. Already parsed by `NoteParser`. P4's index
carries these through untouched; P1's editor exposes `resurface_kind` as one of the
`knownCardTypes`-adjacent fields but does NOT run the SM-2 loop (that's P3). Grading
writes only `resurface_due`+`resurface_interval_days` (kind is preserved), via the
2.1 rail.

### 2.6 Rooms registry (owned incrementally; final set fixed now)

`Room.all` grows to the full set below. To avoid three phases each rewriting it,
**fix the final registry now** and have each phase add only its rows:

```
foyer (home, not in Room.all), reflection-garden*, inbox*, wisdom-garden*   (exist)
life-landscape, identity-studio           (P5 adds)
current-season, uncharted                 (P6 adds)
```
P7 references `life-landscape`/`identity-studio`/`uncharted` — these come from P5/P6,
so P7 adds **no** rooms (correct its spec's "Rooms.swift add all" instruction: by the
time P7 lands, P5+P6 already added them). `Room` gains `kind` (P9) and
`defaultDestination: CaptureDestination` (P7) as **additive optional fields**.

---

## 3. Shared files — ownership and edit discipline

Six files are edited by many phases. Rule: **additive extension points, declared
owner per region, never a rewrite.**

### 3.1 `VaultStore.swift` (touched by P1,P3,P4,P5,P6,P7,P8,P9)

Owner of the write rail: **P1**. Discipline:
- P1 adds `saveEdit(_:updatedNote:)` and extends `NoteSummary` (see 3.6) + extends
  the `parse(path:text:)` reader for the new summary fields. **This is the first
  merge; everything else rebases on it.**
- P1 also adds a **`parsedNotes: [StudioNote]` cache** (`@ObservationIgnored`,
  populated in `reload()` beside `notes`). P5, P6, P9 all require full parsed notes
  for projection and MUST reuse this cache, not re-scan the vault (conflict C4).
- P1/P5/P8 expose vault access via **one** mechanism: change `private var vault` to
  package-internal and add `func withVault<T>(_ body: (Vault) throws -> T) throws -> T`.
  P5's "pass Vault as a parameter" and P8's "`@_spi` accessor" both collapse into
  this single accessor. Room stores (Landscape/Identity/Season/WisdomTheme) receive
  the `VaultStore` and call `withVault`.
- P4 rewrites `reload()`'s tail to build `[IndexedNote]` + `index.rebuild`, and
  replaces `search(_:)` to delegate to `SearchIndex`. P3's `resurfacePool()` and the
  P1 summary extension must be merged **before** P4 touches `reload()`; P4 rebases.
- P7 replaces `capture(title:body:room:)` with `capture(title:body:destination:)`
  and updates all callers atomically. Do this **once**, at P7 — earlier phases keep
  the `room:` form. (P3's "keep a copy" and P5/P6 captures use the `room:` form until
  P7, then migrate.)
- P8 adds `diagnostics`, conflict-state plumbing, and the batch/binary FFI callers.

### 3.2 `RootView.swift` + `ActiveSheet` (touched by every phase)

Owner: shared, but `ActiveSheet` is the contention point. Discipline:
- `ActiveSheet` is an enum every phase extends. **Add cases; never renumber/rename
  existing ones.** P1 reuses `.edit` for wikilink navigation (no new case). P2 adds
  theme via a Settings sheet, not an `ActiveSheet` case. P7 changes
  `.capture(room: String?)` → `.capture(CaptureDestination)` — this is the one
  breaking change; schedule it with the P7 `capture()` signature change and fix all
  producers in the same commit.
- Foyer body composition order (P3 gift under almanac; P9 rich sections) is owned by
  **P9's `FoyerRichView`**, which P3 slots into. Until P9, P3 renders the gift inline
  under `AlmanacView`; P9 later moves it into `FoyerRichView` without changing
  `GiftStore`.
- Rooms list rendering becomes `Room.all.filter { isRoomVisible($0.id) }` at **P9**;
  earlier phases render all rooms. P5/P6 add `NavigationLink` destinations; P9 wraps
  them in the visibility filter.

### 3.3 Settings container (P2, P3, P8, P9)

There is **one** Settings root. P9 owns `Settings/SettingsView.swift` (vertical
sections). P2 contributes the theme section, P8 the "Data & Backups" row, P3 the gift
toggle, P9 the rooms/foyer/rhythm toggles. Whoever lands first creates the shell with
a single section; the rest add sections. Do **not** build two separate settings
sheets (P2's `ThemeSettingsView` becomes a section/row inside the shared root, not a
competing top-level sheet).

### 3.4 `Theme/Theme.swift` (P2 owns; everyone reads)

P2 converts `Studio` from static globals to the `StudioTheme` env value + keeps a
default. This is a one-time mechanical migration touching many call sites — do it as
its own commit **before** P5 adds a dozen views. See §2.4.

### 3.5 `apple/AtelieraVaultCore/src/lib.rs` (P7, P8)

**Batch all Rust additions into one coordinated FFI change**, regenerate bindings
once (`./AtelieraVaultCore/build.sh`), then build the Swift on top:
`write_binary`, `read_binary` (P7 + P8 both need `read_binary` — add once),
`remove`, `move_file`, `write_batch_atomic` (P8). Same `validate_path` guard, same
write-lock, same revision bump. Land this FFI change before P7-media and P8-export.

### 3.6 The note model + `NoteSummary` (P1 owns; P3/P4/P5 consume)

`StudioNote` needs **no structural change** (all fields exist). P1's additions:
- `Note/NoteMetadata.swift` — the enums/registries of §2.3.
- Promote `decision_horizon` → `StudioNote.decisionHorizon: String?` and
  `related_notes` → `relatedNoteIds: [String]?`, adding both to
  `NoteParser.recognizedKeys` (they currently fall into `extraFrontmatter`). This
  **removes** the P5 `// P1-shim:` reads and the P7 shims — P5/P6 read the first-class
  fields. If P5 lands before P1 (not recommended), its shims stay until P1 strips them.
- **`NoteSummary` canonical shape** (extend the existing 6 fields; every phase agrees
  on this one struct):

```swift
struct NoteSummary: Identifiable {
  let id, title, snippet, meaning, timestamp: String       // existing
  let rooms: [String]                                       // existing
  let status: String                                        // P1
  let semanticType: String                                  // P1
  let tags: [String]                                        // P1 (P4 facet, P6 themes)
  let lifeAreas: [String]                                   // P1 (P5 filter)
  let landscapeAnchor: String?                              // P1 (P5 grid)
  let featured: Bool                                        // P1 (P9 foyer)
  let resurfaceKind: String?                                // P3
  let resurfaceDue: String?                                 // P3
  let resurfaceIntervalDays: Int?                           // P3
}
```
  P3 adds only the three `resurface*` lines; it does not fork a parallel summary.
  Keep `parse(path:text:)` and the full `NoteParser` path updated together (both are
  edited in P1/P3).

---

## 4. Contradictions found between specs, and their resolutions

- **C1 — `NoteSummary` extended twice.** P1 §2b and P3 "MODIFY VaultStore" both
  extend `NoteSummary`. **Resolution:** one struct (§3.6). P1 lands the six new
  fields; P3 lands only `resurface*`. P3 rebases on P1's merge.

- **C2 — three different metadata-write APIs.** P1 `saveEdit(_:updatedNote:)`,
  P3 `saveResurfaceSchedule(...)`, P6 `saveNoteMetadata(path:hash:updates:)`,
  P5 direct `vault.writeText`. **Resolution:** §2.1 — one rail; the others are thin
  convenience wrappers that build a mutated `StudioNote` and call
  `saveEdit(_:updatedNote:)`. Only one conflict surface (feeds P8 ConflictMergeView).

- **C3 — the domain vocabulary is redeclared in P1, P5, P6, P7.** `LandscapeAnchor`,
  `IdentitySection`, `WisdomKind`, `SemanticType`, and the anchor/kind/section→type
  maps appear in multiple specs. **Resolution:** §2.3 — P1 owns `NoteMetadata.swift`
  with the enums; P7's `CaptureDestination.swift` owns the classification maps
  (anchor→semanticType, kind→semanticType, section→cardType). P5/P6 import, never
  redeclare (Swift redeclaration = compile error, our guardrail). One golden test set
  covers every mapping; P5/P6/P7 assert against the same captured tables.

- **C4 — projection data source.** P5 wants `VaultStore.parsedNotes`; P6 wants "a
  cache of parsed notes keyed by path+hash"; P9 wants `projectFoyer()`. **Resolution:**
  §3.1 — P1 adds ONE `parsedNotes: [StudioNote]` cache in `reload()`. P5/P6/P9 all
  read it. `projectFoyer()`/landscape/identity/season projectors are pure functions
  over `parsedNotes`.

- **C5 — `capture()` signature churn.** P3/P5/P6 call `capture(...room:)`; P7 changes
  it to `capture(...destination:)`. **Resolution:** §3.1 — keep `room:` through P6;
  P7 migrates all callers in one commit. P3's "keep a copy" writes
  `rooms:["reflection-garden"]`/`["uncharted"]`, which survives the migration
  unchanged (the frontmatter, not the folder, is the interop contract).

- **C6 — "Rooms.swift: add all rooms" claimed by P5, P6, and P7.** **Resolution:**
  §2.6 — P5 adds `life-landscape`,`identity-studio`; P6 adds `current-season`,
  `uncharted`; P7 adds none (references existing). Final registry fixed now; `kind`
  (P9) and `defaultDestination` (P7) are additive fields.

- **C7 — Settings surface built twice.** P2 `ThemeSettingsView` (own sheet) vs P9
  `SettingsView` (root). **Resolution:** §3.3 — one Settings root; P2's theme picker
  is a section within it.

- **C8 — Foyer composition ownership.** P3 renders the gift inline; P9 owns
  `FoyerRichView`. **Resolution:** §3.2 — P3 renders inline until P9; P9 hosts the
  gift inside `FoyerRichView` without touching `GiftStore`.

- **C9 — `read_binary` added by both P7 and P8.** **Resolution:** §3.5 — one Rust
  FFI change adds it once.

- **C10 — decision_horizon/related_notes: extraFrontmatter vs first-class.** P5 reads
  them from `extraFrontmatter` (shim); P7/P9 assume first-class. **Resolution:** §3.6
  — P1 promotes both to first-class model fields + `recognizedKeys`; shims removed.

- **C11 — P4 vs P3 index.** P4 builds the index; P3 scans `notes`. **Resolution:**
  §2.2 — P3's pool is a filter over the extended summary (allowed, not a second
  index); it never persists or duplicates P4's `SearchIndex`.

---

## 5. Front-loadable golden-parity capture tasks

These are pure shared formats/algorithms; capture ground truth **now** (throwaway
vitests over `@studio/*`, `console.log(JSON.stringify(...))`, paste into Swift tests,
delete the vitest). Doing these before coding removes the highest-risk unknowns and
lets phases proceed without re-deriving.

1. **Domain vocab tables (P1/P5/P6/P7)** — from `@studio/domain`: `semanticType`
   raw list, `noteStatus` raw list, `LandscapeAnchor` raw list + `DecisionHorizon`
   raw list, `IdentitySection` raw list, `WisdomKind` raw list,
   `identitySectionForCardType` full table, `semanticTypeForLandscapeAnchor`,
   `semanticTypeForWisdomKind`, `identitySectionDefinition(...).cardType`,
   `defaultLifeAreas` (10, ordered), `defaultWisdomThemes` (13, id+title).
2. **Wikilink / links (P1/P4)** — reuse existing `packages/content/src/links.test.ts`
   as ground truth; add the `__p4golden__.test.ts` adversarial corpus (8–12 notes)
   emitting `extractLinks`, `editableMarkdownLinks` (offsets), `markdownToPlainText`,
   and index `search`/`facets`/`backlinks`/`forwardLinks` outputs.
3. **SM-2 + dates (P3)** — the 14-row `sm2Interval` table (incl. `2*2.5=5.0`,
   `15*2.5=37.5→38` half-boundaries), `ease(forQuality:)`, `addDaysISO` trio
   (`2026-06-21+18`, `2026-02-28+1`, `2026-12-31+6`), and the `select` ranking
   scenarios from `resurfacing.test.ts`.
4. **Config/view-state bytes (P5/P6)** — `landscape-areas.json` v1 exact bytes
   (key order `hidden,id,order,title`, trailing `\n`), `wisdom-themes.json` v1 bytes,
   view-state file path-encoding + bytes (`landscape:family:decisions` →
   `.studio/views/landscape%3Afamily%3Adecisions.json`), `safeAreaId` slug cases.
5. **Season markdown (P6)** — `markdownForSeason(state)` and
   `seasonLetterBody(state,reflection)` byte-golden; `seasonProgress` per frontier;
   `season_workflow` nested-map (incl. decisions sub-array) round-trip.
6. **Capture folder algorithm (P7)** — `portableLifeAreaFolder` for ≥6 edge cases
   (`family`, `Work & Money`, `CON`, ``, 70-char, control char, Unicode) — highest
   single-correctness risk; capture before wiring into paths.
7. **Portability (P8)** — SHA-256 of `[0,1,255]`, `createZip32` hex of one file,
   manifest JSON bytes (key order + trailing `\n`), `portablePathKey` of a Unicode
   string, `exportDisposition` classifications.
8. **Preferences (P9)** — `NEW_STUDIO_PREFERENCES` exact shape and the
   `isRoomVisible`/`isFoyerSectionVisible` truth tables (esp. the almanac-hides-when-
   all-rhythm-layers-off gate).

Tasks 1, 2, 3 are on the critical path (P1→P3/P4) — capture them first.

---

## 6. Executive summary

Build order is a serial spine — **P1 (note depth) → P4 pure index/graph → P5
(Landscape+Identity) → P6 (Season/Uncharted/Wisdom/Reflection) → P7 (classified
capture+media) → P8 export** — with four safe parallel tracks: **P2 themes**,
**P3 The Gift**, **P8 conflict-merge/draft-recovery**, and the **P9 Settings/visibility
skeleton**, all unblocked once P1 and the P2 theme-environment mechanism land. P1 is
strictly first and blocking: it owns the single write API `saveEdit(_:updatedNote:)`,
the one extended `NoteSummary`, the `parsedNotes` cache, the `NoteMetadata.swift`
domain vocabulary, and the promotion of `decision_horizon`/`related_notes` to
first-class fields — killing the P5/P7 shims. Every "add its own writer / redeclare
the enums / fork a second summary or index / re-scan the vault" instruction scattered
across the specs collapses into a shared contract here (§2) and a documented
edit-discipline for the six hot files — `VaultStore.swift`, `RootView.swift`/`ActiveSheet`,
`Theme.swift`, `Rooms.swift`, the note model, and `lib.rs` (§3) — with additive
extension points and one owner per region. Eleven concrete cross-spec contradictions
(C1–C11) are each resolved in §4 (one metadata rail, one vocabulary source, one
Rust-FFI change adding `read_binary` once, one Settings root, `capture()` migrating to
`destination:` only at P7). Golden-parity stays the gate wherever a format or
algorithm is shared; the front-loadable capture tasks (§5) — domain vocab, links,
SM-2/dates first — should be captured up front so no phase re-derives ground truth.
The whole plan honors PRD precedence (data ownership → calm → integrity → simple
mechanics → aesthetics → breadth) and the non-negotiables (byte-identical Markdown,
unknown-key survival, atomic path-contained writes, no gamification, WCAG 2.2 AA with
keyboard alternatives for every drag interaction).
