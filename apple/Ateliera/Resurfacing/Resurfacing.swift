import Foundation

// A native port of `@studio/rhythm`'s resurfacing.ts — the SM-2 "Gift" engine that
// decides which resurface card returns, when, and how far its next due date moves.
// Pure, offline, deterministic — no I/O, no randomness. Golden-tested against the
// TS engine (see ResurfacingTests): the SM-2 interval table, addDaysISO date math,
// and the rhythm-driven selection ranking all match the web app arithmetic-for-
// arithmetic. Reuses the existing `ResurfaceKind`, `RhythmContext`, and
// `Rhythm.preferredKinds(_:)` / `Rhythm.utcMillis(...)` from Rhythm.swift.

/// One resurfacing candidate, mirroring the web `ResurfaceCard`. `dueDate` is an
/// ISO `YYYY-MM-DD` string, so a plain lexical comparison is a correct date
/// comparison (matching the TS `dueDate <= today`).
struct ResurfaceCard: Equatable {
  let sourcePath: String
  let kind: ResurfaceKind
  let dueDate: String  // ISO YYYY-MM-DD (lexical compare == date compare)
  let intervalDays: Int
}

enum Resurfacing {
  /// Second successful interval in the SM-2 sequence (the fixed first-pass step).
  static let firstPassDays = 6

  /// The three grade labels map to SM-2 recall qualities. Mirrors the web
  /// `GIFT_GRADES = { notNow: 2, keep: 4, deeply: 5 }`.
  enum Grade: Int {
    case notNow = 2
    case keep = 4
    case deeply = 5
  }

  /// SM-2-style due check. A card is due when its dueDate is today or earlier.
  static func isDue(_ card: ResurfaceCard, today: String) -> Bool {
    card.dueDate <= today  // lexical, matches TS
  }

  /// Ease factor by recall grade. A grudging pass (3) grows the interval gently,
  /// a clean pass (4) uses the classic SM-2 default of 2.5, and a deep pass (5)
  /// stretches it further — so "this landed deeply" schedules the card to return
  /// later than a plain "keep".
  static func ease(forQuality quality: Int) -> Double {
    if quality >= 5 { return 3 }
    if quality == 4 { return 2.5 }
    return 1.6
  }

  /// SM-2-style interval grader. `quality` is a 0–5 recall grade. A failing grade
  /// (< 3) resets the card to a 1-day interval; a passing grade grows it: the first
  /// pass jumps to a fixed 6-day step, subsequent passes multiply by an ease factor.
  ///
  /// Rounding parity: TS `Math.round` rounds half UP; every SM-2 product here is
  /// `prev * {1.6, 2.5, 3}` with non-negative operands, so away-from-zero rounding
  /// equals round-half-up. `.toNearestOrAwayFromZero` makes the two half-boundary
  /// rows (`2*2.5=5.0`, `15*2.5=37.5→38`) agree with the web — asserted by the golden.
  static func sm2Interval(prevIntervalDays: Int, quality: Int) -> Int {
    if quality < 3 { return 1 }
    if prevIntervalDays <= 1 { return firstPassDays }
    let product = Double(prevIntervalDays) * ease(forQuality: quality)
    return Int(product.rounded(.toNearestOrAwayFromZero))
  }

  /// ISO `YYYY-MM-DD` date arithmetic, UTC-safe. Matches the web `addDaysISO`
  /// (`Date.UTC(...) + days * 86_400_000`). Uses `Rhythm.utcMillis` (proleptic
  /// Gregorian, Foundation-Calendar-free) so there is no timezone drift.
  static func addDaysISO(_ iso: String, _ days: Int) -> String {
    let year = Int(iso.prefix(4)) ?? 0
    let month = Int(iso.dropFirst(5).prefix(2)) ?? 0
    let day = Int(iso.dropFirst(8).prefix(2)) ?? 0
    let ms = Rhythm.utcMillis(year: year, month: month, day: day) + Int64(days) * 86_400_000
    return isoFromUTCMillis(ms)
  }

  /// Format UTC milliseconds back to `YYYY-MM-DD` via Howard Hinnant's
  /// civil-from-days (the inverse of `Rhythm.utcMillis`), never touching
  /// Foundation's timezone-sensitive Calendar.
  private static func isoFromUTCMillis(_ ms: Int64) -> String {
    // Floor-divide to a day count (works for negative ms too).
    let dayMs: Int64 = 86_400_000
    var z = ms / dayMs
    if ms % dayMs != 0 && ms < 0 { z -= 1 }
    z += 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097  // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365  // [0, 399]
    let y = yoe + era * 400
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)  // [0, 365]
    let mp = (5 * doy + 2) / 153  // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1  // [1, 31]
    let m = mp < 10 ? mp + 3 : mp - 9  // [1, 12]
    let year = m <= 2 ? y + 1 : y
    return String(format: "%04d-%02d-%02d", year, m, d)
  }

  /// Return one due ResurfaceCard, or nil when none are due / the pool is empty.
  /// Due cards (dueDate <= today) are ranked by the rhythm-preferred kind order
  /// (`Rhythm.preferredKinds(ctx)`), ties broken by lowest `sourcePath`, so the same
  /// cards/ctx/today always yield the same card — rhythm-driven, never a slot-machine.
  static func select(_ cards: [ResurfaceCard], ctx: RhythmContext, today: String)
    -> ResurfaceCard?
  {
    let due = cards.filter { isDue($0, today: today) }
    guard !due.isEmpty else { return nil }
    let order = Rhythm.preferredKinds(ctx)
    func rank(_ k: ResurfaceKind) -> Int { order.firstIndex(of: k) ?? order.count }
    return due.sorted { a, b in
      rank(a.kind) != rank(b.kind) ? rank(a.kind) < rank(b.kind) : a.sourcePath < b.sourcePath
    }.first
  }

  /// The resurface pool over parsed vault notes, mirroring the web
  /// `buildResurfacePool` + `toResurfaceCard`. A note joins the pool iff it carries
  /// all three `resurface_*` fields AND lives in a resurface room
  /// (`reflection-garden` or `uncharted`). `sourcePath` is the note's file path
  /// (matching web `sourcePath = record.path`). Takes `(path, note)` pairs because
  /// `NoteSummary` does not currently expose the resurface fields — feed it
  /// `zip(paths, VaultStore.parsedNotes)` or equivalent.
  static let resurfaceRooms: Set<String> = ["reflection-garden", "uncharted"]

  static func resurfacePool(from notes: [(path: String, note: StudioNote)]) -> [ResurfaceCard] {
    notes.compactMap { pair in
      let note = pair.note
      guard note.rooms.contains(where: { resurfaceRooms.contains($0) }),
        let kindRaw = note.resurfaceKind, let kind = ResurfaceKind(rawValue: kindRaw),
        let due = note.resurfaceDue, let interval = note.resurfaceIntervalDays
      else { return nil }
      return ResurfaceCard(sourcePath: pair.path, kind: kind, dueDate: due, intervalDays: interval)
    }
  }
}
