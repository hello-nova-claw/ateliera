# P6 Implementation Spec — Season Authoring + Uncharted + Rich Wisdom/Reflection

Status: proposed (2026-08-28). Targets full web feature parity for four rooms.
Depends on P1 (full metadata editing), P2 (themes), P3 (resurfacing), P4 (search/links)
being in reasonable shape; specifically needs the note-metadata write path from P1 to
update arbitrary frontmatter fields on an existing note.

---

## 1. Scope — web features this phase must reach

### 1a. Current Season (wizard + active view + close)

Web sources:
- `apps/studio/src/features/season/SeasonPage.tsx` — 9-step wizard + active view + close dialog
- `apps/studio/src/features/season/use-season.ts` — state machine + service calls
- `apps/studio/src/features/season/field-guidance.ts` — copy for every field
- `packages/domain/src/season.ts` — `SeasonState`, `SeasonWizardStep`, all step-answer
  types, `updateSeasonDraft`, `activateSeasonState`, `closeSeasonState`
- `packages/application/src/season-service.ts` — `createSeasonNote`, `noteWithState`,
  `markdownForSeason`, `seasonLetterBody`, `seasonStateFromNote`, close transaction

Nine wizard steps in order: `name-dates` → `prior-reflection` → `feelings` →
`priorities` → `decisions-practices` → `supports-constraints` → `enough` →
`not-now` → `confirm`. Status lifecycle: `draft` → `active` → `archived`.
Close writes a reflection letter note (celebration / learning / identity / priority
dispositions: celebrate | archive | return-landscape | invite-forward | release).

### 1b. Uncharted

Web sources:
- `apps/studio/src/features/uncharted/UnchartedPage.tsx` — composer + near/beyond grid
- `apps/studio/src/features/uncharted/use-uncharted.ts` — capture + invite-to-season

Two horizons: `near` (default) and `beyond` (flagged by `beyond_gate: true` in
`extraFrontmatter`). "Invite into this season" links a possibility to the active season
by adding the season's `season_id` to the note's `seasons` frontmatter array.

### 1c. Wisdom Garden (rich)

Web sources:
- `apps/studio/src/features/wisdom/WisdomPage.tsx` — theme sidebar, card grid,
  add-idea form, synthesis composer, make-it-mine panel, theme editor
- `apps/studio/src/features/wisdom/use-wisdom.ts`
- `packages/domain/src/wisdom.ts` — `wisdomKinds`, `defaultWisdomThemes`
- `packages/application/src/wisdom-theme-repository.ts` — `.studio/config/wisdom-themes.json`
- `packages/application/src/projections.ts` — `projectWisdomGardenRoom`

Seven kinds: insight · quote · principle · practice · question · resource · synthesis.
Themes are stored as a `tags` array on each note; theme metadata in a JSON config file.
Synthesis creates a new note of kind `synthesis` with `source_notes` list and body
linking source notes as `studio://note/<id>` references.

### 1d. Reflection Garden (rich views)

Web sources:
- `apps/studio/src/features/reflection/ReflectionPage.tsx` — 4 view tabs, capture,
  EntryCard with evidence connections, ThenAndNow
- `apps/studio/src/features/reflection/use-reflection.ts` — capture + connect

Four views: Garden (all, chronological) · Reflection (filtered) · Celebration (filtered)
· Themes (tag-bucketed). Evidence connections: note links (`related_notes`), life-areas,
seasons. Cover images loaded via `resolveCover` on notes with `display.cover` set.

---

## 2. Native design — files to add and modify

### 2a. Data layer: SeasonStore.swift (NEW)

`apple/Ateliera/Season/SeasonStore.swift`

An `@Observable` class backed by `VaultStore`. Owns all season business logic so
`RootView`/`SeasonView` stay thin.

```swift
@Observable
final class SeasonStore {
  var record: SeasonRecord?       // nil = no active/draft season
  var wizardStep: SeasonWizardStep?
  var conflicts: [NoteSummary] = []
  var priorityCandidates: [SeasonPriorityCandidate] = []
  var state: StoreState = .ready  // .loading | .saving | .error(String)

  func load(vault: VaultStore) async
  func beginSeason(title: String, startsOn: String?, endsOn: String?,
                   vault: VaultStore) async throws
  func saveStep(_ step: SeasonWizardStep, answers: SeasonStepAnswers,
                priorityOverride: Bool, vault: VaultStore) async throws
  func activateSeason(vault: VaultStore) async throws
  func reviseSeason(_ answers: SeasonUpdateInput, vault: VaultStore) async throws
  func closeSeason(_ reflection: SeasonCloseReflection, vault: VaultStore) async throws
  func repairActive(keepNoteId: String, vault: VaultStore) async throws
  func createPriority(title: String, vault: VaultStore) async throws -> SeasonPriorityCandidate
}
```

