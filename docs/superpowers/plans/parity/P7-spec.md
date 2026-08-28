# P7 Implementation Spec: Structured / Classified Capture + Media

**Status:** Design spec (implementation-ready)
**Phase:** P7 in the native-parity roadmap
**Value:** Medium–high (classified capture unlocks P5/P6 room populate flows; cover images close the vault round-trip for media)
**Effort:** M–L (depends on P1 note-metadata editing and P5/P6 rooms existing)
**Hard dependencies:** P1 (full metadata editing, status, tags, semanticType), P5 (Life Landscape + Identity Studio rooms), P6 (Wisdom Garden + Uncharted rooms). P7 must be planned in advance but delivered after those phases because its UI pre-selects from room context that P5/P6 create.

---

## 1. Scope — web features this phase must reach

### 1.1 Classified capture
The web's capture model accepts five structured destinations beyond plain "quick capture". All are in `packages/application/src/studio-service.ts` (`capture()`, lines 950–1070) and validated by `packages/application/src/capture-metadata.ts`:

| Destination | Web type | Frontmatter produced | Folder |
|---|---|---|---|
| Foyer placement (`foyer-becoming` / `foyer-feeling` / `foyer-principle`) | `CapturePlacement` in `capture-metadata.ts` | `cardType`, `semanticType`, `rooms: [foyer, identity-studio]`, `status: active`, `display.featured: true` | `Foyer/` |
| Life Landscape anchor + life-area | `landscape: { lifeArea, anchor }` | `landscape_anchor`, `life_areas`, `rooms: [life-landscape]`, `semanticType` from `semanticTypeForLandscapeAnchor()` | `Life Landscape/<portableLifeAreaFolder>/` |
| Decision horizon (Decisions anchor only) | `decisionHorizon: '30d'|'60d'|'90d'|'someday'` | `extraFrontmatter.decision_horizon` | same as landscape |
| Identity section | `identitySection: IdentitySection` | `cardType` from `identitySectionDefinition`, `rooms: [identity-studio]`, `status: active` | `Identity Studio/` |
| Wisdom kind + themes + optional source + optional sourceNoteIds | `wisdom: { kind, themes, source?, sourceNoteIds? }` | `cardType: wisdom.kind`, `tags: themes`, `source`, `source_notes`, `rooms: [wisdom-garden]`, `status: active` | `Wisdom Garden/` |
| Uncharted + optional horizon | `placement: 'uncharted'`, `unchartedHorizon?: 'near'|'beyond'` | `cardType: possibility`, `rooms: [uncharted]`, `extraFrontmatter.beyond_gate: true` when `beyond` | `Uncharted/` |

Validations to match the web (all pre-write):
- Body must be non-empty after trim.
- Only one structured destination: mutually exclusive `placement`, `landscape`, `identitySection`, `wisdom`. Throwing "one Studio destination" before writing.
- `decisionHorizon` only valid with `anchor === 'decisions'`.
- `unchartedHorizon` only valid with `placement === 'uncharted'`.
- Wisdom `source.url` must be `http` or `https` when present.
- Wisdom `themes` deduplicated, max 40.

Context-guided copy (web: `apps/studio/src/features/capture/field-guidance.ts` and `capture-context.ts`) — the capture sheet title, prompt, and placeholder change per destination. All copy is in one Swift file, not scattered in views.

Room pre-selects classification: opening capture from a room pre-selects that room's destination. The web does this via `captureMeaningForContext()` in `capture-context.ts`.

### 1.2 Attachments / media (cover images)
The web represents attached binary files as vault-relative paths in `attachments: [string]` (frontmatter, parsed by `packages/content/src/frontmatter-schema.ts` line 58) and the cover image as `display.cover: string` (same file, line 59). Both are already round-tripped byte-identically by `StudioNote.swift` / `NoteParser.swift`.

The web resolves a cover by reading the binary from the vault via `resolveCoverMedia()` in `packages/application/src/cover-media.ts`: it validates the vault-relative path (no traversal, no URI scheme, no absolute path, no `.studio*` segment), maps extension to MIME type (`.jpg/.jpeg/.png/.webp/.gif/.avif`), checks a 16 MB size cap, and sniffs magic bytes for four types (JPEG, PNG, WebP, GIF). Max size: `MAX_COVER_MEDIA_BYTES = 16 * 1024 * 1024`.

