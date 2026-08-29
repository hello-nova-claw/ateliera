# Development log

## 2026-08-28 — Native parity Phase P1: note depth (metadata editing + wikilinks)

- First parity phase, per `docs/superpowers/plans/parity/`. **The spine everything
  else builds on.** Shipped:
  - `NoteMetadata.swift` — the single typed vocabulary (SemanticType, NoteStatus,
    Sensitivity, AiAccess, LandscapeAnchor, defaultLifeAreas, knownCardTypes),
    golden-matched to `@studio/domain`. Later phases import, never redeclare.
  - `VaultStore.saveEdit(_:updatedNote:)` — the one canonical full-note write rail
    (atomic, expected-hash, whole-model re-serialize so unknown keys survive);
    the title/body editor is now a thin wrapper over it. `NoteSummary` extended
    (status/semanticType/tags/lifeAreas/landscapeAnchor/featured/noteId) and a
    `parsedNotes: [StudioNote]` cache added to `reload()` for later room projections.
  - `MetadataEditorView` — a Form editing every field (type/status, rooms, tags,
    life-areas, seasons, landscape anchor, source, privacy, display); reached via a
    "Details" screen from the redesigned `NoteEditView`.
  - `WikilinkParser` (golden-matched to `links.ts`: same regex, code-span/fence
    skipping, dedup by lower-cased target) + `WikilinkNavigator` (title / studio://
    note/id → path) + a `BodyPreviewView` with tappable link pills and a Preview
    toggle in the edit sheet; tapping a link opens the target note (or a "not found"
    alert).
