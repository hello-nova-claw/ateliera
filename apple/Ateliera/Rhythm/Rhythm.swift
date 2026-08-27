import Foundation

// A native port of `@studio/rhythm`'s rhythm.ts: the astronomical/seasonal engine
// (felt season, 24 solar micro-seasons, moon phase + illumination via Meeus, and
// the menstrual-cycle day/phase). Pure, offline, deterministic math — no ephemeris
// download, no I/O — reproduced arithmetic-for-arithmetic so the native almanac
// matches the web app. Golden-tested against the TS engine (see RhythmTests).
// The natal chart (the only `astronomia`-backed piece) is a separate later slice.

enum MoonPhase: String, CaseIterable, Equatable {
  case new
  case waxingCrescent = "waxing-crescent"
  case firstQuarter = "first-quarter"
  case waxingGibbous = "waxing-gibbous"
  case full
  case waningGibbous = "waning-gibbous"
  case lastQuarter = "last-quarter"
  case waningCrescent = "waning-crescent"
}

enum Season: String, Equatable {
  case winter, spring, summer, autumn
}

enum Hemisphere: String, Equatable {
  case north = "N"
  case south = "S"
}

enum CyclePhase: String, Equatable {
  case menstrual, follicular, ovulation, luteal
}

enum ResurfaceKind: String, CaseIterable, Equatable {
  case evidence, reframe, wish, dream
}

enum RhythmOrientation: String, Equatable {
  case inward, outward
}

struct MicroSeason: Equatable {
  let term: String
  let gloss: String
}

struct MoonState: Equatable {
  let phase: MoonPhase
  let illumination: Double
}

struct CycleState: Equatable {
  let day: Int
  let phase: CyclePhase
}

struct CycleProfile: Equatable {
  let lastPeriodStart: String  // ISO YYYY-MM-DD
  let avgLengthDays: Int
}

struct RhythmProfile {
  let hemisphere: Hemisphere
  var cycle: CycleProfile?
  var placements: [String: String] = [:]
}

struct RhythmContext {
  let date: String
  let season: Season
  let microSeason: MicroSeason
  let moon: MoonState
  let cycle: CycleState?
  let placements: [String: String]
}

enum Rhythm {
  // Proleptic-Gregorian UTC milliseconds for a civil date, matching JS
  // `Date.UTC(y, m-1, d)`. Uses Howard Hinnant's days-from-civil so it never
  // depends on Foundation's calendar/timezone handling.
  static func utcMillis(year: Int, month: Int, day: Int) -> Int64 {
    let y = month <= 2 ? year - 1 : year
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    let days = era * 146_097 + doe - 719_468
    return Int64(days) * 86_400_000
  }

  private static func parse(_ date: String) -> (year: Int, month: Int, day: Int, ms: Int64) {
    let year = Int(date.prefix(4)) ?? 0
    let month = Int(date.dropFirst(5).prefix(2)) ?? 0
    let day = Int(date.dropFirst(8).prefix(2)) ?? 0
    return (year, month, day, utcMillis(year: year, month: month, day: day))
  }

  private static let flip: [Season: Season] = [
    .winter: .summer, .summer: .winter, .spring: .autumn, .autumn: .spring,
  ]

  static func resolveSeason(month: Int, hemisphere: Hemisphere) -> Season {
    let northern: Season
    if month == 12 || month <= 2 {
      northern = .winter
    } else if month <= 5 {
      northern = .spring
    } else if month <= 8 {
      northern = .summer
    } else {
      northern = .autumn
    }
    return hemisphere == .south ? flip[northern]! : northern
  }

  // MARK: Moon (Meeus, Astronomical Algorithms ch. 47–48)

  private static func sinDeg(_ deg: Double) -> Double { sin(deg * .pi / 180) }
  private static func cosDeg(_ deg: Double) -> Double { cos(deg * .pi / 180) }
  private static func mod360(_ deg: Double) -> Double { (deg.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360) }

