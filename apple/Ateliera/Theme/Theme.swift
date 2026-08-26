import SwiftUI

// The Ateliera palette (chamomile, the warm default), translated verbatim from
// apps/studio/src/styles/tokens.css. The other six themes + Dynamic Type + the
// bundled brand fonts come next; this pins the identity for the N0 fidelity check.
// Display type is New York (system serif) as a placeholder until Source Serif 4 is
// bundled; interface is the system sans.
extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xff) / 255,
      green: Double((hex >> 8) & 0xff) / 255,
      blue: Double(hex & 0xff) / 255,
      opacity: 1
    )
  }
}

enum Studio {
  // Surfaces + ink
  static let canvas = Color(hex: 0xf7f5f0)
  static let surface = Color(hex: 0xfffdfa)
  static let sunken = Color(hex: 0xf6f3ec)
  static let ink = Color(hex: 0x292a28)
  static let inkStrong = Color(hex: 0x26271f)
  static let ink1 = Color(hex: 0x3a3b34)
  static let inkMuted = Color(hex: 0x54564f)
  static let inkSoft = Color(hex: 0x6f716c)
  static let inkFaint = Color(hex: 0x8a8c86)
  static let line = Color(hex: 0xe2ddd2)
  static let lineStrong = Color(hex: 0xc9c2b3)
  static let link = Color(hex: 0x6e91ad)
  static let focus = Color(hex: 0x5b3d84)

  // Meaning colours
  static let foundation = Color(hex: 0x8c8d89)
  static let vision = Color(hex: 0xd5ab42)
  static let growth = Color(hex: 0x6f9478)
  static let reflection = Color(hex: 0x6e91ad)
  static let celebration = Color(hex: 0xd2874f)
  static let uncharted = Color(hex: 0x8976a7)
}

// The type scale from tokens.css, as SwiftUI fonts, using the bundled brand
// families (registered at launch — see AtelieraApp). Display = Source Serif 4,
// interface = Figtree, the hand = Nothing You Could Do.
enum StudioFont {
  static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Source Serif 4", size: size).weight(weight)
  }
  static func displayItalic(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Source Serif 4", size: size).weight(weight).italic()
  }
  static func interface(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Figtree", size: size).weight(weight)
  }
  static func hand(_ size: CGFloat) -> Font {
    Font.custom("Nothing You Could Do", size: size)
  }

  static let roomTitle = display(34, weight: .light)
  static let section = display(24)
  static let cardTitle = display(19)
  static let greeting = displayItalic(19, weight: .light)
  static let quote = displayItalic(22, weight: .light)
  static let pageSubtitle = interface(17)
  static let body = interface(16)
  static let meta = interface(15)
  static let control = interface(14, weight: .medium)
  static let label = interface(14, weight: .semibold)
  static let eyebrow = interface(11, weight: .semibold)
  static let signature = hand(16)
}
