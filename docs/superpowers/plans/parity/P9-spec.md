# P9: Onboarding, Progressive Disclosure, Settings, Foyer Richness — Swift Native Spec

**Phase:** P9 (final, polish tier)  
**Status:** Implementation ready  
**Effort:** M–L  
**Value:** Medium (first-run experience + settings depth + calendar closure)

---

## Summary

P9 delivers calm onboarding for new Ateliera studios and progressive disclosure of advanced rooms via Settings, then enriches the Foyer homepage with three data-fed sections (becoming, desired feelings, principles) and rhythm-layer visibility toggles. Native app starts small, reveals rooms gently via Settings→RoomsSettings + guided invitation card, and Foyer surface deepens once Identity Studio (P1 metadata) and Current Season (P6) feed the projection. The tour preview cards and seeded examples are web-only (Playwright cost is unjustified on native); the invite mechanism and Settings toggles are the gate. Small first vertical: room-visibility toggles in Settings + responsive Foyer hiding sections when not ready (no Identity/Season data yet).

---

## 1. Scope — Web Features to Match

### Onboarding & First Visit (web: `apps/studio/src/features/onboarding/`)

- **Entry gate** (`StudioEntryGate.tsx`): create-or-open decision, folder picker (native: already have)
- **First-visit tour** (`FirstVisitGuide.tsx`): modal guide (5 rooms: foyer, landscape, season, uncharted, reflection); optional, resumable, no spotlight overlay
- **Room reveal invitation** (`RoomRevealInvitation.tsx`, `room-reveal.ts`): gentle card inviting optional rooms into view after early activity, tied to room-visibility state
- **Tour examples** (`tour-examples.ts`, `TourPreview.tsx`): sparse furnished-preview cards showing example content (Foyer becoming, landscape cell, season priorities); **skipped on native** (no visual snapshots, no Playwright cost)

### Settings & Preferences (web: `apps/studio/src/features/settings/`)

- **Room-visibility toggles** (`RoomsSettings.tsx`, `room-visibility.ts`): per-room on/off switch; core rooms (Foyer, Landscape) always on, utility (Search, Settings) always on, optional (Identity, Season, Uncharted, Wisdom, Reflection, Inbox) start off for new Studios
- **Foyer-section toggles** (`room-visibility.ts`, `isFoyerSectionVisible`): per-section on/off (becoming, gift, feelings, principles, almanac, seasonPreview, returnCard, cover); new Studios hide all but becoming + gift + almanac
- **Rhythm-layer toggles** (`RhythmLayersSettings.tsx`, `rhythm-layers.ts`): moon, microSeason, cycle (all default on); moonlight and cycle have minimal runtime cost (both read-only); almanac hides when every layer is off
- **Stored preferences** (`use-studio-preferences.ts`): `StoredStudioPreferences` (app layer) → `{ rooms: Record<RoomId, 'off'>, foyerSections: Record<SectionId, 'off'>, rhythm: { moon, microSeason, cycle } }`; seeded `NEW_STUDIO_PREFERENCES` for new Studios

### Rich Foyer (web: `apps/studio/src/features/foyer/`)

- **Becoming** (`Becoming.tsx`): the Identity Studio's `currentlyBecoming` card (who you're practicing becoming); create or open button when null; populated by P1 Identity feature
- **Desired Feelings** (`Feelings.tsx`): up to 3 cards from Identity Studio's "Desired Feelings" section; create button when empty
- **Principles** (`Principles.tsx`): up to 3 cards from Identity Studio's "Values & Principles" section
- **Almanac** (`TodaysAlmanac.tsx`): rhythm context (season, moon, cycle, orientation); already native via `AlmanacView`; hides if every rhythm layer is off
- **Today's Gift** (`TodaysGift.tsx`): SM-2 resurface card; already native (P3); shown when gift exists
- **Season preview** (`SeasonPreview.tsx`): the active Season card + priorities; populated by P6 Season feature
- **Return card** (`ReturnCard.tsx`): gentle invitation back to a note you set down (resurrection mechanic); skipped on native (no resurrect engine yet)
- **Cover image** (`FoyerImage`): optional photograph with caption; skipped on native (P7 media, defer to P7+)

---

## 2. Native Design — Swift Files & API Contract

### New Files to Add

