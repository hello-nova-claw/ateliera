import SwiftUI

// "Today's rhythm" — the native almanac. Two modes so the Foyer can stay minimal:
// `.summary` is the calm Today card (micro-season term + gloss, a row of circular
// badges for the season, the moon and the cycle, the felt line, and one orientation line); `.detail` is the
// deeper reading (the other calendar's season, the next lunation, the next turning
// point) that lives in the tucked-away "Today's rhythm" panel. Reads the pure
// Rhythm engine; no profile is required for moon + season, so it shows for everyone.
// Tapping a badge in the summary opens a sheet that explains that one rhythm, from the
// same sentences the detail panel uses (AlmanacText).
struct AlmanacView: View {
  let context: RhythmContext
  var hemisphere: Hemisphere = .north
  var seasonStyle: SeasonStyle = .astronomical
  var mode: Mode = .summary
  // When the on-device model has personalised today's micro-season, show it in place of the
  // deterministic one, with a quiet "for <place>" caption. Absent → the deterministic term.
  var personalizedMicroSeason: MicroSeason? = nil
  var personalizedPlace: String? = nil
  // The average cycle length Health implied, so the cycle sheet can give the phase's span.
  var cycleLength: Int?
  @Environment(\.studioTheme) private var theme
  @Environment(\.locale) private var locale
  @Environment(\.calendar) private var calendar
  @Environment(\.timeZone) private var timeZone
  @State private var shownBadge: RhythmBadge?

  private var shownMicroSeason: MicroSeason { personalizedMicroSeason ?? context.microSeason }

  enum Mode { case summary, detail }

  private var feltSeason: Season {
    Rhythm.season(date: context.date, hemisphere: hemisphere, style: seasonStyle)
  }

  private var badges: [RhythmBadge] {
    RhythmBadge.badges(for: context, feltSeason: feltSeason, hemisphere: hemisphere)
  }

  // The inline felt line: "Spring · Waning gibbous" (+ cycle day when known).
  private var feltLine: String {
    var parts = [
      Self.sentenceCase(feltSeason.rawValue),
      Self.sentenceCase(context.moon.phase.rawValue),
    ]
    if let cycle = context.cycle { parts.append("Day \(cycle.day)") }
    return parts.joined(separator: " · ")
  }

  private var sheetContext: RhythmBadgeSheet.Context {
    RhythmBadgeSheet.Context(
      rhythm: context, hemisphere: hemisphere, seasonStyle: seasonStyle,
      microSeason: shownMicroSeason, cycleLength: cycleLength, locale: locale,
      calendar: calendar, timeZone: timeZone)
  }

  // The day lines are content: Content/almanac.json, the same file as
  // apps/studio/src/content/almanac.json.
  private struct Copy: Decodable {
    let orientation: [String: String]
  }

  private static let copy: Copy = ContentLibrary.load("almanac")

  private var orientationCopy: String {
    switch Rhythm.orientation(context) {
    case .inward: return Self.copy.orientation["inward"] ?? ""
    case .outward: return Self.copy.orientation["outward"] ?? ""
    }
  }

  var body: some View {
    switch mode {
    case .summary: summary
    case .detail: detail
    }
  }

  private var summary: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Today's rhythm")
        .font(StudioFont.eyebrow).tracking(1.6)
        .foregroundStyle(theme.inkFaint)
      Text(shownMicroSeason.term)
        .font(StudioFont.section)
        .foregroundStyle(theme.inkStrong)
      Text(shownMicroSeason.gloss)
        .font(StudioFont.quote)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      if let place = personalizedPlace {
        Text("✦ for \(place)")
          .font(StudioFont.eyebrow).tracking(1.0).foregroundStyle(theme.inkFaint)
          .accessibilityIdentifier("almanac-personalized")
      }
      RhythmBadgeRow(
        badges: badges, onTap: { shownBadge = $0 },
        trailing: { Text(feltLine).font(StudioFont.control).foregroundStyle(theme.inkStrong) }
      )
      .padding(.top, 2)
      Text(orientationCopy)
        .font(StudioFont.quote)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
    .sheet(item: $shownBadge) { badge in
      RhythmBadgeSheetView(
        sheet: RhythmBadgeSheet.sheet(for: badge, in: sheetContext), onClose: { shownBadge = nil }
      )
      .studioTheme(theme)
    }
  }

  private var detail: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(
        AlmanacText.seasonText(
          date: context.date, hemisphere: hemisphere, style: seasonStyle, locale: locale)
      )
      .font(StudioFont.meta).foregroundStyle(theme.inkStrong)
      Text(
        AlmanacText.otherSeasonText(
          date: context.date, hemisphere: hemisphere, style: seasonStyle, locale: locale)
      )
      .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      .accessibilityIdentifier("almanac-other-season")
      Text(AlmanacText.lunarSeasonText(context: context, locale: locale))
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("almanac-lunar-season")
      Text(AlmanacText.lunationCallout(date: context.date, locale: locale, timeZone: timeZone))
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("almanac-lunation")
      Text(AlmanacText.turningCallout(date: context.date, locale: locale, timeZone: timeZone))
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("almanac-turning-point")
    }
  }

  // Matches the web's sentenceCase: hyphens to spaces, first letter capitalised
  // (e.g. "waxing-crescent" -> "Waxing crescent").
  static func sentenceCase(_ value: String) -> String {
    let spaced = value.replacingOccurrences(of: "-", with: " ")
    guard let first = spaced.first else { return spaced }
    return first.uppercased() + spaced.dropFirst()
  }
}
