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

// The type scale from tokens.css, as SwiftUI fonts. Display = serif, interface = sans.
enum StudioFont {
  static let roomTitle = Font.system(size: 34, weight: .light, design: .serif)
  static let section = Font.system(size: 24, weight: .regular, design: .serif)
  static let cardTitle = Font.system(size: 19, weight: .regular, design: .serif)
  static let greeting = Font.system(size: 19, weight: .light, design: .serif).italic()
  static let quote = Font.system(size: 22, weight: .light, design: .serif).italic()
  static let pageSubtitle = Font.system(size: 17, weight: .regular)
  static let body = Font.system(size: 16, weight: .regular)
  static let meta = Font.system(size: 15, weight: .regular)
  static let control = Font.system(size: 14, weight: .medium)
  static let label = Font.system(size: 14, weight: .semibold)
  static let eyebrow = Font.system(size: 11, weight: .semibold)
}
