# P1 — Note depth: full metadata editing + wikilink navigation

Status: design-ready (2026-08-28). Prerequisite phase: none (P1 is the base).
Successor: P3 (resurface pool over metadata), P4 (faceted search + backlinks),
P5 (landscape/identity rooms built over these fields).

---

## 1. Scope — web features this phase must reach

### 1a. Full metadata on every note

The web `StudioNote` domain type (`packages/domain/src/note.ts`) carries these
fields that the native `StudioNote` already round-trips correctly (parser +
serializer are byte-identical) but does **not** yet expose in any editing UI:

| Field | Web type / domain source | Notes |
|---|---|---|
| `semanticType` | `SemanticType` (6 values) — `semantic-type.ts` | drives room colour + gift selection |
| `status` | `NoteStatus` (5 values) — `note.ts` | draft/active/resting/archived/trashed |
| `tags` | `string[]` | free-form, multi-value |
| `lifeAreas` | `string[]` (from `defaultLifeAreas` — `life-area.ts`) | 10 seeded; user adds more in P5 |
| `landscapeAnchor` | `LandscapeAnchor` (5 values) — `landscape.ts` | optional |
| `seasons` | `string[]` | free-form season IDs, e.g. `2026-winter` |
| `source.title` / `.creator` / `.url` | `NoteSource` — `note.ts` | optional struct |
| `privacy.sensitivity` | `private` \| `sensitive` | |
| `privacy.aiAccess` | `never` \| `ask` \| `selected` \| `scoped` | |
| `display.cover` | `string?` (relative attachment path) | set, not upload (P7) |
| `display.featured` | `bool` | |
| `rooms` | `string[]` | already writable at capture; must also be editable post-capture |

Card type (`cardType`) is a free-form string in the domain and therefore also
needs to be editable for the note kinds that matter now (capture / reflection /
insight / quote / principle / practice / question / resource / synthesis /
identity-truth / identity-emerging / belief / feeling / embodiment-cue /
identity-shift — drawn from `wisdom.ts` and `identity.ts`). A picker with those
values plus a freeform escape hatch covers the field.

The web editor (`apps/studio/src/features/capture/NoteEditorSession.tsx`) drives
`CardEditor` from `@studio/ui`, which handles all of these fields. We do not port
the web React component; we design a native equivalent in SwiftUI.

### 1b. Wikilink parsing and tap-to-navigate

The web `@studio/content/src/links.ts` defines `extractLinks(markdown)` which
returns `ParsedLink[]` with kinds `wiki` | `path` | `id`. For P1 the native
requirement is:

- Parse `[[Target Title]]` and `[[Target Title|alias]]` from the note body.
- Tap a rendered wikilink token → find the matching note in the vault by title
  (case-insensitive, first match) → open it in the editor sheet.
- `studio://note/<id>` links resolve by `StudioNote.id` → open editor.
- Relative `.md` path links are parsed but tap-to-navigate can show "not yet
  navigable" until P4 builds the full link graph.
- Code spans and fenced code blocks are NOT parsed for wikilinks (matching web
  rule in `links.ts` lines 58–62).

Wikilinks are display-only in P1: the body editor remains a plain `TextEditor`;
a separate **rendered-body view** (below the editor or on a "Preview" tab)
renders the Markdown with tappable wikilinks.

---

## 2. Native design — files to add / modify

### 2a. New Swift files under `apple/Ateliera/`

#### `Note/NoteMetadata.swift`
Typed enumerations and helpers mirroring `@studio/domain`:

```
enum SemanticType: String, CaseIterable, Codable {
    case foundations, vision, growth, reflection, celebration, uncharted
}
enum NoteStatus: String, CaseIterable, Codable {
    case draft, active, resting, archived, trashed
}
enum Sensitivity: String, CaseIterable { case `private`, sensitive }
enum AiAccess: String, CaseIterable { case never, ask, selected, scoped }
enum LandscapeAnchor: String, CaseIterable {
    case vision
    case identityValuesFeelings = "identity-values-feelings"
    case decisions, practices
    case structureStrategy = "structure-strategy"
}
// Convenience so StudioNote can refer to typed values without breaking the
// existing String-based serializer.  Bridge helpers:
extension StudioNote {
    var semanticTypeEnum: SemanticType? { SemanticType(rawValue: semanticType) }
    var statusEnum: NoteStatus? { NoteStatus(rawValue: status) }
    var landscapeAnchorEnum: LandscapeAnchor? {
        landscapeAnchor.flatMap { LandscapeAnchor(rawValue: $0) }
    }
}
```

