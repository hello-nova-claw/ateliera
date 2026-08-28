# P5 Implementation Spec — Life Landscape + Identity Studio

Status: ready-to-implement (2026-08-28). Depends on P1 (full metadata editing,
`decisionHorizon`-at-capture, and the `related_notes`/`identity_section` write
path). P2 (themes) and P3 (resurface) are independent and can land before or
after P5.

---

## 1. Scope — web features this phase must reach

| Web file | Surface |
|---|---|
| `apps/studio/src/features/landscape/LandscapePage.tsx` | Life Landscape full UI: matrix / focus / lens views, drag-and-drop + keyboard move, area management, undo, orphan repair |
| `apps/studio/src/features/landscape/use-landscape.ts` | Landscape data layer: load life-area config, project board, move/reorder/add/remove/rename/reorder-area |
| `apps/studio/src/features/landscape/field-guidance.ts` | Copy: new-area and rename-area guidance text |
| `apps/studio/src/features/identity/IdentityPage.tsx` | Identity Studio full UI: 7 sections, currently-becoming, evidence, promote, reorder, add |
| `apps/studio/src/features/identity/use-identity.ts` | Identity data layer: project, add, promote, reorder |
| `apps/studio/src/features/identity/field-guidance.ts` | Copy: per-section field guidance + title guidance |
| `packages/domain/src/landscape.ts` | 5 anchors + `DecisionHorizon` enum (golden values) |
| `packages/domain/src/identity.ts` | 7 section definitions + `identitySectionForCardType` (golden values) |
| `packages/domain/src/life-area.ts` | 10 default life-areas (golden values) |
| `packages/application/src/projections.ts` | `projectLandscapeBoard`, `projectIdentityStudioRoom` algorithms (note eligibility, manual-order overlay, evidence linking) |
| `packages/application/src/life-area-repository.ts` | JSON config at `.studio/config/landscape-areas.json`, version:1 schema, slug rules, MAX_LIFE_AREAS=32 |
| `packages/application/src/view-state.ts` | `.studio/views/<encoded-key>.json` version:1 note-id-list files |

P5 does NOT include Season authoring, Uncharted, rich Reflection/Wisdom (P6),
or the full backlink/link-graph index (P4). It does use the existing vault scan
(all `.md` files), the existing `StudioNote` model (already round-trips
`landscape_anchor`, `life_areas`, `card_type`, `semantic_type`, `display.featured`),
and the Rust core `write_text` + `read_text` APIs already wired in `VaultStore`.

---

## 2. Native design

### Files to ADD

```
apple/Ateliera/
  Landscape/
    LandscapeStore.swift          — @Observable; owns life-area config + board projection
    LifeAreaConfig.swift          — JSON codec for .studio/config/landscape-areas.json (v1)
    LandscapeProjector.swift      — pure function: [StudioNote] + [String] areas -> LandscapeBoardProjection
    LandscapeMatrixView.swift     — 5-anchor x N-area grid; scroll + tap to focus
    LandscapeFocusView.swift      — single-area detail: 5 anchor sections + card list
    LandscapeLensView.swift       — single-anchor across all areas
    LandscapeCardView.swift       — card row: title, horizon badge, move menu
    LandscapeAreaManagerView.swift — add / rename / reorder / remove areas
    LandscapeRoomView.swift       — root NavigationStack destination: segmented Matrix/Focus/Lens + back

  Identity/
    IdentityStore.swift           — @Observable; owns identity projection + view-order state
    IdentityProjector.swift       — pure: [StudioNote] -> IdentityBoardProjection
    IdentityRoomView.swift        — root: currently-becoming hero + 7 section list + TOC sidebar
    IdentitySectionView.swift     — one section: header, cards, add form
    IdentityCardView.swift        — card: title, excerpt, evidence links, reorder arrows, promote

  Shared/
    ViewStateStore.swift          — read/write .studio/views/<key>.json through Rust core
    LandscapeTypes.swift          — LandscapeAnchor enum, DecisionHorizon enum, LifeArea struct,
                                    LifeAreaPreference struct, board projection types
    IdentityTypes.swift           — IdentitySection enum, section definitions, projection types
```

