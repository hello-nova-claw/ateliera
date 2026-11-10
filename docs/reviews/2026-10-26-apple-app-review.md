# Ateliera native app — independent review (2026-10-26)

Scope: `apple/` (SwiftUI app, widget, intents, Rust vault core) on `main` at `3dd67d2`.
Method: seven parallel, read-only reviewers (code quality, security, accessibility + localisation,
App Store readiness, bug sweep, test coverage, UX), followed by a hand verification of the
highest-impact findings against the source. Nothing was changed or run; no `xcodebuild`.
Findings marked **✔** were re-verified by reading the code path after the reviewer reported it.

---

## Verdict

The foundations are strong: every vault write goes through the Rust core (capability-scoped
directory, `O_EXCL` temps, fsync, hash-guarded `renameatx_np`, no `unwrap`), there is no
network SDK, no analytics, no logging of note content, HealthKit data never leaves memory, and
the shared formats are genuinely golden-matched to the TypeScript packages with provenance
comments. The iPhone flow is calm and consistent.

What stands between this and a shippable 1.0 falls into five clusters:

| # | Cluster | Why it matters |
|---|---|---|
| 1 | **YAML frontmatter round-trip is lossy** (quote escapes, scalar typing, silent truncation, newline injection) | Breaks the core invariant "unknown keys survive round-trips" for ordinary web-authored notes; a swipe-Delete is enough to trigger it. |
| 2 | **Swift ports dropped the web's validation** in revisions and import | A crafted or synced manifest can hard-delete or overwrite arbitrary vault files; import plants active content. |
| 3 | **First five minutes on a real device** | Upload fails on iPad orientations; cold launch stacks a folder picker, a Location alert and a menstrual-cycle Health sheet; cancelling the picker strands the user; a new Studio hides the rooms the capture flow writes into. |
| 4 | **Reversibility and reach** | Swipe "Delete" is instant, unconfirmed, and there is no Trash view; natal chart and Sky-ahead are reachable only via a collapsed panel; iPad/Mac get the phone tab bar with no keyboard support. |
| 5 | **Accessibility baseline** | The `inkFaint` and `script` tokens fail WCAG AA in every theme for all small metadata and room eyebrows; no localisation infrastructure at all. |

Everything below is ranked within its dimension. A suggested order of work is at the end.

---

## 1. Bugs (data integrity, correctness)