Seeded life-area IDs and labels (from `packages/domain/src/life-area.ts`):
```
static let defaultLifeAreas: [(id: String, label: String)] = [
    ("family","Family"), ("home","Home"),
    ("health-wellbeing","Health & Wellbeing"),
    ("work-business","Work / Business"), ("money","Money"),
    ("creativity","Creativity"),
    ("relationships-community","Relationships / Community"),
    ("adventure","Adventure"), ("spirituality","Spirituality"),
    ("learning","Learning"),
]
```

Card type registry (from `packages/domain/src/wisdom.ts`, `identity.ts`):
```
static let knownCardTypes: [String] = [
    "capture","reflection","insight","quote","principle","practice",
    "question","resource","synthesis","identity-truth","identity-emerging",
    "belief","feeling","embodiment-cue","identity-shift",
]
```

#### `Note/WikilinkParser.swift`
A pure-Swift regex-based wikilink extractor, golden-matched to
`@studio/content/src/links.ts`:

```swift
struct ParsedWikilink {
    let target: String    // raw target (trimmed)
    let label: String     // display label (= target if no alias)
    let range: Range<String.Index>   // range in the source body string
}

enum WikilinkParser {
    // Matches [[Target]] and [[Target|Alias]], skipping code spans
    // and fenced code blocks exactly as links.ts does.
    static func parse(_ body: String) -> [ParsedWikilink]
}
```

The regex is `\[\[([^\]\|\n]+?)(?:\|([^\]\n]+?))?\]\]` (same as `WIKI_LINK` in
`links.ts`). Code-span exclusion is handled by a pre-pass that blanks
`` `...` `` and ```` ```...``` ```` regions before running the regex, rather
than by AST walking (simpler, sufficient for P1; P4 can upgrade if needed).

#### `Note/MetadataEditorView.swift`
A `Form`-based SwiftUI view with sections for each metadata group. Used as a
sheet or a navigation-pushed view from `NoteEditorSheet`. Sections:

1. **Type & Status** — `cardType` picker (knownCardTypes + "Custom…" field),
   `semanticType` segmented control (6 labels), `status` segmented control
   (5 values, colour-coded per meaning).
2. **Organisation** — `rooms` multi-select (Room.all IDs + labels; inline
   checkboxes), `tags` token field (comma-separated; tap to add/remove),
   `lifeAreas` multi-select (defaultLifeAreas; scroll-picker), `seasons` tag
   field (free text, semicolon-separated).
3. **Landscape** — `landscapeAnchor` optional picker (5 anchors + "None").
4. **Source** — three `TextField`s for `source.title`, `source.creator`,
   `source.url`; shown as a group, empty = nil in model.
5. **Privacy** — `sensitivity` picker, `aiAccess` picker.
6. **Display** — `featured` Toggle; `display.cover` text field (path, not
   a picker; full attachment in P7).

Signature:
```swift
struct MetadataEditorView: View {
    @Binding var note: StudioNote
    // Provides the live note; binding mutates in-place before the caller saves.
}
```

`MetadataEditorView` does **not** write to the vault itself. The caller
(`NoteEditorSheet`) owns the write, letting the existing `VaultStore.saveEdit`
path handle the atomic write + hash check unchanged.

#### `Note/BodyPreviewView.swift`
A SwiftUI view that renders the note body as Markdown (using `AttributedString`
from `Foundation`) with tappable wikilinks:

```swift
struct BodyPreviewView: View {
    let body: String
    let onWikilinkTap: (String) -> Void   // target title
    let onIdLinkTap: (String) -> Void     // note id
}
```

Implementation:
- `WikilinkParser.parse(body)` to extract links.
- Render `AttributedString(markdown: body)` for the base layer.
- Overlay tappable `Text` spans at the wikilink character positions
  (using a `ZStack` over a `Text` that hides the raw `[[...]]` syntax and
  shows the label in `Studio.link` colour with an underline).
- For P1, `.md`-path links are rendered as tappable but show a "not yet
  navigable" alert on tap (deferred to P4).