The web writes binary via `vault.writeBinaryAtomic()` (`packages/storage/src/vault-port.ts` line 91). The Rust core (`apple/AtelieraVaultCore/src/lib.rs`) currently only exposes `write_text` / `read_text`. **Binary write is a Rust core gap.**

Cover image folder convention: the web stores a cover at a path relative to the note — typically `Media/<filename>` (same directory or `Media/` subfolder). The `attachments` array holds additional per-note media at similar vault-relative paths.

---

## 2. Native design

### 2.1 New files to ADD

#### `apple/Ateliera/Capture/CaptureDestination.swift`
The Swift mirror of `packages/application/src/capture-metadata.ts` + `packages/domain/src/landscape.ts` + `packages/domain/src/identity.ts` + `packages/domain/src/wisdom.ts`. Pure value types, no UIKit/SwiftUI imports.

```swift
// Mirrors CapturePlacement from capture-metadata.ts
enum FoyerSlot: String, CaseIterable {
  case becoming = "foyer-becoming"
  case feeling  = "foyer-feeling"
  case principle = "foyer-principle"
}

// Mirrors LandscapeAnchor from domain/landscape.ts
enum LandscapeAnchor: String, CaseIterable {
  case vision               = "vision"
  case identityValuesFeelings = "identity-values-feelings"
  case decisions            = "decisions"
  case practices            = "practices"
  case structureStrategy    = "structure-strategy"
  // -> semanticTypeForLandscapeAnchor() matches TS golden
}

// Mirrors DecisionHorizon from domain/landscape.ts
enum DecisionHorizon: String, CaseIterable {
  case thirtyDays = "30d"
  case sixtyDays  = "60d"
  case ninetyDays = "90d"
  case someday    = "someday"
}

// Mirrors IdentitySection from domain/identity.ts (7 sections)
enum IdentitySection: String, CaseIterable {
  case alreadyTrue      = "already-true"
  case practicingNow    = "practicing-now"
  case valuesPrinciples = "values-principles"
  case desiredFeelings  = "desired-feelings"
  case beliefsPractice  = "beliefs-practice"
  case embodimentCues   = "embodiment-cues"
  case identityShifts   = "identity-shifts"
}

// Mirrors WisdomKind from domain/wisdom.ts (7 kinds)
enum WisdomKind: String, CaseIterable {
  case insight, quote, principle, practice, question, resource, synthesis
}

// The one structured destination a capture carries.
enum CaptureDestination {
  case quickCapture                  // no classification; inbox
  case foyer(FoyerSlot)
  case landscape(lifeArea: String, anchor: LandscapeAnchor, horizon: DecisionHorizon?)
  case identity(IdentitySection)
  case wisdom(kind: WisdomKind, themes: [String], source: NoteSource?, sourceNoteIds: [String]?)
  case uncharted(beyond: Bool)
}
```

Static helpers mirroring the TS domain:
- `semanticTypeForAnchor(_ anchor: LandscapeAnchor) -> String` — golden-matched to `semanticTypeForLandscapeAnchor`.
- `semanticTypeForWisdomKind(_ kind: WisdomKind) -> String` — golden-matched to `semanticTypeForWisdomKind`.
- `cardTypeForIdentitySection(_ section: IdentitySection) -> String` — golden-matched to `identitySectionDefinition`.
- `portableLifeAreaFolder(_ lifeArea: String) -> String` — port of `portableLifeAreaFolder` in `studio-service.ts`; NFC-normalise, strip control chars + `<>:"/\\|?*`, collapse repeated `-`, trim leading/trailing `. -`, cap at 64 code-points, fall back to `"Area"`, guard against Win32 reserved names.

#### `apple/Ateliera/Capture/CaptureGuidance.swift`
Swift mirror of `apps/studio/src/features/capture/field-guidance.ts`. Pure struct — no SwiftUI.

```swift
struct CaptureGuidance {
  let title: String
  let prompt: String
  let description: String
  let example: String

  static let generic: CaptureGuidance = CaptureGuidance(
    title: "Hold this thought",
    prompt: "What would you like remembered?",
    description: "Anything you want the Studio to hold — a thought, a line, a fragment. It doesn't need to be finished.",
    example: "e.g. Kept choosing rest today instead of pushing through."
  )
  // + static lets for each foyer slot, each landscape anchor (5), uncharted
  // All copy verbatim from field-guidance.ts — no paraphrase.
}

// Returns the CaptureGuidance for a given destination.
extension CaptureGuidance {
  static func forDestination(_ destination: CaptureDestination) -> CaptureGuidance { ... }
}
```