| Sev | Where | Defect | Repro / consequence | Fix |
|---|---|---|---|---|
| HIGH ✔ | `Note/NoteParser.swift:216` vs `Note/StudioNote.swift:333` | `unquote` strips quotes but never unescapes; `doubleQuote` escapes `"` and `\`. | Title `Note: "quoted"` → each native save doubles the backslashes; web reads a different string. Same for any unknown key with a quote plus `: `. | Decode the double-quoted escape set in `unquote` (`\\ \" \n \t \uXXXX`); golden test with `: ` + `"`. |
| HIGH ✔ | `Note/StudioNote.swift:286` `needsQuoting` | Ignores `\n`/`\r`. | A scalar containing a newline is emitted raw → injects frontmatter keys (e.g. `resurface_kind: wish` enters the Gift pool) or `---` makes the note unparseable. | Escape `\n \r \t` and C0 controls; strip newlines at single-line UI fields. |
| HIGH | `Note/NoteParser.swift:189` | Only bare `true`/`false` are typed; everything else becomes `.scalar` and is re-quoted. | `rating: 5` → `rating: "5"`; `x: null`/`~` → `"null"`. Value types change for other tools. | Add a `.raw(String)` node that re-emits verbatim for numeric/null tokens. |
| HIGH | `Note/NoteParser.swift:129` | Parser `break`s at the first line it cannot read (comment, `\|-` block scalar, flow map). | Web `yaml` emits `\|-` for multi-line strings; extra keys serialize first, so every schema key after it is lost → note vanishes into Repair, or trailing keys are silently deleted on save. | Parse `\|`/`>` block scalars; keep unknown-shaped lines as `.raw`. |
| HIGH ✔ | `VaultStore.swift:1070` `reload()` | Throws on the first `readText` failure (invalid UTF-8, size change mid-sync). | One Latin-1 `.md` makes the vault unopenable; `openFromPersistedBookmark` swallows the error → folder picker on every launch. | Per-file `try?` into `unparsedPaths`; surface `openVault` errors. |
| MED | `VaultStore.swift:484,548,626` | Write and post-write `reload()` share one `do`. | Reload failure after a successful write reports failure → duplicate notes on retry (up to 8 for `capture(destination:)`), phantom self-conflicts in the editor. | Separate the write from the reload; treat reload failure as non-fatal. |
| MED | `VaultStore.swift:858` `resolveConflictSaveAsNew` | Uses the plain `capture(title:body:room:)`. | Save-as-new drops cardType, status, tags, lifeAreas, resurfacing schedule, cover, unknown keys. | Write `conflict.draft` through `createNote` with a fresh id. |
| MED | `VaultStore.swift:370` | Inbox→Journal migration flag lives in `UserDefaults` keyed by path. | Second device or reinstall re-runs it and promotes every current Inbox draft. | Persist the marker in `.studio/` in the vault. |
| MED | `Note/WikilinkNavigator.swift:14`, `RootView.swift:1152,1308`, `Constellation/ConstellationView.swift:108` | Navigator/picker/constellation use the raw first line (`# Calm morning`); index and backlinks use `Projection.effectiveTitle`. | Links view says resolved; tapping says "Note not found". Picker inserts `[[# Calm morning]]` which repair flags as broken. | Give `NoteSummary` an `effectiveTitle`; fold with `LinkGraph.titleKey`. |
| MED ✔ | `RootView.swift:344`, `Foyer/Invitation.swift:73-124`, `Rhythm/SkyAheadView.swift:175-191` | `nowMs` is local-date→UTC-midnight; events are real instants displayed as UTC civil dates. | Sydney: a full moon at 09:00 local today is omitted; an event at 01:00 local Nov 6 shows as "November 5". Pacific: past events show as "today". | Pass real `Date()` ms; convert instants with `Calendar.current` for display. |
| MED | `Rhythm/LocationHemisphere.swift:29` | A second `resolveHome()` overwrites the pending `CheckedContinuation`. | Launch task awaiting the permission sheet + Settings "Use my location" → first await hangs forever; Health, gift refresh, micro-season never run that session. | Resume the pending continuation with nil before replacing, or serialise. |
| MED | `Note/MetadataEditorView.swift:131` | `listBinding` splits on `,` on every keystroke. | Typing `a,` collapses to `a`; a second tag can only be pasted. | Local `@State` string, parse on commit. |
| MED | `Identity/IdentityRoomView.swift:18` et al. | Room views project once at init. | Delete/archive via the shared editor leaves the card on the board until you leave the room. | Re-project on store change. |
| LOW | `DataManagement/VaultImporter.swift:65` | Exact-path membership ignores `portablePathKey`. | Case/NFC-different paths classified `.create` → whole batch fails on APFS; on iOS writes both and collides later. | Compare with `portablePathKey`, classify as overwrite. |
| LOW | `AtelieraVaultCore/src/lib.rs:333` | Batch rename loop `?`s out with no cleanup. | Earlier files committed, temps left, revision bumped; `rename_exclusive` → `Unavailable` on ExFAT/SMB so every create fails there. | Clean up temps on failure; fall back when `renameatx_np` is unsupported. |
| LOW | `Rhythm/Rhythm.swift:305` | Southern micro-season shifts month by 6 without clamping day. | Aug 29–31 look up "Feb 29–31" → wrong term five days early. Golden-ported, so the web likely shares it. | Clamp day; fix upstream in `@studio/rhythm`. |
| LOW | `DataManagement/RevisionStore.swift:78` | One snapshot per day. | Second conflict-overwrite in a day prunes the first pre-overwrite copy. | Exempt `conflict-resolution` snapshots from same-day pruning. |
| LOW | `DataManagement/VaultExporter.swift:22`, `Zip32Writer.swift:58` | Whole vault loaded into memory; `UInt32(offset)` cast precedes the size check. | Jetsam on media-heavy vaults; trap past 4 GiB. | Stream; check running size before the cast. |
| LOW | `RootView.swift:1236`, `Rhythm/MicroSeasonStore.swift:72` | Stale drafts silently dropped; micro-season cache write failure surfaces as a red Foyer error. | Crash-recovery lost once the file changed elsewhere; cache races print on Today. | Offer stale drafts like the web; don't route cache errors to `store.error`. |
| LOW | `RootView.swift:211-220` | Three `onChange`s each spawn `refreshMicroSeason()` with no cancellation. | On-device model runs twice; an earlier result can overwrite a later one. | Debounce / cancel the previous task. |
| LOW/PLAUSIBLE | `RootView.swift:291,555` | `.edit(next)` while `.edit` is up may diff rather than recreate `NoteEditView`. | Old `@State note` body could be saved into the new path. | `.id(editable.path)` on `NoteEditView`. |

---

## 2. Security & privacy