```
apple/Ateliera/
├── Settings/
│   ├── SettingsView.swift               # Top-level Settings room (sheet or nav)
│   ├── RoomsSettings.swift              # Room-visibility toggles
│   ├── FoyerSectionsSettings.swift      # Foyer-section toggles
│   └── RhythmLayersSettings.swift       # Moon/microSeason/cycle toggles
├── Onboarding/
│   ├── OnboardingState.swift            # Entry gate + tour state machine
│   ├── FirstVisitGuide.tsx              # Tour modal (5 steps)
│   ├── RoomRevealInvitation.swift       # Card inviting optional rooms
│   └── tour-guide.swift                 # Copy & step definitions
├── Foyer/
│   ├── BecomingCard.swift               # Identity-fed becoming section
│   ├── DesiredFeelingsCard.swift        # Identity-fed feelings section
│   ├── PrinciplesCard.swift             # Identity-fed principles section
│   └── FoyerRichView.swift              # Composited sections with visibility gate
```

### Existing Files to Modify

1. **RootView.swift** (Foyer container)
   - Add Settings button to studio bar → sheet presentation
   - Replace hardcoded "ROOMS" list with visibility-gated `Room.all.filter { isRoomVisible($0.id) }`
   - Wrap Foyer sections in FoyerRichView (replaces current roomsSection)
   - Pass `rhythmLayers` to FoyerRichView

2. **Room.swift** (room definitions)
   - Add `kind` field (core/utility/optional)
   - Update `Room.all` to sort by kind

3. **VaultStore.swift** (data projection)
   - Add `studyPreferences: StoredStudioPreferences?` property
   - Load/save from UserDefaults or `.studio/settings.json` when vault is opened
   - Add `projectFoyer()` -> `FoyerProjection` (becoming, feelings, principles, season)

4. **SharedStore.swift** (UserDefaults persistence)
   - Add preferences storage key + encode/decode helpers

---

### Types & Contracts

#### Preferences (persist to `.studio/settings.json` or UserDefaults)

```swift
struct StoredStudioPreferences: Codable {
  var rooms: [String: String]?         // [roomId: "off"], omitted = on
  var foyerSections: [String: String]? // [sectionId: "off"], omitted = on
  var rhythm: RhythmPreferences?
  
  struct RhythmPreferences: Codable {
    var moon: Bool = true
    var microSeason: Bool = true
    var cycle: Bool = true
  }
}
```

#### Visibility Resolvers (match web exactly)

```swift
// core/utility always true; optional default true, off unless explicit "off"
func isRoomVisible(_ id: String, preferences: StoredStudioPreferences?) -> Bool

// section default true, off unless explicit "off"
// almanac additionally hides if every rhythm layer is off
func isFoyerSectionVisible(
  _ id: String, 
  preferences: StoredStudioPreferences?, 
  rhythmLayers: RhythmLayers
) -> Bool
```

#### Foyer Projection (populated by room selects when data exists)

```swift
struct FoyerProjection {
  var becoming: NoteSummary?              // Identity.currentlyBecoming
  var feelings: [NoteSummary] = []        // Identity["Desired Feelings"]
  var principles: [NoteSummary] = []      // Identity["Values & Principles"]
  var season: NoteSummary?                // Season active + status=active
  var priorities: [NoteSummary] = []      // Season.priorities
}
```

#### Entry / Tour State

```swift
enum EntryPhase {
  case choosingLocation
  case creatingSpace
  case openingSpace
  case preparingRooms
  case ready
}

enum OnboardingMode {
  case new      // First-visit tour invited
  case resume   // Tour resumable from Settings
  case none     // Skipped or dismissed
}

struct OnboardingState: Codable {
  var mode: OnboardingMode
  var currentStep: String?  // foyer, landscape, season, uncharted, reflection
}
```

---

## 3. Data & Format — Frontmatter & Golden Values

### Frontmatter Fields (Already Round-Trip via P1)

**Identity Studio** notes carry:
```yaml
semantic_type: identity
identity_section: currently-becoming | values-principles | desired-feelings | ...
```

**Current Season** note carries:
```yaml
semantic_type: season
status: draft | active | archived
season_priorities: [id1, id2, id3]  # backlinks
```

**Foyer Cover Image** (P7+, defer):
```yaml
# In foyer's dedicated note or as attachment metadata
foyer_cover_image: path/to/image.jpg
```

### Golden Tests & Parity

