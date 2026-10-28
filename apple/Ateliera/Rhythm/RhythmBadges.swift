import SwiftUI

// The Today card's badge row: one circle per rhythm the person has in play. The season
// and the moon show for everyone; the cycle only when Health shares one. The moon is
// drawn, not symbolised, so its phase is read at a glance, and the lit limb follows the
// hemisphere. Pure, so the choice of badges, glyphs and spoken labels is testable.
enum RhythmBadge: Equatable {
  case season(Season)
  case moon(phase: MoonPhase, illumination: Double, litRight: Bool)
  case cycle(day: Int, phase: CyclePhase)

  private static let waxingPhases: Set<MoonPhase> = [.waxingCrescent, .firstQuarter, .waxingGibbous]

  // Mirrors the web's MoonGuide: a waxing moon is lit on the right in the north and on
  // the left in the south, as the person actually sees it.
  static func badges(for context: RhythmContext, feltSeason: Season, hemisphere: Hemisphere)
    -> [RhythmBadge]
  {
    let waxesRight = waxingPhases.contains(context.moon.phase)
    var badges: [RhythmBadge] = [
      .season(feltSeason),
      .moon(
        phase: context.moon.phase, illumination: context.moon.illumination,
        litRight: hemisphere == .south ? !waxesRight : waxesRight),
    ]
    if let cycle = context.cycle {
      badges.append(.cycle(day: cycle.day, phase: cycle.phase))
    }
    return badges
  }

  // The SF Symbol for the badge; nil for the moon, which is drawn by `MoonLitShape`.
  // Sun at the height of light, leaf for growth, wind for release, snow for rest; the cycle
  // keeps to its own shapes so no phase borrows a season's.
  var symbol: String? {
    switch self {
    case .season(let season):
      switch season {
      case .spring: return "leaf"
      case .summer: return "sun.max"
      case .autumn: return "wind"
      case .winter: return "snowflake"
      }
    case .moon:
      return nil
    case .cycle(_, let phase):
      switch phase {
      case .menstrual: return "drop"
      case .follicular: return "sunrise"
      case .ovulation: return "sparkles"
      case .luteal: return "sunset"
      }
    }
  }

  var identifier: String {
    switch self {
    case .season: return "rhythm-badge-season"
    case .moon: return "rhythm-badge-moon"
    case .cycle: return "rhythm-badge-cycle"
    }
  }

  // What VoiceOver reads. The cycle always says it is an estimate (design principle 3).
  func label(locale: Locale) -> String {
    switch self {
    case .season(let season):
      return RhythmSummary.sentenceCase(season.rawValue)
    case .moon(let phase, let illumination, _):
      let lit = illumination.formatted(
        .percent.precision(.fractionLength(0)).locale(locale))
      return "\(RhythmSummary.sentenceCase(phase.rawValue)) moon, \(lit) lit"
    case .cycle(let day, let phase):
      let dayText = day.formatted(.number.locale(locale))
      return "Cycle day \(dayText), estimated \(phase.rawValue) phase"
    }
  }
}

// The lit part of the moon's disc. The lit limb is the half of the disc on the lit side;
// the terminator is a half-ellipse whose width shrinks to nothing at the quarters and
// grows back to the disc's edge at new and full. A crescent is the limb minus the
// terminator's ellipse; a gibbous is the limb plus it. Same construction as the web's
// MoonPhaseIcon.
struct MoonLitShape: Shape {
  let illumination: Double
  let litRight: Bool

  func path(in rect: CGRect) -> Path {
    let k = min(1, max(0, illumination))
    let r = min(rect.width, rect.height) / 2
    let centre = CGPoint(x: rect.midX, y: rect.midY)
    if k <= 0.02 { return Path() }
    let disc = Path(
      ellipseIn: CGRect(x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r))
    if k >= 0.98 { return disc }
    let limb = disc.intersection(
      Path(
        CGRect(x: litRight ? centre.x : centre.x - r, y: centre.y - r, width: r, height: 2 * r)))
    let rx = r * abs(1 - 2 * k)
    let terminator = Path(
      ellipseIn: CGRect(x: centre.x - rx, y: centre.y - r, width: 2 * rx, height: 2 * r))
    return k < 0.5 ? limb.subtracting(terminator) : limb.union(terminator)
  }
}

// The rendered row: a circle per badge, each its own accessibility element, with the
// felt line beside it where it fits and beneath it at the largest type sizes.
struct RhythmBadgeRow<Trailing: View>: View {
  @Environment(\.studioTheme) private var theme
  @Environment(\.locale) private var locale
  let badges: [RhythmBadge]
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) {
        circles
        trailing()
      }
      VStack(alignment: .leading, spacing: 10) {
        circles
        trailing()
      }
    }
  }

  private var circles: some View {
    HStack(spacing: 8) {
      ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in
        ZStack {
          Circle().strokeBorder(theme.lineStrong, lineWidth: 1).frame(width: 34, height: 34)
          glyph(badge)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(badge.label(locale: locale))
        .accessibilityIdentifier(badge.identifier)
      }
    }
  }

  @ViewBuilder
  private func glyph(_ badge: RhythmBadge) -> some View {
    if case .moon(_, let illumination, let litRight) = badge {
      // Like the web's MoonPhaseIcon: a hairline disc, the lit part inked.
      ZStack {
        Circle().strokeBorder(theme.line, lineWidth: 1)
        MoonLitShape(illumination: illumination, litRight: litRight).fill(theme.inkMuted)
      }
      .frame(width: 16, height: 16)
    } else if let symbol = badge.symbol {
      Image(systemName: symbol).font(.system(size: 15)).foregroundStyle(theme.inkMuted)
    }
  }
}