  static func computeMoon(dateMs: Int64) -> MoonState {
    let jd = Double(dateMs) / 86_400_000 + 2_440_587.5
    let t = (jd - 2_451_545.0) / 36_525
    let d =
      297.8501921 + 445_267.1114034 * t - 0.0018819 * t * t + (t * t * t) / 545_868
      - (t * t * t * t) / 113_065_000
    let m =
      357.5291092 + 35_999.0502909 * t - 0.0001536 * t * t + (t * t * t) / 24_490_000
    let mPrime =
      134.9633964 + 477_198.8675055 * t + 0.0087414 * t * t + (t * t * t) / 69_699
      - (t * t * t * t) / 14_712_000
    let phaseAngle =
      180 - d - 6.289 * sinDeg(mPrime) + 2.1 * sinDeg(m) - 1.274 * sinDeg(2 * d - mPrime)
      - 0.658 * sinDeg(2 * d) - 0.214 * sinDeg(2 * mPrime) - 0.11 * sinDeg(d)
    let illumination = (1 + cosDeg(phaseAngle)) / 2
    let waxing = mod360(d) < 180
    let foldedBase = mod360(phaseAngle)
    let folded = foldedBase > 180 ? 360 - foldedBase : foldedBase
    let elongation = waxing ? 180 - folded : 180 + folded
    let index = Int((mod360(elongation + 22.5) / 45).rounded(.down)) % 8
    return MoonState(phase: MoonPhase.allCases[index], illumination: illumination)
  }

  // MARK: Micro-seasons (24 solar terms)

  private struct SolarTerm {
    let month: Int
    let day: Int
    let term: String
    let gloss: String
  }

  private static let solarTerms: [SolarTerm] = [
    .init(month: 1, day: 5, term: "Lesser Cold", gloss: "deep stillness, the year at its quietest"),
    .init(month: 1, day: 20, term: "Greater Cold", gloss: "the coldest stretch, roots holding"),
    .init(month: 2, day: 4, term: "Start of Spring", gloss: "the first turn back toward light"),
    .init(month: 2, day: 19, term: "Rain Water", gloss: "frost softening into rain"),
    .init(month: 3, day: 5, term: "Awakening of Insects", gloss: "the sleeping world begins to stir"),
    .init(month: 3, day: 20, term: "Spring Equinox", gloss: "day and night in balance, tipping toward light"),
    .init(month: 4, day: 4, term: "Pure Brightness", gloss: "clear skies, green returning"),
    .init(month: 4, day: 20, term: "Grain Rain", gloss: "rains that feed the new growth"),
    .init(month: 5, day: 5, term: "Start of Summer", gloss: "warmth settling in, days lengthening"),
    .init(month: 5, day: 21, term: "Grain Full", gloss: "seedheads filling, abundance gathering"),
    .init(month: 6, day: 5, term: "Grain in Ear", gloss: "the harvest of light begins"),
    .init(month: 6, day: 21, term: "Summer Solstice", gloss: "the longest day, fullness at its peak"),
    .init(month: 7, day: 7, term: "Lesser Heat", gloss: "rising heat, the slow simmer of summer"),
    .init(month: 7, day: 22, term: "Greater Heat", gloss: "the hottest stretch, everything ripening"),
    .init(month: 8, day: 7, term: "Start of Autumn", gloss: "the first cool edge to the air"),
    .init(month: 8, day: 23, term: "End of Heat", gloss: "heat releasing its grip"),
    .init(month: 9, day: 7, term: "White Dew", gloss: "cool mornings, dew on the grass"),
    .init(month: 9, day: 23, term: "Autumn Equinox", gloss: "balance again, tipping toward dark"),
    .init(month: 10, day: 8, term: "Cold Dew", gloss: "dew turning cold, leaves letting go"),
    .init(month: 10, day: 23, term: "Frost Descent", gloss: "the first frosts, the world drawing in"),
    .init(month: 11, day: 7, term: "Start of Winter", gloss: "stillness arriving, light withdrawing"),
    .init(month: 11, day: 22, term: "Lesser Snow", gloss: "the first snows, the hush before deep cold"),
    .init(month: 12, day: 7, term: "Greater Snow", gloss: "snow deepening, the long dark"),
    .init(month: 12, day: 21, term: "Winter Solstice", gloss: "the longest night, the seed of returning light"),
  ]

