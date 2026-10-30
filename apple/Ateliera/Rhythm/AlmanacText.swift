import Foundation

// The almanac's sentences, shared by the Today card's detail panel and the badge sheets
// so the two never disagree. Pure: a date and a locale in, a localised line out. Nothing
// here reads the clock or the calendar; callers pass what the environment gives them.
enum AlmanacText {
  // "Spring · 42% through"
  static func seasonText(
    date: String, hemisphere: Hemisphere, style: SeasonStyle, locale: Locale
  ) -> String {
    let season = Rhythm.season(date: date, hemisphere: hemisphere, style: style)
    let progress = percent(Rhythm.seasonProgress(date: date, style: style), locale: locale)
    return String(
      localized: "\(season.localizedName(locale: locale)) · \(progress) through", locale: locale,
      comment: "A season and how far through it today is. 1: the season. 2: a share, like 42%.")
  }

  // "By the meteorological calendar, Spring · 36% through": the season by the calendar the
  // person did not choose.
  static func otherSeasonText(
    date: String, hemisphere: Hemisphere, style: SeasonStyle, locale: Locale
  ) -> String {
    let other: SeasonStyle = style == .meteorological ? .astronomical : .meteorological
    let text = seasonText(date: date, hemisphere: hemisphere, style: other, locale: locale)
    switch other {
    case .meteorological:
      return String(
        localized: "By the meteorological calendar, \(text)", locale: locale,
        comment:
          "The season by the month-based calendar. 1: a season line, like Spring · 36% through."
      )
    case .astronomical:
      return String(
        localized: "By the astronomical calendar, \(text)", locale: locale,
        comment:
          "The season by the equinox and solstice calendar. 1: a season line, like Spring · 36% through."
      )
    }
  }

  // "Waning · 60% through the lunar month"
  static func lunarSeasonText(context: RhythmContext, locale: Locale) -> String {
    let progress = percent(context.lunarProgress, locale: locale)
    return String(
      localized:
        "\(context.lunarSeason.localizedName(locale: locale)) · \(progress) through the lunar month",
      locale: locale,
      comment:
        "The quarter of the lunar month and how far through it today is. 1: the quarter, like Waning. 2: a percentage."
    )
  }

  // "Full moon in 4 days": whichever of the new and full moon comes first.
  static func lunationCallout(date: String, locale: Locale, timeZone: TimeZone) -> String {
    let next = Sky.nextLunation(afterMs: dayStart(date: date, timeZone: timeZone))
    return eventLine(
      title: next.phase.localizedName(locale: locale),
      days: daysUntil(next.ms, date: date, timeZone: timeZone), locale: locale)
  }

  // The next occurrence of one lunation after the date, as a line and an instant.
  static func lunation(
    _ phase: Sky.MoonPhase, date: String, locale: Locale, timeZone: TimeZone
  ) -> (text: String, ms: Int64) {
    let eventMs = Sky.nextMoonPhase(afterMs: dayStart(date: date, timeZone: timeZone), phase: phase)
    let text = eventLine(
      title: phase.localizedName(locale: locale),
      days: daysUntil(eventMs, date: date, timeZone: timeZone), locale: locale)
    return (text, eventMs)
  }

  // "Next turning point: June solstice in 51 days"
  static func turningCallout(date: String, locale: Locale, timeZone: TimeZone) -> String {
    turningPoint(date: date, locale: locale, timeZone: timeZone).text
  }

  // The next equinox or solstice after the date, as a line and an instant. One whole
  // sentence per case, so no localised string is nested inside another.
  static func turningPoint(
    date: String, locale: Locale, timeZone: TimeZone
  ) -> (text: String, ms: Int64) {
    let next = Sky.nextTurningPoint(afterMs: dayStart(date: date, timeZone: timeZone))
    let title = next.point.localizedName(locale: locale)
    let text: String
    switch daysUntil(next.ms, date: date, timeZone: timeZone) {
    case 0:
      text = String(
        localized: "Next turning point: \(title) today", locale: locale,
        comment: "1: an equinox or solstice, like June solstice.")
    case 1:
      text = String(
        localized: "Next turning point: \(title) tomorrow", locale: locale,
        comment: "1: an equinox or solstice, like June solstice.")
    case let days:
      text = String(
        localized: "Next turning point: \(title) in \(days) days", locale: locale,
        comment: "1: an equinox or solstice, like June solstice. 2: the number of days.")
    }
    return (text, next.ms)
  }