`SeasonRecord` = parsed `StudioNote` + decoded `SeasonState` (mirrors TS `SeasonRecord`).
`SeasonStepAnswers` = a Swift enum-of-structs mirroring `SeasonStepAnswersMap`.
`SeasonUpdateInput` = struct mirroring TS `SeasonUpdateInput`.
`SeasonCloseReflection` = struct mirroring TS interface.

### 2b. Season domain types: Season/SeasonDomain.swift (NEW)

`apple/Ateliera/Season/SeasonDomain.swift`

Pure Swift value types, no I/O:

```swift
let seasonWizardSteps: [SeasonWizardStep] = [
  .nameDates, .priorReflection, .feelings, .priorities,
  .decisionsPractices, .supportsConstraints, .enough, .notNow, .confirm
]
enum SeasonWizardStep: String { ... }      // matches TS string literals
enum SeasonStatus: String { case draft, active, archived }
struct SeasonDecision { var id, text, horizon, kind: String }
struct SeasonState { ... }                  // all fields from TS SeasonState
```

Functions (ported from `packages/domain/src/season.ts`):
- `createSeasonDraft(id:now:) -> SeasonState`
- `updateSeasonDraft(season:step:answers:now:priorityOverride:) throws -> SeasonState`
- `activateSeasonState(_ season:now:) throws -> SeasonState`
- `closeSeasonState(_ season:now:) throws -> SeasonState`
- `seasonProgress(_ season:) -> Int`
- `validateDate(_ value:) -> Bool` (YYYY-MM-DD guard)

### 2c. Season I/O: Season/SeasonNoteMapper.swift (NEW)

`apple/Ateliera/Season/SeasonNoteMapper.swift`

Converts `StudioNote ↔ SeasonState` (porting `seasonStateFromNote` and `noteWithState`
from `packages/application/src/season-service.ts`).

Key frontmatter keys to read/write from `extraFrontmatter`:
- `season_id: String` — canonical season identity
- `date_start: String?`, `date_end: String?` — ISO date (YYYY-MM-DD)
- `priorities: [String]` — note IDs
- `season_workflow: map` containing: `statement`, `prior_reflection`,
  `skipped_prior_reflection`, `feelings`, `decisions`, `practices`, `supports`,
  `constraints`, `enough`, `not_now`, `mid_season_notes`, `completed_steps`

`markdownForSeason(_ state:) -> String` — mirrors TS `markdownForSeason`; produces:
```
This is a season of {statement}

## How I want it to feel

{feelings joined by " · "}

## Enough
...
```

`seasonLetterBody(state:reflection:) -> String` — mirrors TS `seasonLetterBody`.

Season note file conventions (from `season-service.ts:createSeasonNote`):
- `card_type: season`, `semantic_type: growth`, `rooms: [current-season, foyer]`,
  `tags: [season]`, folder `Current Season/`

### 2d. Wisdom types: Wisdom/WisdomDomain.swift (NEW)

```swift
let wisdomKinds: [WisdomKind] = ["insight","quote","principle","practice",
                                  "question","resource","synthesis"]
typealias WisdomKind = String
struct WisdomTheme: Codable { var id: String; var title: String;
                               var hidden: Bool; var order: Int }
let defaultWisdomThemes: [WisdomTheme] = [
  ("alignment","Alignment"), ("identity","Identity"), ... // 13 entries from domain/src/wisdom.ts
]
struct WisdomThemeConfig: Codable { var version: Int; var themes: [WisdomTheme] }
```

### 2e. Wisdom config store: Wisdom/WisdomThemeStore.swift (NEW)

`apple/Ateliera/Wisdom/WisdomThemeStore.swift`