#### `apple/Ateliera/Capture/CaptureValidator.swift`
Stateless pure functions that reproduce the web's pre-write validation from `studio-service.ts` `capture()`. Returns `Result<Void, CaptureValidationError>`.

```swift
enum CaptureValidationError: Error, LocalizedError {
  case emptyBody
  case conflictingDestinations  // "one Studio destination"
  case decisionHorizonOutsideDecisionsAnchor
  case unchartedHorizonOutsideUncharted
  case wisdomSourceURLScheme(String) // must be http/https
  case wisdomTooManyThemes
  case wisdomDuplicateThemes
}
```

#### `apple/Ateliera/Capture/ClassifiedCaptureSheet.swift`
SwiftUI sheet replacing `NoteEditorSheet` for classified capture. Receives a `CaptureDestination` and displays context-specific guidance from `CaptureGuidance`. Sections:
1. Guidance header (title + prompt from `CaptureGuidance`).
2. Optional title field (shown for all except Foyer slots, where the body IS the card).
3. Body editor (`TextEditor`) with `description` as an inline hint and `example` as the placeholder.
4. Destination-specific extras (conditional, each in its own sub-view):
   - **Wisdom**: `WisdomKindPicker` (segmented-style or `Menu`), `WisdomThemesField` (comma-separated tag entry), `WisdomSourceFields` (title / creator / URL with http/https validation inline).
   - **Decisions**: `DecisionHorizonPicker` (30d / 60d / 90d / someday).
   - **Uncharted**: `UnchartedHorizonToggle` (near / beyond).
5. Confirm / Cancel toolbar — confirm disabled until body non-empty and validation passes.

Accessibility: each picker segment has an `accessibilityLabel`; the validation error announces via `.accessibilityAnnouncement`.

#### `apple/Ateliera/Media/VaultMediaStore.swift`
Binary media read/write through the Rust core. The core currently exposes `write_text`/`read_text` only; binary support requires a Rust core extension (see §2.3). Design for when that exists:

```swift
enum MediaError: Error {
  case pathUnsafe           // traversal / URI scheme / .studio segment
  case formatUnsupported    // not jpg/jpeg/png/webp/gif/avif
  case tooLarge(bytes: Int) // > 16 MB
  case magicMismatch        // sniff fails
  case vaultUnavailable(Error)
}

struct VaultMediaStore {
  static let maxBytes = 16 * 1_024 * 1_024   // mirrors MAX_COVER_MEDIA_BYTES

  // Pick from the photo library, validate, and write into vault at <notePath's folder>/Media/<sanitisedFilename>.
  // Returns the vault-relative path written (to store in note.display.cover or note.attachments).
  func importCoverImage(
    pickerItem: PhotosPickerItem,
    forNotePath notePath: String,
    vault: Vault
  ) async throws -> String

  // Read bytes for a vault-relative cover path. Validates path + magic bytes.
  func resolveCover(
    reference: String,
    fromNotePath notePath: String,
    vault: Vault
  ) async throws -> (data: Data, mimeType: String)
}
```

Path normalisation follows `cover-media.ts` `normalizeCoverPath()` exactly (same traversal rules). Magic byte sniffing: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `52 49 46 46...57 45 42 50`, GIF `47 49 46 38`.

#### `apple/AtelieraTests/CaptureDestinationTests.swift`
Unit tests for `CaptureDestination` logic (see §4).

#### `apple/AtelieraTests/ClassifiedCaptureGoldenTests.swift`
Golden-parity tests (see §4).

#### `apple/AtelieraTests/VaultMediaStoreTests.swift`
Tests for `VaultMediaStore` path validation + magic-byte sniffing.

#### `apple/AtelieraUITests/ClassifiedCaptureUITests.swift`
XCUITest for classified capture flow (see §4).

### 2.2 Files to MODIFY

#### `apple/Ateliera/VaultStore.swift`
Replace the current `capture(title:body:room:)` method with a fully classified version:

```swift
@discardableResult
func capture(
  title: String?,
  body: String,
  destination: CaptureDestination = .quickCapture
) -> Bool
```