  // The instant the civil date begins in the person's zone. Events are looked for from
  // here, not from midnight UTC, so one early on the local date is "today", not missed.
  // The date is the rhythm engine's ISO YYYY-MM-DD, a Gregorian civil date whatever
  // calendar the person reads in, so it is parsed as one. A date the engine could not
  // have written falls back to the same midnight UTC the engine itself uses.
  static func dayStart(date: String, timeZone: TimeZone) -> Int64 {
    guard let start = gregorianStart(of: date, in: timeZone) else {
      return Rhythm.dayMillis(date: date)
    }
    return Int64((start.timeIntervalSince1970 * 1000).rounded())
  }

  // Whole days in the person's zone from the date to the instant, never negative, so
  // "in N days" and the date beside it agree across the date line.
  static func daysUntil(_ eventMs: Int64, date: String, timeZone: TimeZone) -> Int {
    let civil = gregorian(in: timeZone)
    let start =
      gregorianStart(of: date, in: timeZone)
      ?? Date(timeIntervalSince1970: Double(Rhythm.dayMillis(date: date)) / 1000)
    let eventDay = civil.startOfDay(for: Date(timeIntervalSince1970: Double(eventMs) / 1000))
    return max(0, civil.dateComponents([.day], from: start, to: eventDay).day ?? 0)
  }

  private static func gregorian(in timeZone: TimeZone) -> Calendar {
    var civil = Calendar(identifier: .gregorian)
    civil.timeZone = timeZone
    return civil
  }

  private static func gregorianStart(of date: String, in timeZone: TimeZone) -> Date? {
    let parts = date.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return gregorian(in: timeZone).date(
      from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  // "<event> today", "<event> tomorrow" or "<event> in N days".
  static func eventLine(title: String, days: Int, locale: Locale) -> String {
    switch days {
    case 0:
      return String(
        localized: "\(title) today", locale: locale,
        comment: "An event that falls today. 1: the event, like Full moon.")
    case 1:
      return String(
        localized: "\(title) tomorrow", locale: locale,
        comment: "An event that falls tomorrow. 1: the event, like Full moon.")
    default:
      return String(
        localized: "\(title) in \(days) days", locale: locale,
        comment: "An event some days away. 1: the event, like Full moon. 2: the number of days.")
    }
  }

  // The calendar day an instant falls on, in the person's zone: "21 June 2026".
  static func dayText(
    instantMs: Int64, locale: Locale, calendar: Calendar, timeZone: TimeZone
  ) -> String {
    Date(timeIntervalSince1970: Double(instantMs) / 1000).formatted(
      Date.FormatStyle(
        date: .long, time: .omitted, locale: locale, calendar: calendar, timeZone: timeZone))
  }

  // A whole-number percentage in the person's locale, like "42%".
  static func percent(_ fraction: Double, locale: Locale) -> String {
    fraction.formatted(.percent.precision(.fractionLength(0)).locale(locale))
  }
}

// The names that go inside the sentences above. Sentence-initial, as they start a line.
extension LunarSeason {
  func localizedName(locale: Locale) -> String {
    switch self {
    case .new: return String(localized: "New moon", locale: locale, comment: "Lunar quarter name")
    case .waxing: return String(localized: "Waxing", locale: locale, comment: "Lunar quarter name")
    case .full: return String(localized: "Full moon", locale: locale, comment: "Lunar quarter name")
    case .waning: return String(localized: "Waning", locale: locale, comment: "Lunar quarter name")
    }
  }
}

extension Sky.MoonPhase {
  func localizedName(locale: Locale) -> String {
    switch self {
    case .new: return String(localized: "New moon", locale: locale, comment: "Lunation name")
    case .firstQuarter:
      return String(localized: "First quarter", locale: locale, comment: "Lunation name")
    case .full: return String(localized: "Full moon", locale: locale, comment: "Lunation name")
    case .lastQuarter:
      return String(localized: "Last quarter", locale: locale, comment: "Lunation name")
    }
  }
}

extension Sky.TurningPoint {
  func localizedName(locale: Locale) -> String {
    switch self {
    case .marchEquinox:
      return String(localized: "March equinox", locale: locale, comment: "Turning point name")
    case .juneSolstice:
      return String(localized: "June solstice", locale: locale, comment: "Turning point name")
    case .septemberEquinox:
      return String(
        localized: "September equinox", locale: locale, comment: "Turning point name")
    case .decemberSolstice:
      return String(
        localized: "December solstice", locale: locale, comment: "Turning point name")
    }
  }
}