### Files to MODIFY

| File | Change |
|---|---|
| `apple/Ateliera/Rooms.swift` | Add `landscape` and `identity-studio` entries to `Room.all`; add `folderName` mappings ("Life Landscape", "Identity Studio") |
| `apple/Ateliera/RootView.swift` | Wire `NavigationLink` destinations for landscape and identity rooms in `roomsSection`; add `.landscape` and `.identity` to `ActiveSheet` if deep-link capture is needed |
| `apple/Ateliera/VaultStore.swift` | Expose `writeText(path:text:expectedHash:createNew:)` and `readText(path:)` at a slightly higher level (or just keep calling `vault.writeText` / `vault.readText`); expose `list(prefix:)` so `LandscapeStore` and `IdentityStore` can iterate `.studio/` paths without depending on `VaultStore.notes`. Alternatively extend `VaultStore` with `readConfig(path:) -> String?` and `writeConfig(path:text:expectedHash:) -> String` helpers. |
| `apple/Ateliera/Note/StudioNote.swift` | Add `decisionHorizon: String?` as a first-class field (P1 should do this; P5 needs it for display only if P1 is not yet done; fall back to reading from `extraFrontmatter` keyed `"decision_horizon"` if P1 has not promoted it). |
| `apple/Ateliera/Note/NoteParser.swift` | Add `"decision_horizon"` and `"related_notes"` to `recognizedKeys` (if not already done in P1); parse `decision_horizon` into `StudioNote.decisionHorizon`; parse `related_notes` into `StudioNote.relatedNoteIds: [String]?`. |
| `apple/AtelieraTests/` | New test files (see Section 4). |

### Key types (LandscapeTypes.swift)

```swift
enum LandscapeAnchor: String, CaseIterable, Codable {
    case vision = "vision"
    case identityValuesFeelings = "identity-values-feelings"
    case decisions = "decisions"
    case practices = "practices"
    case structureStrategy = "structure-strategy"

    var label: String { … }    // "Vision", "Identity, values & feelings", …
    var prompt: String { … }   // matches landscapeAnchorDefinitions in domain/landscape.ts
    var semanticType: String { … }  // "vision"/"foundations"/"growth"
}

enum DecisionHorizon: String, CaseIterable {
    case d30 = "30d"; case d60 = "60d"; case d90 = "90d"; case someday = "someday"
    var label: String { /* "30 days", "60 days", "90 days", "Someday" */ }
}

struct LifeArea: Identifiable, Equatable, Codable {
    var id: String; var title: String
}
struct LifeAreaPreference: Identifiable, Equatable, Codable {
    var id: String; var title: String; var hidden: Bool; var order: Int
}

struct LandscapeCardModel: Identifiable {
    let id: String          // noteId
    let path: String
    let title: String
    let excerpt: String
    let semanticType: String
    let hash: String
    var lifeAreas: [String]
    var anchor: LandscapeAnchor
    var decisionHorizon: DecisionHorizon?
    var isFeatured: Bool
}
struct LandscapeCellModel {
    let lifeArea: String
    let anchor: LandscapeAnchor
    let featured: LandscapeCardModel?
    let additionalCount: Int
    let cards: [LandscapeCardModel]
    let noteIds: [String]
}
struct LandscapeBoardModel {
    let cells: [LandscapeCellModel]
}
```

### Key types (IdentityTypes.swift)

```swift
enum IdentitySection: String, CaseIterable {
    case alreadyTrue = "already-true"
    case practicingNow = "practicing-now"
    case valuesPrinciples = "values-principles"
    case desiredFeelings = "desired-feelings"
    case beliefsPractice = "beliefs-practice"
    case embodimentCues = "embodiment-cues"
    case identityShifts = "identity-shifts"

    var label: String { … }   // "Already true", "Practicing now", …
    var prompt: String { … }  // from identitySectionDefinitions in domain/identity.ts
    var cardType: String { … } // "identity-truth", "identity-emerging", …
    var semanticType: String { … }
}

struct IdentityEvidenceModel: Identifiable {
    let id: String; let path: String; let title: String; let created: String
}
struct IdentityCardModel: Identifiable {
    let id: String; let path: String; let title: String; let excerpt: String
    let semanticType: String; let hash: String; let created: String
    let evidence: [IdentityEvidenceModel]
}
struct IdentityBoardModel {
    var currentlyBecoming: IdentityCardModel?
    var sections: [IdentitySection: [IdentityCardModel]]
}
```