#### `Note/WikilinkNavigator.swift`
```swift
// Resolves a wikilink target against the loaded vault and returns the
// EditableNote for navigation, or nil when unresolved.
enum WikilinkNavigator {
    static func resolve(
        target: String,
        in notes: [NoteSummary],
        vault: VaultStore
    ) -> EditableNote?
    // Case-insensitive title match; first result wins.
    // For "studio://note/<id>" links, matches on NoteSummary.id.
}
```

### 2b. Files to modify

#### `apple/Ateliera/RootView.swift`

`NoteEditorSheet` gains a "More…" / "Details" toolbar button that pushes
`MetadataEditorView` inside the same `NavigationStack`. The save path in
`VaultStore.saveEdit` already preserves all fields; we add the fields that were
previously ignored (rooms, semanticType, status, tags, etc.) by passing them
through the `@Binding var note: StudioNote` that `MetadataEditorView` mutates.

`NoteEditorSheet` now holds a local copy of the full `StudioNote` (not just
title + body strings) and passes a binding to `MetadataEditorView`. On "Save"
it calls the updated `VaultStore.saveEdit(_:note:)` overload (see below).

The rendered body section of `NoteEditorSheet` adds a "Preview" toggle that
swaps `TextEditor` for `BodyPreviewView`. Tapping a wikilink in preview mode:
1. Calls `WikilinkNavigator.resolve(target:in:vault:)`.
2. If resolved → push a new note editor sheet via `activeSheet = .edit(editable)`.
3. If not resolved → show an in-place `Text` alert "Note not found".

`ActiveSheet` gains no new cases; wikilink navigation reuses `.edit`.

#### `apple/Ateliera/VaultStore.swift`

`saveEdit` is overloaded to accept the full mutated `StudioNote`:
```swift
@discardableResult
func saveEdit(_ editable: EditableNote, updatedNote: StudioNote) -> Bool
```
The existing `saveEdit(_:title:body:)` becomes a thin wrapper calling this.
`updatedNote` only needs `updated` bumped (the caller does this, or `saveEdit`
bumps it internally).

`NoteSummary` gains fields that the rooms and filtered views in P5–P6 will need:
```swift
struct NoteSummary {
    // existing fields ...
    let status: String         // for status-filtered views
    let semanticType: String   // for meaning-colour + gift kind
    let tags: [String]         // for tag-facet in P4
    let lifeAreas: [String]    // for landscape filter in P5
    let landscapeAnchor: String? // for landscape grid in P5
    let featured: Bool         // for "featured" badge
}
```
`VaultStore.parse(path:text:)` already iterates frontmatter lines; extend it to
also read these keys. (The full `NoteParser.parse` call in `reload()` is the
authoritative source; `NoteSummary` is just the lightweight projection used by
the list. Both paths update together.)

---

## 3. Data / format — golden values

