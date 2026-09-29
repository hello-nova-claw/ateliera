import SwiftUI

// Shared Folio surface pieces: the brand lockup (constellation-A + wordmark) and the
// soft, borderless card that lifts with a shadow rather than a hard outline. Kept in
// one place so the Foyer and the rooms read as one calm, minimal system.

// MARK: - Constellation mark

// The seven-star "A": two legs and a crossbar, the lower-right foot the one bright
// star. Drawn on a 40-unit grid, scaled to `size`. Verbatim geometry from the web
// BrandMark so the native lockup matches the design system.
struct ConstellationMark: View {
  var size: CGFloat = 40
  var color: Color = .primary

  private let stars: [CGPoint] = [
    CGPoint(x: 20, y: 4),
    CGPoint(x: 13, y: 20),
    CGPoint(x: 27, y: 20),
    CGPoint(x: 10.8, y: 27),
    CGPoint(x: 29.2, y: 27),
    CGPoint(x: 8, y: 36),
  ]
  private let brightStar = CGPoint(x: 32, y: 36)

  var body: some View {
    Canvas { ctx, sz in
      let s = sz.width / 40
      func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

      var lines = Path()
      lines.move(to: p(20, 4)); lines.addLine(to: p(13, 20))
      lines.addLine(to: p(10.8, 27)); lines.addLine(to: p(8, 36))
      lines.move(to: p(20, 4)); lines.addLine(to: p(27, 20))
      lines.addLine(to: p(29.2, 27)); lines.addLine(to: p(32, 36))
      lines.move(to: p(10.8, 27)); lines.addLine(to: p(29.2, 27))
      ctx.stroke(
        lines, with: .color(color.opacity(0.55)),
        style: StrokeStyle(lineWidth: 1.4 * s, lineCap: .round, lineJoin: .round))

      func dot(_ pt: CGPoint, _ r: CGFloat) {
        let rr = r * s
        ctx.fill(
          Path(ellipseIn: CGRect(x: pt.x * s - rr, y: pt.y * s - rr, width: rr * 2, height: rr * 2)),
          with: .color(color))
      }
      for star in stars { dot(star, 1.7) }
      dot(brightStar, 2.6)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

// MARK: - Brand lockup

// The constellation mark over the "Ateliera / STUDIO" wordmark, centred. The name is
// real text (Cormorant), the tag is tracked interface caps.
struct BrandLockup: View {
  @Environment(\.studioTheme) private var theme
  var tone: Tone = .ink

  enum Tone { case ink, foil }

  private var color: Color { tone == .foil ? theme.script : theme.inkStrong }

  var body: some View {
    VStack(spacing: 4) {
      ConstellationMark(size: 40, color: color)
      Text("Ateliera")
        .font(StudioFont.display(30))
        .foregroundStyle(color)
      Text("STUDIO")
        .font(StudioFont.interface(11, weight: .medium))
        .tracking(5)
        .foregroundStyle(theme.inkSoft)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Ateliera Studio")
  }
}

// MARK: - Soft card

// A borderless surface that lifts with a soft shadow (light themes) or a hairline
// (dark themes / increased-contrast). The Folio card: no hard outline, generous
// radius, room to breathe.
struct StudioCard: ViewModifier {
  @Environment(\.studioTheme) private var theme
  @Environment(\.colorSchemeContrast) private var contrast
  var padding: CGFloat = 20

  private var showsBorder: Bool { theme.isDark || contrast == .increased }

  func body(content: Content) -> some View {
    content
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surface))
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .strokeBorder(theme.line, lineWidth: showsBorder ? 1 : 0)
      )
      .shadow(color: theme.isDark ? .clear : theme.ink.opacity(0.06), radius: 14, x: 0, y: 6)
  }
}

extension View {
  func studioCard(padding: CGFloat = 20) -> some View {
    modifier(StudioCard(padding: padding))
  }
}

// MARK: - Seasonal hero

// The atmospheric photo band on the Foyer, chosen by the felt season. Four CC0
// landscapes (Wikimedia Commons / Unsplash-donated) ship in the asset catalog; see
// apple/PHOTO-CREDITS.md. Decorative, so hidden from assistive tech.
struct SeasonalHero: View {
  let season: Season
  var height: CGFloat = 188

  private var asset: String {
    switch season {
    case .spring: return "Hero-spring"
    case .summer: return "Hero-summer"
    case .autumn: return "Hero-autumn"
    case .winter: return "Hero-winter"
    }
  }

  var body: some View {
    Image(asset)
      .resizable()
      .aspectRatio(contentMode: .fill)
      .frame(maxWidth: .infinity)
      .frame(height: height)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .accessibilityHidden(true)
  }
}