### LandscapeProjector.swift (pure algorithm)

Mirrors `projectLandscapeBoard` in `packages/application/src/projections.ts`:

1. Filter `[StudioNote]` to notes where `note.lifeAreas.contains(area) && note.landscapeAnchor == anchor` for each (area, anchor) pair.
2. Apply manual order from `ViewStateStore.load("landscape:\(area):\(anchor.rawValue)")`.
3. Promote `display.featured == true` to index 0.
4. Read `decisionHorizon` from `note.decisionHorizon` (first-class) or from `extraFrontmatter` key `"decision_horizon"` if P1 has not yet promoted it.
5. Build `LandscapeCellModel(featured: cards.first, additionalCount: max(0, cards.count - 1), cards: cards, noteIds: cards.map(\.id))`.

Note eligibility: `note.status != "archived" && note.status != "trashed"` and `note.extraFrontmatter` does not contain `excluded_from_views: true` or `excluded: true`. Mirror `visible()` in projections.ts.

### IdentityProjector.swift (pure algorithm)

Mirrors `projectIdentityStudioRoom` in `packages/application/src/projections.ts`:

1. Eligible notes: `note.rooms.contains("identity-studio")` and `identitySectionForCardType(note.cardType) != nil`.
2. Evidence map: notes with `semanticType == "reflection" || semanticType == "celebration"`, `related_notes` frontmatter list (extra key until P1 promotes it) matched against eligible-note IDs.
3. Per section: apply `ViewStateStore.load("identity:\(section.rawValue)")` order, then remaining by fallbackCompare (updated desc, created desc, title asc, id asc).
4. Currently-becoming: `ViewStateStore.load("identity:currently-becoming")` → first match in `practicing-now`; fallback to legacy `card_type == "identity" && rooms.contains("foyer")`.

`identitySectionForCardType` mapping (exact parity):
```
"identity-truth" -> alreadyTrue
"identity-emerging" -> practicingNow
"principle" -> valuesPrinciples
"values-principles" -> valuesPrinciples  // section cardType
"feeling" -> desiredFeelings
"desired-feelings" -> desiredFeelings
"belief" -> beliefsPractice
"beliefs-practice" -> beliefsPractice
"embodiment-cue" -> embodimentCues
"embodiment-cues" -> embodimentCues
"identity-shift" -> identityShifts
"identity-shifts" -> identityShifts
// shared-card fallbacks:
"identity" -> practicingNow
"value" -> valuesPrinciples
"principle" (already above)
"feeling" (already above)
```

### LifeAreaConfig.swift (JSON codec)

Config file: `.studio/config/landscape-areas.json` (constant `LIFE_AREA_CONFIG_PATH`).
Version-1 schema:
```json
{ "version": 1, "areas": [ { "id": "family", "title": "Family", "hidden": false, "order": 0 }, … ] }
```
Rules (must match web validation):
- IDs: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 64 chars.
- Titles: 1–100 chars (unicode grapheme clusters), NFC-normalized, unique case-insensitively.
- Max 32 areas. Orders unique, in [0, 31].
- Version > 1: surface "read-only" banner (configUnavailable = .unsupported), never overwrite.
- Parse failure: show "needs attention" repair panel, show defaults, offer "Replace with defaults".
- Write: `JSON.stringify({ version: 1, areas }, null, 2) + "\n"` — use `JSONEncoder` with
  `.prettyPrinted` + `outputFormatting = [.prettyPrinted, .sortedKeys]`... NOTE: web uses
  `JSON.stringify(value, null, 2)` which is key-insertion order, not sorted. The areas array
  has keys `{ hidden, id, order, title }` in that order (alphabetical) because
  `JSON.stringify` of a plain object emits in insertion order. Capture golden bytes (see §3).

