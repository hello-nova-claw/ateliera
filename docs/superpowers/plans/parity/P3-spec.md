# P3 — The Gift (SM-2 resurfacing, the "learns" loop) — build-ready spec

Status: proposed (2026-08-28). Design-only. Roadmap: `docs/superpowers/plans/2026-08-28-ateliera-native-parity.md` §P3.

The signature feature: a rhythm-appropriate resurfaced card on the Foyer that the
Studio *learns* to reschedule. Port the rest of `resurfacing.ts` to Swift
(golden-matched), build the resurface pool over the vault, render the daily Gift
card, and grade it (Not now / Keep / This landed deeply → SM-2 quality 2/4/5)
writing `resurface_kind/due/interval_days` back through the existing atomic write
path.

---

## 1. Scope — the web features to reach (cited)

- **SM-2 engine** — `packages/rhythm/src/resurfacing.ts`: `isDue`, `easeForQuality`
  (private), `sm2Interval`, `selectResurface`. (`preferredKinds` is ALREADY ported —
  `apple/Ateliera/Rhythm/Rhythm.swift:227`.) Golden test: `resurfacing.test.ts`.
- **Resurface pool** — `packages/application/src/resurface-pool.ts`
  (`buildResurfacePool` + `toResurfaceCard`): the pool = every Reflection Garden or
  Uncharted note carrying all three `resurface_*` frontmatter fields, mapped to a
  `ResurfaceCard { sourcePath, kind, dueDate, intervalDays }`. Rooms constant:
  `RESURFACE_ROOMS = ['reflection-garden', 'uncharted']`.
- **Gift orchestration** — `apps/studio/src/features/foyer/use-todays-gift.ts`:
  load rhythm profile → `computeRhythmContext` → `buildResurfacePool` →
  `selectResurface` → load the source note → build a Gift; grading = `keep(quality)`:
  a passing grade (≥3) files a COPY (`service.capture`) to Reflection (or Uncharted
  for `dream`), and EITHER grade advances the source note's `resurface_due` /
  `resurface_interval_days` by `sm2Interval`. Fallbacks to a calm "line" Gift when
  no profile / empty pool / any read failure.
- **Gift UI** — `apps/studio/src/features/foyer/TodaysGift.tsx`: label "Today's
  gift", title + excerpt, "How did this land?" with three text actions (Not now /
  Keep / This landed deeply), busy + success + error states. Grades:
  `GIFT_GRADES = { notNow: 2, keep: 4, deeply: 5 }` (use-todays-gift.ts:47).
- **Excerpt** — web uses `markdownToPlainText(body).slice(0,240)`, title falls back
  to `plain.slice(0,80) || 'Untitled'`. Native has no markdown-to-plain util yet;
  use a minimal plain-text reduction (below) — this is display-only, NOT a golden
  contract.

Explicitly IN scope: engine parity, pool, selection, Gift card, grading write-back,
"keep files a copy". Explicitly OUT (later phases): the disposable search/link index
(P4 — pool here scans the already-loaded `store.notes`, no index needed), rich
capture classification (P7), Foyer "line" richness beyond a single calm fallback (P9).

## 2. Native design — files to ADD / MODIFY

### ADD `apple/Ateliera/Rhythm/Resurfacing.swift`
Pure engine, no I/O — mirrors `resurfacing.ts`. Reuses the existing `ResurfaceKind`
enum and `RhythmContext`/`Rhythm.preferredKinds` in `Rhythm.swift`.