| Sev | Where | Finding | Fix |
|---|---|---|---|
| HIGH ✔ | `DataManagement/RevisionStore.swift:92-95, 99-110` | `prune()` removes every `snapshotPath` named in any `.studio/backups/**/manifest.json`, with no validation. The web port requires `snapshotPath == copyPath(root, originalPath)` and removes with an expected hash. A backup ZIP (or any writer to the synced folder) can plant a manifest dated 2000 listing `Journal/important.md`; the next conflict overwrite hard-deletes it. | Validate manifests on `list()` exactly as `revisions.ts` does; prune only under the snapshot's own folder; remove with expected hash. |
| MED ✔ | `DataManagement/RevisionStore.swift:114-123` | `restore()` writes `originalPath` from the manifest with `expectedHash: nil`. A planted snapshot labelled "Conflict resolution" overwrites arbitrary notes or `.studio/views/*.json`. | Same validation; pass the current hash as `expectedHash`. |
| MED | `DataManagement/VaultImporter.swift:55-70` | Import skips the web's `assertNoActiveContent`, duplicate-entry, NFC/case-collision and manifest checks (`PortableManifest.activeExtensions` is export-only). A ZIP can plant `Evil.app/…`, `.command`, `.html` into the iCloud vault with no quarantine attribute. | Port the four checks into `prepare`. |
| MED | `lib.rs:347-361`, `Zip32Reader.swift:36` | Duplicate ZIP entry names stage two temps; first commits, second fails `RENAME_EXCL`; batch is non-atomic on commit failure, temps leak, revision bumped, reload skipped. | Reject duplicates in the reader and in `write_batch_atomic`; clean up on rename failure. |
| MED | see Bugs rows 1–4 | YAML asymmetry doubles as an injection vector (newline in a scalar adds frontmatter keys). | As above. |
| MED ✔ | `RootView.swift:191-197`, `Rhythm/LocationHemisphere.swift:52`, `Rhythm/PlaceGeocoder.swift:35`, `project.yml:50` | Location is resolved **every launch** (not only when `homePlace.place == nil`) and the precise coordinate goes to Apple's geocoder over the network. Usage string says "once … stays on your device"; CLAUDE.md says no network. Precise lat/lon persisted in UserDefaults though only hemisphere + climate band are used. | Resolve only when nothing is persisted; make geocoding an explicit Settings action; round stored coordinates; reword the string; mention Apple geocoding in the privacy policy. |
| MED ✔ | `RootView.swift:186-198`, `Rhythm/HealthCycleSource.swift:37` | HealthKit (menstrual flow) and Location prompts fire unconditionally on first launch, before any intent, even with the Cycle layer off and while the folder picker is up. | Request in context: Location from the Home-place row, Health when the Cycle layer is turned on. |
| LOW | `DataManagement/ExportView.swift:45` | Only non-core file write in the app: plaintext ZIP of the whole vault at a fixed `tmp/Ateliera-backup.zip`, non-atomic, no protection class, never deleted. | Unique dir, `.atomic` + `.completeFileProtection`, delete after share. |
| LOW | `Note/NoteParser.swift:118-200` | Unbounded recursion; ~4 000 nested levels (16 MB file) overflow the main-thread stack at launch → persistent crash until the file is removed outside the app. | Cap depth (32) and frontmatter size; parse off-main. |
| LOW | `DataManagement/Zip32Reader.swift:10-31`, `ImportView.swift:96` | No archive/entry/total limits (web: 512/64/512 MiB); archive copied 3–4× in memory. | Enforce limits; check `fileSize` before reading; index `Data` directly. |
| LOW | `Ateliera/PrivacyInfo.xcprivacy:28-36` | File-timestamp reason is `C617.1` (app container) but the core `stat`s a user-selected folder, which is `3B52.1`. | Add `3B52.1`. |
| LOW | `DataManagement/DraftRecovery.swift:37` | Full note bodies in `UserDefaults` (backed up, no protection class, never purged on vault switch). | Keep drafts in `.studio/drafts/` or Application Support with protection + backup exclusion. |
| LOW | `VaultStore.swift:324-350` | Previous vault's security scope never stopped on switch; stale bookmark never refreshed. | Track active URL; refresh on `stale`. |
| INFO | `VaultStore.swift:177`, `HealthCycleSource.swift:32`, `LocationHemisphere.swift:26`, `RootView.swift:201` | `ATELIERA_UITEST*` env gates ship in release. | Wrap in `#if DEBUG`. |
| INFO | `Note/BodyPreviewView.swift:20` | Any non-wikilink URL is opened via the system; on macOS `file://` works. Chained with the import finding it is a plausible "import, tap, launch" path. | Allow only `http(s)`/`mailto`. |
| Aside | `VaultStore.swift:906` | `setCover` writes `Media/cover.<ext>` relative to the room folder, so every note in a room shares one cover file. | Key the filename by note id. |

Done well: capability-scoped `Dir` + `O_NOFOLLOW` everywhere, strict `validate_relative`, preconditions re-checked before rename, panics converted to Swift errors; widget/intent receive only a hemisphere; FoundationModels prompts never contain note text; diagnostics record ids and codes, never content.

---

## 3. App Store readiness

**Verdict: needs fixes before submission.** Two hard validation failures, one launch flow that App Review will bounce, and a missing in-app privacy link for a HealthKit app.

| Sev | Guideline | Where | Finding | Fix |
|---|---|---|---|---|
| Blocker ✔ | 2.1 / ITMS-90474 | `project.yml:38` | iPad is targeted, only three orientations declared, no `UIRequiresFullScreen`. Upload is rejected. | Add `INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad` with all four, or `UIRequiresFullScreen: YES`. |
| Blocker (Mac) | ITMS-90242 | `project.yml` | No `LSApplicationCategoryType`. | `INFOPLIST_KEY_LSApplicationCategoryType: public.app-category.lifestyle`. |
| Likely rejection ✔ | 5.1.1 / HIG | `RootView.swift:186-198` | Folder picker + Location alert + menstrual-cycle Health sheet stacked on cold launch with no context. | Defer both prompts to in-context actions (see Security). |
| Likely rejection ✔ | 2.1 | `RootView.swift:190`, `VaultStore.swift:464` | Cancel the folder picker → empty Today; captures fail with red text behind the sheet; only re-entry is Settings → Choose folder…; no "create a Studio" option. | Dedicated no-vault welcome screen with Choose folder / Create in iCloud Drive. |
| Likely rejection | 5.1.1(i) | Settings | No in-app privacy-policy link (required for HealthKit apps). | `Link("Privacy policy", …)` row; host the page. |
| Reviewer question | 2.5.1 / 5.1.3 | `HealthCycleSource.swift` | Read-only, memory-only, never written to vault — fine. Expect "why Health?"; prepare review notes. Enable HealthKit on the App ID. | Review notes + App ID capability. |
| Reviewer question | 5.1.1(i) | `project.yml:50` | Location purpose string is inaccurate ("once", "stays on your device") — see Security. | Reword. |
| Plausible | Signing | `project.pbxproj` (gitignored) | Generated project has team `W2UCHS9WV3` on targets vs `4J2C587G89` in `project.yml`; README still says `""`. | Clean `xcodegen generate`; one team; update README. |
| Polish | Export compliance | `project.yml` | `ITSAppUsesNonExemptEncryption` absent (only SHA-256 used → exempt). | Set `false` on both targets. |
| Polish | 4.0 | `RootView.swift:153` | macOS and iPad ship the four-tab phone UI; no `.commands`, no Settings scene, no `horizontalSizeClass`. | `NavigationSplitView` at regular width; Settings scene; ⌘N/⌘F/⌘,. |
| Polish | Metadata | — | Age-rating questionnaire: answer wellness (cycle prompts) and astrology (natal chart). Copy is calm and non-medical; no 1.4 exposure. | — |
| Polish | Icons | `Assets.xcassets` | No iOS 18 dark/tinted icon variants; generated launch screen is blank white. | Add variants + launch background colour. |
| Polish | Widget | `Shared/SharedStore.swift`, `RhythmWidget.swift:5` | No App Group on either target, so the widget always falls back to the region heuristic; the comment claims it reads the App Group. | Add `group.au.com.annamcphee.ateliera` to both, or fix the comment. |
| Polish | macOS | `VaultStore.swift:338-349` | Stale bookmark not refreshed. Hardened Runtime not set (fine for Mac App Store). | Refresh on stale. |