Internally: validate via `CaptureValidator`, build `StudioNote` using `CaptureDestination` resolvers (cardType, semanticType, rooms, status, lifeAreas, landscapeAnchor, tags, source, sourceNoteIds, extraFrontmatter), compute the folder path (including `portableLifeAreaFolder` for landscape), then write atomically with retry (up to 8 attempts on `VaultError.Conflict`). Return false + set `self.error` on failure. The loop matches the web's `CAPTURE_ATTEMPTS = 8`.

Foyer captures: `status: active`, `display.featured: true`. Classified non-foyer captures: `status: active`. Quick captures: `status: draft`, `rooms: ["inbox"]`.

#### `apple/Ateliera/RootView.swift`
- Change `ActiveSheet.capture(room: String?)` to `ActiveSheet.capture(CaptureDestination)`.
- Foyer's "Add a reflection" quick-capture button stays as `.quickCapture`.
- Room capture buttons (currently `room-capture-button`) pass the room's mapped destination.
- Pass the new `ClassifiedCaptureSheet` for any destination that isn't `.quickCapture`.
- After P5/P6 rooms are added, the Landscape room's "+" opens capture with `.landscape(lifeArea:anchor:)` preset.

#### `apple/Ateliera/Rooms.swift`
Add the missing rooms needed by P5/P6 + the classified capture routing:

```swift
static let all: [Room] = [
  Room(id: "life-landscape", title: "Life Landscape", ...),
  Room(id: "identity-studio", title: "Identity Studio", ...),
  Room(id: "reflection-garden", title: "Reflection Garden", ...),
  Room(id: "inbox", title: "Inbox", ...),
  Room(id: "wisdom-garden", title: "Wisdom Garden", ...),
  Room(id: "uncharted", title: "Uncharted", ...),
]
```

Add `defaultDestination: CaptureDestination` to `Room` so the capture button can pre-select.

#### `apple/Ateliera/Note/StudioNote.swift`
Extend the `StudioNote` model with:
- `landscapeAnchor: String?` (already present per the serializer — confirm NoteParser reads it).
- No structural changes needed; classified capture writes notes with the same model.

Extend `StudioNote` with a factory used by `VaultStore.capture(destination:)`:

```swift
static func classified(
  id: String,
  created: String,
  title: String?,
  body: String,
  destination: CaptureDestination
) -> StudioNote
```

#### `apple/AtelieraVaultCore/src/lib.rs` (Rust core — binary write)
Add `write_binary` and `read_binary` UniFFI-exposed functions matching the text equivalents. This is the only non-Swift file changed in P7. The `write_binary` must honour the same path-guard (no traversal, no `.studio*`), use the same lock, and return `WriteOutcome`. `read_binary` returns `[UInt8]`. Once exposed, update the UniFFI header and regenerate `generated/ateliera_vault_core.swift` via `build.sh`.

> **Note:** If the Rust core extension lands in a later sprint, the media import path can be implemented using `FileManager` direct writes to the security-scoped vault URL as a temporary fallback, bypassing the Rust core's path-guard. This is lower safety but unblocks UI work. The fallback must be removed before shipping.

### 2.3 Rust core extension protocol

New Rust public functions to add to `lib.rs`:

```rust
#[uniffi::export]
pub fn write_binary(
    &self,
    path: String,
    bytes: Vec<u8>,
    create_new: bool,
) -> Result<WriteOutcome, VaultError>

#[uniffi::export]
pub fn read_binary(&self, path: String) -> Result<Vec<u8>, VaultError>
```

Same path-guard (`validate_path`) as `write_text`. `write_binary` must create intermediate directories if needed (`Media/` subfolder pattern).

---

## 3. Data / format — frontmatter fields and golden values

All fields are already in the web schema (`packages/content/src/frontmatter-schema.ts`) and the native serializer (`StudioNote.swift`). No new frontmatter keys are added in P7. P7 only populates fields that already exist but are currently left at their defaults in quick capture.

### 3.1 Field mapping by destination