```swift
struct ResurfaceCard: Equatable {
  let sourcePath: String
  let kind: ResurfaceKind
  let dueDate: String        // ISO YYYY-MM-DD (lexical compare == date compare)
  let intervalDays: Int
}

enum Resurfacing {
  static let firstPassDays = 6

  static func isDue(_ card: ResurfaceCard, today: String) -> Bool {
    card.dueDate <= today                       // lexical, matches TS
  }

  static func ease(forQuality q: Int) -> Double {
    q >= 5 ? 3 : (q == 4 ? 2.5 : 1.6)
  }

  static func sm2Interval(prevIntervalDays: Int, quality: Int) -> Int {
    if quality < 3 { return 1 }
    if prevIntervalDays <= 1 { return firstPassDays }
    return Int((Double(prevIntervalDays) * ease(forQuality: quality)).rounded()) // .toNearestOrAwayFromZero == Math.round for these positives
  }

  static func select(_ cards: [ResurfaceCard], ctx: RhythmContext, today: String) -> ResurfaceCard? {
    let due = cards.filter { isDue($0, today: today) }
    guard !due.isEmpty else { return nil }
    let order = Rhythm.preferredKinds(ctx)
    func rank(_ k: ResurfaceKind) -> Int { order.firstIndex(of: k) ?? order.count }
    return due.sorted { a, b in
      rank(a.kind) != rank(b.kind) ? rank(a.kind) < rank(b.kind) : a.sourcePath < b.sourcePath
    }.first
  }
}
```
CAUTION on rounding: TS `Math.round(2.5)=3` (rounds half UP), Swift
`.rounded()` default is `.toNearestOrAwayFromZero` → `2.5→3` too, and every SM-2
product is `prev*{1.6,2.5,3}` (non-negative). For x.5 exactly (only reachable via
`*2.5`), away-from-zero == round-half-up for positives, so they agree. Assert this
with the golden table (§3) rather than reasoning — one case (`prev=2,q=4 → 5`, i.e.
`5.0`) and `15*2.5=37.5→38` exercise the boundary.

### ADD `apple/Ateliera/Foyer/GiftStore.swift` (`@Observable`)
The orchestration equivalent of `use-todays-gift.ts`, driven by `VaultStore` +
`RhythmContext` (both already in `RootView`).

