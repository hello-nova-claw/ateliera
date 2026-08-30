import Foundation

// A gentle, contextual offer surfaced beside the Foyer's Gift — aligned with the sky
// and the season. At most one shows at a time; it's always dismissible and never nags.
// Accepting opens an existing flow (the season wizard, or a moon-intention capture);
// the app never authors the reflection for you.
struct Invitation: Identifiable, Equatable {
  enum Kind: Equatable {
    case seasonAtTurningPoint(Sky.TurningPoint)
    case newMoonIntention(lunation: String)
  }

  let id: String  // stable per-occurrence key, for dismissal
  let kind: Kind
  let title: String
  let body: String
  let acceptLabel: String
}

// Pure: derives today's single invitation from the date, hemisphere, the vault's notes
// (to suppress ones already acted on / underway), and the set of dismissed keys.
enum InvitationEngine {
  private static let day: Int64 = 86_400_000
  private static let newMoonWindow = -2...1  // days: 2 days after … 1 day before a new moon
  private static let seasonWindow = 0...7  // days before a turning point

  static func current(
    date: String, hemisphere: Hemisphere, notes: [StudioNote], dismissed: Set<String>
  ) -> Invitation? {
    let ms = Rhythm.dayMillis(date: date)
    let today = ms / day

    // 1. New-moon intention — the most time-bound, so it wins.
    let newMoon = Sky.nearestMoonPhase(toMs: ms, phase: .new)
    let newMoonDays = Int(newMoon / day - today)
    if newMoonWindow.contains(newMoonDays) {
      let lunation = Sky.isoDate(ms: newMoon)
      let id = "newmoon:\(lunation)"
      let alreadySet = notes.contains {
        $0.cardType == "moon-intention" && $0.frontmatterScalar("moon_lunation") == lunation
      }
      if !dismissed.contains(id) && !alreadySet {
        let when = newMoonDays == 0 ? "today" : (newMoonDays == 1 ? "tomorrow" : "just passed")
        return Invitation(
          id: id, kind: .newMoonIntention(lunation: lunation), title: "A new moon",
          body: "New moon \(when) — set an intention to carry through the month?",
          acceptLabel: "Set an intention")
      }
    }

    // 2. Begin a season in step with the next equinox/solstice — unless one's underway.
    let next = Sky.nextTurningPoint(afterMs: ms)
    let turningDays = Int(next.ms / day - today)
    if seasonWindow.contains(turningDays) {
      let id = "season:\(Sky.isoDate(ms: next.ms))"
      let seasonUnderway = notes.contains {
        $0.cardType == "season" && ($0.status == "active" || $0.status == "draft")
      }
      if !dismissed.contains(id) && !seasonUnderway {
        let north = next.point.beginsSeason
        let local = hemisphere == .south ? north.opposite : north
        let when = turningDays == 0 ? "today" : (turningDays == 1 ? "tomorrow" : "in \(turningDays) days")
        return Invitation(
          id: id, kind: .seasonAtTurningPoint(next.point), title: "A season is turning",
          body: "The \(next.point.title) is \(when) — \(local.rawValue) begins. Begin a personal season in step with it?",
          acceptLabel: "Begin a season")
      }
    }

    return nil
  }
}
