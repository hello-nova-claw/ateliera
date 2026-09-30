import Foundation

// A gentle, contextual offer surfaced beside the Foyer's Gift — aligned with the sky,
// the season, your cycle, and what's alive in the vault. At most one shows at a time,
// it's always dismissible per-occurrence, and it never nags. Accepting opens an existing
// flow (a season, a reflection, a room); the app never authors the reflection for you.
struct Invitation: Identifiable, Equatable {
  enum Kind: Equatable {
    case seasonAtTurningPoint(Sky.TurningPoint)
    case seasonClosing(seasonId: String)
    case newMoonIntention(lunation: String)
    case fullMoonReflection(lunation: String)
    case microSeasonShift(term: String)
    case solarReturn(year: Int)
    case cyclePhase(CyclePhase)
    case inboxWaiting
    case synthesizeWisdom(theme: String)
    case promoteIdentity(noteId: String)
  }

  let id: String  // stable per-occurrence key, for dismissal
  let kind: Kind
  let title: String
  let body: String
  let acceptLabel: String
}

// All the engine needs to derive today's single invitation — pure, so it's easy to test.
struct InvitationContext {
  let date: String
  let hemisphere: Hemisphere
  let notes: [StudioNote]
  let cycle: CycleProfile?
  let birthDate: String?  // YYYY-MM-DD
  let dismissed: Set<String>
}

enum InvitationEngine {
  private static let day: Int64 = 86_400_000

  // The single invitation to show — the first, in priority order, that isn't dismissed.
  static func current(_ ctx: InvitationContext) -> Invitation? {
    let candidates: [Invitation?] = [
      solarReturn(ctx),
      seasonClosing(ctx),
      newMoon(ctx),
      fullMoon(ctx),
      seasonBegin(ctx),
      microSeasonShift(ctx),
      cyclePhase(ctx),
      inboxWaiting(ctx),
      synthesizeWisdom(ctx),
      promoteIdentity(ctx),
    ]
    return candidates.compactMap { $0 }.first { !ctx.dismissed.contains($0.id) }
  }

  // Back-compat convenience (used by older callers/tests).
  static func current(
    date: String, hemisphere: Hemisphere, notes: [StudioNote], dismissed: Set<String>
  ) -> Invitation? {
    current(
      InvitationContext(
        date: date, hemisphere: hemisphere, notes: notes, cycle: nil, birthDate: nil,
        dismissed: dismissed))
  }

  // MARK: - Generators (each returns an invitation only when its signal is real)

  private static func solarReturn(_ ctx: InvitationContext) -> Invitation? {
    guard let birth = ctx.birthDate, birth.count >= 10 else { return nil }
    guard String(ctx.date.suffix(5)) == String(birth.suffix(5)) else { return nil }  // MM-DD match
    let year = Sky.civil(fromMs: Rhythm.dayMillis(date: ctx.date)).year
    return Invitation(
      id: "solar:\(year)", kind: .solarReturn(year: year), title: "Your solar return",
      body: "A year around the sun today — begin a new personal year in step with it?",
      acceptLabel: "Begin a season")
  }

  private static func seasonClosing(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    for note in ctx.notes where note.cardType == "season" && note.status == "active" {
      guard let end = note.frontmatterScalar("date_end"), end.count >= 10 else { continue }
      let endMs = Rhythm.dayMillis(date: end)
      guard endMs <= ms + 7 * day else { continue }  // within a week, or already past
      let seasonId = note.frontmatterScalar("season_id") ?? note.id
      let title = note.title ?? "your season"
      return Invitation(
        id: "season-close:\(seasonId)", kind: .seasonClosing(seasonId: seasonId),
        title: "A season is closing", body: "“\(title)” is drawing to a close — reflect and close it?",
        acceptLabel: "Close the season")
    }
    return nil
  }

  private static func newMoon(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    let moon = Sky.nearestMoonPhase(toMs: ms, phase: .new)
    let days = Int(moon / day - ms / day)
    guard (-2...1).contains(days) else { return nil }
    let lunation = Sky.isoDate(ms: moon)
    let already = ctx.notes.contains {
      $0.cardType == "moon-intention" && $0.frontmatterScalar("moon_lunation") == lunation
    }
    guard !already else { return nil }
    let when = days == 0 ? "today" : (days == 1 ? "tomorrow" : "just passed")
    return Invitation(
      id: "newmoon:\(lunation)", kind: .newMoonIntention(lunation: lunation), title: "A new moon",
      body: "New moon \(when) — set an intention to carry through the month?",
      acceptLabel: "Set an intention")
  }

  private static func fullMoon(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    let moon = Sky.nearestMoonPhase(toMs: ms, phase: .full)
    let days = Int(moon / day - ms / day)
    guard (-1...1).contains(days) else { return nil }
    let lunation = Sky.isoDate(ms: moon)
    return Invitation(
      id: "fullmoon:\(lunation)", kind: .fullMoonReflection(lunation: lunation),
      title: "A full moon",
      body: "Full moon \(days == 1 ? "tomorrow" : "tonight") — what has grown, and what's ready to release?",
      acceptLabel: "Reflect")
  }