Reads/writes `.studio/config/wisdom-themes.json` via `VaultStore`'s Rust core
(`vault.readText` / `vault.writeText`). Mirrors `wisdom-theme-repository.ts`:
- JSON shape: `{ "version": 1, "themes": [...] }`
- Max 40 themes, 1–100 char titles, slugged IDs `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- Optimistic concurrency: reads `hash`, writes with `expectedHash`
- Falls back to `defaultWisdomThemes` when file absent

### 2f. Wisdom projection: Wisdom/WisdomProjection.swift (NEW)

`WisdomCardProjection` (noteId, path, title, excerpt, cardType, hash, themes: [String],
source: NoteSource?). `projectWisdomGarden(notes:[ParsedNote]) -> WisdomProjection`
mirrors `projectWisdomGardenRoom` — filters `rooms` contains `wisdom-garden`,
groups by tags for theme counts.

### 2g. Uncharted projection: Uncharted/UnchartedProjection.swift (NEW)

`UnchartedCardProjection` (noteId, path, title, excerpt, hash, horizon, seasons: [String]).
`projectUncharted(notes:[ParsedNote]) -> [UnchartedCardProjection]` mirrors
`projectUnchartedRoom` — filters `rooms` contains `uncharted`, reads `beyond_gate`
from `extraFrontmatter`.

### 2h. Reflection projection: Reflection/ReflectionProjection.swift (NEW)

`ReflectionCardProjection` (noteId, path, title, excerpt, hash, created, semanticType,
lifeAreas, seasons, tags, linkedNoteIds, evidenceConnections, thenNoteId?,
coverReference?). `projectReflectionGarden(notes:lifeAreas:) -> ReflectionGardenProjection`
mirrors `projectReflectionGardenRoom` — chronological by `created`, reads
`related_notes` and `then_note_id` from `extraFrontmatter`.

Evidence connection resolution (`resolveReflectionEvidence`): checks note status
(available/archived/missing), life-area hidden flag, season active/archived/missing.

### 2i. Views: Season/SeasonView.swift (NEW)

`apple/Ateliera/Season/SeasonView.swift` — SwiftUI room for Season:

- Empty state → "Begin a season" button
- `wizardStep != nil` → `SeasonWizardView` (step-by-step form, progress indicator
  "Step N of 9", each step's fields, Continue / Begin this season buttons)
- Active season → title, date range, statement, feelings chips, priorities list,
  enough block, decisions ladder (30/60/90), practices+supports list,
  not-now collapsible, Revise/Close actions
- Close sheet: celebration/learning/identity text fields + per-priority disposition picker
- Conflict repair banner (multiple active seasons)

Step forms use `StudioField` (a label + description + control) — native equivalent of
the web's `GuidedField`. Field guidance copy is ported verbatim from
`features/season/field-guidance.ts` into a `SeasonFieldGuidance` struct in the file.

### 2j. Views: Uncharted/UnchartedView.swift (NEW)

`apple/Ateliera/Uncharted/UnchartedView.swift`

- Room heading: "leave room for possibility"
- Composer: multiline text field + "Leave this beyond the gate" toggle → Keep button
- Near possibilities section (grid of `PossibilityCard`)
- Beyond the gate section (grid, with threshold heading)
- `PossibilityCard`: title, excerpt, Open button, "Invite into this season" button (when
  active season exists and card not already linked), linked confirmation

### 2k. Views: Wisdom/WisdomView.swift (NEW)

`apple/Ateliera/Wisdom/WisdomView.swift`

- Left sidebar (iPad) or drawer/tab (iPhone): Contents list (All ideas + themes, Edit
  themes toggle)
- Theme editor sheet: rename, hidden toggle, add new theme, Save
- Main area header: active theme title + Add an idea toggle
- Add idea form: kind picker (7 options), title (optional), body, source details
  (creator / title / URL in a disclosure group)
- Card grid: `WisdomCardView` (kind label, title, excerpt, source link, Select checkbox)
- Selection panel: "Synthesize N notes" button → synthesis form
  (title + body + source list + Keep synthesis)
- "Make it mine" section: body textarea → Keep my response
- Status messages (kept / error)

### 2l. Views: Reflection/ReflectionView.swift (NEW)

`apple/Ateliera/Reflection/ReflectionView.swift`

Replaces the current thin `RoomView` for `reflection-garden`. Four tabs rendered as a
`Picker` (segmented, or custom tab list on iPad): Garden · Reflection · Celebration ·
Themes.

- Capture bar: textarea (type Reflection/Celebration selector) + Keep / Continue in editor
- Garden view: `ThenAndNow` pair when present, then chronological entry cards
- Reflection/Celebration views: filtered cards
- Themes view: tag-count buttons → filter cards by tag
- `EntryCard`: semantic mark (colour-coded), title, excerpt, cover image when available
  (loaded from vault via `readText` on the attachment path), evidence connection list
  (tappable when resolvable) + "Connect evidence" form

### 2m. Rooms.swift (MODIFY)

Add four rooms to `Room.all`:

```swift
Room(id: "current-season",   title: "Current Season",
     eyebrow: "a humane present focus",
     intro: "Name what matters now as a gentle chapter."),
