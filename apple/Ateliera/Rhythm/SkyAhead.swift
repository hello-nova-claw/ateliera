import Foundation

// The "Sky ahead" timeline: the upcoming computed sky events, nearest-first. Everything
// here is a straightforward composition of the Sky engine's already-golden-matched
// primitives (equinoxes/solstices, moon phases, the 24 micro-seasons) — no new astronomy,
// no network, no AI. The view groups and tints by family; a per-vault toggle set
// (SkyLayers) decides which families show, with the astrology layer additionally gated
// behind a natal birth date. Calm and scannable: no counts to chase, no streaks.

// Which event families are shown. A persisted per-vault set (SkyLayerStore), it lets the
// person quiet layers they don't want. `.astrology` stays off by default and is gated
// behind a natal profile — the richer transit layer (Mercury retrograde, sign ingresses)
// is a later slice; for now it surfaces only the solar return.
struct SkyLayers: OptionSet, Equatable {
  let rawValue: Int
  init(rawValue: Int) { self.rawValue = rawValue }

  static let turningPoints = SkyLayers(rawValue: 1 << 0)
  static let moonPhases = SkyLayers(rawValue: 1 << 1)
  static let microSeasons = SkyLayers(rawValue: 1 << 2)
  static let cycle = SkyLayers(rawValue: 1 << 3)
  static let astrology = SkyLayers(rawValue: 1 << 4)

  static let all: SkyLayers = [.turningPoints, .moonPhases, .microSeasons, .cycle, .astrology]

  // What a fresh vault sees: the sky layers that need nothing of the person. Cycle needs
  // HealthKit; astrology needs a birth date — both stay off until opted into.
  static let defaults: SkyLayers = [.turningPoints, .moonPhases, .microSeasons]
}

// One event on the timeline. `family` drives filtering and the view's tint/glyph;
// `isNextLunation` flags the single nearest new/full moon so the view can lead with it.
struct SkyEvent: Identifiable, Equatable {
  enum Family: String, CaseIterable, Equatable {
    case turningPoints, moonPhases, microSeasons, cycle, astrology
  }

  let id: String
  let family: Family
  let ms: Int64
  let title: String
  let detail: String
  var isNextLunation = false
}

enum SkyAhead {
  private static let day: Int64 = 86_400_000

  /// The upcoming sky events strictly after `nowMs`, within `horizonDays`, nearest-first.
  /// Only families in `layers` are included; the astrology layer additionally requires a
  /// `birthDate` (gating the natal surface).
  static func events(
    nowMs: Int64, hemisphere: Hemisphere, layers: SkyLayers, birthDate: String?,
    horizonDays: Int = 120
  ) -> [SkyEvent] {
    let cutoff = nowMs + Int64(horizonDays) * day
    var out: [SkyEvent] = []

    if layers.contains(.turningPoints) { out += turningPoints(nowMs, cutoff, hemisphere) }
    if layers.contains(.moonPhases) { out += moonPhases(nowMs, cutoff) }
    if layers.contains(.microSeasons) { out += microSeasonShifts(nowMs, cutoff, hemisphere) }
    if layers.contains(.astrology) { out += solarReturn(nowMs, cutoff, birthDate) }

    return out.filter { $0.ms > nowMs && $0.ms <= cutoff }.sorted { $0.ms < $1.ms }
  }

  // MARK: - Families

  // Every equinox/solstice between now and the horizon, each naming the local season it
  // begins (flipped for the southern hemisphere).
  private static func turningPoints(_ now: Int64, _ cutoff: Int64, _ hemisphere: Hemisphere)
    -> [SkyEvent]
  {
    var events: [SkyEvent] = []
    var cursor = now
    // Walk turning points forward; each call returns the next one strictly after the cursor.
    while true {
      let next = Sky.nextTurningPoint(afterMs: cursor)
      guard next.ms <= cutoff else { break }
      let begins = hemisphere == .south ? next.point.beginsSeason.opposite : next.point.beginsSeason
      events.append(
        SkyEvent(
          id: "turning:\(Sky.isoDate(ms: next.ms))", family: .turningPoints, ms: next.ms,
          title: next.point.title, detail: "\(begins.rawValue) begins"))
      cursor = next.ms
    }
    return events
  }