- **Room visibility logic**: unit test that `isRoomVisible(id, newStudioPrefs)` matches web's `resolveRoomVisibility` exactly (core/utility on, optional off for new studios)
- **Foyer-section gating**: test `isFoyerSectionVisible("almanac", prefs, layers)` returns false when all rhythm layers are off (match web exactly)
- **Preference serialization**: round-trip `.studio/settings.json` or UserDefaults → struct → JSON == input (no secret keys lost)
- **Projection queries**: `VaultStore.projectFoyer()` selects notes matching `(semanticType="identity" AND identitySection="currently-becoming")` etc., compare count/titles against seeded vault

---

## 4. TDD Plan

### Unit Tests

1. **PreferencesTests.swift**
   - `testRoomVisibilityNewStudio`: core on, optional off
   - `testRoomVisibilityExistingStudio`: all on if prefs nil
   - `testFoyerSectionVisibilityAlmanacGate`: almanac hides when all rhythm layers off
   - `testPreferencesCodable`: round-trip UserDefaults

2. **OnboardingStateTests.swift**
   - `testInitialState`: entry phase
   - `testCreateFlow`: choosing → creating → ready
   - `testTourProgression`: foyer → landscape → season → uncharted → reflection
   - `testDismissTour`: tour-dismissed mode persists

3. **FoyerProjectionTests.swift** (golden)
   - Parse seeded vault with Identity + Season notes
   - `testBecomingCard`: select currently-becoming, compare title/id
   - `testFeelingsCards`: select up to 3 from desired-feelings, verify count
   - `testPrinciplesCards`: select up to 3 from values-principles
   - `testSeasonPreview`: select active season + its priorities

### UI Tests (XCUITest, iOS-only for now)

1. **FirstVisitTourTests.swift**
   - Launch new Studio → entry gate renders
   - Tap "Create new Studio" → preparing state
   - Tour step 1 (Foyer) guide modal appears
   - Tap "Next room" → step 2 (Landscape)
   - Tap "Leave tour" → dismisses, enters active state
   - Verify tour state persists on app relaunch (resume-tour in Settings)

2. **RoomsSettingsTests.swift**
   - Open Settings → Rooms section
   - Toggle optional room off → disappears from Foyer rooms list
   - Toggle back on → re-appears
   - Verify Settings persists across app relaunch

3. **FoyerSectionsSettingsTests.swift**
   - Open Settings → Foyer Sections
   - Toggle "Becoming" off → Becoming card hidden in Foyer (no create button)
   - Capture an Identity/"currently-becoming" note
   - Toggle "Becoming" on → card appears on Foyer
   - Verify rhythm-layer gate: turn all rhythm layers off → almanac hides

---

## 5. Dependencies

### Hard Dependencies (must be complete before P9 starts)

- **P1 (Note Depth)**: Foyer becoming/feelings/principles cards need Identity metadata (`semanticType`, `identitySection`); must read/write these fields byte-identically
- **VaultStore completion**: `projectFoyer()` helper to query by semantic type + section; requires P1's frontmatter parsing
- **Rhythm-layers data**: `RhythmContext.moon`, `RhythmContext.microSeason`, `RhythmContext.cycle` already in Rhythm engine; just need preferences toggles

### Soft Dependencies / Later Phases

- **P3 (The Gift)**: "Today's Gift" already native; settings toggle just hides/shows it
- **P5 (Identity Studio room)**: populates Foyer becoming/feelings/principles; until P5, these sections remain empty (hidden by default in new Studios)
- **P6 (Season authoring)**: populates season preview + priorities; until P6, season section is empty
- **P7 (Media + classified capture)**: cover image + returnCard (resurrection); defer to P7+ (not critical path for onboarding)

### Shared Contracts

- **Preferences format**: match web's `StoredStudioPreferences` (rooms/foyerSections/rhythm keys)
- **Room definitions**: ROOMS list with id/name/kind matches web's `room-visibility.ts` ROOMS array (for labels in UI)
- **Tour copy**: FirstVisitGuide text matches web's `tour-guide.tsx` exactly (copy is part of product contract)

---

## 6. Risks & Smallest Vertical Slice

### Risks

1. **Preferences persistence**: UserDefaults vs `.studio/settings.json` — decide early (UserDefaults simpler on-device, JSON more portable). Recommend UserDefaults for P9, add JSON export in P8.
2. **Tour state machine**: five-step tour with resume + dismiss is moderately complex (especially dismiss-on-resume semantics). Mitigate with thorough unit tests before UI tests.
3. **Empty Foyer sections**: until P5/P6, Becoming/Feelings/Principles/Season cards are always empty. Foyer must gracefully hide these sections in new Studios (toggle off by default). Risk: Settings-toggle confusion if user expects content but toggles it on.
4. **Rhythm-layer gate on almanac**: tricky conditional: section-toggle AND (moon OR microSeason OR cycle). Unit test this exactly.