All frontmatter fields are already round-tripped byte-identically by the existing
`StudioNote` serializer (proven by `NoteSerializerTests`). P1 adds no new
frontmatter keys and no new serialization logic. The new typed enums are only
ever written back as their `rawValue` strings (which match the web's schema).

### 3a. Enum values to hard-code and test against web schema

From `packages/domain/src/semantic-type.ts`:
```
SemanticType raw values: foundations, vision, growth, reflection, celebration, uncharted
```

From `packages/domain/src/note.ts`:
```
NoteStatus raw values: draft, active, resting, archived, trashed
Sensitivity raw values: private, sensitive
AiAccess raw values: never, ask, selected, scoped
```

From `packages/domain/src/landscape.ts`:
```
LandscapeAnchor raw values:
  vision, identity-values-feelings, decisions, practices, structure-strategy
```

These are constants in TypeScript. No golden-value vitest is needed because the
values are string literals, not computed. The Swift `CaseIterable` enums just
hard-code the same strings.

### 3b. Wikilink parsing golden values

Capture from `packages/content/src/links.test.ts` (existing golden in the web
codebase). The first test case is the canonical golden:

Input:
```
Meet [[A quiet morning]] and [[Future Self|her]].
See [proof](../Reflection/proof.md#today) and [identity](studio://note/01HX).
```

Expected wikilinks only (kind=wiki):
```
[{target: "A quiet morning", label: "A quiet morning"},
 {target: "Future Self",     label: "her"}]
```

The P1 `WikilinkParserTests.swift` golden reproduces exactly these pairs. The
`.md`-path and `studio://note/` cases are parsed separately (kind=path/id) and
tested individually.

Run the golden capture once (the web tests already pass; values are stable):
```sh
cd /Users/anna/Sites/ateliera
pnpm --filter @studio/content exec vitest run src/links.test.ts
```
No new throwaway vitest is needed; the existing test file is the ground truth.

### 3c. Code-span exclusion golden

Input: `` `[[not a link]]` ``  → 0 wikilinks.
Input: ```` ```\n[[also ignored]]\n``` ```` → 0 wikilinks.
Input: `[[kept]]` → 1 wikilink `{target:"kept", label:"kept"}`.

These three cases are directly ported from `links.test.ts` line 18.

---

## 4. TDD plan

### Unit tests (AtelieraTests)

#### `NoteMetadataTests.swift`
- `testSemanticTypeRawValuesMatchWebSchema` — `SemanticType.allCases.map(\.rawValue)` == web array.
- `testNoteStatusRawValuesMatchWebSchema` — same for NoteStatus.
- `testLandscapeAnchorRawValuesMatchWebSchema` — same.
- `testSensitivityRawValuesMatchWebSchema`, `testAiAccessRawValuesMatchWebSchema`.
- `testDefaultLifeAreaIdsMatchDomainPackage` — 10 IDs in correct order.

#### `WikilinkParserTests.swift`
- `testExtractsBasicWikilink` — `[[A quiet morning]]` → target="A quiet morning", label same.
- `testExtractsAliasedWikilink` — `[[Future Self|her]]` → target="Future Self", label="her".
- `testSkipsCodeSpanWikilink` — backtick span → 0 results.
- `testSkipsFencedCodeWikilink` — fenced block → 0 results.
- `testIgnoresEmptyTarget` — `[[   ]]` → 0 results.
- `testDeduplicatesSameTarget` — `[[One]] [[One|again]]` → 1 wikilink (first wins).
- `testMultipleWikilinksInOrder` — preserves source order.
- `testRangeIsCorrectInBody` — `range` maps to the exact `[[...]]` span in the string.
- `testGoldenFromLinksTestTs` — reproduces the first test case from `links.test.ts` verbatim.

#### `WikilinkNavigatorTests.swift`
- `testResolvesExactTitleMatch` — title match is case-insensitive.
- `testResolvesStudioUriById` — `studio://note/<id>` hits.
- `testReturnsNilWhenUnresolved` — non-matching target → nil.
- `testFirstMatchWins` — two notes with the same title → first alphabetically wins.

#### `MetadataRoundTripTests.swift`
- `testStatusChangeRoundTrips` — parse note, change `status` to "resting", re-serialize, re-parse, confirm status = "resting", all other fields unchanged.
- `testTagsRoundTrip` — add/remove tags, serialize, parse, confirm tags array matches.
- `testLifeAreasRoundTrip` — same for `life_areas`.
- `testLandscapeAnchorRoundTrip` — set `landscapeAnchor = "decisions"`, round-trip.
- `testSourceRoundTrip` — set `source.url`, round-trip.
- `testPrivacyRoundTrip` — set `aiAccess = "never"`, round-trip.
- `testFeaturedToggleRoundTrip` — `display.featured = true`, round-trip.
- `testUnknownFrontmatterPreservedAfterMetadataEdit` — parse a note with `mood: tender`, change tags, re-serialize, `mood: tender` still present at the top.

#### Existing tests that continue to gate correctness
- `NoteSerializerTests.testSerializerMatchesTheWebSerializerByteForByte` — must stay green.
- `NoteParserTests.testParseThenSerializeRoundTripsByteForByte` — must stay green.
- `EditWriteTests` — must stay green (the save-edit path is not structurally changed).

### UI tests (AtelieraUITests)

#### `MetadataEditorUITests.swift`
- `testOpenMetadataSheet` — tap "Edit" on a note → tap "Details" toolbar button → `MetadataEditorView` appears (confirmed by "Type & Status" section header existence).
- `testChangeStatusAppliesToNote` — change status to "resting" in sheet → save → re-open note → sheet shows "resting" selected.
- `testAddTagRoundTrips` — add tag "calm" → save → re-open → "calm" is visible in the tags field.
- `testWikilinkPreviewShowsLinkColour` — capture two notes (B references `[[A]]`) → open B → switch to preview → a link-coloured span is visible.
- `testWikilinkTapNavigatesToTarget` — same setup → tap `[[A]]` in preview → editor for A opens.
- `testWikilinkTapOnUnresolvedShowsAlert` — `[[NonExistent]]` → tap → alert "Note not found" visible.

All UI tests run against `ATELIERA_UITEST=1` fresh vault (no fixture data) so
capture steps must create any notes the test depends on. Use the `type(_:into:in:)`
helper already in `CaptureFlowUITests`.

---

## 5. Dependencies

### What P1 requires
- Nothing from later phases. The full `StudioNote` model is already in place,
  the parser round-trips all fields, and `VaultStore.saveEdit` writes atomically.
- The existing `beginEdit` / `saveEdit` / `reload` loop in `VaultStore` is
  the write path; P1 widens the fields passed through it, not the path itself.

### What later phases depend on from P1
- **P3 (The Gift / resurface)**: reads `resurfaceKind/Due/IntervalDays` and
  `semanticType` from the note model. P1 exposes semanticType in the editor but
  does not implement the gift loop; P3 builds on top.
- **P4 (search parity)**: facets on `semanticType`, `status`, `tags`,
  `lifeAreas`. The `NoteSummary` extension in §2b populates these.
- **P5 (Landscape/Identity rooms)**: the room views are projections over
  `landscapeAnchor`, `lifeAreas`, `status`, and `semanticType`. P1 is the spine.

### Shared contracts P1 establishes
- `VaultStore.saveEdit(_:updatedNote:)` — the canonical full-note save API.
  All later phases that write metadata use this, not a bespoke path.
- `WikilinkNavigator.resolve(target:in:vault:)` — reused by P4's backlink graph.
- `NoteSummary` extended fields — the projection P4 and P5 query.

---

## 6. Risks + first vertical slice

### Risks
1. **MetadataEditorView UX** — a Form with 6 sections is long on a phone. Mitigation:
   collapse sections (DisclosureGroup), mark optional sections with "optional" hints,
   and ship the Type & Status section first (the highest-value fields).
2. **Wikilink rendering with AttributedString** — mixing a Markdown-rendered
   `AttributedString` with overlaid tappable spans is fragile on iOS 17.
   Mitigation: use a simpler approach — render the body as plain `Text`, then
   append a separate `HStack` of tappable `Button("[[target]]")` pills beneath
   the body. This is less inline but completely reliable. Upgrade to an inline
   overlay in P4 when the link graph exists and can validate every link.
3. **`rooms` editing** — notes can belong to multiple rooms. The multi-select
   must not allow the user to leave `rooms` empty (the web treats an empty array
   as "inbox"). Validate before save; show an error if empty.
4. **NoteSummary parsing performance** — extending `VaultStore.parse` to read
   more frontmatter lines per note is negligible for personal vault sizes.

### Smallest first vertical slice (recommended order)

1. `NoteMetadata.swift` with typed enums + tests (no UI; 30 min).
2. Extend `VaultStore.saveEdit` to the full-note overload (no UI; 15 min).
3. Extend `NoteSummary` with the new fields + tests (no UI; 20 min).
4. `MetadataRoundTripTests.swift` — all green before any UI work.
5. `MetadataEditorView.swift` — **Type & Status section only** (card type +
   semantic type + status). Wire into `NoteEditorSheet`'s toolbar.
6. `testChangeStatusAppliesToNote` UI test — green.
7. Remaining metadata sections (tags, lifeAreas, rooms, source, privacy, display).
8. `WikilinkParser.swift` + `WikilinkParserTests.swift` — all golden tests green.
9. `BodyPreviewView.swift` with pill-style tappable links.
10. `WikilinkNavigator.swift` + `WikilinkNavigatorTests.swift`.
11. Preview tab in `NoteEditorSheet` + navigation wiring.
12. UI tests for wikilink tap-to-navigate.

The first green vertical slice is **status change on a note round-trips and
appears in the room list** (steps 1–6). Everything else builds on that proven
write path.