  // Each of the four moon phases, walked forward across the horizon. The single nearest
  // new/full (the next lunation) is flagged.
  private static func moonPhases(_ now: Int64, _ cutoff: Int64) -> [SkyEvent] {
    var events: [SkyEvent] = []
    for phase in Sky.MoonPhase.allCases {
      var cursor = now
      while true {
        let ms = Sky.nextMoonPhase(afterMs: cursor, phase: phase)
        guard ms > cursor, ms <= cutoff else { break }
        events.append(
          SkyEvent(
            id: "moon:\(phase):\(Sky.isoDate(ms: ms))", family: .moonPhases, ms: ms,
            title: phase.title, detail: phaseDetail(phase)))
        cursor = ms
      }
    }
    // Flag the nearest major lunation (new or full) after now.
    let lunation = Sky.nextLunation(afterMs: now)
    if let index = events.firstIndex(where: {
      $0.ms == lunation.ms && $0.title == lunation.phase.title
    }) {
      events[index].isNextLunation = true
    }
    return events
  }

  // The timeline's moon-phase and solar-return lines are content: Content/sky-ahead.json.
  private struct Copy: Decodable {
    struct SolarReturn: Decodable {
      let title: String
      let detail: String
    }

    let moonPhases: [String: String]
    let solarReturn: SolarReturn
  }

  private static let copy: Copy = ContentLibrary.load("sky-ahead")

  private static func phaseDetail(_ phase: Sky.MoonPhase) -> String {
    let key: String
    switch phase {
    case .new: key = "new"
    case .firstQuarter: key = "firstQuarter"
    case .full: key = "full"
    case .lastQuarter: key = "lastQuarter"
    }
    return copy.moonPhases[key] ?? ""
  }

  // The 24 solar micro-seasons turn on fixed day-of-year boundaries, so a forward scan
  // (day by day) finds each shift exactly, with its new term and gloss.
  private static func microSeasonShifts(_ now: Int64, _ cutoff: Int64, _ hemisphere: Hemisphere)
    -> [SkyEvent]
  {
    var events: [SkyEvent] = []
    var prev = microSeason(atMs: now, hemisphere)
    var cursor = (now / day + 1) * day  // start at the next midnight boundary
    while cursor <= cutoff {
      let here = microSeason(atMs: cursor, hemisphere)
      if here.term != prev.term {
        events.append(
          SkyEvent(
            id: "micro:\(here.term):\(Sky.isoDate(ms: cursor))", family: .microSeasons, ms: cursor,
            title: here.term, detail: here.gloss))
        prev = here
      }
      cursor += day
    }
    return events
  }

  private static func microSeason(atMs ms: Int64, _ hemisphere: Hemisphere) -> MicroSeason {
    let c = Sky.civil(fromMs: ms)
    return Rhythm.resolveMicroSeason(month: c.month, day: c.day, hemisphere: hemisphere)
  }

  // The next solar return (birthday, MM-DD) within the horizon. The astrology layer's only
  // event for now — the full natal-transit layer is a later slice (needs VSOP87).
  private static func solarReturn(_ now: Int64, _ cutoff: Int64, _ birthDate: String?) -> [SkyEvent]
  {
    guard let birth = birthDate, birth.count >= 10 else { return [] }
    let mmdd = String(birth.suffix(5))  // MM-DD
    let thisYear = Sky.civil(fromMs: now).year
    // Try this year and next; take the first strictly after now.
    for year in [thisYear, thisYear + 1] {
      let iso = String(format: "%04d-%@", year, mmdd)
      let ms = Rhythm.dayMillis(date: iso)
      if ms > now && ms <= cutoff {
        return [
          SkyEvent(
            id: "solar:\(year)", family: .astrology, ms: ms, title: copy.solarReturn.title,
            detail: copy.solarReturn.detail)
        ]
      }
    }
    return []
  }
}