Room(id: "uncharted",        title: "What if…?",
     eyebrow: "leave room for possibility",
     intro: "Keep possibilities that don't need a plan yet."),
```

The existing `reflection-garden` and `wisdom-garden` entries stay; their `RoomView`
is replaced by the rich `ReflectionView` / `WisdomView` above.

### 2n. VaultStore.swift (MODIFY)

Add targeted write helpers used by SeasonStore and WisdomThemeStore:
- `readFile(path:) throws -> (text: String, hash: String)` — already `readText` via Rust
- `writeFile(path:text:expectedHash:createNew:) throws` — already `writeText` via Rust
- `writeJsonConfig(path:data:expectedHash:) throws` — thin wrapper for JSON config files
  (used by `WisdomThemeStore`)

Add a cache of parsed notes keyed by path + hash to avoid re-parsing on every projection.

### 2o. RootView.swift (MODIFY)

- Add navigation to `SeasonView`, `UnchartedView` in rooms section
- Wire `WisdomView` and `ReflectionView` in place of simple `RoomView` for their rooms
- Add `SeasonStore` as a state object (fed by `VaultStore` on open)
- Add `WisdomThemeStore` as a state object

---

## 3. Data / format — frontmatter fields and golden values

### Season note schema (card_type: season)

Standard frontmatter + extra keys written into `extraFrontmatter` (preserved by the
existing round-trip path):

| Field (YAML key) | Type | Scope |
|---|---|---|
| `season_id` | String | canonical season ID (may differ from note `id` if recovered) |
| `date_start` | String (YYYY-MM-DD) | optional |
| `date_end` | String (YYYY-MM-DD) | optional |
| `priorities` | [String] | list of note IDs |
| `season_workflow` | map | nested wizard state (statement, prior_reflection, skipped_prior_reflection, feelings, decisions, practices, supports, constraints, enough, not_now, mid_season_notes, completed_steps) |

Rooms: `["current-season", "foyer"]`. Folder: `Current Season/`.
Status: `draft` → `active` (on confirm) → `archived` (on close).

### Uncharted note schema (card_type: possibility)

Standard frontmatter + `beyond_gate: true` in `extraFrontmatter` for beyond-gate cards.
Rooms: `["uncharted"]`. Folder: `Uncharted/`. `semantic_type: uncharted`.
"Invite into season" appends the season's `season_id` to the note's `seasons` array.

### Wisdom note schema

`card_type` = the wisdom kind (insight/quote/principle/practice/question/resource/synthesis).
`semantic_type` = derived: principle+synthesis → foundations; practice → growth;
question → uncharted; others → reflection (ported from `semanticTypeForWisdomKind`
in `packages/domain/src/wisdom.ts`).
Rooms: `["wisdom-garden"]`. Folder: `Wisdom Garden/`.
Themes stored as `tags` array. Source metadata in standard `source` map.
Synthesis: `source_notes` = list of source note IDs; body contains markdown links.

### Wisdom theme config

Path: `.studio/config/wisdom-themes.json`
Format: `{ "version": 1, "themes": [{ "id": slug, "title": str, "hidden": bool, "order": int }] }`

### Reflection evidence connections

`related_notes` in `extraFrontmatter` → `[String]` of note IDs (kind: note).
Standard `life_areas` frontmatter → (kind: life-area).
Standard `seasons` frontmatter → (kind: season, resolved via `season_id`).
`then_note_id` in `extraFrontmatter` → String (for Then & Now pairs).
`display.cover` → String attachment reference for cover images.

### Golden values to capture

Run throwaway vitest against `@studio/content` / `@studio/domain` / `@studio/application`:

**Season golden values:**
1. `markdownForSeason(state)` — capture output for a fully-filled SeasonState with all
   fields populated; assert Swift `markdownForSeason` byte-identical.
2. `seasonLetterBody(state, reflection)` — capture with a known reflection; assert Swift
   byte-identical.
3. Full round-trip: construct a season note via `noteWithState`, serialize via
   `serializeNote`, parse back via Swift `NoteParser`, confirm `SeasonNoteMapper`
   recovers all `SeasonState` fields correctly.
4. `seasonProgress(state)` for states at each completedSteps frontier — assert Swift
   integer matches.

**Wisdom golden values:**
5. `semanticTypeForWisdomKind` for all 7 kinds — assert Swift mapping matches.
6. `defaultWisdomThemes` array (id + title pairs) — assert Swift literal matches.

**Uncharted golden values:**
7. A note with `beyond_gate: true` in extraFrontmatter round-trips through
   `NoteParser` and Swift `UnchartedProjection` returns `horizon: .beyond`.

**Reflection golden values:**
8. Evidence-connection resolution for a note with `related_notes`, `life_areas`, and
   `seasons` — expected `ReflectionEvidenceConnection` array; assert Swift matches.

**Capture convention golden values:**
9. A season note captured via Swift `SeasonNoteMapper.createSeasonNote` serialized
   by `StudioNote.serialize()` — feed that bytes through the web `parseNote` and assert
   the parsed `extraFrontmatter` contains the right keys at the right nesting depth.

---

## 4. TDD plan

### Unit tests (AtelieraTests)

**SeasonDomainTests.swift**
- `testSeasonWizardStepOrder` — assert `seasonWizardSteps` matches TS array exactly
- `testCreateSeasonDraft` — golden field defaults
- `testUpdateSeasonDraftNameDates` — valid input advances `completedSteps`
- `testUpdateSeasonDraftRejectsEmptyTitle` — throws
- `testUpdateSeasonDraftPriorityLimit` — >3 throws `PriorityLimitError` unless override
- `testActivateSeasonRejectsIncompleteSteps` — throws
- `testCloseSeasonRejectsDraft` — throws
- `testSeasonProgress` — golden integer for each step frontier
- `testValidDate` — valid/invalid YYYY-MM-DD

**SeasonNoteMapperTests.swift**
- `testMarkdownForSeasonGolden` — byte-identical to TS golden captured above
- `testSeasonLetterBodyGolden` — byte-identical to TS golden
- `testNoteWithStateRoundTrip` — create season note, serialize, parse, recover SeasonState
- `testSeasonStateFromNotePreservesUnknownKeys` — extra frontmatter survives

**WisdomDomainTests.swift**
- `testWisdomKindSemanticTypes` — golden map for all 7 kinds
- `testDefaultWisdomThemesGolden` — 13 entries, exact IDs + titles

**WisdomThemeStoreTests.swift**
- `testLoadAbsentFileReturnsDefaults`
- `testLoadValidConfigParsesThemes`
- `testLoadInvalidJsonReturnsDefaultsWithRepairFlag`
- `testSaveWritesCorrectJson`
- `testSaveRejectsTooManyThemes`
- `testSaveRejectsDuplicateIds`
- `testOptimisticConcurrencyConflictThrows`

**UnchartedProjectionTests.swift**
- `testNearDefaultHorizon` — note without `beyond_gate` → `.near`
- `testBeyondGateFlagHorizon` — note with `beyond_gate: true` → `.beyond`
- `testExcludesNonUnchartedRooms`
- `testGoldenBeyondGateRoundTrip` — captures golden #7 above

**ReflectionProjectionTests.swift**
- `testChronologicalOrder` — sorted by `created` newest first
- `testEvidenceConnectionsNoteAvailable`
- `testEvidenceConnectionsNoteArchived`
- `testEvidenceConnectionsNoteMissing`
- `testEvidenceConnectionsLifeAreaHidden`
- `testEvidenceConnectionsSeason`
- `testThenAndNow` — `then_note_id` wired correctly
- `testCoverReferencePresent`
- `testGoldenEvidenceResolution` — golden #8 above

**SeasonStoreTests.swift** (using in-memory VaultStore stub)
- `testLoadWithNoSeasonFile` → `record == nil`
- `testBeginSeasonCreatesDraftFile`
- `testSaveStepAdvancesWizard`
- `testActivateSeasonChangesStatus`
- `testCloseSeason` — writes letter note, archives season note
- `testConflictRepair` — two active seasons → `repairActive` archives the unchosen one

### UI tests (AtelieraUITests)

**SeasonWizardUITests.swift**
- Full wizard happy path: enter name → skip reflection → add feelings → add one
  priority → skip decisions → skip supports → enter enough → skip not-now → confirm
- Verify season appears in Foyer room list after activation
- Close season: enter reflection fields + disposition for each priority

**WisdomUITests.swift**
- Capture a new wisdom note of kind `quote` with source details
- Verify it appears in the garden filtered by its theme
- Select two notes → Synthesize → Keep synthesis → verify synthesis card appears

**UnchartedUITests.swift**
- Capture a near possibility → appears in near grid
- Capture a beyond-gate possibility → appears in beyond grid
- Invite into active season → "Linked" appears on card

**ReflectionRichUITests.swift** (extends existing CaptureFlowUITests)
- Switch to Reflection tab → verify entry appears
- Switch to Celebration tab → verify filtered
- Switch to Themes tab → tap theme → verify filtered cards

---

## 5. Dependencies

### Hard dependencies on earlier phases

| Phase | What P6 needs |
|---|---|
| P1 — Note metadata editing | `saveNoteMetadata(path:hash:updates:)` — write arbitrary frontmatter fields on an existing note (required by: invite-to-season, reflection evidence connect, season revision, uncharted invitation). Without P1, these writes must be done by re-serializing the full parsed note — which is workable but couples P6 tightly to the parser. |
| P2 — Themes | Theme tokens for 4 new rooms (Current Season, Uncharted get new visual treatment). P6 can ship on chamomile only; full theme polish deferred. |
| P3 — Resurfacing | Not required for P6 itself, but the close-season flow writes a reflection note that benefits from P3's `resurface_kind` support in the editor (cosmetic). |
| P4 — Search/links | Backlinks in evidence connections use the link graph. P6 can ship with a simpler naive scan (O(n) over all notes); P4's graph replaces it without API change. |

### Shared contracts P6 relies on

- `StudioNote.serialize() -> String` — unchanged; season/uncharted/wisdom notes use it
- `NoteParser.parse(_ text:) -> StudioNote?` — unchanged; all reads use it
- `VaultStore.readText` / `VaultStore.writeText` (Rust core FFI) — unchanged
- `NoteFactory.createNoteId()`, `NoteFactory.suggestFilename` — unchanged; season notes
  use standard filenames
- `VaultStore.reload()` — triggers projection refresh after any mutation

The season `extraFrontmatter` structure (`season_workflow` nested map with specific keys)
is the format contract with the web; if the web changes it in a future release, the
native mapper must be updated in lockstep.

---

## 6. Risks and first vertical slice

### Risks

1. **`season_workflow` map depth.** The native `YamlNode` emitter handles nested maps
   already (`case .map`), but the `season_workflow` value is a deeply nested map
   (decisions is a `[{id, text, horizon, kind}]` list of maps). The serializer test must
   cover this. Mitigation: add a `testSeasonWorkflowMapRoundTrip` fixture test before
   any production code.

2. **Wisdom theme config concurrency.** The JSON config is read/written with
   `expectedHash` / `expectedMissing`; a parallel write from the web app on the same
   iCloud vault can fail with a conflict. Mitigation: catch `VaultConflictError`,
   reload, retry once (matches web app's `CAPTURE_ATTEMPTS` pattern).

3. **Reflection cover images.** Loading cover images requires reading vault files that
   may live in arbitrary subdirectories; the Rust core's `readText(path:)` handles this,
   but large images block the main actor. Mitigation: load images on a background task
   using `Task.detached`.

4. **P1 dependency.** If P1's arbitrary-field write path isn't ready, the "invite into
   season" and "connect evidence" mutations must re-serialize the whole note (parse →
   mutate Swift struct → serialize → write). This is safe (byte-identical serializer
   already tested) but requires the caller to hold the current hash — which is available
   in the projection structs.

### Smallest first vertical slice

**Slice: Uncharted room — capture + near/beyond grid (no season invitation)**

Why this first:
- Touches zero wizard UI, no complex state machine
- Adds a new room route (Rooms.swift + RootView.swift changes are tiny)
- Proves the `beyond_gate` extraFrontmatter round-trip works
- Forces `UnchartedProjection.swift` to exist (which Reflection evidence resolution
  can borrow as a pattern)
- Can be tested with a single failing unit test (projection) + one failing UI test
  (capture flow) before writing any production code

Concrete failing test to write first:
```swift
// AtelieraTests/UnchartedProjectionTests.swift
func testBeyondGateFlagHorizon() {
    let note = // a StudioNote with extraFrontmatter = [("beyond_gate", .bool(true))]
               // and rooms = ["uncharted"]
    let cards = UnchartedProjection.project(notes: [note])
    XCTAssertEqual(cards.first?.horizon, .beyond)
}
```

After this slice is green and committed, proceed to:
Reflection rich views → Wisdom Garden → Season wizard (the largest slice, last).