Slug generation for custom areas (mirrors `safeAreaId` in use-landscape.ts):
```swift
func safeAreaId(title: String, existing: [LifeAreaPreference]) -> String {
    var base = title
        .folding(options: .diacriticInsensitive, locale: .init(identifier: "en"))
        .lowercased()
        // replace non-[a-z0-9] runs with "-", trim edges, cap at 56 chars
    base = base.replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
    base = base.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    if base.isEmpty { base = "area" }
    base = String(base.prefix(56))
    let ids = Set(existing.map(\.id))
    if !ids.contains(base) { return base }
    var suffix = 2
    while ids.contains("\(base)-\(suffix)") { suffix += 1 }
    return "\(base)-\(suffix)"
}
```

### ViewStateStore.swift

Reads/writes `.studio/views/<percent-encoded-key>.json` through the Rust core:
```
version:1 schema: { "version": 1, "noteIds": ["id1", "id2", …] }
```
Keys used by P5:
- `landscape:<area>:<anchor>` — card order per (area, anchor) cell
- `landscape:<area>` — (unused in P5 but reserving the pattern)
- `identity:<section>` — card order per identity section
- `identity:currently-becoming` — the promoted note ID (first element used)

Write path: read current → compare-and-swap with `expectedHash`; if missing, write with `createNew: true` / `expectedHash: nil`.

### LandscapeStore.swift (ObservableObject)

State:
```swift
@Observable final class LandscapeStore {
    var areas: [LifeArea] = []                          // active (not hidden), sorted by order
    var preferences: [LifeAreaPreference] = []          // all (incl. hidden)
    var configRevision: String? = nil                   // hash of landscape-areas.json
    var board: LandscapeBoardModel = .empty
    var state: LoadState = .loading                     // loading/ready/stale/error
    var error: String? = nil
    var repairRequired = false
    var configUnavailable: ConfigUnavailability? = nil  // .unsupported / .unavailable
    private(set) var view: LandscapeViewMode = .matrix
    enum LandscapeViewMode { case matrix, focus(area: String), lens(anchor: LandscapeAnchor) }
}
```

Methods:
- `load(vault: Vault, notes: [StudioNote])` — async; load config then project board.
- `refresh(notes: [StudioNote])` — re-project board (called after any vault change).
- `move(card:lifeAreas:anchor:notes:vault:) async throws -> String` — read note, set `landscapeAnchor`, `lifeAreas`, `cardType`, `semanticType`, bump `updated`, write via `vault.writeText(expectedHash:)`, return new hash.
- `reorder(lifeArea:anchor:noteIds:vault:) async throws` — write view state file.
- `addArea(id:title:) async throws`, `removeArea(id:) async throws`, `renameArea(id:title:) async throws`, `reorderArea(id:offset:) async throws` — mutate preferences, save config, refresh board.
- `repairAreas(vault:) async throws` — savePreferences(allowRepair: true).

### IdentityStore.swift (ObservableObject)

```swift
@Observable final class IdentityStore {
    var model: IdentityBoardModel = .empty
    var state: LoadState = .loading
    var error: String? = nil
}
```

Methods:
- `load(vault: Vault, notes: [StudioNote])` — async; project board.
- `add(section:title:body:vault:) async throws` — capture note: `StudioNote.capture(…, room: "identity-studio", cardType: section.cardType, semanticType: section.semanticType)`, write to `"Identity Studio/<filename>"`.
- `promote(noteId:vault:) async throws` — write view state `"identity:currently-becoming"` with noteId at front.
- `reorder(section:noteIds:vault:) async throws` — write view state `"identity:\(section.rawValue)"`.
- `refresh(notes:)` — re-project (pure, cheap).

### Concurrency contract

Every mutating operation reads the note's current hash before writing (`beginEdit` pattern already in `VaultStore`), then calls `vault.writeText(expectedHash: currentHash)`. On conflict (`VaultError.conflict`), surface an alert "This note changed from another device. Try again." — **do not silently overwrite**. This matches the web's `StudioSaveConflictError` behavior.