---

## 4. UX seamlessness

Navigation is a single `TabView` (Today · Browse · Capture · Find) on every device; the full tree is in the reviewer notes, summarised here by what hurts.

| Sev | Where | What the user experiences | Fix |
|---|---|---|---|
| HIGH ✔ | `Settings/StudioPreferences.swift:29-42` | A new Studio shows only Life Landscape and Constellation in Browse, while the only capture entry writes Gratitude into Reflection Garden and Possibilities into Uncharted and the closing card says "This is on your Reflection Garden" — a room they cannot see. The tour describes three hidden rooms. Nothing points at Settings → ROOMS. | Auto-reveal any room a capture writes into; make the closing card's room name a link; align the tour. |
| HIGH ✔ | `RootView.swift:190`, `VaultStore.swift:464` | Real-device first launch: cancel the picker → full Today screen, every capture fails with small red text behind the sheet; tour never fires. | No-vault welcome screen (shared with App Store fix). |
| HIGH | `RootView.swift:594-606` | Natal chart ("Your rhythm") and Sky ahead are reachable **only** inside the collapsed "Today's rhythm & intentions" panel. Settings → RHYTHM has no link to either. | Add rows in Settings → RHYTHM; link Sky ahead from the almanac card. |
| HIGH ✔ | `Rooms.swift:76`, `Capture/CaptureDestination.swift:75`, `Inbox/InboxView.swift:69-72`, `Note/MetadataEditorView.swift:19` | Room keys disagree: Landscape captures write `life-landscape` but the room's `vaultKey` is `landscape`, so its Browse count never reflects workshop cards. "File to…" lists Constellation, whose sentinel `__constellation__` gets written and the note vanishes from every room. Details → Rooms offers Journal/Constellation toggles nothing reads. | `fileable` flag on `Room`; set landscape's `vaultKey` to `life-landscape`; exclude sentinels. |
| HIGH | all room views + `RootView.swift:780` | Swipe "Delete" sets `trashed` instantly with no confirmation and no Trash view to restore from (only the edit sheet confirms "Move to Trash?"). Same for Archive. Contradicts "simple reversible mechanics". | Trash/Archived list with Restore; undo toast; label "Move to Trash" everywhere. |
| HIGH | `RootView.swift:152-176` | iPad/Mac get the phone tab bar with a fake "Capture" tab (`Color.clear` + bounce). No sidebar, no keyboard shortcuts, no menu commands. Mac build in `build-mac/` is from Aug 28; views use `UIImage`/`PhotosPicker` without `canImport(UIKit)` guards — the Mac build may not compile. | `NavigationSplitView` at regular width; ⌘N/⌘F/⌘,; Settings scene. |
| MED | `Guidance/GuidedThreadView.swift:158`, `Workshop/WorkshopView.swift:88` | "Save & leave" never writes the current step's draft; threads are not resumable despite the roadmap; swipe-dismiss drops typed text; no Back between steps. | Append the pending draft on leave; persist `step`; add Back. |
| MED | capture sheet | A plain journal entry can only be written via Browse → Journal → "Add to Journal" (Journal hidden in a new Studio). Inbox says "quick captures waiting to find their place" but nothing feeds it except its own button. Roadmap says Inbox folds into Journal. | Add a "Just a note" intention landing in Journal, or drop Inbox from Browse. |
| MED | `Capture/ClassifiedCaptureSheet.swift:44-69`, `CaptureGuidance.swift:38` | Lead-in "I am becoming someone who…" sits above a placeholder "e.g. I'm becoming someone who rests…" → users save "I am becoming someone who I'm becoming someone who…". | Becoming-specific example; strip a duplicated lead-in on save. |
| MED | `RootView.swift:627`, `Foyer/Invitation.swift:170`, `Inbox/InboxView.swift:36` | Count badge on every room incl. Inbox (PRD 7.4 forbids), weekly "3 notes are waiting" invitation, "Inbox zero". | Drop the Inbox count and numeric invitation. |
| MED | `VaultStore.swift` ×13, `ExportView.swift:51`, `ImportView.swift:103` | Raw Rust/Foundation error strings rendered in red on Today and in sheets. | Map to calm sentences at the store boundary; show inside the sheet that caused them. |
| MED | `RootView.swift:922-944` | The generic editor says "REFLECTION / Write what you're noticing… / Fifteen minutes still counts." for Journal entries, Inbox captures and moon intentions alike. | Per-use label/placeholder/footer. |
| MED | `Foyer/TodaysGiftView.swift:56`, `Inbox/InboxView.swift:45` | "Not now" records an SM-2 grade of 2 on the Gift but merely hides an invitation; "Keep" is save, promote-to-Journal, and a Gift grade. | "Not today / Keep showing me this / This landed"; "Keep in Journal". |
| MED | `RootView.swift:1413, 1427` | "Take the tour" ends on Today not Settings; "Choose folder…" presents a fileImporter while the sheet is dismissing (known race). | Present after `onDismiss`. |
| MED | `Foyer/Invitation.swift:88-156` | "Close the season" / "Begin a season" / "Open Wisdom" only navigate to the room; the user must then find the action. | Pass the payload into the destination. |
| LOW | various | "Find" tab → "Search" title; "Foyer" only in tour/Settings; "Version history" → "History"; Gratitude → "Celebrate something" → "Celebrate" → "celebration"/"gratitude" → "Celebration" tab; a "Garden" tab inside the Reflection Garden. | One glossary. |
| LOW | empty states | "Nothing here yet." with no call to action in Journal, Reflection, Wisdom, Uncharted, Constellation. | Reuse the room `intro` + a Begin button. |
| LOW | `Workshop/WorkshopView.swift:118` | Anchor life area is mandatory before any prompt, even for a becoming. | "Not sure yet". |
| LOW | `RootView.swift:740-805`, `Season/SeasonView.swift:214` | Generic `RoomView` and `.search` sheet are unreachable; legacy `SeasonCloseView` forces three mandatory reflections and shows raw slugs. | Delete dead paths; make close reflections optional. |