### Smallest First Vertical Slice

**Goal**: Room-visibility toggles work end-to-end; Foyer respects visibility.

1. Add `StoredStudioPreferences` struct + UserDefaults persistence
2. Add `isRoomVisible()` resolver
3. Modify `RootView.roomsSection` to filter by visibility
4. Add `SettingsView.swift` with mock Rooms panel (button list, toggle state, no network)
5. Add unit tests for visibility logic
6. Verify: new Studio starts with optional rooms hidden, toggle room on/off in Settings, Foyer rooms list updates

**Follow-up slices:**
- Foyer-section toggles + rhythm-layer toggles (same Settings pattern)
- Tour state machine + FirstVisitGuide modal
- Room-reveal invitation card (lightweight; gated on "activity threshold")
- FoyerRichView with Identity-/Season-fed cards (requires P1 projection helpers)

---

## 7. Implementation Checklist

- [ ] Add `StoredStudioPreferences` struct to `SharedStore.swift`
- [ ] Add `isRoomVisible()` / `isFoyerSectionVisible()` resolver functions
- [ ] Unit tests for visibility logic (golden: match web exactly)
- [ ] Add `SettingsView.swift` + room/section/layer toggle panels
- [ ] Modify `RootView` to gate rooms/sections by visibility + Settings button
- [ ] Add `OnboardingState` struct + persistence
- [ ] Add `FirstVisitGuide.swift` (5-step modal + copy)
- [ ] Unit tests for tour state machine
- [ ] XCUITest: new studio → tour → settings room-toggle
- [ ] `VaultStore.projectFoyer()` helper (queries by semantic type + section)
- [ ] Add Foyer-rich components: `BecomingCard.swift`, `DesiredFeelingsCard.swift`, `PrinciplesCard.swift`
- [ ] FoyerRichView: compose sections with visibility + data checks
- [ ] Golden tests: Foyer projection queries match expected cards
- [ ] Verify all 48+ unit tests + 6+ UI tests green on iOS + macOS

---

## 8. Key Decisions

1. **Preferences storage**: UserDefaults (on-device, simple); `.studio/settings.json` export added in P8
2. **Tour presentation**: modal aside (matching web's FirstVisitGuide), non-dismissible mid-tour (only "Leave" button), dismissible on completion
3. **Room reveal invitation**: skipped in P9 (minimal data to decide if threshold met); add as P8 follow-up when diagnostics/repair engine exists
4. **Foyer cover image**: skipped in P9 (P7 media gate); section toggle exists, renders placeholder until P7
5. **Return card**: skipped (no resurrection/repair engine yet); toggle exists for future parity
6. **Tour examples**: skipped on native (no visual snapshots; Playwright cost unjustified in native); Settings offers tour replay instead
7. **New Studio template**: seeded `NEW_STUDIO_PREFERENCES` hides optional rooms + most Foyer sections (becoming + gift + almanac only); existing Studios show everything (absent prefs = all on)

---

## Hard Dependencies Summary

- **P1 complete**: Identity metadata parsing + serialization
- **VaultStore.projectFoyer()**: room-filter queries (can stub empty initially)
- **Rhythm engine complete**: moon/microSeason/cycle context available

**Unblocked by**: P3, P5, P6, P7 (each populates Foyer sections or Settings toggles; phase can ship partially)

---

## Context for Anna

P9 is polish-tier but **gates the first-run experience**. A new Studio should feel small and calm, not overwhelming with 10 rooms. The onboarding tour (optional, resumable, no screenshots) and Settings toggles (room visibility + Foyer sections + rhythm layers) are the mechanism. Until P5/P6 exist, Foyer sections (becoming/feelings/principles/season) are hidden by default, so the homepage stays simple: just the almanac, gift, and "ROOMS" list (2–3 rooms initially).

The Settings room is new; I'm structuring it as a vertical scrollable panel with 3–4 sections (Rooms, Foyer Sections, Rhythm Layers, maybe Portability/About). No theme switcher (P2 deferred) or diagnostics (P8 deferred) yet.

Tour state is simple: a boolean "is touring" + a string step (foyer/landscape/season/uncharted/reflection), both in UserDefaults. Dismissing the tour clears it. Resuming re-enters the same step. Golden test: `NEW_STUDIO_PREFERENCES` exactly matches web's initialization.