### LandscapeMatrixView layout

SwiftUI `Grid` (iOS 16+) with a sticky anchor column and scrollable area columns. On iPhone (compact width), collapse to a vertical list of anchors; each anchor row shows the first-area featured card only, with "View all areas" navigation to focus mode. On iPad and Mac, show the full matrix horizontally scrollable.

Move gesture: `.onDrag` / `.onDrop` with `NSItemProvider(object: noteId as NSString)`. Drop target highlighted with `.listRowBackground` color change.

Keyboard alternative (WCAG / AGENTS.md requirement): each card has a context menu (long-press or right-click) with "Move to…" submenu listing other anchors and areas. This is the full keyboard-accessible alternative — no drag required to move a card.

### Decision horizon

The web stores `decision_horizon` as an `extraFrontmatter` key (not a first-class model field). P5 reads it from `note.extraFrontmatter` as a `YamlNode.scalar` keyed `"decision_horizon"` and validates against `DecisionHorizon.allCases`. Writing a horizon at capture-time is a P7 concern; P5 displays existing values only. Displayed label: "30 days", "60 days", "90 days", "Someday".

---

## 3. Data / format — frontmatter fields and golden values

### Fields used by P5 (no new fields introduced)

| Frontmatter key | SwiftUI mapping | Notes |
|---|---|---|
| `life_areas` | `StudioNote.lifeAreas` | Already in model + parser. |
| `landscape_anchor` | `StudioNote.landscapeAnchor` | Already in model + parser. |
| `card_type` | `StudioNote.cardType` | Set to anchor rawValue on move (e.g., `"decisions"`). |
| `semantic_type` | `StudioNote.semanticType` | Set to anchor's semantic type on move. |
| `display.featured` | `StudioNote.display.featured` | Featured card promoted to cell index 0. |
| `decision_horizon` | `extraFrontmatter["decision_horizon"]` | Read-only in P5; display badge only. |
| `rooms` (identity) | `StudioNote.rooms` | Must include `"identity-studio"`. |
| `related_notes` | `extraFrontmatter["related_notes"]` | Evidence list (reflection/celebration notes linking to identity notes). Parsed as `.list([String])`. |

### Config file format (byte-for-byte contract)

`.studio/config/landscape-areas.json`:
```json
{
  "version": 1,
  "areas": [
    {
      "hidden": false,
      "id": "family",
      "order": 0,
      "title": "Family"
    },
    ...
  ]
}
```
Key order within each area object is `hidden, id, order, title` (alphabetical — this is what `JSON.stringify` of `{ hidden, id, order, title }` produces because JS object literal insertion order is alphabetical for these keys when constructed as a spread). Verify with the golden test below.

View state files (`.studio/views/<encoded-key>.json`):
```json
{
  "version": 1,
  "noteIds": ["01JYABC...", "01JYDEF..."]
}
```

### Default life areas (10 total, first 5 active)

These must be hardcoded in Swift, matching `packages/domain/src/life-area.ts`:
```
family, home, health-wellbeing, work-business, money (active)
creativity, relationships-community, adventure, spirituality, learning (hidden, order 5–9)
```

### Identity section → card-type mapping (must be exact)

```swift
static func identitySectionForCardType(_ cardType: String) -> IdentitySection? {
    switch cardType {
    case "identity-truth":      return .alreadyTrue
    case "identity-emerging":   return .practicingNow
    case "values-principles":   return .valuesPrinciples
    case "principle":           return .valuesPrinciples
    case "desired-feelings":    return .desiredFeelings
    case "feeling":             return .desiredFeelings
    case "beliefs-practice":    return .beliefsPractice
    case "belief":              return .beliefsPractice
    case "embodiment-cues":     return .embodimentCues
    case "embodiment-cue":      return .embodimentCues
    case "identity-shifts":     return .identityShifts
    case "identity-shift":      return .identityShifts
    case "identity":            return .practicingNow   // legacy shared-card
    case "value":               return .valuesPrinciples
    default:                    return nil
    }
}
```