Done well: one-sheet-at-a-time state machine with chained `onDismiss`; consistent guided-thread chrome across Become/Celebrate/Possibilities/reverse workshop; the edit sheet is thorough and reversible (draft recovery, three-way conflict merge, confirmed trash, friendly wikilink-not-found).

---

## 5. Accessibility & localisation

### Contrast (WCAG ratio; AA = 4.5:1 body, 3:1 large). Bold fails for how the token is used.

| Pair | Chamomile | Fig Leaf | Sunrise | Wisteria | Deep Ocean | Sunset | Forest |
|---|---|---|---|---|---|---|---|
| `ink` / surface | 13.3 | 12.9 | 13.1 | 13.0 | 10.8 | 11.2 | 11.4 |
| `inkMuted` / surface | 6.7 | 6.5 | 6.6 | 6.5 | 6.8 | 6.6 | 7.0 |
| `inkSoft` / sunken | **4.35** | **4.23** | **4.31** | **4.25** | **4.21** | **4.37** | 4.75 |
| **`inkFaint` / surface** (text ~130×) | **3.39** | **3.31** | **3.36** | **3.32** | **3.53** | **3.04** | **3.69** |
| **`script` / canvas** (eyebrow 19pt, greeting 20pt) | **2.84** | **2.95** | **2.49** | **2.77** | 8.2 | ≈8 | ≈8 |
| `link` / surface | 5.4 | **4.30** | 5.3 | 5.2 | 6.8 | 6.4 | 6.3 |
| `celebration` / surface (12pt status) | **4.08** | **4.00** | **3.99** | **3.95** | 4.7 | 4.7 | 4.7 |
| `lineStrong` / surface (borders, 3:1) | **1.87** | **1.85** | **1.81** | **1.85** | 3.2 | **2.65** | **2.84** |