| Destination | `card_type` | `semantic_type` | `rooms` | `life_areas` | `landscape_anchor` | `tags` | `extraFrontmatter` |
|---|---|---|---|---|---|---|---|
| Quick capture | `capture` | `reflection` | `[inbox]` | `[]` | — | `[]` | `{}` |
| `foyer-becoming` | `identity` | `foundations` | `[foyer, identity-studio]` | `[]` | — | `[]` | `{}` |
| `foyer-feeling` | `feeling` | `vision` | `[foyer, identity-studio]` | `[]` | — | `[]` | `{}` |
| `foyer-principle` | `principle` | `foundations` | `[foyer, identity-studio]` | `[]` | — | `[]` | `{}` |
| Landscape `vision` | `vision` | `vision` | `[life-landscape]` | `[lifeArea]` | `vision` | `[]` | `{}` |
| Landscape `identity-values-feelings` | `identity-values-feelings` | `foundations` | `[life-landscape]` | `[lifeArea]` | `identity-values-feelings` | `[]` | `{}` |
| Landscape `decisions` | `decisions` | `growth` | `[life-landscape]` | `[lifeArea]` | `decisions` | `[]` | `{ decision_horizon: horizon }` |
| Landscape `practices` | `practices` | `growth` | `[life-landscape]` | `[lifeArea]` | `practices` | `[]` | `{}` |
| Landscape `structure-strategy` | `structure-strategy` | `foundations` | `[life-landscape]` | `[lifeArea]` | `structure-strategy` | `[]` | `{}` |
| Identity `already-true` | `identity-truth` | `foundations` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `practicing-now` | `identity-emerging` | `growth` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `values-principles` | `principle` | `foundations` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `desired-feelings` | `feeling` | `vision` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `beliefs-practice` | `belief` | `foundations` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `embodiment-cues` | `embodiment-cue` | `growth` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Identity `identity-shifts` | `identity-shift` | `reflection` | `[identity-studio]` | `[]` | — | `[]` | `{}` |
| Wisdom `insight/quote/resource` | `insight`/`quote`/`resource` | `reflection` | `[wisdom-garden]` | `[]` | — | `themes` | `{}` |
| Wisdom `principle/synthesis` | `principle`/`synthesis` | `foundations` | `[wisdom-garden]` | `[]` | — | `themes` | `{}` |
| Wisdom `practice` | `practice` | `growth` | `[wisdom-garden]` | `[]` | — | `themes` | `{}` |
| Wisdom `question` | `question` | `uncharted` | `[wisdom-garden]` | `[]` | — | `themes` | `{}` |
| Uncharted (near) | `possibility` | `uncharted` | `[uncharted]` | `[]` | — | `[]` | `{}` |
| Uncharted (beyond) | `possibility` | `uncharted` | `[uncharted]` | `[]` | — | `[]` | `{ beyond_gate: true }` |

`status` = `active` for all classified; `draft` for quick-capture.
`display.featured` = `true` for foyer placements only; `false` for all others.

### 3.2 Folder / path convention (cite: `studio-service.ts` lines 1059–1068)

```
quick capture:    Inbox/<suggestFilename>
foyer-becoming:   Foyer/<suggestFilename>
foyer-feeling:    Foyer/<suggestFilename>
foyer-principle:  Foyer/<suggestFilename>
landscape:        Life Landscape/<portableLifeAreaFolder(lifeArea)>/<suggestFilename>
identity:         Identity Studio/<suggestFilename>
wisdom:           Wisdom Garden/<suggestFilename>
uncharted:        Uncharted/<suggestFilename>
```

`portableLifeAreaFolder` algorithm (must be golden-tested):
1. `String.normalize(.nfc)` the lifeArea string.
2. Replace code-points `< 32` or `== 127` with `-`.
3. Replace `[<>:"/\\|?*]` with `-`.
4. Collapse repeated `-` to single `-`.
5. Trim leading/trailing spaces, `.`, `-`.
6. Slice to 64 Unicode scalars.
7. If empty, return `"Area"`.
8. If matches case-insensitively `CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]`, return `"Area"`.

### 3.3 Golden values to capture from the TS engine

Run a throwaway vitest (`pnpm --filter @studio/application exec vitest run`) with the following assertions, capture the output, and hard-code them as `XCTAssertEqual` values in `ClassifiedCaptureGoldenTests.swift`:

```typescript
// In a throwaway test file in packages/application/src:
import { semanticTypeForLandscapeAnchor } from '@studio/domain';
import { semanticTypeForWisdomKind } from '@studio/domain';
import { identitySectionDefinition } from '@studio/domain';
// portableLifeAreaFolder is not exported; copy it inline or call service.capture
// with known landscape inputs and inspect the resulting path.

// Capture golden values:
console.log(semanticTypeForLandscapeAnchor('vision'));                   // 'vision'
console.log(semanticTypeForLandscapeAnchor('identity-values-feelings')); // 'foundations'
console.log(semanticTypeForLandscapeAnchor('decisions'));                 // 'growth'
console.log(semanticTypeForLandscapeAnchor('practices'));                 // 'growth'
console.log(semanticTypeForLandscapeAnchor('structure-strategy'));        // 'foundations'

console.log(semanticTypeForWisdomKind('insight'));    // 'reflection'
console.log(semanticTypeForWisdomKind('principle'));  // 'foundations'
console.log(semanticTypeForWisdomKind('practice'));   // 'growth'
console.log(semanticTypeForWisdomKind('question'));   // 'uncharted'
console.log(semanticTypeForWisdomKind('synthesis')); // 'foundations'

console.log(identitySectionDefinition('already-true').cardType);      // 'identity-truth'
console.log(identitySectionDefinition('practicing-now').cardType);    // 'identity-emerging'
console.log(identitySectionDefinition('beliefs-practice').cardType);  // 'belief'
console.log(identitySectionDefinition('embodiment-cues').cardType);   // 'embodiment-cue'
console.log(identitySectionDefinition('identity-shifts').cardType);   // 'identity-shift'

// portableLifeAreaFolder — call service.capture and inspect path:
const svc = createStudioService({ vault: createInMemoryVault(), index: new RecordingIndex() });
const result = await svc.capture({ body: 'x', landscape: { lifeArea: 'family', anchor: 'vision' } });
console.log(result.path); // 'Life Landscape/family/...'
// edge cases:
// lifeArea: 'Work & Money' -> 'Life Landscape/Work---Money/...' (& becomes -, two spaces become -)
// lifeArea: 'CON' -> 'Life Landscape/Area/...'
// lifeArea: '' -> 'Life Landscape/Area/...'
```

Cover path validation — the golden set from `cover-media.ts` tests:
- `'Media/photo.jpg'` relative to `'Reflection Garden/note.md'` → resolves to `'Reflection Garden/Media/photo.jpg'`
- `'../evil.md'` → invalid (escapes)
- `'javascript:alert(1)'` → invalid (URI scheme)
- `'/absolute.jpg'` → invalid (absolute)

---

## 4. TDD plan

### 4.1 Unit tests — `AtelieraTests/CaptureDestinationTests.swift`

Write these tests **before** writing production code. Each test must fail first.

```
testSemanticTypeForLandscapeAnchor_allFiveAnchors()
  — assert each anchor returns the golden semanticType (Table §3.1)

testSemanticTypeForWisdomKind_allSevenKinds()
  — assert each kind returns the golden semanticType

testCardTypeForIdentitySection_allSevenSections()
  — assert each section returns the golden cardType

testPortableLifeAreaFolder_ascii()
  — "family" -> "family", "Work & Money" -> "Work---Money" (or whatever TS returns)
  — edge: empty string -> "Area"
  — edge: "CON" -> "Area"
  — edge: 70-char string -> 64-char result

testPortableLifeAreaFolder_controlChars()
  — lifeArea with embedded tab -> replaced with "-"

testCaptureValidator_rejectsEmptyBody()
testCaptureValidator_rejectsConflictingDestinations()
testCaptureValidator_rejectsDecisionHorizonOutsideDecisions()
testCaptureValidator_rejectsUnchartedHorizonOutsideUncharted()
testCaptureValidator_rejectsWisdomSourceNonHttp()
testCaptureValidator_acceptsValidWisdomSourceHttps()
testCaptureValidator_deduplicatesWisdomThemes()
testCaptureValidator_rejectsTooManyWisdomThemes()
```

### 4.2 Golden-parity tests — `AtelieraTests/ClassifiedCaptureGoldenTests.swift`