### Anchor → cardType + semanticType mapping (must be exact)

```swift
extension LandscapeAnchor {
    var cardType: String { rawValue }   // "vision", "decisions", etc.
    var semanticType: String {
        switch self {
        case .vision:                    return "vision"
        case .identityValuesFeelings:    return "foundations"
        case .decisions:                 return "growth"
        case .practices:                 return "growth"
        case .structureStrategy:         return "foundations"
        }
    }
}
```

### Golden values to capture (via throwaway Vitest)

Run once as a throwaway test to nail the exact bytes for critical output formats:

**Test 1 — Config serialization**
```ts
// parity/golden-landscape-config.test.ts
import { describe, it, expect } from 'vitest';
import { createLifeAreaRepository } from '@studio/application';
// …or just inline the serialize function:
const areas = [
  { id: 'family', title: 'Family', hidden: false, order: 0 },
  { id: 'home', title: 'Home', hidden: false, order: 1 },
];
const text = `${JSON.stringify({ version: 1, areas }, null, 2)}\n`;
// => assert exact bytes, capture them as the Swift golden
```
Golden fact: the JS `JSON.stringify` emits `hidden` before `id` before `order` before `title` when these are the only keys, because `JSON.stringify` serializes own enumerable keys in insertion order (the object literal `{ hidden, id, order, title }` is sorted alphabetically by coincidence). The Swift encoder MUST reproduce this exact order — use a custom `Encodable` conformance with a manual `CodingKeys` ordering, NOT `JSONEncoder` with `.sortedKeys` (which would give the same result for these keys but would break if order changes in future).

**Test 2 — Identity section for card-type exhaustive table**
```ts
import { identitySectionForCardType } from '@studio/domain';
const cases = ['identity-truth','identity-emerging','principle','values-principles',
  'feeling','desired-feelings','belief','beliefs-practice','embodiment-cue',
  'embodiment-cues','identity-shift','identity-shifts','identity','value'];
cases.forEach(ct => console.log(ct, '->', identitySectionForCardType(ct)));
```
Capture the output table and assert Swift `identitySectionForCardType` matches.

**Test 3 — View state file format**
```ts
const key = 'landscape:family:decisions';
const path = `.studio/views/${encodeURIComponent(key)}.json`;
// => ".studio/views/landscape%3Afamily%3Adecisions.json"
const content = `${JSON.stringify({ version: 1, noteIds: ['AAA', 'BBB'] }, null, 2)}\n`;
```
Assert Swift `ViewStateStore` produces the same path and content bytes.

---

## 4. TDD plan

### Unit tests (AtelieraTests/)

**LandscapeProjectorTests.swift**
- `testProjectsEmptyBoardWhenNoNotes()` — zero notes → all 50 cells empty.
- `testSingleNoteAppearsInCorrectCell()` — note with `life_areas: [family]`, `landscape_anchor: vision` → appears in (family, .vision) featured.
- `testManualOrderOverrideFallback()` — view-state `["B","A"]` for two notes → B appears first.
- `testFeaturedCardPromotedToIndex0()` — `display.featured: true` on second note → it becomes `featured`.
- `testAdditionalCountIsCorrect()` — 3 notes in one cell → `featured` = first, `additionalCount` = 2.
- `testDecisionHorizonParsedFromExtraFrontmatter()` — extra key `decision_horizon: "30d"` → `.d30`.
- `testExcludedNoteNotProjected()` — `excluded_from_views: true` in extra → not visible.
- `testArchivedNoteNotProjected()` — `status: archived` → not projected.
- `testMultipleAreasIncludesNoteInBothCells()` — `life_areas: [family, work-business]`, same anchor → appears in both cells.