| Sev | Where | Finding | Fix |
|---|---|---|---|
| HIGH | `Theme/StudioTheme.swift` `inkFaint`; ~130 text uses (`RootView.swift:619,694,1423`, `Journal/JournalView.swift:94`, `SkyAheadView.swift:124,155`, `Inbox/InboxView.swift:36`, capture placeholders) | Defined as "disabled/ghost" but carries every eyebrow, date line, empty-state and helper text at 10.5–12pt. Fails AA in all seven themes. | New `inkQuiet` text token ≥4.5:1; reserve `inkFaint` for non-text. Land on the web tokens too. |
| HIGH | `RootView.swift:822`, `Foyer/FoyerHero.swift:99,117`, `StudioComponents.swift:65` | `script` on the room eyebrow and greeting fails even 3:1 in all four light themes; handwriting face has thin strokes. | Use `scriptInk` for text; keep `script` for the foil mark. |
| HIGH | `project.yml`, `project.pbxproj` (`knownRegions = (Base, en)`) | No localisation infrastructure: zero `.xcstrings`, zero `String(localized:)`. ~231 SwiftUI literals would auto-extract; ~540 more live in `String`-typed properties (`Rooms.swift`, guidance, invitations, 27 micro-season terms, sky event titles) rendered via `Text(someString)` and never will. | Add `Localizable.xcstrings` + `SWIFT_EMIT_LOC_STRINGS: YES`; wrap `String` copy in `String(localized:)`; `InfoPlist.xcstrings` for usage strings. ~800 strings. |
| MED-HIGH | 9 `swipeActions` sites, 0 `.contextMenu` (`JournalView.swift:44`, `InboxView.swift:44`, `RootView.swift:778`, `IdentityRoomView.swift:190`, `WisdomView.swift:61`, `UnchartedView.swift:111`, `LandscapeRoomView.swift:225`, `ReflectionView.swift:196`) | "File…", "Move", "Archive", "Keep" are swipe-only. Full Keyboard Access, Switch Control, iPad keyboard and Mac pointer users cannot reach them (AGENTS.md requires alternatives). | Mirror each in `.contextMenu`. |
| MED-HIGH | `RootView.swift:520`, `WisdomView.swift:189`, `LandscapeRoomView.swift:281-291`, `SearchView.swift:171`, selection rows in Reflection/Settings/Metadata | Dismiss `xmark` has no label and an ~11pt hit area; Wisdom select toggle lacks label/`.isSelected`; chips ~30pt tall; checkmark rows lack `.isSelected`. | 44pt frames + `contentShape`; labels; `.accessibilityAddTraits(.isSelected)`. |
| MED | `Theme/Theme.swift:51-62` | Custom fonts scale (good) but on the `.body` curve, so `display(44)` becomes ~137pt at AX5; `eyebrow` at 10.5pt is below Apple's 11pt floor; zero `dynamicTypeSize`/`ViewThatFits`/`AnyLayout`, so fixed `HStack`s (room rows, Then→Now, the 3-segment picker) overflow at AX sizes. | `relativeTo:` per role; raise eyebrow to 11–12pt; `ViewThatFits` on the overflowing rows. |
| MED | `AtelieraWidgets/RhythmWidget.swift:66`, `JournalView.swift:88`, `ReflectionView.swift:333,392` | Fixed 10pt text in the widget; `lineLimit(1)` truncates the titles the user is choosing between. | `.caption2`; `lineLimit(2)`. |
| MED | `JournalView.swift:124`, `ConstellationView.swift:273`, `SkyAheadView.swift:184` | Display dates forced to `en_US_POSIX` + `d MMMM yyyy` and a hand-rolled English month array; `"\(pct)%"` ×5. | `date.formatted(.dateTime…)`; `.formatted(.percent)`. |
| MED | `Invitation.swift:178`, `RevisionHistoryView.swift:43`, `AlmanacView.swift:61`, `FirstVisitGuide.swift:19`, `ClassifiedCaptureSheet.swift:69,117` | Plurals and sentences by concatenation (`note\(count == 1 ? "" : "s")`, `"\(leadIn) \(body)"`); `.uppercased()` ×27 (Turkish-i). | `inflect: true` / xcstrings plurals; `.textCase(.uppercase)`. |
| MED | `RootView.swift:803` `meaningColour` + dots in `RootView.swift:719`, `JournalView.swift:87`, `ReflectionView.swift:229`, `ConstellationView.swift:157` | Meaning conveyed by hue only; VoiceOver reads "heart fill" while the meaning is silent. | `.accessibilityLabel(note.meaning)` or `.accessibilityHidden(true)`; a legend. |
| MED | app-wide | Zero `.keyboardShortcut`, `onKeyPress`, `.help()`, `defaultFocus`; confirm buttons lack `.defaultAction`. | ⌘N/⌘F/⌘,; `.defaultAction`/`.cancelAction`; `.help()` on icons. |
| LOW-MED | `TodaysGiftView.swift:82`, `LandscapeRoomView.swift:207` | `celebration` status text and `growth` horizon pill fail AA in light themes. | Use `inkMuted` + symbol, or darken the tokens. |
| LOW | animations in `RootView.swift:259-570`, `WorkshopView.swift`, `GuidedThreadView.swift:220` | Restrained (0.2–0.25s) but no `accessibilityReduceMotion` check. | Honour the environment value. |
| LOW | `RhythmWidget.swift:59-66` | Hard-coded chamomile palette regardless of theme/dark mode; no `.combine`. | `colorScheme` switch; `.accessibilityElement(children: .combine)`. |
| LOW | `chevron.right` ×8, `arrow.right` ×3, literal "›" ×2 | Won't mirror in RTL. | `.forward` variants. |

Done well: Constellation ships a real text alternative (Map/List, 44pt labelled dots, relationships in words); primary/secondary ink is 6–13:1 everywhere; `StudioCard` honours Increase Contrast; Sky-ahead rows combine into one VoiceOver sentence; 181 `accessibilityIdentifier`s.

---

## 6. Code quality