- Every metadata field round-trips byte-identically (unknown keys preserved).
  **77 unit + 9 UI tests green; both platforms build.** (The multi-agent
  BUILD-PLAN's contracts held: one write rail, one vocabulary source, one summary.)
- Next on the serial spine: P4-core (index/link graph), then P5. Parallel-safe:
  P2 themes, P3 the Gift.

## 2026-08-28 — Native Apple app, Phase N5: grow the rooms (Foyer + room navigation)

- The app is no longer a single screen. The home is now a **Foyer** — the almanac,
  "Your rhythm", a **ROOMS** section, and a **RECENTLY** list of all notes — inside a
  `NavigationStack`. Rooms (Reflection Garden, Inbox, Wisdom Garden) are data-driven
  views that filter the vault by a note's `rooms` frontmatter; tapping one pushes a
  `RoomView` with that room's heading + notes, tap-to-edit.
- The minimal list parser now reads the `rooms` block (and inline/empty forms); the
  seeded demo notes carry `rooms: [reflection-garden]`. `NoteRow` extracted so the
  Foyer and room views share it.
- Tests: `RoomsTests` (parse a block list / empty / missing; membership filtering)
  and a UI test that captures a note, steps into the Inbox room, and confirms it's
  there (using the room's unique intro as the presence signal). Note: value-based
  `NavigationLink` + `navigationDestination` didn't register taps reliably under
  XCUITest in a ScrollView — switched to the **direct-destination** `NavigationLink`
  form, which does. 41 unit + 5 UI tests green; both platforms build
  (`artifacts/ios/native-n5-foyer.png`).
- **Room-specific capture.** Each `RoomView` now has an "Add to <room>" button; it
  captures a note tagged to that room (`rooms: [<room>]`) and writes it into the
  room's folder (`Room.folderName(for:)`), while the Foyer's capture still defaults
  to Inbox. `StudioNote.capture`/`VaultStore.capture` gained a `room` parameter.
  Unit tests (factory tags the room, folder names) + a UI test (step into Wisdom
  Garden, capture there, see it land). 43 unit + 6 UI tests green.
- **Ecosystem (start): Siri / Shortcuts.** A `TodaysRhythmIntent` (App Intents,
  no extension target needed) speaks/returns a one-line almanac —
  `RhythmSummary.line` over the pure rhythm engine, hemisphere from the last
  location fix — exposed via an `AppShortcutsProvider` with Siri phrases ("Today's
  rhythm in Ateliera"). `LocationHemisphere.persisted` made `nonisolated` so the
  intent can read it off the main actor. 2 unit tests for the summary line. 45 unit
  + 6 UI tests green.
- **Ecosystem: home-screen Widget.** A WidgetKit extension (`AtelieraWidgets`,
  multiplatform so the Mac app embeds it too) with a "Today's rhythm" widget —
  micro-season, felt season, moon (phase + % lit) — reusing the pure rhythm engine
  via shared source files, refreshing daily at midnight. Hemisphere comes from
  `SharedStore.bestHemisphere`: the app's stored location fix, else a device-region
  fallback (`RegionHemisphere`, e.g. AU → southern), so the widget is right for
  Anna without needing an App Group. (First tried an App Group for cross-process
  sharing, but `-allowProvisioningUpdates` won't auto-register a new group;
  dropped it for the offline region fallback, which also improves the app's default
  hemisphere before a location grant.) Info.plist + target wired in xcodegen; builds
  on iOS, macOS, and device.
- Also this pass: **keyboard-robust UI tests** — a `type(_:into:in:)` helper that
  waits for the software keyboard before typing, after a corrupted simulator
  (repeated `simctl` reboots left the hardware keyboard connected + a blank-render
  state) produced spurious failures. Erasing the sim to factory restored it; the
  app renders correctly (`artifacts/ios/native-n5-clean-sim.png`). 48 unit + 6 UI
  tests green on a clean sim.
- N5 remaining: Handoff (cross-app, the named N5 gate item — needs the web/Tauri
  app to advertise activities too).

## 2026-08-28 — Native Apple app, Phase N5 (start): native search

- First N5 slice: search across the vault. `NoteSearch` (`apple/Ateliera/Search/`) is
  a pure, offline ranker — matches every query token in a note's title or body,
  weights title hits above body hits, orders by score (title A→Z tiebreak). Not an
  interop contract (the web's index is disposable), so it's a native ranker, not a
  port. 5 unit tests.
- `VaultStore` builds search docs (id + title + body) on each reload and exposes
  `search(query)`; a `SearchView` (magnifying-glass in the studio bar) offers a live
  search field + results, and tapping a result opens it for editing. A UI test
  captures a note and finds it by a body-only word. 37 unit + 4 UI tests green; both
  platforms build.
- Next in N5: grow beyond the single room (navigation + room views), then the
  ecosystem bits (Widgets / Shortcuts / Handoff).

## 2026-08-28 — "One vault, two apps" verified across iCloud (iPhone ↔ web engine)

- Proved the ADR-012 interop end to end with a real iCloud vault. Created a shared
  vault in iCloud Drive (`Ateliera-Shared`, with the `.studio-space` marker) and a
  Mac-authored `welcome.md`; the native iPhone app, pointed at that folder via the
  `.fileImporter` picker, **read the welcome note** (Mac → phone).
- Captured a note on the iPhone; it synced back and landed at
  `Inbox/2026-08-28--a-new-note-from-anna--bn9hxx.md` — the web app's exact filename
  convention (ULID id, date--slug--id6). Parsed through `@studio/content`'s real
  `parseNote`: **ok, 0 warnings, and `serializeNote(parsed) === fileBytes`** — the
  Swift-written note is **byte-identical** to what the TypeScript web app would
  write (phone → web).
- So the two apps are genuinely separate codebases sharing one Markdown vault, and
  a note written by either is indistinguishable to the other. Gotchas surfaced:
  iCloud sync phone→Mac can lag minutes; leftover phantom "Ateliera"/"Ateleira"
  folders from earlier test sessions made folder-picking ambiguous (fixed by a
  unique folder name + an in-app welcome note as a positive "right vault" signal);
  "On My iPhone" folders never sync — must be an iCloud Drive folder.

## 2026-08-27 — Native Apple app, Phase N4 loose ends: real profile + natal chart

- **Hemisphere from location.** `LocationHemisphere` (CoreLocation, one-shot,
  when-in-use) resolves the device latitude to N/S and persists it, replacing the
  hardcoded southern default in the almanac. Graceful: no permission → keeps the
  persisted/`.north` value; skipped under `ATELIERA_UITEST`. Added
  `NSLocationWhenInUseUsageDescription`; no entitlement needed (works on iOS + macOS).
- **Natal chart, ported.** `apple/Ateliera/Rhythm/NatalChart.swift` reproduces
  `@studio/rhythm`'s natal computation without `astronomia`: Meeus solar longitude
  (ch. 25), lunar longitude (ch. 47, principal terms), and the ascendant from
  apparent sidereal time (ch. 12). The product surface is the zodiac SIGN, so it's
  golden-tested to **sign-level parity** — sun/moon/rising match the TS engine
  across 5 births — with the same honest degradation (date→sun, +time→moon,
  +location→rising).
- **"Your rhythm" settings** (`RhythmSettings.swift`): enter birth date, optional
  time (interpreted in the device zone → UTC), and place ("Use my location" or
  cleared), see the live natal chart, and it's persisted to UserDefaults. Reached
  from a "Your rhythm ›" link under the almanac.
- 31 unit + 3 UI tests green (a new UI test opens the rhythm sheet and confirms the
  chart renders). Both platforms build; `artifacts/ios/native-n4-rhythm-room.png`.
- **Rising-sign fix (wrong birthplace zone).** A wrong rising was traced to the
  time-zone reaching the chart, not the math: a new golden test proved the native
  local-time→UTC path matches the web's `computeNatalChartLocal` exactly (incl. DST)
  when given an IANA zone. Forward geocoding doesn't always return a zone, so the
  chart was silently falling back to the *device* zone. Fix: `PlaceGeocoder.search`
  reverse-geocodes the resolved point to fill the zone when missing, and "Your
  rhythm" now shows the birthplace's zone + offset (flagging a device-zone
  fallback) so it's never a silent guess. 32 unit + 3 UI green.
- **Birthplace search.** The birth place is no longer "here only": a geocoded
  search (`PlaceGeocoder`, CoreLocation) resolves any place name to its coordinate
  AND its IANA time zone, so the natal chart reads the birth time in the
  birthplace's zone (fixing the earlier device-zone caveat) and the rising sign is
  right. "Use my location" remains as a shortcut; both persist a place label + zone
  in `BirthData`. Installed on Anna's iPhone. Both platforms build; 31 unit + 3 UI
  tests green.

## 2026-08-27 — Native Apple app, Phase N4b: HealthKit drives the cycle layer

- The almanac's cycle is now fed by HealthKit. A pure `CycleDeriver`
  (`apple/Ateliera/Rhythm/CycleDeriver.swift`) turns the days a person logged
  menstrual flow into a `CycleProfile` — groups consecutive flow days into periods
  (a >10-day gap starts a new one, so a missing day doesn't split a period), takes
  the most recent period's start, and averages the spacing between period starts
  (clamped 21–35, default 28 with < 2 periods). 7 unit tests.
- `HealthCycleSource` (iOS-only; a stub on macOS since HealthKit isn't there)
  requests read access to `menstrualFlow`, queries ~400 days of samples, maps
  bleeding days to local day-strings, and hands them to the deriver. Read-only,
  on-device; the almanac simply omits the cycle when there's no permission or data
  — no error surfaced, no pressure. Skips the request under `ATELIERA_UITEST` so UI
  automation never hits the permission sheet.
- Config: `NSHealthShareUsageDescription` (required before authorization) via an
  INFOPLIST_KEY; the `com.apple.developer.healthkit` entitlement scoped to the iOS
  SDKs (`CODE_SIGN_ENTITLEMENTS[sdk=iphone*]`) so the macOS build stays clean.
- Verified: iOS + macOS both build; the **device build signs with the HealthKit
  entitlement** (automatic provisioning added the capability to the App ID); on the
  unsigned simulator the request errors and the almanac degrades gracefully with no
  crash (`artifacts/ios/native-n4b-almanac.png`); 29 unit + 2 UI tests green.
- **Verified on Anna's iPhone (device):** installed the signed HealthKit build,
  granted Cycle Tracking read access, and the almanac showed the cycle line from
  her real Health data. The N4 gate is met end-to-end — the cycle layer is driven
  by Health, the almanac renders natively.

## 2026-08-27 — Native Apple app, Phase N4a: native rhythm engine + Today's almanac

- Ported `@studio/rhythm`'s `rhythm.ts` to Swift (`apple/Ateliera/Rhythm/Rhythm.swift`):
  felt season (hemisphere-flipped), the 24 solar micro-seasons (with the southern
  six-month shift), moon phase + illumination (Meeus, Astronomical Algorithms
  ch. 47–48), the menstrual cycle day/phase, and the inward/outward orientation
  (from resurfacing's `preferredKinds`). Pure, offline, deterministic — reproduced
  arithmetic-for-arithmetic. UTC day math uses Hinnant's days-from-civil to match
  JS `Date.UTC` exactly. `astronomia` isn't needed here (only the natal chart uses
  it — a later slice).
- **Golden parity**: 6 XCTest cases assert against values captured from the TS
  engine — season (both hemispheres), micro-season boundaries + southern shift,
  moon phase + illumination (matching to **1e-12**), cycle first-cycle + wrap,
  orientation, and the full context. Swift's libm and JS `Math` agree bit-for-bit
  on the moon math.
- **Native almanac** (`AlmanacView`, wired to the top of the room): "Today's
  rhythm" — micro-season term + gloss, an inward/outward orientation line, and the
  felt season, moon (phase + % lit), and cycle when known — mirroring the web Foyer
  strip's copy. Verified on the simulator (`artifacts/ios/native-n4-almanac.png`);
  the southern-hemisphere shift renders live (an August date reads February's "Rain
  Water"). Hemisphere is a temporary southern default until a rhythm profile /
  location wires it; the cycle arrives from HealthKit next (N4b).
- 22 unit + 2 UI tests green on the simulator.

## 2026-08-27 — Native Apple app: running on a real iPhone (device install + on-device capture)

- Ran the app on a physical **iPhone 15 Pro Max** (iOS 26.5.2). Signed with Anna's
  Apple Development identity / team `W2UCHS9WV3` via automatic provisioning
  (`-allowProvisioningUpdates`, team passed on the xcodebuild command line so it
  isn't baked into the committed project), installed and launched with `devicectl`.
  The Reflection Garden renders natively with the real fonts, and **capturing and
  saving a reflection through the sheet works on-device** — the full capture →
  Rust-core atomic write → reload loop, confirmed on real hardware. This settles
  the earlier "do we actually have a functional iOS app?": yes.
- Polish from that session (both green across 16 unit + 2 UI tests):
  - The room now orders **newest-first** (by `updated`, then `created`; ISO strings
    sort chronologically) instead of alphabetically by title.
  - The capture/edit sheet is clearer: a high-contrast **principal title** in Studio
    ink (the old `.navigationTitle` read faint), explicit **"TITLE" / "REFLECTION"**
    field labels, and a placeholder in the otherwise-blank body editor.
- Device-only paths still open: pointing at a real **iCloud** vault and confirming
  cross-device visibility with the web app (this run used the seeded demo vault).

## 2026-08-27 — Native Apple app: UI tests drive the real capture/edit flow

- Closed the last N3 verification gap. The write path was proven at the FFI/unit
  level, but the actual button→sheet→write→list flow in the running app was
  untested (a CLI simulator can't tap). Added an **XCUITest target**
  (`AtelieraUITests`, iOS-only, wired into the scheme) that launches the app and
  drives it: tap "Add a reflection", type a title + body, "Keep", and assert the
  new note row appears; then tap the note, extend its title, "Save", and assert the
  room reflects the edit. Both pass on the iPhone 17 simulator.
- To keep the flow deterministic, the app honors an `ATELIERA_UITEST=1` launch
  environment (`VaultStore`): it opens a fresh, empty vault in its own sandbox
  instead of the seeded fixture or a persisted bookmark, so the room starts empty
  and the captured note is unambiguous. Added accessibility identifiers to the
  capture button, title field, body editor, and save button.
- Full run: **16 unit + 2 UI tests green on the simulator**; the 16 unit tests also
  green natively on macOS (`-only-testing:AtelieraTests`, since the UI target is
  iOS-only). The capture and edit loops are now verified end-to-end in the live app
  — the remaining unverified paths are strictly hardware-gated (real-device install,
  iCloud cross-device sync).

## 2026-08-27 — Native Apple app: multi-slice vault core (device + Mac) and macOS-hosted tests

- The vault-core XCFramework was simulator-only, which blocked device and Mac
  builds. `AtelieraVaultCore/build.sh` now builds four Rust static libs and packs
  three XCFramework slices: **iOS device** (`aarch64-apple-ios`), a **universal iOS
  simulator** slice (`aarch64` + `x86_64` fused with `lipo`, so it runs on Apple-
  Silicon and Intel Macs), and **macOS** (`aarch64-apple-darwin`). The write
  primitive's `renameatx_np` was already gated `any(macos, ios)`, so every slice
  compiles unchanged. (A universal macOS slice needs `x86_64-apple-darwin` added to
  the hermetic toolchain — a follow-up.)
- Fixed the test host for macOS: xcodegen hardcodes `TEST_HOST` to the iOS bundle
  layout (`Ateliera.app/Ateliera`), but the macOS host binary lives under
  `Contents/MacOS`. Added a `TEST_HOST[sdk=macosx*]` override in `project.yml` so
  the suite runs natively on Mac.
- Verified all three: the **full 16-case XCTest suite passes natively on macOS**
  (arm64 — the Rust core's `flock`/`renameatx_np`/`fsync` exercised on real macOS,
  not the sim), the app **links and builds for a generic iOS device**, and the sim
  suite still passes on the new universal slice. Device install/run itself still
  needs signing + hardware.

## 2026-08-27 — Native Apple app, Phase N3: capture writes a note back to the vault

- The native app now CREATES notes, not just reads them. Added a single-note
  **atomic write surface** to the Rust core (`apple/AtelieraVaultCore/src/lib.rs`),
  ported from the Tauri crate's `write_atomic`: an in-process mutex + advisory
  `flock` on `.studio-write.lock`, a temp file created with `O_EXCL`, `sync_all`,
  a monotonic `.studio-revision` bump written atomically, and an atomic rename —
  `RENAME_EXCL` (`renameatx_np`) when creating so a concurrent writer can't be
  clobbered. Gated on `any(macos, ios)` (the Tauri original was macOS-only) so it
  works on device. Path-contained + symlink-refusing via the existing guard;
  `open_parent` now creates intermediate dirs. Exposed over UniFFI as
  `write_text(path, text, expected_hash, create_new) -> WriteOutcome{hash, revision}`.
  5 Rust unit tests (create + read-back, create-new conflict, expected-hash
  overwrite/stale-reject, path-escape, monotonic revision) pass via `cargo test`.
- Native **quick capture** (`apple/Ateliera/Note/NoteFactory.swift`,
  `VaultStore.capture`, a `CaptureSheet` in `RootView`): builds the web app's
  default Inbox note (`card_type: capture`, `rooms: [inbox]`, `status: draft`),
  serializes it byte-identically, and writes it to `Inbox/<date>--<slug>--<id>.md`.
  Ported `createNoteId` (base-32 ULID-ish), `slugify`, and `suggestFilename` from
  `@studio/content` so ids/paths match the web app.
- 5 new XCTest cases exercise the **real FFI write** (not a stub): a capture note
  written through `Vault.write_text` reads back byte-identical, its SHA matches the
  Rust hash, revision advances to 1, the round trip reconstructs the capture
  defaults, duplicate create is refused, path escapes are rejected, and the
  filename/slug/id conventions match. 14 XCTest cases green on the iPhone 17 sim;
  the "Add a reflection" affordance renders (`artifacts/ios/native-n3-room.png`).
- **Editing added** (`VaultStore.beginEdit`/`saveEdit`, a shared `NoteEditorSheet`
  used by both capture and edit; tapping a note row opens it). Editing reads the
  note fresh, parses it, applies the new title/body, bumps `updated`, and writes
  back with `expected_hash` optimistic concurrency (`create_new: false`) — a stale
  write is refused, and unknown frontmatter keys survive the round trip because the
  parsed model is re-serialized whole. 2 more XCTest cases (edit keeps unknown keys
  + advances the revision; a stale-hash write is refused) — **16 green on the sim**.
  This closes the N3 gate's second half in code (`artifacts/ios/native-n3-edit.png`).
- Next: device-verify the capture/edit sheets writing to a real iCloud folder (the
  in-app sheet tap, like the `.fileImporter`, is the one path only checkable on
  device); classify captures into rooms beyond Inbox; add device + macOS slices to
  build.sh/XCFramework. Then Phase N4 (rhythm + HealthKit).

## 2026-08-27 — Native Apple app, Phase N2: broadened golden fixtures (optional fields, quoting, CRLF)

- Locked in the optional note fields the parser/serializer touch but the base
  golden never exercised. Captured each as ground-truth bytes from
  `@studio/content`'s `serializeNote` and added six round-trip fixtures
  (`apple/AtelieraTests/NoteFixturesTests.swift`, `parse golden → serialize == golden`):
  `landscape_anchor`, the nested `source` map + `source_notes`, the `resurface_*`
  keys, YAML scalar quoting, `\r\n` endings, and an everything-at-once note.
- The fixtures surfaced two real fidelity gaps and fixed them:
  - **Scalar quoting** (`StudioNote.swift`): the serializer now double-quotes a
    scalar exactly when the `yaml` library would — colons (`: `/trailing `:`),
    ` #`, bool/null-like (`true`/`false`/`null`/`~`, case-insensitive; *not*
    yes/no/on/off), number-like (int/hex/octal/float/inf/nan), leading YAML
    indicators, and empty/whitespace — otherwise plain. Rules derived empirically
    from `yaml`'s own output.
  - **CRLF** (`NoteParser.swift`): the parser now detects the document's line
    ending at the unicode-scalar level (Swift folds `\r\n` into one `Character`,
    so `firstIndex(of: "\n")` misses it) and restores it on the body, so a
    `\r\n` note round-trips byte-for-byte.
- All 9 XCTest cases pass on the iPhone 17 simulator via `xcodebuild test`.
- Next: Phase N3 — the capture/write path (native capture UI → serialize → atomic
  path-contained write back to the vault via the Rust core).

## 2026-08-27 — Native Apple app, Phase N2 (serializer): byte-identical Markdown writes

- Captured the ground-truth bytes of `@studio/content`'s `serializeNote` (key order,
  block sequences, `[]` for empty, block maps, plain scalars, `extraFrontmatter`
  first) and reproduced them exactly in Swift (`apple/Ateliera/Note/StudioNote.swift`).
- Added a native **XCTest target** (`apple/AtelieraTests`, wired into `project.yml`
  with a test scheme) and a **golden test** asserting the Swift serializer output ==
  the TS serializer output byte-for-byte. **Passes on the iPhone 17 simulator via
  `xcodebuild test`.** This is the "both apps share one vault" write-path guarantee.
- Also this session: a native **Reflection Garden room** reading real notes via the
  Rust core, with a native `.fileImporter` folder picker + bookmark persistence
  (`artifacts/ios/native-n1-room.png`).
- **Parser added** (`apple/Ateliera/Note/NoteParser.swift`): a dependency-free
  block-YAML reader splits frontmatter/body, reads recognised keys into the model,
  and keeps unknown keys in order as `extraFrontmatter`. Two more passing tests:
  parse extracts the known fields + preserves unknown keys, and **parse→serialize
  round-trips byte-for-byte**. Phase N2 gate met — Markdown → model → Markdown is
  byte-identical with unknown-key survival, so both apps share one vault.
- Next: broaden golden fixtures (optional fields — `landscape_anchor`, `source`
  object, resurface keys — quoting, `\r\n`); device-verify the picker; add device +
  macOS XCFramework slices; then grow the rooms (capture + more of the MVP).

## 2026-08-27 — Native Apple app, Phase N1: reads the vault via the Rust core (UniFFI)

- New `apple/AtelieraVaultCore` Rust crate — the portable cap-std read surface
  (`open`/`list`/`readText`/`exists`/`getRevision`), ported verbatim from
  `commands/vault.rs` (path-guard, symlink-nofollow, streaming SHA-256, sorted
  listing, `.studio-revision`), exposed to Swift via **UniFFI 0.28**.
- `build.sh` builds the iOS-sim staticlib, generates the Swift bindings, and
  assembles `VaultCore.xcframework` (products gitignored; run it + `xcodegen
  generate` on a fresh clone). Wired into `apple/project.yml`.
- **Verified on the iPhone 17 simulator** (`artifacts/ios/native-n1.png`): the
  SwiftUI app writes a fixture Studio, then opens and reads a note **through the
  Rust core** — showing the note text, `rev 1` (from `.studio-revision`),
  `2 entries` (the sorted listing), and the SHA-256 computed in Rust. The whole
  UniFFI pipeline works end to end; ADR-012's "reuse the Rust core, vault as the
  contract" is demonstrated.
- Next: swap the fixture for a **native security-scoped `UIDocumentPickerViewController`**
  so the app opens the real shared iCloud vault (the ADR-011 file access, now
  trivial in Swift), then the Markdown round-trip (Phase N2).

## 2026-08-27 — Native Apple app, Phase N0: SwiftUI skeleton + Ateliera theme

- Pivoted the iOS direction from Tauri to a **native SwiftUI app** across Mac +
  iPhone + iPad (ADR-012 supersedes ADR-011; plan
  `docs/superpowers/plans/2026-08-25-ateliera-apple-native.md`). Rationale: the
  product wants a genuinely native *feel* + deep ecosystem (HealthKit, Handoff,
  Widgets) while keeping Ateliera's custom styling — SwiftUI does both — and
  because the vault (Markdown files) is the source of truth, a native app shares
  the *vault*, not the code. Web/PWA/Tauri-desktop stay untouched.
- New `apple/` multiplatform Xcode project (xcodegen from `apple/project.yml`;
  generated `.xcodeproj` + build dirs gitignored). `AtelieraApp` + `RootView` +
  a `Theme` translated verbatim from `tokens.css` (chamomile palette, the type
  scale, the six meaning colours).
- Bundled the real brand fonts as ttf (Source Serif 4 / Figtree / Nothing You
  Could Do, with OFL licences), registered at launch via
  `CTFontManagerRegisterFontsForURL`.
- **Verified:** builds for **iOS and macOS**; installs, launches, and renders the
  Ateliera identity natively on the iPhone 17 simulator with the real fonts and
  full type scale (`artifacts/ios/native-n0-fonts.png`). N0 gate met.
- Next (Phase N1): reuse the Rust vault core via UniFFI (read path) so the native
  app opens the same iCloud Markdown vault as the web app. Follow-up polish:
  Dynamic Type (fonts are fixed-size for now) and the other six themes.

## 2026-08-25 — iOS Phase 0: Tauri 2 host bring-up

- Brought the app up on iOS per `docs/superpowers/plans/2026-08-25-ateliera-ios.md`
  (ADR-011). No frontend rewrite — the React app runs in a `WKWebView`.
- Toolchain: added the `aarch64-apple-ios` / `-sim` Rust targets, installed
  CocoaPods, and ran `tauri ios init` (scaffolds `gen/apple`, gitignored). Added
  `ios:init` / `ios:dev` / `ios:build` scripts via `scripts/run-ios.mjs`.
- Portability fixes so the host compiles for iOS: `rfd` (native desktop dialogs)
  is now a desktop-only dependency with the three call sites `cfg`-gated (mobile
  reaches files via the document picker, Phase 1); the lib gained
  `crate-type = ["staticlib", "cdylib", "rlib"]` and `#[cfg_attr(mobile,
  tauri::mobile_entry_point)]` on `run()` (Tauri 2 mobile needs the entry symbol).
- The Xcode "Build Rust Code" phase runs `cargo` from a sandboxed env that does
  not see the repo's hermetic `.toolchains/`. `run-ios.mjs` idempotently patches
  `gen/apple/project.yml` to export `CARGO_HOME`/`RUSTUP_HOME` (resolved via
  `git rev-parse`) so the build phase always finds the toolchain.
- For Phase 0 the iOS shell boots an ephemeral in-memory vault (`isIosShell()` in
  `App.tsx`) so the Studio runs before the iCloud adapter exists (Phase 1).
- **Result:** the app builds, installs, and runs on the iPhone 17 simulator
  (`** BUILD SUCCEEDED **`, live `UIKitApplication` process, webview connected to
  the dev server). The webview renders blank under `tauri ios dev` for the same
  reason `pnpm dev` is blank on desktop — the strict CSP blocks the Vite dev
  server; the real UI loads from a production build (`tauri ios build`), which is
  the Phase 5 path. Desktop/PWA unaffected: lint, typecheck, 393 app tests,
  clippy, and rustfmt all green.
- Current phase: Phase 0 gate met. Next is Phase 1 — the native vault plugin
  (document picker + security-scoped bookmarks) and the `ios-vault.ts` adapter.

## 2026-08-24 — Editorial-spread design overhaul and structural room pass

- Landed the visual-system revision from the `design_handoff_ateliera_polish/`
  bundle (ADR-009 supersedes ADR-007): swapped to Source Serif 4 / Figtree /
  Nothing You Could Do, capped and extended the type scale, added shared
  measure/rhythm tokens, and introduced a stylelint `studio/no-undefined-token`
  guard. Restyled `@studio/ui` (RoomHeading, AppShell, CardEditor focus mode)
  and moved every room onto the new scale, replacing non-card pastel fills with
  hairline rules.
- Completed the deeper structural room layouts the first pass deferred, one
  commit per room (branch `design/room-structure`, merged to `main`):
  - **Landscape** — the empty matrix cell is now the add target; removed the 25
    "+ Add" chips and the placeholder sentence.
  - **Identity** — single spine with a section-index aside (quiet counts);
    notes are hairline rows, not pastel cards.
  - **Season** — decisions render as a 30/60/90 ladder with a monospace horizon
    column (new `--studio-font-mono` token); dropped the measure-breaking grid.
  - **Wisdom** — Contents folded into the room's single aside; entries are
    hairline rows with a vision left-rule on selection.
  - **Uncharted** — possibilities as rows; the gate is a labelled threshold with
    everything past it held back at `opacity: 0.86`.
  - **Reflection** — view filters moved into the aside as counted filters; date
    margin tightened to 104px.
  - **Search** — facets live in a persistent aside; active filters show as
    removable chips; the match reason moved to a right-hand column.
  - **Settings** — all panels gathered onto one 640px page via a new
    `SettingsRoom` wrapper; rhythm layers are label-and-control rows.
- Fixed two issues caught during visual verification: the Uncharted threshold
  eyebrow failed AA contrast (accent moved to the flanking rules), and the new
  mobile spreads needed `minmax(0, 1fr)` so a wide child's min-content cannot
  exceed the viewport.
- Recorded future directions in the PRD roadmap (§21): a new **Phase 5 — Guided
  rituals & rhythm-aware practice** (future-self journalling, magical morning
  routines, moon-phase guided intention flow) and an extended **Phase 4** (proper
  dream journalling; auto-generated mantras / EFT tapping / meditation scripts &
  audio, gated behind AI scopes and the audit log).
- Verification: `pnpm lint`, `pnpm typecheck`, all 393 `@studio/app` unit tests,
  and the full Playwright visual suite pass.
- Current phase: design system and all built rooms are on the editorial spread.
  Still open — recompile and push the `ds-bundle/` via `/design-sync` (still
  flags `_ds_needs_recompile`, now also diverged by `--studio-font-mono`), the
  Inbox room (placeholder, pending its triage model), and surfacing the
  already-computed cycle/natal rhythm placements in the UI.

## 2026-07-15 — Studio entry and first-visit onboarding plan

- Reviewed the current launch flow and confirmed that the complete room shell and Foyer mount before a Studio Space is selected, leaving the actual entry decision visually subordinate to inactive navigation.
- Defined a dedicated pre-Studio Entry Gate, an explicit create/open/preparing state machine, and a fully initialized active-session boundary so rooms, Search, Capture, and Studio services do not mount prematurely.
- Planned an optional, resumable five-room First Visit walkthrough for newly created Studio Spaces, with one optional real contribution, no spotlight overlay, no compulsory disclosure, and replay from Settings.
- Added a furnished-preview layer to every tour stop: sparse, realistic example content appears in the authentic room layout, remains clearly labelled and structurally unable to enter storage or derived indexes, and becomes an editable draft only through an explicit **Use as a starting point** action.
- Refined the aesthetic contract around **Ateliera should unfold, not announce itself**: the first visit is a spatial, unnumbered wandering with a continuous threshold, stable guide, prefetched room transitions, asymmetrical negative space, strict visual-restraint rules, authored-card replacement, a quiet ending, and direct everyday returns.
- Specified per-Studio onboarding state in portable `.studio/settings.json`, calm long-running and failure states, legacy-Studio behavior, accessibility requirements, visual review states, and a six-task TDD implementation sequence.
- Current phase: onboarding plan ready for implementation in `docs/superpowers/plans/2026-07-15-ateliera-onboarding.md`.

## 2026-07-13 — Planning baseline

- Product requirements and design bible completed.
- Implementation plan and technical specification completed.
- Current phase: repository foundation and Task 1 scaffolding.
- Final visual design is in progress separately; implementation treats visual tokens as replaceable.

## 2026-07-13 — Repository foundation

- Scaffolded the pnpm monorepo and `@studio/*` package boundaries.
- Added strict TypeScript, ESLint layer rules, CSS `!important` rejection, unit, build, and Playwright gates.
- Added the minimal accessible Studio shell; visual tokens remain provisional and replaceable.
- Task 1 is complete; current phase: ready for Task 2 design primitives.

## 2026-07-13 — Design primitives

- Added provisional, replaceable design tokens for color, typography, spacing, focus, contrast, and motion.
- Added accessible SemanticMark and Card primitives with explicit non-color labels and named regions.
- Added Storybook, axe checks, and reviewed desktop/mobile visual baselines.
- Task 2 is complete; current phase: ready for Task 3 content kernel.

## 2026-07-13 — Markdown content kernel

- Added the version 1 note domain schema and explicit YAML snake_case to domain camelCase mapping.
- Added recoverable Markdown parsing, deterministic serialization, unknown-key preservation, stable note IDs, and portable filename suggestions.
- Added representative vault fixtures plus enum, malformed metadata, fidelity, and property-based coverage.
- Task 3 is complete; current phase: ready for Task 4 migrations and links.

## 2026-07-13 — Storage adapter contract

- Defined the adapter-neutral `VaultPort` contract and in-memory conformance harness across list, read, atomic conditional write, move, remove, and watch behavior.
- Added 131 contract cases covering path validation, conditional text/binary create and replace conflicts, conditional remove, failed-write atomicity, move/remove edge cases, and normalized logical watcher events.
- Task 4 is complete; its shared contract is the acceptance boundary for desktop and browser storage adapters.

## 2026-07-13 — Desktop vault security remediation

- Added an initial Tauri vault adapter, conditional SHA-256 writes, same-directory atomic replacement, filesystem watching, and a TypeScript bridge.
- Security review found pathname time-of-check/time-of-use exposure, raw temporary watcher events, non-atomic expected-hash/move behavior against external writers, and watcher lifecycle gaps.
- Replaced the pathname API with native folder selection, retained `cap_std` directory capabilities, random window-owned tokens, and component-relative no-follow operations.
- The first macOS compare-and-swap attempt used a swap-then-validate sequence. Re-review rejected it because failed content was transiently published and rollback could overwrite a concurrent external change.
- Replaced that sequence with a documented linearizability boundary: Studio mutations serialize through an in-process mutex and the vault-level `.studio-write.lock` advisory lock. Conditional writes validate before publication, never swap failed content into place, and preserve cooperating concurrent writers. Arbitrary tools that ignore the advisory lock remain outside the exact CAS guarantee.
- Rooted filesystem watching at the retained directory descriptor, coalesced logical watcher projections that hide write-temporary/lock files, cleaned up native watchers after subscription failure, and routed window destruction through the production lifecycle handler.
- Reserved every ASCII case variant of a `.studio-*` path component from the public vault API so renderer calls cannot replace lock, temporary, or future control files even on case-insensitive macOS volumes. Added a two-selection concurrency proof for the shared advisory lock.
- Added post-registration device/inode verification and retry for ordinary `F_GETPATH`-to-`notify` replacement. Pathname ABA remains possible, so native events are treated only as rescan hints and an independent two-second reconciliation always snapshots through the retained capability. ABA can delay delivery but cannot disclose outside content.
- Made direct reads nonblocking and reject non-regular targets from opened-descriptor metadata; FIFO coverage proves text and binary reads cannot hang.
- Aligned every vault adapter on conditional text, binary, and remove semantics. The Tauri bridge now forwards `expectedHash` and `expectedMissing`; native writes revalidate under the cooperative lock, use exclusive rename for missing-only creates, and conditional remove validates before unlink.
- Added a complete runnable Tauri bootstrap plus real invoke-handler and macOS watcher-to-Tauri event tests. Task 5 is implemented and awaiting independent security re-review.

## 2026-07-13 — Final visual design handoff

- Accepted Anna's final Studio design-system ZIP as the visual source of truth.
- Transcribed the implementation-grade visual authority: exact base and per-theme target values, picker chips/swatches, quiet-action overrides, self-hosted typography, token-name migration, room compositions, component states, responsive behavior, accessibility, interaction gaps, and authority rules.
- Task 2's current CSS remains the reviewed provisional high-contrast primitive baseline. Applying all final theme/type values to production tokens is scheduled through the shell and Foyer visual tasks and requires contrast/Playwright verification.
- Added architecture decisions for token-override themes and self-hosted Newsreader, Hanken Grotesk, and Caveat.
- Retained the original mockup, byte-identical `.dc.html` source, artifact checksums, and security boundary as durable provenance; no compatible prototype runtime is retained or shipped.
- Updated the product bible and executable plan without changing MVP scope.

## 2026-07-13 — Browser-local PWA vault

- Added a browser `VaultPort` that selects OPFS when supported, records that backend choice per named vault, and uses IndexedDB only as the compatibility backend rather than as a silent runtime-error fallback.
- Added conditional-write serialization, cross-instance and cross-tab watcher events, persistent-storage requests with calm best-effort messaging, and WebKit-safe IndexedDB transaction completion handling.
- Added portable ZIP export plus typed, bounded, checksum-verified import previews. Imports require explicit confirmation, stage every file, preserve replacements, and roll back the target after failures; stored and deflate-compressed ZIPs are supported.
- Hardened the portability boundary after adversarial review: imports cap the source blob before allocation, stream-inflate within declared limits, publish and roll back conditionally so another tab's edit is never overwritten, and restore move destinations when source removal fails. Browser exports use an explicit ZIP32 profile of 9,999 user files, 64 MiB per entry, and 512 MiB for expanded data and the final archive; these are transport limits rather than vault-capacity limits.
- Added a production PWA manifest, local icons, a single root-scoped service worker, content-derived cache versions, stale-cache cleanup, and an app-shell-only cache boundary that excludes private note content.
- Added a native 180×180 Apple touch icon and made the readiness message conditional on actual service-worker support and shell-cache preparation.
- Added a production-only browser contract harness and Playwright coverage for CAS conflicts, failed-write preservation, moves, removes, backend stability, cross-tab watch events, offline capture reload, IndexedDB fallback, focus restoration, cache privacy, and desktop/mobile presentation.
- Chromium proves full offline navigation. Because Playwright's WebKit offline toggle can cause transient origin-storage failures unrelated to the app, WebKit proves cached-subresource failure plus reload with its normal document and origin-storage access; the separate WebKit contract continues to exercise persistent IndexedDB reload behavior.
- Verified 332 unit/contract tests, typecheck, lint, production build, and 21 production-server Playwright tests across desktop Chromium, mobile Chromium, and desktop WebKit. Task 6 is ready for independent re-review before Task 7 begins.

## 2026-07-13 — Disposable search index and link graph

- Added a shared, injected SQLite driver boundary and a real FTS5-backed index, with Node 22+ `node:sqlite` isolated behind a desktop/test export so a browser SQLite-WASM adapter can reuse the schema and behavior.
- Added deterministic filtered keyword search, plain-text snippets with highlight ranges, stable-ID/path/title link resolution, forward links, backlinks, late-target repair, and complete derived-row cleanup.
- Added a deterministic vault rebuild that ignores non-Markdown files, isolates recoverable parse failures as repair items, reports progress, and publishes the replacement index in one transaction only after every source note has been read.
- Proved failed-rebuild rollback and clear/rebuild equivalence against real SQLite, plus 100% statement/branch/function/line coverage for the Markdown link parser.
- Independent review found ambiguous duplicate IDs/titles, above-root link normalization, orphan dictionaries, incomplete CommonMark parsing, and an unstated renderer-thread risk. The remediated implementation deterministically repairs duplicate IDs, preserves ambiguous wiki candidates, rejects absolute/escaping paths, normalizes NFC, cleans dictionaries, and derives links/search text from a CommonMark AST.
- The UI-safe package root no longer exports the concrete synchronous index. The Node adapter rejects document/UI contexts; production desktop execution belongs in a native/background process and future browser SQLite belongs in a Web Worker. Progress separately reports scanning, indexing, and the commit boundary.
- Added card-type filtering, safe tag/source match context, punctuation-only empty results, and conservative diacritic highlighting. Typo-tolerant title/tag ranking is explicitly deferred to Task 16 with tests and visible rationale required before the Search UI ships.
- Re-review then found unsafe transformed-string highlight offsets and missing reference-style links. The final remediation uses validated grapheme-aware mappings back to original UTF-16 offsets, keeps titles literal and consistent across FTS/snippets, resolves full/collapsed/shortcut references, and enables GFM table/plain-text semantics.
- Final CommonMark review added recursive definition discovery inside container nodes, first-definition precedence, and graceful unmatched-reference handling.
- The reproducible 10,000-note real-FTS benchmark rebuilt in 7.983 seconds and returned warmed filtered results in 9.76 ms on the reference development Mac, below the 200 ms target.
- Verified all 374 workspace tests, typecheck, lint, and production build. Task 7 remediation is complete and ready for independent re-review.

## 2026-07-13 — Application services and room projections

- Added an injected `StudioService` that captures with safe Inbox defaults and saves in the required order: validate, serialize, conditional atomic vault write, disposable-index upsert, then UI event publication.
- Preserved durable Markdown when indexing fails, exposed explicit ready/stale/rebuilding state, coalesced rebuild scheduling, and rebuilt the disposable index from canonical vault notes.
- Wrapped compare-and-swap conflicts with both the attempted note and the current durable text so concurrent edits remain available for resolution.
- Added vault-derived Foyer, room, Life Landscape, Current Season, Reflection, and Celebration projections with deterministic fallback sorting, archive/exclusion filtering, corrupt-note isolation, and canonical-ID de-duplication.
- Added a dedicated `.studio/views/*.json` repository for disposable per-view ordering without weakening the reserved `.studio-*` storage-control namespace.
- Added a browser-safe portable storage-contract export so application code does not pull Node-only adapters into the production PWA bundle.
- Independent review found that observer exceptions could enter the durable data path, index mutations were not sequenced against rebuilds, external vault changes had no lifecycle owner, multiple active seasons were silently collapsed, Inbox drafts leaked into philosophical rooms, timestamp strings were sorted lexically, stale recovery depended on another edit, and capture collision handling was incomplete.
- Added a failure-isolated subscriber bus with diagnostic reporting and unsubscribe/dispose cleanup. Event failures can no longer reject saves or rebuilds, suppress recovery scheduling, or prevent other listeners from receiving events.
- Serialized index upserts and rebuilds behind durable/index generations. A rebuild that overlaps a durable save remains stale until its queued upsert catches up, and a single later upsert cannot falsely heal an incomplete index.
- Added idempotent start/dispose lifecycle around vault watching, case-insensitive internal-path exclusion, coalesced create/modify/move/remove reconciliation, scan-race isolation, and bounded timer-backed recovery with injectable timers and backoff.
- Active-season projections now expose conflicts and a repair payload, Inbox drafts remain visible only in Inbox until triage, Foyer featured content excludes the dedicated season card, and chronological fallbacks compare parsed epochs with deterministic ties.
- Added bounded collision retries to StudioService and hardened the transitional shell capture adapter with draft/Inbox defaults and conditional writes; all production application files now participate in coverage.
- Added a separate external-change generation so an event arriving during watcher reconciliation keeps the index stale until a follow-up rebuild represents it.
- Final lifecycle review added hash-and-count-based suppression for self-published watcher events with bounded expiry, while mismatched or expired hashes remain external changes and force reconciliation.
- Recovery now survives a throwing injected scheduler and diagnostic callback by falling back to the bounded timer path. Disposal is terminal, suppresses late effects, closes delayed watcher registrations, and waits for both in-flight durable saves and queued index work.
- Vault scans and the transitional capture listing skip only files confirmed missing after a read race; storage and existence outages remain visible to callers instead of masquerading as empty or deleted content.
- Final race review replaced reusable path/hash suppression with a monotonically increasing per-path write generation and one consumable publication for only the latest operation. Ambiguous watcher events stay stale until their exact write settles, preventing an older hash from hiding an external ABA restoration.
- All concurrent disposal callers now receive the same terminal promise and wait for the same watcher, save, and index drain before cleanup completes.
- Verified 57 application tests at 100% statement/branch/function/line coverage, 431 workspace tests, lint, focused and workspace typecheck, and the production build. Task 8 remediation is complete and ready for re-review.

## 2026-07-13 — Responsive shell and visual system

- Applied the accepted design handoff to a responsive, BEM-named Studio shell with a fixed desktop room rail, compact mobile navigation, calm onboarding, keyboard command palette, focus-trapped dialogs, route/provider boundaries, and accessible page-focus transitions.
- Added the seven approved themes—Chamomile, Fig Leaf, Sunrise, Wisteria, Deep Ocean, Sunset, and Forest—with local preference persistence, a keyboard radio menu, visible status announcements, and light/dark `color-scheme` integration.
- Preserved the handoff palette as the visual target. Component text that failed WCAG contrast uses the stronger semantic ink token, and theme `line-strong` values are deliberately strengthened where interactive boundaries require 3:1 non-text contrast; these are accessibility corrections rather than palette additions.
- Self-hosted Newsreader, Hanken Grotesk, and Caveat as reviewed WOFF2 subsets with local licenses and no external font requests.
- Kept browser onboarding on the IndexedDB/OPFS adapter while native onboarding dynamically loads the Tauri-only folder selector. Cancelling native selection leaves the welcome state intact and does not create a browser vault accidentally.
- Hardened offline readiness across service-worker update races, retained a visible compact readiness status on mobile, and restored dialog focus to the actual invoking control on both shell variants.
- Playwright review covered Chamomile at 1440×1000, Fig Leaf at 1024×768, Deep Ocean at 390×844, onboarding, an effective 720 CSS-pixel viewport representing 200% zoom on a 1440-pixel display, and unmistakable keyboard focus in light and dark themes. The corrected compact layout has no horizontal clipping and the dark inherited content remains readable.
- Independent review required six corrections before acceptance: complete radio-menu keyboard behavior, a full-size compact Search target, final Card baselines, canonical unknown-route replacement, real room code splitting, and an explicit browser Studio-selection boundary.
- Theme choices now use roving focus, focus the selected radio on open, support Arrow keys/Home/End, persist changes as selection moves, restore trigger focus on Escape, and close safely on unobscured outside pointer input. Compact Search remains at least 44×44 CSS pixels.
- Unknown URLs replace to `/foyer`; each room ships through its own lazy boundary with an accessible loading status. Final desktop/mobile Card snapshots were reviewed against the accepted production tokens rather than tolerated with a wider threshold.
- Browser launch no longer constructs or opens an implicit vault. Capture stays unavailable until Create or Open completes; Create uses a stable name-derived local vault, persists the chosen name, detects case-insensitive and orphaned-data duplicates, and offers Open Existing without overwriting. Open selects only a known local Studio. Native sessions still require fresh capability selection after every relaunch.
- Final offline re-review found that the readiness label covered only already-loaded resources, so a first visit to a lazy room could fail after the network disappeared. The Vite build now emits a revisioned precache manifest for every app document, JavaScript chunk, stylesheet, font, icon, and web manifest, and injects the same manifest into the single service worker. Installation caches the complete static set before activation; renderer readiness verifies every expected URL in the exact versioned cache instead of inferring completeness from performance entries.
- Production coverage now creates a fresh named Studio, never visits Current Season or Search while online, waits for verified readiness, removes network access, then opens both lazy rooms through desktop and mobile controls without page errors. Cache-privacy coverage remains green because only build outputs and public static assets enter Cache Storage; private note content remains exclusively in the vault.
- Reviewed the final Chamomile onboarding shell at desktop width after these changes. Its disabled Capture state, compact `No Studio selected` rail status, named Create/Open boundary, typography, spacing, and contrast match the intended calm handoff.
- Verified 450 workspace tests, typecheck, ESLint/stylelint, production build, all 45 production-server Playwright tests across desktop Chromium, mobile Chromium, and desktop WebKit, and all 5 focused visual/accessibility checks. Task 9 remediation is complete; room-specific Foyer composition remains Task 12.

## 2026-07-13 — Capture, Markdown editing, autosave, and recovery

- Migrated production capture from the transitional string-only adapter to `StudioService.capture`, while retaining the legacy adapter only as an injected shell-test seam.
- Added body-first Quick Capture with immediate focus, empty-submit protection, retained text on failure, a quiet expiring “Remembered.” status, invoking-control focus restoration, and the established local-persistence messaging.
- Added a CodeMirror 6 Markdown focus editor as a separately loaded production chunk. The editor exposes title and body first, keeps metadata in a disclosure, supports keyboard-only use, and adapts to the full-screen mobile inspector.
- Added a session-scoped draft-recovery port and browser adapter. Recovery is written synchronously before durable save; reload offers explicit Restore or Discard and never silently replaces the durable note.
- Added the complete save-state model: idle, dirty, saving, saved, conflict, and error. Autosave waits 750ms, serializes writes, carries the latest exact hash forward, flushes on blur and Escape/close, and never publishes overlapping or out-of-order saves.
- Ordinary save failures retain recovery and pause in the error state; autosave retries only after a later edit instead of entering an eager retry loop.
- On exact-hash conflict, autosave stops and retains both versions. The editor exposes Keep mine as a sibling, Keep other, and Merge manually; none overwrites automatically.
- Connected each opened Studio to the application lifecycle: the shell starts and subscribes to its `StudioService`, reprojects cards after durable edits and conflict choices, and unsubscribes before disposal. Studio replacement and unmount let editor cleanup enqueue its last save before terminal disposal drains pending work.
- Scoped browser recovery to the stable vault ID and injected recovery to its supplied Studio ID. Native selection now creates one opaque version-four identity in the reserved `.studio-vault-id` control file, returns no pathname, and reuses that identity whenever the same vault is selected again; different native vaults therefore cannot share recovery drafts for an identical note path. Optional Quick Capture meaning is now part of the original `expectedMissing` capture write, so a classified capture cannot be partially committed by a second metadata save.
- Production Playwright proved capture within the 15-second budget, lazy editor loading, axe-clean desktop/mobile presentation, reload interruption recovery, Escape flush with focus restoration, existing offline capture behavior, and a real external OPFS mutation conflict. Screenshots were inspected at desktop and mobile sizes.
- Verified lint, typecheck, 472 workspace tests, production build, and 55 of 57 all-project Playwright checks before the WebKit focus correction; the only failure was WebKit focus restoration and the remaining conflict case was intentionally browser-scoped. After retaining the exact invoking card across the async close boundary, the focused WebKit suite passed 3 with the conflict integration proof skipped as designed. Task 10 is ready for independent review.
- Independent review found unsafe stale-draft restoration, cross-Studio recovery keys, silent typing after conflict, lossy sibling creation, unavailable-storage crashes, incomplete service lifecycle ownership, and under-specified conflict failures. Recovery is now scoped by stable Studio ID and path, storage failures degrade visibly, stale drafts enter an explicit read-only comparison, and every resolution preserves both versions until its durable action succeeds.
- For a live compare-and-swap conflict, Keep Mine clones the complete attempted `StudioNote`, including unknown frontmatter, privacy, display, attachment, line-ending, and classification metadata, while assigning a fresh ID and bounded collision-safe `expectedMissing` path. Session recovery intentionally stores only title/body plus scope/hash/timestamp in this MVP; a stale recovered draft inherits the current durable note's metadata, so the product does not claim full metadata crash recovery. Keep Other and successful edits trigger projection refresh through the started/subscribed service; switching and unmount unsubscribe and dispose only after pending editor saves drain.
- Conflict actions now expose busy, disabled, detailed failure, and retry states; failed close flushes keep the editor open. Optional Quick Capture meaning retains the safe body-first `Place later` default and is serialized atomically in the capture's only durable write.
- Removed the unused Markdown language parser from the separately loaded CodeMirror editor while retaining editing, history, keyboard, wrapping, and plain-Markdown behavior. The lazy editor chunk fell from 504.67 kB minified / 174.38 kB gzip to 275.93 kB / 89.99 kB, below the 500 kB production warning budget; the 477.88 kB main chunk remains below that same limit.
- A second independent review tightened the remaining durability and interaction boundaries. Native recovery now uses a stable opaque vault identity; blocked `sessionStorage` access falls back to an in-memory session store; semantic captures use one atomic write; manual merges become durably dirty against the remote hash; room and browser-history navigation wait for the editor flush; conflict and error summaries receive focus once without later focus theft; and same-tick duplicate conflict actions are serialized to one write.
- Added real browser-vault recovery and conflict coverage, including immediate-close manual-merge durability, navigation within the 750ms debounce window, keyboard focus behavior, and rapid duplicate action protection. Dedicated Recovery, Conflict, Busy, and Error visual stories are axe-clean at reviewed desktop and mobile sizes. Visual review exposed insufficient status contrast, which was corrected with the stronger semantic ink token before the suite was accepted.
- Final post-remediation verification passed 502 workspace tests, lint, typecheck, the production build, 64 of 66 production Playwright cases, and all 9 visual/accessibility checks. The two skips are intentional because desktop WebKit does not expose Chromium's OPFS API; the same OPFS conflict and manual-merge flows pass on desktop and mobile Chromium. Native verification separately passed 290 storage tests, 42 app tests, 19 Rust tests, `cargo fmt`, and `cargo clippy`.

## 2026-07-13 — Recoverable note lifecycle and local revisions

- Chose metadata-only Archive for the MVP: archiving changes `status` in place through an exact-hash write, preserving the stable path, body, unknown frontmatter, and line-ending preference. Unarchive returns the note to active views without moving user-authored Archive content.
- Added a lifecycle-scoped control-storage boundary that permits only `.studio/Trash/` and `.studio/backups/`, with explicit user-to-control and control-to-user moves. Arbitrary settings, view-state, and user paths cannot be accessed through this trusted interface.
- Aligned browser, in-memory, and native public adapters on case-insensitive `.studio-*` component reservation, so renderer-facing calls cannot address lock, temporary, probe, or future control artifacts. The explicit control boundary continues to use only the documented `.studio/Trash/` and `.studio/backups/` subtrees.
- Trash now journals a CAS-protected `prepared` entry before moving unchanged Markdown into `.studio/Trash/items/`, records original path/hash/status/deletion time and attachment availability, then finalizes the entry. Interrupted finalization rolls back when safe; reconciliation resolves unambiguous prepared/restoring states and reports ambiguous states without overwriting either copy.
- Restore verifies the trashed content hash and schema, preserves the exact original note metadata/body, rechecks missing attachments, and returns a visible deterministic `--restored[-N]` path report when the original location is occupied. There is no permanent-delete card action.
- Integrated archive, unarchive, Trash, restore, and reconciliation with `StudioService` lifecycle events and generation-aware index rebuilds. Incremental index failures cannot reject an already durable lifecycle mutation; Markdown remains authoritative and the disposable index rebuilds afterward.
- Added exact-byte local revision snapshots with incomplete-copy journals and automatic rolling retention. The newest completed snapshot per day is retained for 30 days by default, cleanup is confined to `.studio/backups/`, and user-authored `Archive/` is never pruned.
- Conflict choices now require a completed `conflict-resolution` snapshot before Keep Mine, Keep Other, or manual merge proceeds. Snapshot failure leaves both versions and recovery state available with retryable feedback.
- Production Playwright proves archive → unarchive → Trash → occupied-path restore, missing-attachment reporting, reconciliation, and offline operation through OPFS/IndexedDB on desktop Chromium, mobile Chromium, and desktop WebKit. Tauri IPC tests verify the same trusted control paths use only the opaque vault token.
- Independent review then found seven recovery-boundary gaps: Trash moves did not compare-and-swap the source inside the adapter mutation lock; storage outages could masquerade as missing files; save/lifecycle/snapshot work did not share one disposal-aware queue; invalid snapshots could influence retention; seeded browser state and cross-tab messages were under-validated; restore could collide with an existing stable ID; and snapshot creation lacked explicit resource bounds.
- Conditional moves now carry the expected source hash through every adapter and Tauri IPC, with the native check performed under the cooperative write lock immediately before exclusive rename. Trash, restore, and rollback use that atomic contract, so a concurrent winner remains at the source and no destination is published.
- Lifecycle presence is tri-state (`present`, `absent`, or `unavailable`), attachment availability distinguishes `available`, `missing`, and `unknown`, and reconciliation verifies surviving bytes against the journal hash before any transition. Outages and mismatches leave the manifest unchanged and retryable.
- All durable Studio mutations now share one queue. Disposal rejects new work immediately, drains accepted saves, lifecycle operations, reconciliation, and snapshots to a terminal state, then drains the disposable index queue.
- Revision manifests and their complete file sets are fully validated before retention. Only verified complete snapshots count; equal timestamps are deterministic; interrupted pruning keeps a retryable journal; and configurable file-count, per-file, total-byte, and manifest-byte limits reject known oversize work before backup mutation while mid-copy failures remain honestly incomplete.
- Browser listings discard invalid or case-insensitive `.studio-*` entries even when the backing store was pre-seeded. Cross-tab watcher messages require an exact known event shape, normalized paths, and valid SHA-256 hashes before delivery.
- Restore scans canonical Markdown and extensionless note sources for the stable ID before moving. A collision returns an explicit repair result, preserves both files and the Trash manifest, and leaves the existing index/backlinks untouched.
- Fresh re-review identified three remaining integrity races: manifest read outages could be mistaken for a missing manifest, retention trusted listed snapshot hashes instead of the bytes it would preserve, and a second app instance could introduce a duplicate stable note ID between restore's scan and move.
- Manifest loading now distinguishes confirmed absence from unavailable storage; snapshot retention hashes every stored file before accepting it; and restore supplies an exact public-note state vector to the same adapter/native mutation lock that verifies the trashed source hash. Conflicts reset the restore journal to its retryable state, then either report the new stable-ID collision for repair or return the unrelated storage conflict without moving either note.
- The final resource-safety review found that retention read snapshot bytes before rejecting oversized adapter metadata. Known per-file and cumulative declared sizes are now validated before any backup read, then accepted files still undergo actual-byte length and SHA-256 verification.
- Final remediation verification passed 598 workspace tests, 112 application tests at strict 100% statement/branch/function/line coverage, 349 storage tests, typecheck, ESLint/stylelint, production build, 67 of 69 production Playwright cases with the same two intentional WebKit OPFS skips, 21 Rust tests, `cargo fmt --check`, and `cargo clippy -D warnings`. Final independent review reports no remaining P0–P2 findings; Task 11 remediation is complete.
- A subsequent original-review audit found three deeper authority boundaries: Archive and Trash lookup still depended on a disposable index entry; Trash manifest parsing did not reject every unsafe or colliding semantic combination as one unit; and pruning relisted current hashes instead of carrying the exact hashes validated before journal publication.
- Archive, unarchive, and Trash now resolve the requested stable ID directly from canonical Markdown and reject duplicate IDs or unreadable candidates. A durable save whose index upsert failed can still enter lifecycle work, after which the normal generation-aware rebuild restores the disposable index.
- Trash manifests now require an exact schema, canonical note IDs compatible with the existing domain contract, lowercase SHA-256, canonical ISO timestamps, safe normalized user/control paths, exact ID/basename Trash binding, and unique IDs, Trash paths, attachment records, and original/restore destinations. Any invalid or colliding entry rejects the whole manifest before a journal or note mutation.
- Revision retention now carries hashes computed from verified snapshot bytes into conditional removal and carries the exact hash returned by the pruning-manifest write into final manifest removal. A changed copy, changed manifest, or unexpected new file cannot be authorized by a relist and leaves the pruning journal available for repair or retry.
- Final verification passed 609 workspace tests, 120 application tests at strict 100% statement/branch/function/line coverage, 352 storage tests, typecheck, ESLint/stylelint, production build, 67 of 69 production Playwright cases with the same two intentional WebKit OPFS skips, 21 Rust tests, `cargo fmt --check`, and `cargo clippy -D warnings`. The three subsequent review findings are remediated and ready for reviewer verification.

## 2026-07-13 — Life Landscape

- Added ten configurable default life areas with five active by default, plus the fixed Vision, Identity & Feelings, Decisions, Practices, and Structure & Strategy anchors and their approved prompts.
- Built one-scan canonical Landscape projections with deterministic featured cards, additional-card counts, multi-area linking, decision horizons, and unknown-frontmatter preservation.
- Added Matrix, Focus, and Lens views. The desktop Matrix retains its 184-pixel anchor rail and confines horizontal scrolling to the named board scroller; compact and mobile layouts route directly to the focused area stack and never render the matrix.
- Added atomic classified capture from every Landscape cell, existing-editor card opening, exact-CAS move/link operations, incidental view ordering, configurable active-area ordering, and immediate Undo feedback.
- Added thresholded pointer dragging plus complete keyboard and explicit-menu alternatives for card and area movement. Visible conflict/error feedback leaves the canonical Markdown authoritative.
- Preserved browser-history semantics by replacing, rather than pushing, the automatic mobile focus route; forward/back navigation now returns to the originating room without an intermediate redirect entry.
- Added accessible Storybook fixtures for empty, sparse five-area, dense ten-area, Focus, Lens, and dark states. Reviewed desktop matrix/focus, mobile focus, and dark presentation, then strengthened semantic stocks, quiet-action contrast, and compact navigation behavior.
- Production verification passed the complete 83-case Playwright suite with four intentional capability/layout skips and all 33 visual/axe checks, including all ten Landscape visual cases across responsive, 200% zoom, dark, reduced-motion, and forced-color conditions. Task 13 is implemented and ready for independent review.

## 2026-07-14 — Life Landscape review remediation

- Made every displayed Landscape card carry its exact durable hash. Move, link, and Undo now compare-and-swap against the version the person actually saw; a concurrent edit remains untouched and produces visible, retryable conflict feedback.
- Replaced the hand-rolled pointer hit test with dnd-kit mouse and 500 ms touch sensors, explicit Move/Also show drag modes, a destination preview and overlay, a visible cancel action, and complete menu keyboard behavior with focus restoration. Production Playwright proves desktop dragging and mobile long-press cancellation followed by a successful move.
- Persisted ordered, hidden, renamed, and custom life areas in the single fixed `.studio/config/landscape-areas.json` control file. Browser and mocked native adapters exercise the real default StudioService factory without exposing a caller-selected internal path.
- Hardened life-area configuration recovery after independent review. Required adapter metadata bounds reads before allocation; malformed, oversized, stale-metadata, and future-schema files are never overwritten automatically. The UI states that original bytes are untouched, hides unrelated mutations, and requires a two-step confirmation before an exact-revision replacement with defaults.
- Moved Landscape capture into portable `Life Landscape/<area>/` folders, added atomically authored 30/60/90-day and Someday decision horizons, made the matrix an actual bounded two-axis scrollport with measured sticky headings, and corrected the drag-helper contrast exposed by axe.
- Deferred the non-startup Studio service runtime behind a dynamic import. The startup entry fell from 501.64 kB to 214.70 kB minified; the service is a 284.10 kB lazy chunk and Landscape remains a 63.05 kB lazy chunk. A hard 500,000-byte startup-entry build guard prevents regression, while the offline precache continues to include every emitted chunk.
- Final verification passed 721 workspace tests, typecheck, ESLint/stylelint, the production build, 90 of 99 all-project Playwright cases with nine intentional browser/layout skips, and all 33 visual/axe checks. The production dependency audit reports no known vulnerabilities; dnd-kit and its included packages are MIT licensed. Independent review approved the final configuration recovery boundary with no findings.
- Final product review separated future/unsupported life-area configuration from malformed-but-repairable configuration. A newer schema now receives a calm read-only compatibility message, every Add/Rename/Hide/Reorder path is suppressed and guarded, and its bytes remain untouched until the app can understand them.
- Successful keyboard menu reorder and link actions restore the surviving Move trigger; a move that reparents the card restores its title, with Undo as the final fallback. Failed actions keep the menu item focused for immediate retry. Production keyboard coverage proves all three successful paths in Chromium and WebKit.
- Post-review verification passed 725 workspace tests, typecheck, ESLint/stylelint, the production build, 92 of 102 all-project Playwright cases with ten intentional browser/layout skips, and all 33 visual/axe checks.
- Closed the final async menu-focus gap by retaining the exact invoked move or reorder action before its awaited mutation. A failed operation now restores that action only after its disabled busy state clears, with an enabled menu item and then the Move trigger as fallbacks; successful moves keep the existing page-owned destination focus and are never overridden.
- Final closeout verification passed 726 workspace tests, typecheck, ESLint/stylelint, the production build, 95 of 105 all-project Playwright cases with ten intentional browser/layout skips, and all 33 visual/axe checks. A real IndexedDB stale-hash conflict proves immediate retry focus in production Chromium and WebKit.

## 2026-07-14 — Current Season

- Added the interruptible nine-step season ritual: name and dates, prior reflection, desired feelings, no more than three priorities by default, 30/60/90-day decisions and experiments, practices, supports and constraints, an Enough line, an intentional Not Now list, and explicit confirmation before activation.
- Persisted every completed step immediately to one canonical Markdown season note with exact-hash writes, stable `season_id` frontmatter, conservative malformed-metadata recovery, and unknown-frontmatter preservation. Drafts recover at the next incomplete step after reload.
- Enforced one active season without silently selecting among conflicts. When multiple active notes exist, the room exposes each candidate and requires an explicit keep choice; repair snapshots every conflicting note before archiving the others.
- Built the editorial Current Season cover with the season statement, up to three primary priority cards, desired feelings, Enough, 30/60/90 horizons, practices, support, constraints, and a collapsed Not Now disclosure. Compact layouts use one calm column and expose Current Season through an accessible More menu.
- Closing a season now requires a celebration, learning, identity reflection, and an explicit disposition for every priority. A `season-close` revision captures the season and linked Landscape notes before any mutation; the season letter is stored in Reflection Garden and no thread is carried forward automatically.
- Added Storybook fixtures for active, empty, wizard, conflict, long-text, and dark states. Browser verification covers interrupted recovery and the full create/read/reload/close lifecycle on desktop Chromium, mobile Chromium, and desktop WebKit, plus mobile composition, 200% zoom, forced colors, reduced motion, and axe checks.
- Final verification passed 750 workspace tests, typecheck, ESLint/stylelint, the production build, all 219 application tests at strict 100% statement/branch/function/line coverage, 7 focused production Playwright cases with 2 intentional non-mobile layout skips, and all 10 Current Season visual/accessibility checks.

## 2026-07-14 — Uncharted and Reflection Garden

- Added the pressure-free Uncharted room with one large “What if…” composer, spacious near-possibility columns, a distinct Beyond the Gate threshold, dashed unknowable cards, calm empty/loading/error/offline states, and a single-column mobile composition. Captures classify atomically into portable `Uncharted/` Markdown, preserve an explicit near/beyond horizon, and never add priority, due-date, progress, or streak metadata.
- Added optional exact-CAS invitations from Uncharted into the active season. Invitations preserve the note's semantic type and unknown frontmatter, add only the canonical season relationship, retain the possibility in Uncharted, and restore the invoking control after retryable failure.
- Added Reflection Garden as a deterministic chronological reading stream with Garden, Reflections, Celebrations, and Themes views; one-sentence capture; recoverable full-editor continuation; optional Then & Now pairings; canonical identity, season, life-area, and Uncharted connections; and no heatmap or performance scoring.
- Kept Reflection and Celebration as distinct semantic Markdown entries while deriving the Garden and deterministic theme summaries from canonical notes. All relationship writes compare-and-swap against the displayed hash and preserve unknown metadata.
- Routed optional Reflection images through the vault media boundary rather than rendering raw paths. Blob URLs are revoked after use, missing or unsafe media leaves the entry intact with calm repair text, and private assets remain outside the app-shell cache.
- Added accepted Storybook fixtures for sparse, empty, dense, long-text, dark, loading, malformed, offline, responsive, 200% zoom, forced-color, and reduced-motion states. Visual review confirmed the restrained purple Uncharted composition and blue/orange editorial Reflection stream at desktop and mobile widths.
- The full browser gate exposed an existing Landscape resilience gap: after an exact-hash move conflict preserved another writer's durable version, the visible projection remained stale. Landscape now reprojects on failed moves while retaining the open menu and exact retry focus; a real IndexedDB conflict passes in Chromium and WebKit.
- Final verification passed 947 workspace tests, typecheck, ESLint/stylelint, the production build, 113 of 132 production Playwright cases with 19 intentional browser/layout skips, and all 60 visual/axe checks. Uncharted and Reflection Garden are implemented and ready for independent review.

## 2026-07-14 — Uncharted and Reflection Garden review remediation

- Made Reflection Garden chronology derive exclusively from canonical `created` timestamps with stable note-ID tie-breaking; incidental room order and later edits cannot reorder the garden.
- Preserved evidence as canonical kind-and-ID relationships, including duplicate labels, and added actionable note, life-area, and season navigation. Missing and archived targets remain visible as calm repair states without inventing a destination.
- Isolated every reflection image resolution so one missing, unsafe, malformed, or throwing asset cannot suppress its siblings. Every created blob URL is revoked on replacement, cancellation, and unmount.
- Serialized repeated invitation and evidence actions, refreshed projections in success and failure paths, preserved the exact draft or selection after conflict, and restored focus to the stable retry control after the refreshed card renders.
- Connected room availability to live browser connectivity rather than a static label. Both rooms expose their local-only offline state and remain writable while Playwright has network access disabled.
- Added production IndexedDB conflict, duplicate-action, retry-focus, canonical navigation, theme, Then & Now, available/missing media, malformed-note, missing/archived evidence, and offline-write coverage across Chromium, mobile Chromium, and WebKit.
- Review-remediation verification passed typecheck, ESLint/stylelint, all 959 workspace tests, and the complete 24-case focused production Playwright matrix with 17 passes and seven intentional browser/layout skips.
- Final canonical-evidence remediation now resolves note, life-area, and season relationships by exact kind and stable ID, preserves available, archived/historical, and missing states, and never invents a destination for stale metadata.
- Evidence navigation revalidates canonical storage at click time. If a life area is hidden or removed after rendering, or the active season is replaced with a different `season_id`, Reflection Garden stays open, shows calm repair feedback, and restores focus to the exact evidence control rather than routing to an unrelated fallback.
- Real IndexedDB race coverage mutates both canonical targets after their buttons render and before click in Chromium and WebKit. Final verification passed typecheck, full ESLint/stylelint, all 966 workspace tests, and the 27-case focused production matrix with 19 passes and eight intentional browser/layout skips. Independent re-review approved Task 15 with no remaining findings.

## 2026-07-14 — Search, Inspector, backlinks, and repair

- Added an entirely local Search room backed by the disposable SQLite-WASM worker index. Keyword and typo-tolerant title/tag retrieval expose bounded plain-text match evidence; imported HTML remains text, punctuation-only queries stay empty, and visible results remain capped at 200.
- Added URL-persistent, self-excluding filters for room, semantic meaning, life area, season, status, tag, card type, and inclusive date range. Facets aggregate over the complete matching set rather than the visible 200-result window, including blank, broad, filtered, and fuzzy queries; selected zero-count values remain removable.
- Added the on-request Inspector with canonical metadata, backlinks, authoritative one-note fallback reads, modal focus containment, invocation focus restoration, and responsive full-screen mobile presentation. Warm inspection uses the index rather than scanning the vault.
- Added a calm repair queue for malformed metadata and exact broken-link occurrences. Repairs preserve body bytes, CRLF preference, attachments, source context, and unknown safe frontmatter; invalid timestamps are visibly editable; link removal/relinking changes only the selected occurrence.
- All repair writes compare-and-swap against the reviewed revision. Conflicts retain both attempted and durable versions for inspection. Stable-ID ownership is checked across canonical Markdown before snapshot, write, or index publication, so unchanged duplicates are rejected while the owning path and genuinely unique replacements remain valid.
- Index lifecycle now distinguishes initial rebuilding, ready, and stale states; an empty stale projection never claims authoritative absence. Initial vault opening rebuilds Search, and the service worker precaches the search worker, SQLite worker, OPFS proxy, and WASM without caching private Studio content.
- Independent review drove corrections for complete facets, inclusive date bounds, genuine Damerau-Levenshtein rationale, indexed Inspector lookup, async Inspector races, initial rebuild state, metadata preservation, duplicate-ID authority, repair focus/modal behavior, bounded snippets, conflict evidence, mobile containment, and cold-offline worker startup. Final re-review approved with no P0–P2 findings.
- Final verification passed typecheck, ESLint/stylelint, the production build, all 1,102 workspace tests, the 21-case Search/Repair production matrix with 19 passes and two intentional platform skips, and all 70 visual/axe checks. The skips are the mobile duplicate-CAS path already proven in both desktop engines and WebKit's cold module-worker interception; warm offline WebKit remains covered. At 10,000 notes, warm search measured 10.14 ms and complete facets 24.88 ms, with an 8.272 s rebuild.

## 2026-07-14 — Complete portable backup and restore

- Added a calm Backup & Restore room that downloads a deterministic ZIP32 archive, validates every checksum and bound before preview, shows exact create/overwrite/conflict/skip outcomes, requires explicit choices for every conflict and confirmation before mutation, serializes duplicate restore actions, and restores keyboard focus after completion or retryable failure.
- Defined the portable set from canonical vault content rather than the disposable index. Exports include every room, attachments, view/season state, recoverable Trash, and completed Studio revision backups while excluding rebuildable index/cache data under a separately bounded manifest section. Unknown future user files remain portable.
- Kept the archive deliberately interoperable: stored ZIP32 entries with UTF-8 names, deterministic ordering and timestamps, per-file SHA-256 descriptors, a versioned exact-schema manifest, deflate-compatible import, 9,999-entry, 64 MiB per-entry, and 512 MiB expanded/archive limits. Declared sizes and aggregate budgets are rejected before reads wherever metadata permits, then observed bytes and hashes are verified again.
- Made restore one atomic, revision-guarded publication across in-memory, IndexedDB, OPFS, and Tauri adapters. Preview and apply revalidate the target's complete portable path/hash/note-ID fingerprint, detect case/Unicode and stable-ID collisions, reject source or target ABA changes, and never publish a partial import when a competitor wins.
- Added monotonically increasing vault revisions and exact expected-before conditions to browser and native batch contracts. IndexedDB publishes files and revision in one transaction; OPFS and native backends use bounded durable journals that recover interrupted work to an all-old or all-new state and fail closed when evidence is forged, oversized, incomplete, or ambiguous.
- Hardened OPFS listing with metadata-only sidecars so normal asset scans do not allocate attachment bodies. Legacy or stale metadata is healed through bounded verified reads, atomic target sizes are preflighted before journal mutation, and create/update conditions remain authoritative throughout the recovered write.
- Streamed native metadata and ordinary large attachments through bounded raw IPC chunks rather than JSON-expanded payloads. Tauri assembles chunks into the export only after exact length and SHA-256 verification; archive construction remains bounded even when metadata changes between stat and read.
- Added a private native backup destination with atomic filesystem publication and no vault-path disclosure. Browser backups remain explicit local downloads; no private Markdown, attachments, export bytes, or restored content enters the service-worker cache.
- Added an all-room destructive restore drill against `fixtures/vaults/anna-sample`, verifying semantic recovery of Foyer, Identity, Life Landscape, Current Season, Uncharted, Wisdom, Reflection/Celebration, relationships, structured Studio state, Trash, attachments, and backups after the target is destroyed and rebuilt from the archive.
- Final integrity review found that IndexedDB could return same-length corrupted bytes alongside a stale persisted hash, allowing restore preview to classify damaged content as unchanged. IndexedDB records now require an exact schema, canonical vault/key/path/timestamp/hash fields, and recomputed SHA-256 agreement on both listing and direct read; corruption fails closed before preview or mutation. A real direct-IndexedDB corruption journey proves the old failure and the repaired behavior in Chromium and WebKit.
- Final current-head verification passed typecheck, ESLint/stylelint, all 1,190 workspace tests, the production build, the exact destructive restore drill, 48 Rust tests, `cargo fmt --check`, `cargo clippy -D warnings`, all 12 portability journeys across desktop Chromium, mobile Chromium, and desktop WebKit, and all 7 focused visual/axe checks. Independent final re-review approved Task 17 with no P0–P2 findings.

## 2026-07-14 — Security, privacy, and diagnostics hardening

- Added a bounded local diagnostics boundary that accepts only allowlisted operation names, technical error codes, ISO timestamps, ULID note IDs, SHA-256 hashes, and non-negative measures. Titles, bodies, paths, messages, stacks, arbitrary metadata, inherited fields, accessors, hostile proxies, and malformed values never enter the report.
- Made diagnostics preview exact rather than representative: the returned human-readable preview decodes to the identical UTF-8 bytes prepared for export. The recorder is memory-only and capped at 10,000 entries. No production upload, telemetry transport, persistent diagnostic log, or Settings callsite exists yet, and the threat model states that limitation explicitly.
- Added a fixed-allowlist CommonMark/GFM renderer boundary for a future rendered preview. It drops raw HTML, escapes text and attributes, rejects active/encoded/authority-changing URLs, suppresses remote/data/SVG images, and permits only relative raster images. Existing production React surfaces still render user content as text and do not use an HTML sink.
- Hardened both browser and Tauri content policies to packaged/same-origin code, fonts, workers, and media; removed the unused native asset protocol; retained only the required IPC transports; and continued to grant only `core:default` to the local `main` window with no remote capability. Production/dev/preview HTTP responses now add CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, no-referrer, and a restrictive permissions policy. A deployable `_headers` file is copied into the web artifact.
- Documented the complete MVP threat model: lost/shared devices, malicious imports and active content, filesystem escape, XSS/webview compromise, backup/cloud/Git leakage, AI/network exposure, diagnostic metadata, dependency compromise, reflective safety boundaries, residual risks, and the review triggers for future AI, sync, sharing, plugin, external-opening, app-lock, and encrypted-backup work.
- Added an executable macOS Rust dependency-audit policy. It first proves the vulnerable `quick-xml 0.39.4` path is absent from both Apple target graphs, then applies exactly two documented RustSec exceptions for a Linux-only Wayland build-time parser. The exceptions are forbidden for a future Linux release. The npm production audit reports no known vulnerabilities.
- Independent security review found and then verified remediation of three P2 issues: accessor-backed diagnostic fields could change after validation, the PWA lacked response-level anti-clickjacking headers, and the raw cross-platform Rust audit had no committed target-aware gate. Final re-review approved Task 18 with no remaining P0–P2 findings.
- Final verification passed the 29-case security suite, all 1,220 workspace tests, 440 application tests at strict 100% statement/branch/function/line coverage, typecheck, ESLint/stylelint, the production build, response-header Playwright in desktop Chromium, mobile Chromium, and desktop WebKit, 48 Rust tests, `cargo fmt --check`, `cargo clippy -D warnings`, the target-aware macOS Rust audit, and the npm production dependency audit.

## 2026-07-14 — MVP release candidate hardening

- Added one reproducible 15-gate release command that binds retained evidence to the exact clean candidate commit. The gate covers typecheck, ESLint/stylelint, workspace and security tests, PWA build and inspection, npm and target-aware Rust audits, destructive restore, Rust tests/format/clippy, production browser journeys, visual/axe coverage, macOS packaging, and native artifact inspection.
- Enforced production PWA budgets and offline completeness. The final artifact contains 52 files and 49 precache entries, with 1,538,686 bytes of JavaScript and 2,818,841 total bytes; inspection reports no issues.
- Hardened release accessibility and responsive evidence across themes, compact/mobile layouts, 200% text and zoom, WCAG text spacing, forced colors, reduced motion, missing images, keyboard-only journeys, focus restoration, and 44-by-44 CSS-pixel interactive targets.
- Retained the complete visual corpus inside candidate evidence rather than leaving screenshots in transient test output. Independent review verified all 103 retained screenshots match the current run byte-for-byte.
- Built `The Studio.app` and `The Studio_0.1.0_aarch64.dmg` with canonical identifier `au.com.annamcphee.thestudio` and version `0.1.0`. The final DMG is 4,050,927 bytes with SHA-256 `2df62e8b47e2f6eedd4e78e98f1ff82351b0f02a583356dba5db44813e3c0503`; mandatory `hdiutil verify` passed, and a corrupt-image regression proves inspection fails closed.
- Final clean verification at commit `c6919a5a47eb384f613cc3e2adb5ac1735de2a1e` passed all 15 gates: 1,227 workspace tests, the 29-case security suite, 48 Rust tests, 162 production Playwright journeys with 30 intentional project-specific skips, and all 107 visual/axe cases. The retained manifest, logs, PWA report, native inventory, and artifact hashes bind to that exact commit.
- Independent re-review approved the release candidate with no P0–P2 findings. VoiceOver, physical-iPhone installed-PWA testing, Developer ID signing, notarization, Gatekeeper, and clean-device installation remain explicit manual gates; the generated macOS artifact is local and signing-ready, not signed or notarized for public distribution. Inner Studio remains a post-MVP option.

## 2026-07-14 — Native Studio creation repair

- Corrected native onboarding so Create and Open are distinct operations. Create now asks for a parent location, creates the entered Studio name as a child folder, initializes it in a temporary sibling, and publishes it atomically without opening, replacing, or overwriting an existing folder.
- Removed user-facing “vault” terminology. Onboarding now says “Open an existing Studio,” while loading, empty, storage, backup, and error states consistently describe the Studio or its files.
- Added a shared synchronous action guard for native and browser onboarding. Repeated Create/Open activation cannot start overlapping storage scans or Studio services, both choices remain disabled while work is pending, and cancellation or failure always unlocks the interface.
- The reported 15 GB was the pre-existing Documents folder being scanned after it was mistakenly registered as the Studio; the app did not create or copy 15 GB. The incorrect attempt wrote only three small hidden Studio control files at that folder root.
- Regression coverage proves named native creation, cancellation, collision safety, retryable failure cleanup, specific same-name guidance, browser duplicate-action serialization, and user-facing terminology. Focused verification passed 52 Rust tests and 227 app/storage tests; independent re-review found no remaining P0–P2 issues.

## 2026-07-14 — Native Studio open guard

- Added an explicit native Studio-space marker to newly created Studio folders. Opening an existing Studio now validates the marker, or a conservative legacy Studio shape, before registration can start recursive listing, hashing, watching, or index rebuild work.
- A parent folder accidentally left with old Studio control files is rejected before registration when its top-level shape is not plausibly a Studio. The reproduced Documents-style case keeps the capability registry empty and avoids the expensive scan that previously made the app appear unresponsive.
- First startup now returns after the Studio watcher is ready and runs the initial disposable index rebuild in the background. The UI can enter the Studio while Search and derived projections continue to report their rebuilding state.
- Malformed Studio markers fail closed rather than falling back to legacy handling. Created Studios remain reopenable across process restarts with the same recovery identity.
- Regression coverage now proves marker creation, reopen, suspicious-parent rejection, malformed-marker rejection, and nonblocking startup while the first index rebuild is still running. Verification passed 55 Rust tests, app startup tests, typecheck, ESLint/stylelint, `cargo fmt --check`, and `cargo clippy -D warnings`.

## 2026-07-14 — Life Landscape matrix polish

- Gave the matrix anchor rail and corner header tokenized inset spacing so fixed row labels no longer sit hard against the left edge. Section prompts now use the same margin rhythm as the room header.
- Added direct matrix-cell creation controls. Each Life Landscape cell can now open capture in the correct life area and anchor without first switching into Focus view.
- Made the destination anchor authoritative when a Landscape note is moved. Moving a Vision note into Decisions now rewrites canonical Markdown metadata to `cardType: decisions`, `semanticType: growth`, and `landscapeAnchor: decisions`; moving away from Decisions removes stale `decision_horizon` metadata while preserving unrelated unknown frontmatter.
- Tightened Landscape focus restoration so a failed move returns focus to the exact failed menu action instead of being overwritten by an older successful reorder focus restore.
- Verification passed 41 focused app/application tests, typecheck, ESLint/stylelint, eight desktop Chromium Landscape journeys with one intentional touch-only skip, and all 10 Landscape visual/axe states across sparse/dense matrices, focus/lens, compact, zoom, mobile, forced colors, and reduced motion.

## 2026-07-15 — Ateliera brand realignment

- Renamed the public product identity from The Studio to Ateliera across the web app, PWA manifest, browser metadata, onboarding, navigation, Foyer, Settings, portability, backup/restore, diagnostics, tests, release tooling, and product/design documentation.
- Adopted the tagline “A private studio for designing a life from the inside out.” as the primary product positioning while preserving Studio as the in-product metaphor for Studio spaces, Studio rooms, and the user-owned local files.
- Updated native macOS identity to Ateliera, including the Tauri product name, bundle identifier, window title, Rust package/binary names, and release/build scripts. Historical generated artifact guards now reject both original `The Studio.dc.html` references and future `Ateliera.dc.html` prototype references.
- Renamed user-owned export and technical namespaces where they represented product identity, including portable archive format labels, browser storage roots, OPFS channels, backup filenames, diagnostic exports, and default local Studio naming.
- Deliberately retained historical source filenames and reference artifacts under `docs/design/reference/`, existing PRD/plan filenames, the `.studio/` control-folder convention, `@studio/*` package namespace, `StudioService`, and `studio-*` CSS/token naming because those are implementation contracts or domain metaphors rather than user-facing product branding.
- Verification covered focused app/storage/tooling unit tests, typecheck, ESLint/stylelint, Rust tests/format/clippy, PWA build inspection, desktop Chromium onboarding/shell journeys, and Foyer visual/a11y states across responsive, forced-colors, and reduced-motion variants.

## 2026-07-15 — Onboarding entry boundary

- Replaced the inactive Foyer shell with a dedicated full-viewport Ateliera entry boundary. Before a Studio Space is active, room navigation, mobile navigation, Search, Capture, room routes, and loading announcements are no longer mounted.
- Added a reducer-backed entry/active contract and an explicit active-application component boundary. The router remains dormant before entry, preserves the launch URL, and only canonicalizes it when a Studio Space becomes active.
- Kept existing browser and native create/open behavior intact, including duplicate protection, progress locking, injected test services, and the transition into the Foyer after activation.
- Verified all 175 app tests, TypeScript, ESLint/stylelint, 20 desktop/mobile onboarding and shell journeys, axe on both sides of the threshold, and inspected fresh-entry screenshots at 1440×1000 and 390×844.

## 2026-07-15 — Dedicated Studio Space entry gate

- Introduced Ateliera and its “inside out” positioning at the threshold, with platform-specific local-storage reassurance and clearer **Create a new Studio Space** / **Open an existing Studio Space** language.
- Replaced the browser select picker with calm, accessible return cards for one or several known Studio Spaces. The entry gate remains a focused place-selection surface rather than growing into a management dashboard.
- Made the app-level theme picker available outside a Studio Space and added Storybook coverage for new, returning, multiple, native, error, long-name, mobile, and dark entry states.
- Caught and corrected both a mobile handwritten-text contrast failure and an invalid desktop spacing-token reference through axe and direct screenshot inspection. Focused desktop/mobile onboarding journeys, all 178 app tests, typecheck, lint, and the Storybook production build pass.

## 2026-07-15 — Recoverable Studio entry progress

- Expanded the entry reducer into explicit entry, creating, opening, error, and active states with attempt ownership. Stale progress, failure, cancellation, or activation events from an abandoned attempt can no longer replace the current entry state.
- Added honest creation/opening phases and a ten-second longer-than-usual explanation without percentages, progress rings, or indefinite spinners. Creation progress stays inside its active sheet so assistive technology does not announce duplicate status from the obscured entry gate.
- Creation cancellation now preserves the typed Studio Space name and returns focus to the entry action. Failed opening stops progress and offers explicit **Try again** and **Return to the beginning** paths.
- Verified the transition table, 185 app tests, typecheck, lint, all 14 desktop/mobile onboarding journeys, and all 55 native storage tests.

## 2026-07-15 — Portable per-Studio onboarding state

- Added a typed `.studio/settings.json` repository as the authority for each Studio Space's First Visit state. The schema records named tour steps, start/update/complete/dismiss timestamps, and the optional legacy-tour invitation dismissal without using browser `localStorage`.
- Preserved unknown top-level settings across structural rewrites and treated a valid settings file with no onboarding metadata as a legacy-compatible not-started state rather than corruption. Malformed onboarding fails soft, retains its exact durable revision for repair, and preserves unrelated valid settings.
- Made every write atomic and exact-hash guarded. High-level tour transitions reload and retry boundedly after a concurrent writer wins, while direct stale saves still surface their conflict; an interrupted write leaves the last valid settings readable.
- Exposed the repository through the active `StudioService`, allowed only the exact settings control path, and kept arbitrary `.studio/settings/*` access outside the control boundary.
- Proved `.studio/settings.json` survives both portable export/import and named backup/restore. Focused application and storage tests, typecheck, and ESLint/stylelint pass; the broader 1,255-test workspace run passed 1,240 tests, with 15 pre-existing Search assertion failures caused only by the committed `safe vault path` / `safe Studio file location` wording mismatch.

## 2026-07-15 — Gentle First Visit

- Added a quiet First Visit threshold after creation, with an explicit choice between a five-room guided wander and immediate entry. Interrupted visits resume from their durable per-Studio step; completed and dismissed visits remain replayable from Settings without duplicating user content.
- Furnished Foyer, Life Landscape, Current Season, Uncharted, and Reflection Garden with immutable, clearly labelled example compositions that are passed only through presentation props. Examples never enter canonical projections, Search, Inbox, backups, diagnostics, or Markdown; approved starting points become ordinary editable captures only after an explicit choice.
- Integrated examples into each room's authentic structure rather than appending a generic gallery. Canonical slot occupancy suppresses the matching Foyer starting point across relaunch and replay, while cancelling a starting point writes nothing.
- Serialized direct room visits, guide navigation, completion, and dismissal through one latest-intent persistence queue. Competing navigation cannot leave an older durable step behind the visible room, and replay now records the Foyer before the walkthrough appears.
- Added stable heading focus, named spatial controls, next-room prefetching, compact guide controls, reduced-motion and forced-colors behavior, state-aware Settings copy, and a single legacy invitation for Studio Spaces created before onboarding metadata existed.
- Directly inspected the welcome and all five furnished rooms at 1440×1000 and 390×844. Corrected a mobile focus race, Landscape heading hierarchy, and a wide-layout control overlap found through Playwright and screenshot review.
- Verification passed TypeScript, ESLint/stylelint, all 1,283 workspace tests at the time of the initial gate, desktop and mobile five-room Playwright journeys with axe at every step, keyboard/reduced-motion/forced-colors/compact checks, and focused regression coverage for persistence races, replay, cleanup, and canonical example suppression.

## 2026-07-15 — Onboarding release hardening

- Replaced pnpm's retired production-audit endpoint with a deterministic audit
  tool that derives the exact installed production dependency tree and queries
  npm's supported bulk advisory endpoint. The current 202-version production
  inventory reports no advisories.
- Made the cold-offline existing-Studio journey wait for completed Studio
  activation before navigating. This aligns the test with the deliberately
  backgrounded index rebuild instead of racing the room shell.
- Added one CI-only browser retry for transient Chromium/WebKit process
  exhaustion and serialized the visual release project to one worker. Local
  development remains fail-fast.
- Scoped Storybook axe scans to `#storybook-root` so the release harness audits
  the rendered Ateliera story rather than Storybook's outer document. No axe
  rules were disabled; a dedicated regression proves defects inside the story
  root are still detected.
- Made native packaging remove the previous bundle directory before building
  and made native inspection reject unexpected sibling `.app` bundles. The
  resulting inventory contains only `Ateliera.app` and the matching Ateliera
  DMG; `hdiutil verify`, metadata inspection, and the unsigned/unnotarized
  policy checks pass.
- Individual release gates pass: typecheck, lint, production build, 1,292
  workspace tests under normal load, 29 security tests, 55 Rust tests,
  formatting, clippy, production dependency audit, target-aware Rust audit,
  restore drill, 165 production E2E journeys with 32 intentional skips, the
  visual/axe matrix, PWA inspection, and native bundle inspection.
- The retained all-in-one release manifest is not yet final. During the last
  complete verifier run, unrelated Google Drive and macOS service CPU pressure
  caused two asynchronous unit tests to exceed their timeouts; their exact two
  files then passed 44/44 in 18 seconds. The complete verifier must be rerun on
  a quieter reference host before this candidate is represented as a fully
  green release manifest.

## 2026-07-16 — Focused First Visit tour

- Replaced the fixed guide sidebar with a full-width focused-tour composition.
  The elevated guide now precedes an independently framed active room, so
  Foyer, Landscape, and other intrinsically wide room layouts retain their
  usable width and cannot collide with tour copy.
- Made the next destination the guide's single strong primary action, with
  explicit **Next room · …** labels and a distinct **Finish tour · Return to
  Foyer** action. Focus moves to each guide heading before the active room, and
  the guide remains visible until the person deliberately leaves or completes
  the tour.
- Added an AppShell focus mode that applies native `inert` to the desktop rail,
  top bar, and mobile navigation while visually fading and lightly blurring
  those unrelated regions. The active room, authentic examples,
  starting-point actions, Previous/Next, and Leave remain interactive. Global
  command-palette shortcuts and any open shell menus are suppressed while the
  tour is active and restored immediately afterward.
- Added forced-colors treatment, reduced-motion continuity, full-width mobile
  behavior, and an invisible inert mobile navigation state so fixed shell chrome
  cannot cover the active room.
- Direct Playwright inspection at 1440×1000 and 390×844 confirmed the guide/room
  boxes do not intersect and the reported Foyer overlap is gone. Focused unit
  verification passed 30 UI and 216 app tests; typecheck and lint pass; the
  onboarding browser matrix passed 17/17 applicable Chromium journeys plus 8/8
  applicable WebKit journeys, with the two project-specific preference tests
  intentionally skipped outside desktop Chromium.

## 2026-07-16 — Identity Studio and Wisdom Garden

- Completed the seven-room house with full Identity Studio and Wisdom Garden
  routes, desktop/mobile navigation, command-palette destinations, calm
  empty/loading/stale/offline/error states, and responsive editorial layouts.
- Added canonical identity sections, a current-becoming projection shared with
  the Foyer, evidence links from Reflection/Celebration, inline capture,
  promotion, and keyboard-operable section ordering without duplicating
  Markdown notes.
- Added editable Wisdom themes, thematic reading, typed and attributed sources,
  personal responses, and multi-note synthesis that preserves stable
  source-note IDs alongside readable wiki links.
- Kept both rooms Markdown-native. `source_notes` now round-trips through
  frontmatter, source attribution and themes remain editable in the canonical
  card editor, and Wisdom theme preferences live in a small atomic `.studio`
  configuration file.
- Clarified the semantic model: Meaning is the global colour lens, while Life
  Landscape anchors are structural positions. Contextual capture now suggests
  or locks the appropriate meaning, moving a Landscape card reclassifies it,
  and anchored notes explain why their meaning is not independently editable.
- Introduced one shared handwritten room-heading composition across Foyer,
  Identity, Landscape, Current Season, Uncharted, Wisdom, Reflection, Search,
  Settings, and placeholders. Removed Landscape's double horizontal inset and
  corrected the heading's optical left alignment.
- Verification passed typecheck, ESLint/stylelint, all 1,330 workspace tests,
  focused desktop Chromium persistence journeys for both new rooms, axe with
  zero violations, and the existing Landscape matrix/focus/lens browser
  journey. Direct screenshot review covered the integrated Identity Studio,
  Wisdom Garden, and Life Landscape.

## 2026-08-21 — The Almara Seam: rhythm engine and Today's Gift

- Folded Almara's rhythm/resurfacing engine into Ateliera. A Gift — a real
  resurfaced card or a calm fallback line — now appears in the Foyer, ranked by
  moon/cycle/year-wheel/natal position, and can be kept as an ordinary card
  through the existing capture-placement system. Implemented as the eight-task
  `docs/superpowers/plans/2026-08-18-almara-seam.md` plan; every task is one
  atomic commit and the feature branch is not yet merged pending a live try.
- Merged the extracted, dependency-free `@studio/rhythm` package (natal chart,
  resurfacing selection, year-wheel/moon/cycle context, timezone) with its 60
  tests. Ambient season stays "the year-wheel" in new code so it never collides
  with the Current Season room.
- Added opt-in `resurface_kind` (`evidence`/`reframe`/`wish`/`dream`),
  `resurface_due`, and `resurface_interval_days` frontmatter, round-tripping
  through parse/serialize and preserved when absent. `resurface_kind` is never
  auto-assigned — a person marks a card for resurfacing deliberately in the
  CardEditor, and only for Reflection Garden or Uncharted notes.
- Built `buildResurfacePool` over the disposable index — cards with a
  resurface kind from Reflection Garden and Uncharted only — with documented
  `LIMIT 200` ordering. Added the versioned, atomic, revision-guarded
  `rhythm-profile.json` repository mirroring the Wisdom theme repository, including
  the corrupt-bytes-untouched recoverable-default and future-version-refusal
  behavior. Exposed the repository on `StudioService`.
- Added the Settings rhythm-profile section: birth date/time/timezone/place and
  cycle basis, recomputing and caching natal placements on save. Added the
  Foyer `TodaysGift` component and `useTodaysGift` hook — no slot when no profile
  is saved, the calm fallback when a profile exists but nothing is due, and the
  resurfaced card's title/excerpt otherwise. Keep routes dreams to Uncharted and
  everything else to Reflection Garden, advances the source card's due date, and
  shows busy/error/success feedback; index or note-load failure falls back to the
  calm Gift rather than breaking the Foyer. Today is sourced from an injectable
  clock, not `new Date()`.
- Verification passed typecheck, ESLint/stylelint, all 1,486 workspace tests,
  and the full Playwright suite at 172 passed with 32 intentional
  browser/layout skips. The feature is code-complete; live trial of the Gift in
  the running app and the merge decision remain Anna's call.

## 2026-08-21 — Birthplace picker instead of raw coordinates

- Replaced manual latitude/longitude entry in the rhythm profile with an
  offline birthplace picker. A person types a place name; the Studio derives the
  latitude, longitude, IANA timezone, and hemisphere from the choice. Nobody has
  to know their own coordinates. Manual lat/lon/timezone/hemisphere entry moves
  into a collapsed "Set the location manually" advanced section, still pre-filled
  by a chosen place, for birthplaces not in the list or exact coordinates.
- Added a build-time-only gazetteer pipeline: `scripts/generate-places.mjs`
  bakes `all-the-cities` (GeoNames, CC BY 4.0) plus `tz-lookup` into a committed
  `packages/rhythm/src/places-data.js` asset — 135,233 places, population-sorted,
  one TSV row of name/country/lat/lon/timezone each. `all-the-cities` and
  `tz-lookup` are devDependencies only; the app gains no new runtime dependency.
  The generated `.js` is a plain module (with a `.d.ts` companion) so tsc never
  parses its ~6.5 MB string literal, mirroring the astronomia lazy-import pattern.
- Added `searchPlaces(query, limit)` to `@studio/rhythm` — pure, offline,
  case-insensitive, prefix matches ahead of mid-string, each in descending
  population order. The gazetteer loads lazily on the first search and is cached.
- The gazetteer builds as its own lazy chunk (5.85 MB / 2.23 MB gzipped),
  separate from the 390 KB startup entry, and is deliberately excluded from the
  service-worker precache: it's a rarely-used enhancement, so it's fetched on
  demand rather than tripling the install payload. Core offline behavior is
  unaffected — manual coordinate entry still works, and a failed gazetteer load
  degrades quietly to no suggestions.
- The birthplace combobox is a keyboard-operable ARIA listbox (Arrow keys, Enter
  to choose, Escape to close, active-descendant tracking) and injects its search
  function so tests never load the real gazetteer.
- Verification passed typecheck, ESLint/stylelint, all 1,496 workspace tests
  (10 new: 6 for `searchPlaces`, plus birthplace-picker cases in the Settings
  suite), the production build with the startup-entry budget intact, and the
  full Playwright suite at 172 passed / 32 intentional skips.

## 2026-08-28 — Native parity: P1–P4 (metadata depth, themes, the Gift, faceted search)

The SwiftUI app (`apple/`) advanced from ~30% toward full web parity along the
accepted P1–P9 roadmap (`docs/superpowers/plans/2026-08-28-ateliera-native-parity.md`,
with per-phase specs + a shared BUILD-PLAN under `docs/superpowers/plans/parity/`).
Pure algorithm cores for P2/P3/P4 were built in parallel (cost-tuned subagents),
each golden-matched to the corresponding `@studio/*` package, then integrated
serially into the shared Swift files. All writes stay on the one atomic,
path-contained, expected-hash rail; every phase is TDD'd (unit + XCUITest).

- **P1 — note depth (already on main):** the full `StudioNote` metadata editor,
  `[[wikilink]]` parsing/navigation, and a body preview, all round-tripping
  byte-identically with unknown frontmatter surviving.
- **P2 — themes:** all seven palettes (`StudioTheme`, hex from `tokens.css`) live
  via a single `@Environment(\.studioTheme)` mechanism; a Settings switcher persists
  the choice (`ThemeStore` → `UserDefaults`) and recolours the app instantly.
- **P3 — the Gift:** the SM-2 resurfacing engine (golden-matched to
  `resurfacing.ts`, incl. the interval table and UTC `addDaysISO`), a resurface
  pool over the loaded vault, and a Foyer "Today's Gift" card. Grading (Not now/
  Keep/This landed deeply → quality 2/4/5) files a keepsake copy for a passing
  grade and advances the source note's `resurface_due`/`interval_days` through the
  write rail — the "learns" loop, closed. No streaks or counts.
- **P4 — faceted search + links:** a disposable in-memory `SearchIndex` +
  `LinkGraph` rebuilt on every `reload()`. Prefix ranking, snippet highlight
  ranges, match reasons, and seven facet groups; wikilink/markdown/`studio://note`
  backlinks + forward-links (resolved/broken/ambiguous) surfaced in the note
  editor's Links screen. Replaced the old substring `NoteSearch`.
- **Deferred (next slices):** P4's repair panel (needs editable-link offsets +
  `rewrite` + `RepairQueue`), then P5–P9 (rooms depth, capture classification,
  conflict-merge/export, Foyer richness).

## 2026-08-28 — Native parity P5: Life Landscape + Identity Studio

Two centerpiece rooms, built pure-core-first then wired serially (all writes on the
atomic path; golden-matched to `@studio/application` projections + `@studio/domain`).

- **Types** (`LandscapeTypes`/`IdentityTypes`): extend P1's `LandscapeAnchor` with
  labels/prompts/semantic mapping; `DecisionHorizon`, `LifeArea(Preference)`,
  identity sections. `Identity.sectionForCardType` reproduces the *web* function
  (find-by-cardType then shared-card table) — the P5 spec's looser table was wrong;
  section-id-style card types correctly return nil.
- **Pure cores**: `LandscapeProjector`/`IdentityProjector` (ported
  `projectLandscapeBoard`/`projectIdentityStudioRoom` incl. `visible()` draft-inbox
  clause, `fallbackCompare`, manual-order overlay, featured promotion, evidence
  linking, currently-becoming); `LifeAreaConfig` + `ViewState` codecs byte-identical
  to the web JSON (`id,title,hidden,order` key order; `%3A` view paths — both
  captured from node, the spec's alphabetical claim was wrong). `decision_horizon`/
  `related_notes` read from `extraFrontmatter` (P1 shim). 37 unit tests.
- **Stores**: `LandscapeStore` (config load, board projection, move card to anchor,
  reorder, add/rename/hide areas) + `IdentityStore` (project, add card, promote,
  reorder) over new `VaultStore` raw-file + typed-capture helpers. 7 integration tests.
- **Rooms**: `LandscapeRoomView` (focus view — area chips, 5 anchor sections, a
  keyboard-accessible Move menu, area manager) + `IdentityRoomView` (currently-
  becoming hero, 7 sections, add form, promote), added to `Room.all` and wired into
  the Foyer. 2 XCUITests (seeded via `ATELIERA_UITEST_P5`).
- **Compiler note**: cross-file `if case` matching on the `indirect enum` YamlNode
  trips a spurious "circular reference"; fixed by keeping all YamlNode case access in
  StudioNote.swift (new `frontmatterScalar/Bool/List` accessors) and calling those.

## 2026-08-29 — Native parity P4 repair panel (deferred slice)

Closed the P4 follow-up: `LinkEditor` (editable WIKI links with UTF-16 offsets +
`rewrite`, golden-matched to link-edit.ts — offsets/remove/relink verified against
node), `RepairQueue` (broken/ambiguous links via the link graph + duplicate-id
metadata, ordered path→kind→occurrence), `VaultStore.repairQueue()`/`repairLink()`
on the atomic rail, and a `Search/RepairView` reached from Settings → Repair links.
Markdown/reference-link repair (needs mdast offsets) stays a documented follow-up;
wiki links are the form Ateliera writes. 14 pure + 2 integration unit tests + 1
XCUITest. Gotcha: a row-level `.accessibilityIdentifier` overrides child ids in
XCUITest — put ids on the leaf controls, not the container.

## 2026-08-29 — Native parity P6 (partial): Uncharted + Wisdom Garden

Building P6's four rooms in the spec's order (Uncharted → Wisdom → Reflection →
Season), each a shippable slice. Two done:

- **Uncharted**: `UnchartedProjection` (near/beyond split by `beyond_gate`
  extraFrontmatter, golden-matched to projectUnchartedRoom) + `UnchartedStore`
  (keep near/beyond) + `UnchartedView` (composer + two grids). New `createNote`
  helper on VaultStore (used by Wisdom too) and a `capture(…extraFrontmatter:)`
  overload for the `beyond_gate` flag. Season-invitation deferred to the Season room.
- **Wisdom Garden**: `WisdomDomain` (7 kinds, `semanticTypeForWisdomKind`, 13 default
  themes — golden), `WisdomProjection` (cards + theme counts, port of
  projectWisdomGardenRoom), `WisdomStore` (add-idea with kind/themes/source,
  synthesize N notes → a `synthesis` card carrying `source_notes`), `WisdomView`
  (theme filter, add-idea sheet, card list with select, synthesis sheet). Theme-editor
  config + "make it mine" are documented follow-ups.

12 unit tests + 2 XCUITests; full suite green. Still open in P6: Reflection rich
views (4 tabs + evidence resolution) and the Season wizard (9-step state machine +
note mapper + close transaction) — the largest remaining slice.

## 2026-08-29 — Native parity P6 (cont.): Reflection Garden

Third of P6's four rooms. `ReflectionProjection` ports `projectReflectionGardenRoom`
+ `reflectionEvidenceConnections`: a chronology (created desc, id asc) with each
entry's evidence connections resolved — linked notes (available/archived/missing by
target status), life areas (available, or archived when hidden), and seasons
(matched by `season_id`, active→available / archived→archived / else missing) —
plus theme tag-counts (count desc, name asc). `ReflectionStore` loads the configured
life areas for resolution and captures reflection/celebration entries.
`ReflectionView` gives four tabs (Garden · Reflection · Celebration · Themes), a
capture bar with a kind selector, and entry cards showing colour-coded marks +
evidence lines. Cover images, Then & Now, and the connect-evidence form are
documented follow-ups. 7 unit + 1 XCUITest; full suite green.

P6 now: Uncharted ✓, Wisdom ✓, Reflection ✓. Remaining: the Season wizard
(9-step state machine + note mapper + close transaction) — the largest slice.

## 2026-08-29 — Native parity P6 complete: the Season wizard

The last and largest P6 room. `SeasonDomain` (`SeasonEngine`) ports the nine-step
state machine from season.ts (createDraft/updateDraft/activate/close/progress,
date + priority + reflection validation). `SeasonNoteMapper` is byte-identical to
season-service.ts: `markdownForSeason`, `seasonLetterBody`, and the
`season_workflow` nested map (with `decisions` as a block sequence of maps) — this
required extending `YamlNode` with a `mapSeq` case (serializer + parser), plus
teaching the parser to read unquoted `true`/`false` as booleans (else re-serializing
`skipped_prior_reflection: false` quoted it). All cross-file YamlNode construction
lives in StudioNote.swift (`applySeasonFrontmatter`) to dodge the indirect-enum
compiler cycle. `SeasonStore` drives begin → save step → activate → close (files a
reflection letter + archives), with multiple-active-season repair. `SeasonView` is
the wizard (step N of 9), the active view, and the close sheet. Structured decision
entry in the UI, and the per-disposition note side-effects, are documented follow-ups.

Golden bytes captured from the web serializer; the full season note round-trips
byte-identically and the existing note round-trip tests stay green. 18 unit + 1
XCUITest for Season. **P6 done: Current Season, Uncharted, Wisdom, Reflection all
shipped.** Remaining roadmap: P7 (structured/classified capture + media), P8 (data
UI: export/import/revisions/conflict-merge), P9 (onboarding + rich Foyer).

## 2026-08-29 — Native parity P7 (partial): classified capture

Structured capture, consolidating the per-room composers into one golden-matched
path. `CaptureDestination` (+ `FoyerSlot`, reusing the P5/P6 anchor/section enums)
resolves each of the five structured destinations — Foyer placement, Life Landscape
anchor (+ decision horizon), Identity section, Wisdom kind (+ themes/source), and
Uncharted (+ beyond gate) — to the exact `card_type`/`semantic_type`/`rooms`/`status`/
`life_areas`/`landscape_anchor`/`tags`/`source`/`extraFrontmatter`/folder the web
writes, including a golden `portableLifeAreaFolder` (the spec's examples were wrong;
bytes captured from the TS). `CaptureValidator` mirrors the pre-write checks (empty
body, decision-horizon-only-on-Decisions, http(s) wisdom source, ≤40 themes).
`VaultStore.capture(destination:)` writes with an 8-attempt collision retry.
`ClassifiedCaptureSheet` (+ `CaptureGuidance`, copy verbatim from field-guidance.ts)
is reachable from the Foyer's "Place a card" — place a becoming / feeling / principle
as a featured Foyer card, or a quick note. 17 unit + 1 XCUITest; full suite green.

Deferred (P7 remaining): cover-image media — needs a Rust core `write_binary`/
`read_binary` extension (+ UniFFI regen), then `VaultMediaStore` (path guard + magic-
byte sniff + 16 MB cap) and a `PhotosPicker`. Then P8 (export/import/revisions/
conflict-merge) and P9 (onboarding + rich Foyer).

## 2026-08-29 — Native parity P7 complete: media (cover images)

The last P7 slice, and the first Rust-core change since N3. Added
`write_binary`/`read_binary` to `AtelieraVaultCore` (`src/lib.rs`) — same atomic,
path-contained, symlink-refusing write path as `write_text`, taking/returning raw
bytes (2 cargo tests: round-trip + traversal refusal); rebuilt the 3-slice
XCFramework + UniFFI Swift bindings via `build.sh`. `VaultMedia` ports
`cover-media.ts`: `normalizeCoverPath` (traversal / scheme / absolute / `.studio*`
guards — golden-matched to the TS, whose real behaviour differs from the P7 spec's
examples), extension→MIME, and magic-byte sniffing (JPEG/PNG/GIF/WebP/AVIF), with a
16 MB cap. `VaultStore.setCover`/`readCover` write + read a validated `Media/cover.<ext>`
through the Rust binary path. A `PhotosPicker` in the note editor imports a cover and
sets `display.cover`, showing the thumbnail. 5 media unit tests (incl. the full vault
round-trip); the system picker isn't XCUITest-driveable so the flow is unit-covered.

**P7 done: classified capture (Foyer/Landscape/Identity/Wisdom/Uncharted) + cover
media.** Native parity now spans P1–P7. Remaining roadmap: P8 (export/import ZIP,
revisions, diagnostics, conflict-merge — more Rust FFI) and P9 (onboarding +
disclosure + rich Foyer).