  private static let cumulativeDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

  private static func dayOfYearNoLeap(month: Int, day: Int) -> Int {
    cumulativeDays[month - 1] + day
  }

  static func resolveMicroSeason(month: Int, day: Int, hemisphere: Hemisphere) -> MicroSeason {
    var lookupMonth = month
    if hemisphere == .south {
      lookupMonth = ((month - 1 + 6) % 12) + 1
    }
    let target = dayOfYearNoLeap(month: lookupMonth, day: day)
    var chosen = solarTerms[solarTerms.count - 1]
    for term in solarTerms where dayOfYearNoLeap(month: term.month, day: term.day) <= target {
      chosen = term
    }
    return MicroSeason(term: chosen.term, gloss: chosen.gloss)
  }

  // MARK: Cycle

  private static func cyclePhaseForDay(_ day: Int, avgLengthDays: Int) -> CyclePhase {
    if day <= 5 { return .menstrual }
    let ovulationStart = max(6, avgLengthDays - 14)
    if day < ovulationStart { return .follicular }
    if day <= ovulationStart + 2 { return .ovulation }
    return .luteal
  }

  static func computeCycle(_ cycle: CycleProfile?, dateMs: Int64) -> CycleState? {
    guard let cycle else { return nil }
    let start = parse(cycle.lastPeriodStart)
    let daysSince = Int((dateMs - start.ms) / 86_400_000)
    let avg = cycle.avgLengthDays
    let day: Int
    if daysSince < avg {
      day = daysSince + 1
    } else {
      let mod = daysSince % avg
      day = mod == 0 ? avg : mod
    }
    return CycleState(day: day, phase: cyclePhaseForDay(day, avgLengthDays: avg))
  }

  // MARK: Orientation (from resurfacing.ts's preferredKinds)

  static func preferredKinds(_ ctx: RhythmContext) -> [ResurfaceKind] {
    var weight: [ResurfaceKind: Int] = [.evidence: 0, .reframe: 0, .wish: 0, .dream: 0]
    // Season: deep winter closes inward (proof); spring opens outward (wishes).
    if ctx.season == .winter || ctx.season == .autumn { weight[.evidence]! += 2 }
    if ctx.season == .spring || ctx.season == .summer { weight[.wish]! += 2 }
    // Cycle: late luteal/menstrual ask for proof; follicular/ovulation for intention.
    if let phase = ctx.cycle?.phase {
      if phase == .luteal || phase == .menstrual { weight[.evidence]! += 2 }
      if phase == .follicular || phase == .ovulation { weight[.wish]! += 2 }
    }
    // Moon: full = what's gathered (evidence); new = intention (wish).
    if ctx.moon.phase == .full || ctx.moon.phase == .waningGibbous { weight[.evidence]! += 3 }
    if ctx.moon.phase == .new || ctx.moon.phase == .waxingCrescent { weight[.wish]! += 3 }

    let all = ResurfaceKind.allCases
    return all.sorted { a, b in
      weight[a]! != weight[b]!
        ? weight[a]! > weight[b]!
        : all.firstIndex(of: a)! < all.firstIndex(of: b)!
    }
  }

  /// Today's lean: gathering (inward) vs opening (outward), from the top
  /// preferred kind — matches the web almanac.
  static func orientation(_ ctx: RhythmContext) -> RhythmOrientation {
    let top = preferredKinds(ctx).first
    return top == .wish || top == .dream ? .outward : .inward
  }

  static func computeContext(profile: RhythmProfile, date: String) -> RhythmContext {
    let parsed = parse(date)
    return RhythmContext(
      date: date,
      season: resolveSeason(month: parsed.month, hemisphere: profile.hemisphere),
      microSeason: resolveMicroSeason(
        month: parsed.month, day: parsed.day, hemisphere: profile.hemisphere),
      moon: computeMoon(dateMs: parsed.ms),
      cycle: computeCycle(profile.cycle, dateMs: parsed.ms),
      placements: profile.placements)
  }
}