| Sev | Where | Finding | Fix |
|---|---|---|---|
| HIGH | `RootView.swift` (1700 lines) | Holds RootView, NoteRow, RoomView, `meaningColour`, RoomHeading, ProfileAvatar, NoteEditorSheet, NoteEditView (270), NotePickerSheet, InvitationCard, SettingsView (335). Shared components imported from six other files live inside the root screen; 20 `@State`s and a 150-line sheet switch. | Move chrome to `Theme/StudioComponents.swift`, editors to `Note/`, Settings to `Settings/`; extract an `@Observable RootRouter`. |
| HIGH | `RootView.swift:1259, 1584` | `Task {}` from a non-`@MainActor` View method calls `store.setCover`/`setProfileAvatar` → `reload()` rewrites `notes`/`parsedNotes`/search index off-main. `VaultStore` and all room stores are unisolated. | Mark the stores `@MainActor`; the compiler then flags both sites. |
| HIGH | `Shared/Projection.swift:109`, `VaultStore.swift:1129`, `Foyer/GiftStore.swift:116` | Markdown→plain-text reducer pasted three times; the Gift copy already diverged (shows raw `[[` `]]`). | Delete the copies; call `Projection`. |
| HIGH | `Note/WikilinkParser.swift:43`, `Search/LinkGraph.swift:301` | `maskCode` duplicated verbatim; both compile `NSRegularExpression` per call per note (~3 000 compiles per reload on 1 000 notes). | Single `static let` regexes; one `maskCode`. |
| MED | `VaultStore.swift:459,512,576,798,1040` | Five near-identical note-creation rails; only `createNote` is clean, and it swallows reload errors with `try?` while the others surface them. | One throwing rail; the overloads build the note and delegate. |
| MED | `VaultStore.swift:1177,1234` | Legacy 55-line line-based frontmatter parser kept alive only by the simulator `openFixture()`, which writes notes by hand with force-unwraps and bypasses the Rust core; "Phase N2" comment is stale. | Seed via `StudioNote.capture`; delete the legacy parser and its three tests; move ~130 lines of UI-test seeders under `#if DEBUG`. |
| MED | 8 sites incl. `RootView.swift:105` (`almanacContext`, evaluated 11× per body) and `JournalView.swift:124` (2 formatters per row per render) | `yyyy-MM-dd` `DateFormatter` built ad hoc. | One `DayStamp` helper in `Rhythm.swift` (already shared with the widget); cache `almanacContext`. |
| MED | `Landscape/LifeAreaConfig.swift` (264) vs `Wisdom/WisdomThemeConfig.swift` (191) | Same JSON codec twice (serialize, ParseResult, jsonString ×4 copies incl. `ViewState.swift:80`, `PortableManifest.swift:102`, slug fold ×3 incl. `NoteFactory.swift:45`); the 64 KiB cap exists in one and not the other. | Generic `VersionedListCodec`; one `Slug.fold`, one `JSONText.quote`. |
| MED | all seven `*Store.swift` | Identical load/refresh/error shell (28× `error = store.error`); life areas parsed in three stores with three error policies; `ViewState` read in three places. | `VaultStore` owns `lifeAreas` and `viewOrder(key:)`; a `mutate` helper. |
| MED | `RootView.swift:912,1271`, `WorkshopView.swift:290` + 38 raw eyebrow chains, 7 TextEditor-placeholder overlays, 10 hand-built card borders, `cornerRadius: 12` ×22 | The app is not using its own `StudioComponents` kit. | `StudioEyebrow`, `StudioTextEditor`, `CoverPickerRow`, `StudioRadius`. |
| LOW | `Rooms.swift:6` | Stringly room ids (`"inbox"` ×22, `"reflection-garden"` ×15 …) and 16 raw `frontmatterScalar("…")` keys. | `enum RoomKey: String`; `FrontmatterKey` constants. |
| LOW | `HomePlaceStore.swift:32`, `RhythmSettings.swift:18`, `StudioPreferences.swift:61-128`, `OnboardingState.swift:39` | Four hand-rolled `UserDefaults`+`Codable` shells with the same studio-key encoding. | One `DefaultsSlot<Value>`. |
| LOW | `NatalChart.swift:40`, `CycleDeriver.swift:36`, `RhythmSettings.swift:111` | Force unwraps guarded by a condition expressed elsewhere. | `if let`. |
| LOW | `Zip32Writer.swift:13` | Bit-at-a-time CRC-32 on every exported byte. | Table or `zlib.crc32`. |
| LOW | `RootView.swift:1358`, `StudioComponents.swift` `BrandLockup`, `Media/VaultMedia.swift` `MediaError` | Stale comments, unused type, unused error. | Prune. |

The custom `Zip32Reader/Writer` is justified: Foundation has no public archive API, the format is store-only and golden-matched to `packages/storage/src/zip32.ts`.

---

## 7. Tests

Counts: **444** unit cases in 62 files, **50** UI cases in 8 files, **11** Rust tests. ~14 unit files embed goldens with provenance from the TypeScript packages; the rest assert the Swift implementation against itself. **No CI job builds or tests the Apple app**, no `.xctestplan`, coverage off. **No xcresult bundle contains a unit-test run** — the last recorded runs (Oct 2–3) are UI-only, with `testEditingANoteUpdatesTheRoom` and `testWikilinkNavigatesToTarget` never re-run green. The Rust test binary was last built Aug 29.