```
testFoyerBecomingMetadata_matchesWebCapturePlacement()
  — StudioNote built for .foyer(.becoming) has cardType="identity",
    semanticType="foundations", rooms=["foyer","identity-studio"],
    status="active", display.featured=true

testLandscapeDecisionsWithHorizon_roundTrips()
  — capture into decisions anchor with horizon="60d"
  — serialize -> parse -> extraFrontmatter["decision_horizon"] == "60d"

testUnchartedBeyond_roundTrips()
  — capture .uncharted(beyond: true)
  — serialize -> parse -> extraFrontmatter["beyond_gate"] == true

testWisdomWithSource_roundTrips()
  — capture wisdom(kind: .synthesis, themes: ["rest","identity"], source: NoteSource(url: "https://example.com"), sourceNoteIds: ["abc"])
  — serialize -> parse -> source.url == "https://example.com", sourceNoteIds == ["abc"], tags == ["rest","identity"]

testPortableLifeAreaFolder_goldenMatchesTS()
  — hard-code TS-captured golden value for "family", "Work & Money", "CON", ""
  — XCTAssertEqual(CaptureDestination.portableLifeAreaFolder("family"), "family")
  — [one assert per golden case captured in §3.3]

testFolderForDestination_landscape_usesPortableLifeAreaFolder()
  — folder for .landscape(lifeArea: "family", anchor: .vision, horizon: nil)
    starts with "Life Landscape/family/"

testFolderForDestination_identity_isIdentityStudio()
  — folder for .identity(.alreadyTrue) starts with "Identity Studio/"

testFolderForDestination_wisdom_isWisdomGarden()
  — folder for .wisdom(kind: .insight, ...) starts with "Wisdom Garden/"
```

### 4.3 Write tests — `AtelieraTests/ClassifiedCaptureWriteTests.swift` (extend `CaptureWriteTests.swift` or new file)

```
testClassifiedCaptureWritesToCorrectFolder()
  — VaultStore.capture(destination: .identity(.alreadyTrue)) writes to Identity Studio/
  — vault.list() finds exactly one file under Identity Studio/

testLandscapeCaptureWithHorizonWritesDecisionHorizonKey()
  — VaultStore.capture(destination: .landscape(lifeArea: "family", anchor: .decisions, horizon: .sixtyDays))
  — read back, parse -> extraFrontmatter["decision_horizon"] == "60d"

testWisdomCaptureDeduplicatesThemes()
  — VaultStore.capture(destination: .wisdom(kind: .insight, themes: ["rest","rest"], ...))
  — parse -> tags == ["rest"]  (length 1)

testConflictingDestinationsAreRejectedBeforeWriting()
  — attempt identity + wisdom destination simultaneously -> returns false, vault empty

testCollisionRetryProducesUniqueFiles()
  — exercise the 8-attempt loop by seeding first id collision
```

### 4.4 Media tests — `AtelieraTests/VaultMediaStoreTests.swift`

```
testNormalizeCoverPath_validRelative()
  — "Media/photo.jpg" relative to "Reflection Garden/note.md" -> "Reflection Garden/Media/photo.jpg"

testNormalizeCoverPath_rejectsTraversal()
  — "../secret.jpg" relative to "notes/note.md" -> nil

testNormalizeCoverPath_rejectsAbsolute()
  — "/root.jpg" -> nil

testNormalizeCoverPath_rejectsURIScheme()
  — "https://example.com/x.jpg" -> nil

testNormalizeCoverPath_rejectsStudioSegment()
  — ".studio-revision" -> nil

testMagicByteSniffer_jpg()
testMagicByteSniffer_png()
testMagicByteSniffer_webp()
testMagicByteSniffer_gif()
testMagicByteSniffer_rejectsUnsupportedFormat()
testMagicByteSniffer_respectsSizeCap()
```

### 4.5 UI tests — `AtelieraUITests/ClassifiedCaptureUITests.swift`

```
testIdentityCaptureFromRoom()
  — navigate to Identity Studio room (added in P5)
  — tap room capture button -> ClassifiedCaptureSheet appears pre-selected to identity
  — fill body, tap Keep
  — note appears in room with identity card type

testWisdomCaptureWithKindPicker()
  — navigate to Wisdom Garden
  — tap capture, select kind "Insight", add a theme tag "rest"
  — fill body, tap Keep
  — note appears in Wisdom Garden

testDecisionHorizonPicker()
  — navigate to Life Landscape, select a life area, tap Decisions anchor capture
  — ClassifiedCaptureSheet shows horizon picker (30d/60d/90d/someday)
  — select 60d, fill body, tap Keep
  — read file back and confirm decision_horizon frontmatter key
  — (accessibility): horizon picker options have accessibilityLabel

testFoyerCaptureSetsDisplayFeatured()
  — capture foyer-becoming from Foyer
  — read back: display.featured == true
```