**IdentityProjectorTests.swift**
- `testProjectsAllSevenSections()` — notes with all 7 section card-types → one per section.
- `testLegacyCardTypeMapping()` — `card_type: principle` → `values-principles` section.
- `testEvidenceLinkingByRelatedNotes()` — reflection note with `related_notes: [identity-note-id]` → evidence appears on identity card.
- `testCurrentlyBecomingFromViewState()` — view state `identity:currently-becoming = [noteId]` → `currentlyBecoming` populated.
- `testCurrentlyBecomingFallsBackToLegacyFoyer()` — `card_type: identity`, `rooms: [foyer]` → legacy currently-becoming.
- `testOnlyPracticingNowEligibleForPromotion()` — other sections' card-types not promotable.
- `testSectionManualOrder()` — view-state `identity:already-true = ["B","A"]` → B first.

**LifeAreaConfigTests.swift**
- `testRoundTripsDefaultAreas()` — serialize defaults, parse back → identical.
- `testGoldenConfigBytes()` — encode two areas → exact byte comparison against captured golden string.
- `testRejectsVersionGreaterThan1()` — version:2 JSON → `.unsupported` error.
- `testRepairOnMalformedJSON()` — invalid JSON → `repairRequired = true`, defaults returned.
- `testSlugGenerationMatchesWeb()` — "Body & energy" → "body-energy"; "Family" (already taken) → "family-2".
- `testMaxLifeAreas()` — 33 areas → validation error.
- `testDuplicateIdRejected()` — two areas with same id → validation error.

**ViewStateStoreTests.swift**
- `testViewPathEncoding()` — key `"landscape:family:decisions"` → path `".studio/views/landscape%3Afamily%3Adecisions.json"`.
- `testRoundTripsNoteIds()` — write ["A","B"], read back → ["A","B"].
- `testDeduplicatesNoteIds()` — write ["A","A","B"] → reads back ["A","B"].
- `testGoldenFileBytes()` — write ["AAA","BBB"] → exact bytes match golden.

### UI tests (AtelieraUITests/)

**LandscapeUITests.swift**
- `testLandscapeRoomAppears()` — Life Landscape in rooms list.
- `testMatrixViewShowsAnchors()` — open Landscape → "Vision", "Decisions" visible.
- `testFocusViewShowsCards()` — fixture with one landscape note → card title visible in Focus view.
- `testKeyboardMoveViaContextMenu()` — long-press card → "Move to…" menu present → select another anchor → card moves (verify vault file updated).
- `testAddAreaAndVerify()` — open area manager → add "Body & energy" → appears in matrix columns.
- `testRenameArea()` — rename "Family" to "Family & Community" → heading updates.
- `testRemoveAreaHidesIt()` — hide one area → column disappears from matrix.
- `testUndoMove()` — move card → "Undo move" button → card returns.

**IdentityUITests.swift**
- `testIdentityRoomAppears()` — Identity Studio in rooms list.
- `testAllSevenSectionsVisible()` — open Identity Studio → all 7 section headings visible.
- `testCurrentlyBecomingHero()` — fixture with promoted note → "Currently becoming" shows note title.
- `testAddToSection()` — tap "Add a truth" in "Already true" → fill body → Save → card appears.
- `testPromoteCard()` — fixture with `practicing-now` note → "Make current" → hero updates.
- `testEvidenceLinkShown()` — fixture with `related_notes` pointing to identity note → evidence row visible on card.
- `testReorderViaArrows()` — two cards in one section → tap ↑ on second → order reversed.

---

## 5. Dependencies

### Hard dependencies on P1

- `StudioNote.decisionHorizon` as a first-class optional field (for landscape horizon display). If P1 is not done, fall back: read `extraFrontmatter["decision_horizon"]` inline in `LandscapeProjector` — add this as a shim now and remove when P1 lands.
- `StudioNote.relatedNoteIds: [String]?` parsed from `related_notes` frontmatter (for identity evidence). Same fallback shim strategy.
- Full metadata write API from P1 (setting `cardType`, `semanticType`, `lifeAreas`, `landscapeAnchor` on move) — these are already serializable but P5 needs to write them back reliably. The `LandscapeStore.move()` method does this directly using the existing `vault.writeText` path, so it does not literally depend on P1's UI, only on its write-path contracts — which P5 can replicate.

### Shared contracts