| Sev | Area | Gap | Suggested test |
|---|---|---|---|
| HIGH | `Zip32Reader` | Only a flipped-CRC case; traversal/absolute/backslash entries, truncated EOCD, bad signature, non-stored method, duplicates, unicode names all untested — this is the untrusted-input surface. | `testReaderRejectsTraversalEntry`, `…TruncatedArchive`, `…DeflateMethod`, `…DuplicateEntry`, `…RoundTripsUnicodePath`. |
| HIGH | `VaultStore.writeBatch/writeRawFile/removeFile` | No direct tests of the Swift wrappers over the atomic batch (used by import, restore, migration); rollback semantics from Swift unproven. | Batch with one escaping path → nothing written + `error` set; stale revision → `false`. |
| HIGH | Infrastructure | No CI, no recorded unit run. | `macos-15` job: `xcodegen generate` → `cargo test` in `AtelieraVaultCore` → `xcodebuild test -only-testing:AtelieraTests -enableCodeCoverage YES`; nightly UI job; add `cargo test` to `build.sh`. |
| HIGH | UI tests | Three demonstrably flaky tests driven by label concatenation (`"has plentyI am becoming…"`) and swipe-until-found loops. | Identifiers + `accessibilityValue`; `scrollTo` via identifier. |
| MED | Golden provenance | Goldens are pasted literals; the producing vitest was deleted; two cited TS paths (`link-edit.ts`, `cover-media.ts`) no longer exist. Nothing fails when `@studio/*` changes. `LifeAreaConfigTests`/`ViewStateTests` say "golden" but cite no TS source. | A `native-goldens.test.ts` in `packages/test-utils` that emits `apple/AtelieraTests/Fixtures/*.json`; Swift loads them; wired into `pnpm test`. |
| MED | `UnchartedStore`, `HomePlaceStore`, `ReflectionStore` (3 tests) | Store write paths untested; `HomePlaceStore` hard-codes `UserDefaults.standard`. | Inject defaults; add move/round-trip tests. |
| MED | `SharedStoreTests` | Writes the **real** `UserDefaults.standard` and leaves it nil; compares against `Locale.current`. | Inject defaults; assert on `RegionHemisphere` only. |
| MED | `lib.rs` | No tests for symlink refusal, `open` on a file/missing path, nested `list`, revision persistence across re-open, temp cleanup on mid-batch failure, `write_text` with `expected_hash` on a missing file. | Add each. |
| MED | Edge matrix | No BOM, 1 MB body, emoji slug, leap day, whitespace-only title, empty body, `+10:00` vs `Z` ordering. | Add to `NoteFixturesTests`. |
| MED | `RhythmSettings.swift` (343) | Only `resolvedSeasonStyle` and `SkyLayerStore` tested; profile persistence, manual-vs-Health cycle, hemisphere override, natal migration not. | `testRhythmProfileRoundTripsPerVault`, `testManualCycleOverridesHealthCycle`. |
| MED | `LocationHemisphere`, `PlaceGeocoder`, `HealthCycleSource`, `FoundationModelsPersonalizer` | No protocol seam; "degrade honestly" branches untested. | Extract `CycleSource`/`PlaceResolver` protocols (the `MicroSeasonPersonalizer` pattern already works). |
| LOW | `TodaysRhythmIntent`, `RhythmWidgetData` | Untestable (widget not linked; `Date()` inline). | Route through `RhythmSummary.line(for:)` with injected date. |
| LOW | UI tests | 91 of ~267 queries match visible copy. Seeding code ships in release (`VaultStore.swift:203` not `#if DEBUG`). | Identifiers; `#if DEBUG`. |

Done well: every vault test uses an isolated temp directory with `defer` cleanup; store tests drive the real Rust core and assert on bytes re-read from disk; the `MicroSeasonPersonalizer` fake is the right template for the other framework seams.

---

## Suggested order of work

1. **Frontmatter round-trip** (Bugs 1–4; one PR): fix `unquote`, escape control chars in `doubleQuote`, add `.raw` nodes for numbers/null/block scalars, cap depth. Add a fast-check-style property test over arbitrary strings and goldens from the web `yaml` output. This is the invariant the whole product rests on.
2. **Port the web's validation** into `RevisionStore` (`list`/`prune`/`restore`) and `VaultImporter.prepare` (active content, duplicates, collisions, manifest). Reject duplicate ZIP entries in the reader; clean up temps on batch failure in `lib.rs`.
3. **Launch flow**: no-vault welcome screen; move Location and Health requests into context; resolve the home place only once; reword the Location string; add the in-app privacy-policy link; make `reload()` per-file tolerant and separate write from reload.
4. **Submission config**: iPad orientations, `LSApplicationCategoryType`, `ITSAppUsesNonExemptEncryption`, `3B52.1` reason, one Team ID, dark/tinted icons, launch colour.
5. **Reach and reversibility**: auto-reveal captured-into rooms; fix the `life-landscape` key and exclude sentinel rooms from File to…; Trash/Archived view with Restore and a confirm or undo on swipe-delete; Settings rows for Your rhythm and Sky ahead; `.contextMenu` mirrors of every swipe action.
6. **Accessibility tokens**: `inkQuiet` text token and `scriptInk` for eyebrows/greeting (land on the web tokens first, then re-port); 44pt icon targets and labels; `relativeTo:` font curves.
7. **CI + goldens**: a macOS GitHub Actions job running `cargo test` and the unit suite; regenerate goldens from a checked-in TS emitter; harden the three flaky UI tests.
8. **iPad/Mac**: `NavigationSplitView` at regular width, keyboard shortcuts, Settings scene; confirm the Mac target still compiles.
9. **Localisation**: String Catalog + `SWIFT_EMIT_LOC_STRINGS`, then the `String(localized:)` pass; `Date.FormatStyle` and plural inflection.
10. **Code health**: `@MainActor` stores; split `RootView.swift`; dedupe the plain-text reducer, `maskCode`, config codecs and date formatters; retire the legacy parser.
