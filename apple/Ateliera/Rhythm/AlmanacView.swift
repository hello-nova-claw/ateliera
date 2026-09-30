import SwiftUI

// "Today's rhythm" — the native almanac. Two modes so the Foyer can stay minimal:
// `.summary` is the calm Today card (micro-season term + gloss, a circular season
// icon with the felt season · moon, and one orientation line); `.detail` is the
// deeper reading (the other calendar's season, the next lunation, the next turning
// point) that lives in the tucked-away "Today's rhythm" panel. Reads the pure
// Rhythm engine; no profile is required for moon + season, so it shows for everyone.
struct AlmanacView: View {
  let context: RhythmContext
  var hemisphere: Hemisphere = .north
  var seasonStyle: SeasonStyle = .meteorological
  var mode: Mode = .summary
  @Environment(\.studioTheme) private var theme

  enum Mode { case summary, detail }

  private var otherStyle: SeasonStyle {
    seasonStyle == .meteorological ? .astronomical : .meteorological
  }

  private func seasonText(_ style: SeasonStyle) -> String {
    let season = Rhythm.season(date: context.date, hemisphere: hemisphere, style: style)
    let pct = Int((Rhythm.seasonProgress(date: context.date, style: style) * 100).rounded())
    return "\(Self.sentenceCase(season.rawValue)) · \(pct)% through"
  }

  private var feltSeason: Season {
    Rhythm.season(date: context.date, hemisphere: hemisphere, style: seasonStyle)
  }

  // A gentle season glyph for the circular badge — sun at the height of light,
  // leaf for growth and release, snow for rest.
  private var seasonSymbol: String {
    switch feltSeason {
    case .spring: return "leaf"
    case .summer: return "sun.max"
    case .autumn: return "wind"
    case .winter: return "snowflake"
    }
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

  private func whenText(_ eventMs: Int64, from ms: Int64) -> String {
    let days = max(0, Int((eventMs - ms) / 86_400_000))
    return days == 0 ? "today" : (days == 1 ? "tomorrow" : "in \(days) days")
  }

  private var turningCallout: String {
    let ms = Rhythm.dayMillis(date: context.date)
    let next = Sky.nextTurningPoint(afterMs: ms)
    return "Next turning point: \(next.point.title) \(whenText(next.ms, from: ms))"
  }

  private var lunationCallout: String {
    let ms = Rhythm.dayMillis(date: context.date)
    let next = Sky.nextLunation(afterMs: ms)
    return "\(next.phase.title) \(whenText(next.ms, from: ms))"
  }

  private var orientationCopy: String {
    switch Rhythm.orientation(context) {
    case .inward: return "A gathering day — a good time to notice how far you have come."
    case .outward: return "An opening day — a good time to name what you want to make room for."
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
      Text(context.microSeason.term)
        .font(StudioFont.section)
        .foregroundStyle(theme.inkStrong)
      Text(context.microSeason.gloss)
        .font(StudioFont.quote)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 12) {
        ZStack {
          Circle().strokeBorder(theme.lineStrong, lineWidth: 1).frame(width: 34, height: 34)
          Image(systemName: seasonSymbol).font(.system(size: 15)).foregroundStyle(theme.inkMuted)
        }
        Text(feltLine).font(StudioFont.control).foregroundStyle(theme.inkStrong)
      }
      .padding(.top, 2)
      Text(orientationCopy)
        .font(StudioFont.quote)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var detail: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(seasonText(seasonStyle))
        .font(StudioFont.meta).foregroundStyle(theme.inkStrong)
      Text("By the \(otherStyle.label.lowercased()) calendar, \(seasonText(otherStyle))")
        .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        .accessibilityIdentifier("almanac-other-season")
      Text(lunationCallout)
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("almanac-lunation")
      Text(turningCallout)
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
