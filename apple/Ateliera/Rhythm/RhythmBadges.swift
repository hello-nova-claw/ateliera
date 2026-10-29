import SwiftUI

// The Today card's badge row: one circle per rhythm the person has in play. The season
// and the moon show for everyone; the cycle only when Health shares one. The moon is
// drawn, not symbolised, so its phase is read at a glance, and the lit limb follows the
// hemisphere. Pure, so the choice of badges, glyphs and spoken labels is testable.
enum RhythmBadge: Equatable {
  case season(Season)
  case moon(phase: MoonPhase, illumination: Double, litRight: Bool)
  case cycle(day: Int, phase: CyclePhase)

  // Mirrors the web's MoonGuide: a waxing moon is lit on the right in the north and on
  // the left in the south, as the person actually sees it. Waxing is read from how far
  // through the lunar month we are (0 at new, 0.5 at full) rather than the phase name,
  // because the new and full windows straddle their instants.
  static func badges(for context: RhythmContext, feltSeason: Season, hemisphere: Hemisphere)
    -> [RhythmBadge]
  {
    let waxesRight = context.lunarProgress < 0.5
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
      return season.localizedName(locale: locale)
    case .moon(let phase, let illumination, _):
      let lit = illumination.formatted(.percent.precision(.fractionLength(0)).locale(locale))
      return String(
        localized: "\(phase.localizedName(locale: locale)) moon, \(lit) lit", locale: locale,
        comment: "Moon badge label. 1: the phase, like Waning gibbous. 2: the lit share, like 62%.")
    case .cycle(let day, let phase):
      return String(
        localized: "Cycle day \(day), estimated \(phase.localizedName(locale: locale)) phase",
        locale: locale,
        comment: "Cycle badge label. 1: the day number. 2: the phase, like follicular.")
    }
  }
}

extension Season {
  func localizedName(locale: Locale) -> String {
    switch self {
    case .spring: return String(localized: "Spring", locale: locale, comment: "Season name")
    case .summer: return String(localized: "Summer", locale: locale, comment: "Season name")
    case .autumn: return String(localized: "Autumn", locale: locale, comment: "Season name")
    case .winter: return String(localized: "Winter", locale: locale, comment: "Season name")
    }
  }
}

extension MoonPhase {
  // Sentence-initial, as the start of "<phase> moon".
  func localizedName(locale: Locale) -> String {
    switch self {
    case .new: return String(localized: "New", locale: locale, comment: "Moon phase name")
    case .waxingCrescent:
      return String(localized: "Waxing crescent", locale: locale, comment: "Moon phase name")
    case .firstQuarter:
      return String(localized: "First quarter", locale: locale, comment: "Moon phase name")
    case .waxingGibbous:
      return String(localized: "Waxing gibbous", locale: locale, comment: "Moon phase name")
    case .full: return String(localized: "Full", locale: locale, comment: "Moon phase name")
    case .waningGibbous:
      return String(localized: "Waning gibbous", locale: locale, comment: "Moon phase name")
    case .lastQuarter:
      return String(localized: "Last quarter", locale: locale, comment: "Moon phase name")
    case .waningCrescent:
      return String(localized: "Waning crescent", locale: locale, comment: "Moon phase name")
    }
  }
}

extension CyclePhase {
  // Mid-sentence, as in "estimated <phase> phase".
  func localizedName(locale: Locale) -> String {
    switch self {
    case .menstrual:
      return String(
        localized: "menstrual", locale: locale, comment: "Cycle phase name, mid-sentence")
    case .follicular:
      return String(
        localized: "follicular", locale: locale, comment: "Cycle phase name, mid-sentence")
    case .ovulation:
      return String(
        localized: "ovulation", locale: locale, comment: "Cycle phase name, mid-sentence")
    case .luteal:
      return String(localized: "luteal", locale: locale, comment: "Cycle phase name, mid-sentence")
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
    let lit = min(1, max(0, illumination))
    let radius = min(rect.width, rect.height) / 2
    let centre = CGPoint(x: rect.midX, y: rect.midY)
    if lit <= 0.02 { return Path() }
    let disc = Path(
      ellipseIn: CGRect(
        x: centre.x - radius, y: centre.y - radius, width: 2 * radius, height: 2 * radius))
    if lit >= 0.98 { return disc }
    let limb = disc.intersection(
      Path(
        CGRect(
          x: litRight ? centre.x : centre.x - radius, y: centre.y - radius, width: radius,
          height: 2 * radius)))
    let terminatorWidth = radius * abs(1 - 2 * lit)
    let terminator = Path(
      ellipseIn: CGRect(
        x: centre.x - terminatorWidth, y: centre.y - radius, width: 2 * terminatorWidth,
        height: 2 * radius))
    return lit < 0.5 ? limb.subtracting(terminator) : limb.union(terminator)
  }
}

// The rendered row: a circle per badge, each its own accessibility element, with the
// felt line beside it where it fits and beneath it at the largest type sizes.
struct RhythmBadgeRow<Trailing: View>: View {
  @Environment(\.studioTheme) private var theme
  @Environment(\.locale) private var locale
  // The circles grow with the symbol's text style so the glyph never outgrows its border.
  @ScaledMetric(relativeTo: .subheadline) private var badgeSize: CGFloat = 34
  @ScaledMetric(relativeTo: .subheadline) private var moonSize: CGFloat = 16
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
          Circle().strokeBorder(theme.lineStrong, lineWidth: 1).frame(
            width: badgeSize, height: badgeSize)
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
      .frame(width: moonSize, height: moonSize)
    } else if let symbol = badge.symbol {
      Image(systemName: symbol).font(.subheadline).foregroundStyle(theme.inkMuted)
    }
  }
}