  private static func seasonBegin(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    let next = Sky.nextTurningPoint(afterMs: ms)
    let days = Int(next.ms / day - ms / day)
    guard (0...7).contains(days) else { return nil }
    let underway = ctx.notes.contains {
      $0.cardType == "season" && ($0.status == "active" || $0.status == "draft")
    }
    guard !underway else { return nil }
    let local = ctx.hemisphere == .south ? next.point.beginsSeason.opposite : next.point.beginsSeason
    let when = days == 0 ? "today" : (days == 1 ? "tomorrow" : "in \(days) days")
    return Invitation(
      id: "season:\(Sky.isoDate(ms: next.ms))", kind: .seasonAtTurningPoint(next.point),
      title: "A season is turning",
      body: "The \(next.point.title) is \(when) — \(local.rawValue) begins. Begin a personal season in step with it?",
      acceptLabel: "Begin a season")
  }

  private static func microSeasonShift(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    let now = microSeason(atMs: ms, ctx.hemisphere)
    let before = microSeason(atMs: ms - 2 * day, ctx.hemisphere)
    guard now.term != before.term else { return nil }  // turned within the last ~2 days
    let year = Sky.civil(fromMs: ms).year
    return Invitation(
      id: "microseason:\(now.term):\(year)", kind: .microSeasonShift(term: now.term),
      title: "The season has turned",
      body: "“\(now.term)” — \(now.gloss). A moment to notice it?", acceptLabel: "Reflect")
  }

  private static func cyclePhase(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    guard let today = Rhythm.computeCycle(ctx.cycle, dateMs: ms),
      let yesterday = Rhythm.computeCycle(ctx.cycle, dateMs: ms - day),
      today.phase != yesterday.phase
    else { return nil }
    let (body, _) = cycleCopy(today.phase)
    return Invitation(
      id: "cycle:\(today.phase.rawValue):\(ms / (28 * day))",
      kind: .cyclePhase(today.phase), title: "Your rhythm is shifting", body: body,
      acceptLabel: "Reflect")
  }

  private static func inboxWaiting(_ ctx: InvitationContext) -> Invitation? {
    // Only unfiled quick captures (drafts in the Inbox) — kept Journal entries have
    // already found their place and shouldn't be counted.
    let waiting = ctx.notes.filter { $0.rooms.contains("inbox") && $0.status == "draft" }
    guard !waiting.isEmpty else { return nil }
    let count = waiting.count
    return Invitation(
      id: "inbox:\(week(ctx.date))", kind: .inboxWaiting, title: "Notes to sort",
      body:
        "\(count) note\(count == 1 ? "" : "s") \(count == 1 ? "is" : "are") waiting in the Inbox — sort \(count == 1 ? "it" : "them") into place?",
      acceptLabel: "Open the Inbox")
  }

  private static func synthesizeWisdom(_ ctx: InvitationContext) -> Invitation? {
    var byTag: [String: Int] = [:]
    for note in ctx.notes where note.rooms.contains("wisdom-garden") && note.status != "trashed" {
      for tag in Set(note.tags) { byTag[tag, default: 0] += 1 }
    }
    guard let theme = byTag.filter({ $0.value >= 3 }).keys.sorted().first else { return nil }
    return Invitation(
      id: "synth:\(theme):\(week(ctx.date))", kind: .synthesizeWisdom(theme: theme),
      title: "A thread to weave",
      body: "You've kept a few ideas about “\(theme)” — weave them into one?",
      acceptLabel: "Open Wisdom")
  }

  private static func promoteIdentity(_ ctx: InvitationContext) -> Invitation? {
    let ms = Rhythm.dayMillis(date: ctx.date)
    let aged = ctx.notes.first {
      $0.cardType == "identity-emerging" && $0.status != "trashed"
        && Rhythm.dayMillis(date: $0.created) <= ms - 30 * day
    }
    guard let card = aged else { return nil }
    let title = card.title ?? "what you're practicing"
    return Invitation(
      id: "promote:\(card.id)", kind: .promoteIdentity(noteId: card.id),
      title: "Becoming true", body: "“\(title)” has been with you a while — is it becoming true?",
      acceptLabel: "Open Identity")
  }

  // MARK: - Helpers

  private static func microSeason(atMs ms: Int64, _ hemisphere: Hemisphere) -> MicroSeason {
    let c = Sky.civil(fromMs: ms)
    return Rhythm.resolveMicroSeason(month: c.month, day: c.day, hemisphere: hemisphere)
  }

  private static func week(_ date: String) -> Int { Int(Rhythm.dayMillis(date: date) / (7 * day)) }

  private static func cycleCopy(_ phase: CyclePhase) -> (body: String, label: String) {
    switch phase {
    case .menstrual: return ("A time to rest and let go — what wants to be released?", "Reflect")
    case .follicular: return ("Energy is returning — what would you like to begin?", "Reflect")
    case .ovulation: return ("A brighter, outward stretch — what are you ready to share?", "Reflect")
    case .luteal: return ("A time to complete and tend — what deserves closing well?", "Reflect")
    }
  }
}