- `VaultStore.vault` (the `Vault` FFI handle) must be accessible to `LandscapeStore` and `IdentityStore`. Current architecture makes `vault` private to `VaultStore`. Two options: (a) pass `Vault` down via parameter to store methods; (b) move `vault` internal and expose a `performVaultOperation(_ closure: (Vault) throws -> T) throws -> T` method. Option (a) is simpler; document the choice in `LandscapeStore`.
- `VaultStore.notes` is a `[NoteSummary]` (lightweight). P5 needs full `[StudioNote]` for projection. Therefore `LandscapeStore.load(vault:)` must re-scan and parse all notes, or `VaultStore` must also maintain a `parsedNotes: [StudioNote]` cache. Recommended: expose `VaultStore.parsedNotes: [StudioNote]` as an `@ObservationIgnored` cache computed alongside `notes` in `reload()`, accessed by the landscape/identity stores. This avoids re-parsing the entire vault twice.
- The Rust core `vault.list(prefix:)` used to find `.studio/config/` and `.studio/views/` files — already exposed via FFI.
- `NoteFactory.captureNote(...)` extended to accept `room: String`, `cardType: String`, `semanticType: String` for identity capture. VaultStore.capture already takes `room`; P5 needs cardType/semanticType overrides.

---

## 6. Risks + smallest first vertical slice

### Risks

1. **Vault API access**: `VaultStore.vault` is private. Must settle the access pattern before writing either room store. Low effort to fix; high coupling if deferred.
2. **`parsedNotes` cache cost**: re-parsing all `.md` files per projection call on large vaults. Mitigate by reusing the cache in `reload()`.
3. **Matrix layout on iPhone**: a 5×8 grid (5 anchors × 8 areas) does not fit compact width. The collapse-to-single-anchor fallback must be designed before the matrix view is wired into the NavigationStack.
4. **Config write ordering**: the JSON key order within each area object must match the web's `JSON.stringify` exactly, or the web app will see a "changed" file on next read. Golden test gates this.
5. **Drag-and-drop on iOS 16 vs 17**: `.onDrop` with `NSItemProvider` works differently from the newer `Transferable` API. Target iOS 16+ (ADR says Tauri 2 / iOS 17 minimum for the Tauri build, but the SwiftUI app can use 16+). Check the existing project deployment target before choosing the API.
6. **P1 shims**: if P5 ships before P1, the `decisionHorizon` and `relatedNoteIds` shims must be stripped in P1 to avoid double-parsing. Mark them with `// P1-shim: remove when P1 lands`.

### Smallest first vertical slice

Implement in this order (each step is independently testable and shippable):

1. **LandscapeTypes.swift + IdentityTypes.swift** — enums and struct definitions, no logic. Unit tests: anchor/section label strings.
2. **ViewStateStore.swift** — pure read/write of `.studio/views/<key>.json`. Unit tests: encoding, roundtrip, golden bytes.
3. **LifeAreaConfig.swift** — JSON codec, slug generation, validation. Unit tests: golden bytes, slug, error cases.
4. **LandscapeProjector.swift** — pure projection over an in-memory `[StudioNote]`. Unit tests: all projection cases above.
5. **IdentityProjector.swift** — pure projection. Unit tests: all identity cases above.
6. **LandscapeStore.swift** — wire projector + config + view-state into `@Observable`. No UI yet. Integration test: real vault fixture, load, assert board.
7. **IdentityStore.swift** — same pattern. Integration test.
8. **LandscapeRoomView + LandscapeFocusView** — Focus view (single area) only; skip Matrix and Lens. UI test: focus view card visible; keyboard move via context menu.
9. **LandscapeMatrixView + LandscapeLensView** — add the two remaining views. UI test: matrix columns visible; lens anchor switcher.
10. **LandscapeAreaManagerView** — add/rename/remove/reorder. UI test: add area appears.
11. **IdentityRoomView + all subviews** — full identity UI. UI tests: all 7 sections; currently-becoming; evidence.
12. **Wire both rooms into RootView** — add to `Room.all`, add `NavigationLink` destinations.

After step 8, you have one working room end-to-end. After step 11, both rooms are complete. Step 12 ships them.
