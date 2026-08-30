import SwiftUI

// "Today's rhythm" — the native almanac, mirroring the web Foyer strip: the
// micro-season term + gloss, an inward/outward orientation line, and the felt
// season, moon (phase + % lit), and cycle (when known). Reads the pure Rhythm
// engine; no profile is required for moon + season, so it shows for everyone.
struct AlmanacView: View {
  let context: RhythmContext
  var hemisphere: Hemisphere = .north
  var seasonStyle: SeasonStyle = .meteorological
  @Environment(\.studioTheme) private var theme

  private var otherStyle: SeasonStyle {
    seasonStyle == .meteorological ? .astronomical : .meteorological
  }

  private func seasonText(_ style: SeasonStyle) -> String {
    let season = Rhythm.season(date: context.date, hemisphere: hemisphere, style: style)
    let pct = Int((Rhythm.seasonProgress(date: context.date, style: style) * 100).rounded())
    return "\(Self.sentenceCase(season.rawValue)) · \(pct)% through"
  }

  private func whenText(_ eventMs: Int64, from ms: Int64) -> String {
    let days = max(0, Int((eventMs - ms) / 86_400_000))
    return days == 0 ? "today" : (days == 1 ? "tomorrow" : "in \(days) days")
  }

  // The next equinox/solstice — a gentle "turning point ahead" callout.
  private var turningCallout: String {
    let ms = Rhythm.dayMillis(date: context.date)
    let next = Sky.nextTurningPoint(afterMs: ms)
    return "Next turning point: \(next.point.title) \(whenText(next.ms, from: ms))"
  }

  // The next new or full moon.
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
    VStack(alignment: .leading, spacing: 10) {
      Text("Today's rhythm")
        .font(StudioFont.eyebrow).tracking(1.6)
        .foregroundStyle(theme.inkFaint)
      Text(context.microSeason.term)
        .font(StudioFont.roomTitle).tracking(-0.5)
        .foregroundStyle(theme.inkStrong)
      Text(context.microSeason.gloss)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      Text(orientationCopy)
        .font(StudioFont.meta)
        .foregroundStyle(theme.vision)
        .fixedSize(horizontal: false, vertical: true)
      HStack(alignment: .top, spacing: 28) {
        fact("Season", seasonText(seasonStyle))
        fact(
          "Moon",
          "\(Self.sentenceCase(context.moon.phase.rawValue)) · \(Int((context.moon.illumination * 100).rounded()))% lit"
        )
        if let cycle = context.cycle {
          fact("Cycle", "Day \(cycle.day) · \(Self.sentenceCase(cycle.phase.rawValue))")
        }
      }
      .padding(.top, 2)
      Text("By the \(otherStyle.label.lowercased()) calendar, \(seasonText(otherStyle))")
        .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        .accessibilityIdentifier("almanac-other-season")
      Text(lunationCallout)
        .font(StudioFont.meta).foregroundStyle(theme.vision)
        .accessibilityIdentifier("almanac-lunation")
      Text(turningCallout)
        .font(StudioFont.meta).foregroundStyle(theme.vision)
        .accessibilityIdentifier("almanac-turning-point")
    }
  }

  private func fact(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4)
        .foregroundStyle(theme.inkFaint)
      Text(value)
        .font(StudioFont.control)
        .foregroundStyle(theme.inkStrong)
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