---

## 5. Dependencies

### 5.1 Earlier phases required
- **P1** (full metadata editing): P7's classified capture writes `semanticType`, `cardType`, `status`, `lifeAreas`, `landscapeAnchor`, `source`, `sourceNoteIds`, `tags`. If the note editor doesn't already read/write these fields, classified captures would be write-only. P7's write path is independent but the *review/edit* flow for a classified note requires P1's full editor.
- **P5** (Life Landscape + Identity Studio): The Landscape and Identity capture destinations need the room screens to provide the context (which life area, which anchor, which section). P7's `CaptureDestination` types and `VaultStore.capture(destination:)` can be coded and unit-tested before P5, but the UI triggers live in P5's room views.
- **P6** (Wisdom Garden + Uncharted): Same — wisdom and uncharted capture destinations need room views from P6.

### 5.2 Shared contracts
- **`StudioNote` byte-identical serializer** (already golden-tested): all new fields (`landscapeAnchor`, `extraFrontmatter` keys, `source`, `sourceNoteIds`, `tags`) are already serialized by `StudioNote.serialize()`. No changes needed there.
- **`NoteParser`** (already round-trips unknowns): `NoteParser.parse()` must correctly read `landscape_anchor`, `life_areas`, `source_notes`, `display.featured` for the write tests to work. Confirm this is covered in `NoteParserTests.swift` before writing P7 tests.
- **`VaultStore.capture()` signature change**: all callers in `RootView.swift` and the UITest suite must be updated atomically with the signature change.
- **Rust core binary extension**: `VaultMediaStore` cannot ship without the Rust core `write_binary`/`read_binary` functions. This is the only external dependency in P7.

---

## 6. Risks + smallest first vertical slice

### Risks
1. **Rust core binary gap**: `write_binary` is the only blocking gap for media. If Rust work is delayed, the path-validation and magic-byte logic can be unit-tested without it, and `VaultMediaStore.importCoverImage` can fall back to `FileManager` writes scoped to the security-scoped URL (lower safety, mark as `#if DEBUG`-gated fallback).
2. **`portableLifeAreaFolder` correctness**: The NFC + control-char + Win32 reserved-name algorithm is subtle. Golden-test it against the TS output for at least 6 edge cases before wiring it into folder paths.
3. **Sheet pre-selection after P5/P6**: `ClassifiedCaptureSheet` needs to receive a `CaptureDestination` from context that doesn't exist until P5/P6 room screens are built. Mitigation: implement `ClassifiedCaptureSheet` with a destination parameter from day one; P5/P6 only need to pass the right value.
4. **`NoteParser` reading `landscape_anchor`**: confirm this field is parsed before writing classified landscape notes; if not, add the parser test + fix as a prerequisite task within P7.

### Smallest first vertical slice

**Slice 1 — `CaptureDestination` + `CaptureValidator` + unit tests (no UI)**
Write `CaptureDestination.swift`, `CaptureValidator.swift`, and `CaptureDestinationTests.swift`. All of §4.1 goes green. No VaultStore changes, no UI. Deliverable: a pure Swift module that knows all 5 structured destinations, produces the right metadata, validates inputs, and has golden-matched semantic types. This is the safe foundation that P5/P6 can build on.

**Slice 2 — `VaultStore.capture(destination:)` + write tests**
Replace `VaultStore.capture(title:body:room:)` with the classified signature and write `ClassifiedCaptureWriteTests`. All classified notes write to the correct folder with the correct frontmatter. Deliverable: a working classified write path confirmed against the vault.

**Slice 3 — `ClassifiedCaptureSheet` + `CaptureGuidance` + one UI test**
Build the sheet with guidance copy and the wisdom/horizon/uncharted extras. Wire one UITest: identity capture from Foyer. This is the user-visible milestone and the gate for P5/P6 integration.

**Slice 4 — Media (cover image)**
Add `write_binary`/`read_binary` to the Rust core, generate the Swift bindings, build `VaultMediaStore`, and write `VaultMediaStoreTests`. Wire a `PhotosPicker` to `ClassifiedCaptureSheet`'s cover field.
