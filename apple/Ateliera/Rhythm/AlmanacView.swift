import SwiftUI

// "Today's rhythm" — the native almanac, mirroring the web Foyer strip: the
// micro-season term + gloss, an inward/outward orientation line, and the felt
// season, moon (phase + % lit), and cycle (when known). Reads the pure Rhythm
// engine; no profile is required for moon + season, so it shows for everyone.
struct AlmanacView: View {
  let context: RhythmContext
  @Environment(\.studioTheme) private var theme

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
        fact(
          "Season",
          "\(Self.sentenceCase(context.season.rawValue)) · \(Int((Rhythm.seasonProgress(date: context.date) * 100).rounded()))% through"
        )
        fact(
          "Moon",
          "\(Self.sentenceCase(context.moon.phase.rawValue)) · \(Int((context.moon.illumination * 100).rounded()))% lit"
        )
        if let cycle = context.cycle {
          fact("Cycle", "Day \(cycle.day) · \(Self.sentenceCase(cycle.phase.rawValue))")
        }
      }
      .padding(.top, 2)
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
