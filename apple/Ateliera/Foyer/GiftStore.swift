import Foundation
import Observation

// The Foyer's daily Gift — the native equivalent of the web
// `use-todays-gift.ts`. It builds the resurface pool over the loaded vault,
// asks the rhythm-driven `Resurfacing.select` for the one card to return today,
// loads that source note for display, and — on a grade — files a keepsake copy
// (for a passing grade) and advances the source's SM-2 schedule through the one
// atomic write rail. Every failure degrades to a calm `.line` rather than an
// error surface (PRD: emotional calm), so the Foyer is never broken by a missing
// profile, an empty pool, or an unreadable note.

/// What the Foyer shows today: either a resurfaced `card` to reflect on and grade,
/// or a calm `line` (the fallback when nothing is due).
enum Gift: Equatable {
  case line(title: String, excerpt: String)
  case card(
    title: String, excerpt: String, body: String,
    sourcePath: String, kind: ResurfaceKind, intervalDays: Int)
}

/// The transient state of a grade write, for the card's status line.
enum KeepState: Equatable {
  case idle
  case busy
  case success(String)
  case error(String)
}

@Observable final class GiftStore {
  static let calmLine = Gift.line(title: "A quiet place to begin.", excerpt: "")

  var gift: Gift = GiftStore.calmLine
  var keepState: KeepState = .idle

  @ObservationIgnored private let store: VaultStore

  init(store: VaultStore) {
    self.store = store
  }

  /// Rebuild today's Gift: pool → select → load source. Any miss keeps the calm
  /// line. `resetStatus` clears a lingering grade confirmation on a genuine new
  /// load (date change / launch) but not when advancing right after a grade.
  func refresh(ctx: RhythmContext, today: String, resetStatus: Bool = true) {
    if resetStatus { keepState = .idle }
    let pool = store.resurfacePool()
    guard let card = Resurfacing.select(pool, ctx: ctx, today: today),
      let editable = store.beginEdit(path: card.sourcePath)
    else {
      gift = Self.calmLine
      return
    }
    let note = editable.note
    gift = .card(
      title: Projection.title(note),
      excerpt: Projection.excerpt(note),
      body: note.body,
      sourcePath: card.sourcePath,
      kind: card.kind,
      intervalDays: card.intervalDays)
  }

  /// Grade the current card (Not now=2 / Keep=4 / This landed deeply=5). A passing
  /// grade (>= 3) files a keepsake copy into Reflection (or Uncharted for a dream);
  /// either grade advances the source's `resurface_due`/`interval_days` by the SM-2
  /// step. No streaks, no counts — just the note returning on a wiser schedule.
  func grade(_ quality: Int, today: String) {
    guard case .card(_, _, let body, let sourcePath, let kind, let intervalDays) = gift else {
      return
    }
    keepState = .busy
    // Re-read the source fresh so the schedule write uses a current hash.
    guard let editable = store.beginEdit(path: sourcePath) else {
      keepState = .error("This note couldn't be opened.")
      return
    }
    if quality >= 3 {
      // File a copy as a kept reflection. Writing a new file does not touch the
      // source, so `editable`'s hash stays valid for the schedule write below.
      let room = kind == .dream ? "uncharted" : "reflection-garden"
      if !store.capture(title: editable.note.title, body: body, room: room) {
        keepState = .error(store.error ?? "Couldn't file a copy.")
        return
      }
    }
    let nextInterval = Resurfacing.sm2Interval(prevIntervalDays: intervalDays, quality: quality)
    let nextDue = Resurfacing.addDaysISO(today, nextInterval)
    if store.saveResurfaceSchedule(editable, due: nextDue, intervalDays: nextInterval) {
      keepState = .success(Self.successMessage(quality: quality))
    } else {
      keepState = .error(store.error ?? "Couldn't update the schedule.")
    }
  }

  // MARK: - Display helpers (display-only, NOT a golden contract — see P3 spec §1)

  static func successMessage(quality: Int) -> String {
    switch quality {
    case 2: return "Set aside for now."
    case 5: return "Kept — it landed deeply."
    default: return "Kept."
    }
  }
}