```swift
enum Gift {
  case line(title: String, excerpt: String)                 // calm fallback
  case card(title: String, excerpt: String, body: String,
            sourcePath: String, kind: ResurfaceKind, intervalDays: Int)
}
enum KeepState: Equatable { case idle, busy, success(String), error(String) }

@Observable final class GiftStore {
  var gift: Gift = .line(title: "A quiet place to begin.", excerpt: "")
  var keepState: KeepState = .idle
  private let store: VaultStore

  func refresh(ctx: RhythmContext, today: String)          // builds pool, selects, loads source
  func grade(_ quality: Int, today: String)                // see §data
}
```
- `refresh` builds the pool from `store` (see pool method below), calls
  `Resurfacing.select`, and — for a hit — reads the source note via
  `store.beginEdit(path:)` (already returns `EditableNote` with parsed `StudioNote`
  + `baseHash`) to fill `body`/title/excerpt. Any failure → keep the `.line`
  fallback (parity with web's calm degradation, PRD "emotional calm").
- Grades map exactly: Not now=2, Keep=4, This landed deeply=5 (mirror `GIFT_GRADES`).

### ADD `apple/Ateliera/Foyer/TodaysGiftView.swift`
SwiftUI card mirroring `TodaysGift.tsx`. "Today's gift" eyebrow (reuse
`StudioFont.eyebrow`), title (`StudioFont.cardTitle`/`roomTitle`), excerpt
(`StudioFont.pageSubtitle`). For `.card`, a "How did this land?" group with three
buttons (`Studio.link` text actions, matching the existing Foyer text-action look).
Busy → disable buttons; success/error → a `role`-equivalent status/alert line
(`.accessibilityLabel`, announce via `.accessibilityAddTraits(.updatesFrequently)`
or an `AccessibilityNotification.Announcement`). No streaks/counts (PRD). Fully
keyboard/VoiceOver operable — buttons, no drag.
Accessibility identifiers for XCUITest: `gift-card`, `gift-grade-not-now`,
`gift-grade-keep`, `gift-grade-deeply`, `gift-status`.

### MODIFY `apple/Ateliera/VaultStore.swift`
Add a pool builder that reuses the already-loaded, reloaded-on-write `notes` +
`summariesByPath`, so no new index is introduced (P4 owns the index). Because
`NoteSummary` does not currently carry the `resurface_*` fields, extend the
lightweight `parse(path:text:)` frontmatter reader to also capture
`resurfaceKind/Due/IntervalDays` (three more `hasPrefix` branches next to the
existing `created:`/`updated:` ones — cheap, no full parse) and add them to
`NoteSummary`. Then:

```swift
func resurfacePool() -> [ResurfaceCard] {
  notes.compactMap { s in
    guard s.rooms.contains(where: { ["reflection-garden","uncharted"].contains($0) }),
          let kindRaw = s.resurfaceKind, let kind = ResurfaceKind(rawValue: kindRaw),
          let due = s.resurfaceDue, let interval = s.resurfaceIntervalDays
    else { return nil }
    return ResurfaceCard(sourcePath: s.id, kind: kind, dueDate: due, intervalDays: interval)
  }
}
```
(`s.id` == path, matching web `sourcePath = record.path`.)

Add a metadata-only save used by grading (does NOT touch title/body/`updated`
semantics beyond bumping `updated`, and preserves unknown frontmatter via
re-serialize — same contract as `saveEdit`):

```swift
@discardableResult
func saveResurfaceSchedule(path: String, baseHash: String, note: StudioNote,
                          due: String, intervalDays: Int) -> Bool {
  var updated = note
  updated.resurfaceDue = due
  updated.resurfaceIntervalDays = intervalDays
  updated.updated = NoteFactory.isoTimestamp()
  // vault.writeText(path:, text: updated.serialize(), expectedHash: baseHash, createNew: false); reload()
}
```
NOTE: `resurfaceKind` is left as-is (never nil'd) so the card stays in the pool and
keeps returning on its new schedule — matches web (`keep` only writes due+interval).

`capture(...)` already exists and writes to a room folder; for "Keep files a copy"
the Gift uses it with a `reflection`/`uncharted` room key. The web files copies into
`Reflection Garden/Reflections` (or `Uncharted`); native `capture` currently writes
to `Room.folderName(for:)` (top-level room folder). Acceptable divergence for P3
(folder is not the interop contract — the `rooms` frontmatter is, and web reads by
frontmatter regardless of folder; StudioNote.swift header + resurface-pool comments
confirm). Keep the copy's `rooms` = `["reflection-garden"]` / `["uncharted"]` so both
apps pool it identically. (Sub-folder parity is a P7 capture-classification concern.)

### MODIFY `apple/Ateliera/RootView.swift`
Add `@State private var giftStore` (constructed from `store`). Render
`TodaysGiftView(store: giftStore, ...)` in the Foyer `VStack` — place it directly
under `AlmanacView` / above the "Your rhythm ›" button (the Gift is the day's
orientation offering; web renders it near the top of the Foyer). Wire:
- `.task` / `.onChange(of: almanacContext.date)`: `giftStore.refresh(ctx:today:)`
  using the same `today` string RootView already computes for `almanacContext`.
- Grade buttons → `giftStore.grade(quality, today:)`; on success call
  `store` reload is already done inside `grade` (both `capture` and
  `saveResurfaceSchedule` call `reload()`), then re-`refresh` to advance to the next
  due card (or the calm line).

Reuses: `Rhythm.computeContext` (already wired for the almanac), `VaultStore`
capture/edit/write path (atomic, path-contained, expected-hash), `StudioNote`
serializer (byte-identical), `NoteFactory` timestamps.

## 3. Data / format — frontmatter, kinds, golden values

**Frontmatter (already round-tripped by the native model — no schema change):**
- `resurface_kind`: enum `evidence|reframe|wish|dream`
  (`StudioNote.resurfaceKind`, parsed at `NoteParser.swift:92`, serialized at
  `StudioNote.swift:96`; web schema `frontmatter-schema.ts:55`).
- `resurface_due`: ISO `YYYY-MM-DD` (`resurfaceDue`; schema `z.iso.date()`).
- `resurface_interval_days`: positive int (`resurfaceIntervalDays`; schema
  `z.number().int().positive()`; serialized as `.int`).
Pool inclusion requires ALL THREE (matches `toResurfaceCard`). Kept notes get a
COPY captured (new id/file); the SOURCE note keeps its `resurface_kind` and gets
new `resurface_due`/`resurface_interval_days`.

**Card kinds & rooms:** kind ↔ room is a soft convention (evidence/reframe live in
Reflection Garden; wish/dream in Uncharted) but the ENGINE reads `resurface_kind`
off the note regardless — do not hardcode kind from room. `RESURFACE_ROOMS =
["reflection-garden","uncharted"]` gates the pool.

**Grade → quality:** Not now = 2, Keep = 4, This landed deeply = 5.
A passing grade is `quality >= 3` (files a copy). "Not now" (2) reschedules only.

**GOLDEN VALUES — SM-2 intervals** (captured from `resurfacing.ts` via node; assert
these exact ints in `ResurfacingGoldenTests`). `sm2Interval(prev, quality)`:

| prev | q | → | notes |
|---|---|---|---|
| 1 | 4 | 6 | first pass fixed step |
| 1 | 5 | 6 | first pass, deep still fixed 6 |
| 1 | 3 | 6 | first pass, grudging still 6 |
| 1 | 2 | 1 | fail resets |
| 2 | 4 | 5 | 2*2.5=5.0 (boundary) |
| 6 | 3 | 10 | 6*1.6=9.6→10 |
| 6 | 4 | 15 | 6*2.5=15 |
| 6 | 5 | 18 | 6*3=18 |
| 6 | 2 | 1 | fail resets |
| 10 | 3 | 16 | 10*1.6=16 |
| 15 | 4 | 38 | 15*2.5=37.5→38 (half-up boundary) |
| 15 | 5 | 45 | 15*3 |
| 18 | 5 | 54 | 18*3 |
| 40 | 0 | 1 | fail resets |

**GOLDEN VALUES — `addDaysISO` (due-date advance, UTC)** — the web computes next due
= `addDaysISO(today, nextInterval)` (use-todays-gift.ts:34). Native must match:
`addDaysISO("2026-06-21", 18) = "2026-07-09"`;
`addDaysISO("2026-02-28", 1) = "2026-03-01"` (2026 non-leap);
`addDaysISO("2026-12-31", 6) = "2027-01-06"`.
Implement with `Rhythm.utcMillis(year:month:day:)` (already proven UTC-safe in
`Rhythm.swift:81`) + `86_400_000 * days`, then format back — do NOT use Foundation
Calendar (timezone drift risk).

**GOLDEN — selection ranking:** reuse the `resurfacing.test.ts` scenarios directly
(deep-winter/late-luteal → evidence; spring/follicular → wish; new moon → wish,
full moon → evidence; same-kind ties break on lowest `sourcePath`; input-order
independence; determinism). `preferredKinds` is already golden-tested
(`RhythmTests`); this phase adds `isDue`/`sm2Interval`/`select`.

**How to (re)capture goldens:** throwaway node script over
`packages/rhythm/src/resurfacing.ts` (`easeForQuality`/`sm2Interval` reproduced) —
the §3 tables above were generated exactly this way (`node` on 2026-08-28). No
vitest fixture file is required; the numbers are small and stable, embed them in the
Swift test. If preferred, `pnpm --filter @studio/rhythm exec vitest run resurfacing`
green confirms the TS source these were taken from is unchanged.

## 4. TDD plan (failing test first, per case)

Unit (`AtelieraTests/`):
1. `ResurfacingGoldenTests.swift`
   - `sm2Interval` matches the full §3 table (one assert per row).
   - `isDue`: equal-today true; earlier true; later false (lexical dates).
   - `ease(forQuality:)`: 5→3, 4→2.5, 3→1.6, 2→1.6.
   - `select`: due-today returned; none-due → nil; empty pool → nil (no throw);
     winter/luteal → evidence; spring/follicular → wish; new/full moon; same-kind
     tie → lowest sourcePath; reversed input → same pick; determinism (twice equal).
2. `GiftScheduleTests.swift` — `addDaysISO` golden trio (§3) + a couple of ordinary
   in-month advances.
3. `ResurfacePoolTests.swift` — given `[NoteSummary]` (or seeded vault notes):
   includes only reflection-garden/uncharted notes with all three fields; excludes a
   note missing `resurface_interval_days`; excludes an inbox note that has the fields;
   `sourcePath == path`; maps kind/due/interval correctly.
4. `GiftStoreTests.swift` (against a temp on-disk vault via `VaultStore`, like
   `EditWriteTests`/`CaptureWriteTests`):
   - `refresh` with no due cards / no profile → `.line` fallback.
   - `refresh` with a due wish card in spring ctx → `.card` with that source's body.
   - `grade(4)` on a card → (a) a copy note now exists tagged reflection-garden
     (pool/notes count grows), (b) the SOURCE file's `resurface_due` advanced by
     `sm2Interval(prev,4)` days and `resurface_interval_days` updated, verified by
     re-reading + parsing; unknown frontmatter on the source survives (round-trip).
   - `grade(2)` ("Not now") → NO copy captured; source rescheduled to +1 day
     (`sm2Interval(prev,2)=1`); `resurface_kind` unchanged.
   - stale-hash write path: `saveResurfaceSchedule` with a wrong baseHash surfaces
     the core's `Conflict` as an error (parity with `saveEdit`), no data loss.

UI (`AtelieraUITests/`) — `GiftFlowUITests.swift` (drive a seeded temp vault via the
existing `ATELIERA_UITEST=1` empty-vault hook; seed one due wish + one due evidence
note into it before launch, or add a UITEST seed branch in `VaultStore.openFixture`
guarded by env):
   - Gift card appears with `gift-card` id and the "How did this land?" group.
   - Tap `gift-grade-keep` → success status appears (`gift-status`), the card
     advances (next due card or the calm line), and a new Reflection note is visible
     in RECENTLY.
   - VoiceOver: the three grade buttons are reachable and labelled; status line is
     announced (no drag interactions to alternative).

Every test must be observed RED before the impl exists (engine first, then pool,
then store, then view). Run: `cd apple && xcodegen generate && xcodebuild test
-scheme Ateliera -destination "platform=iOS Simulator,id=27464D12-...".`

## 5. Dependencies

Earlier phases / existing contracts this relies on (all already shipped):
- **Note model round-trip** (Phase N2): `StudioNote` byte-identical serialize +
  `NoteParser` full parse, incl. the `resurface_*` fields and unknown-key survival —
  the grading write-back leans entirely on this.
- **Atomic write path**: `VaultStore.capture` / `saveEdit` → Rust core
  `write_text(expectedHash:createNew:)` (path-contained, atomic, `Conflict` on stale
  hash). Grading adds `saveResurfaceSchedule` on the same rail.
- **Rhythm engine**: `Rhythm.computeContext` + `Rhythm.preferredKinds`
  (already golden-matched) — the card-kind preference driver. RootView already
  computes the `RhythmContext` + `today` for the almanac; the Gift reuses them.
- **Rooms**: `rooms` frontmatter filtering (`NoteSummary.rooms`) — the pool gate.

Does NOT depend on P1 (full metadata editor) or P4 (index): the pool scans the
already-loaded `store.notes`; grade writes only the two schedule fields + a captured
copy. Shared contract it EXPORTS forward: `Resurfacing` + `ResurfaceCard` (P4's
index can later feed the same `select`), and `saveResurfaceSchedule` as a first
example of metadata-only writes (P1 generalises this to all fields).

## 6. Risks + smallest first vertical slice

Risks:
- **Rounding parity** (`Math.round` vs Swift `.rounded()`): pinned by the §3 golden
  table incl. the two half-boundary rows; if any diverge, use explicit
  `.rounded(.toNearestOrAwayFromZero)` and re-assert. LOW.
- **Date math**: Foundation `Calendar` can drift by timezone; MUST use
  `Rhythm.utcMillis` for `addDaysISO` (golden trio guards it). LOW once enforced.
- **Pool from summaries, not a full index**: relies on `reload()` running after
  every write (it does) so a graded card's new due date is reflected before the next
  `refresh`. Cap: web's 200-row index cap does NOT apply (native scans all notes) —
  strictly better here. LOW.
- **"Keep files a copy" folder**: native writes to the top-level room folder, not
  `Reflection Garden/Reflections`. Frontmatter `rooms` (the interop contract) is
  identical, so both apps pool it; folder parity deferred to P7. ACCEPTED divergence.
- **Empty/broken source note** (renamed/deleted since load): `refresh`/`grade` must
  degrade to the calm `.line` (web parity), never crash the Foyer. Covered by tests.

Smallest first vertical slice (ship end-to-end, then widen):
1. `Resurfacing.swift` engine + `ResurfacingGoldenTests` (RED→GREEN) — pure, no UI.
2. `addDaysISO` helper + `GiftScheduleTests`.
3. `VaultStore.resurfacePool()` + `NoteSummary` field extension + `ResurfacePoolTests`.
4. `GiftStore.refresh` (select + load source) returning `.line`/`.card` +
   `GiftStoreTests` for refresh only.
5. `TodaysGiftView` rendering a `.card`, wired into RootView under the almanac
   (display only, buttons disabled) — visible Gift on the Foyer.
6. `GiftStore.grade` + `saveResurfaceSchedule` + copy-capture; enable buttons;
   `GiftStoreTests` grade cases + `GiftFlowUITests`. This is the "learns" loop closed.
