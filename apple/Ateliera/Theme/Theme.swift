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
  static let canvas = Color(hex: 0xeee8de)
  static let surface = Color(hex: 0xf7f3ec)
  static let sunken = Color(hex: 0xe6dfd3)
  static let ink = Color(hex: 0x2b2824)
  static let inkStrong = Color(hex: 0x221f1b)
  static let ink1 = Color(hex: 0x3a3631)
  static let inkMuted = Color(hex: 0x5b554d)
  static let inkSoft = Color(hex: 0x6c655b)
  static let inkFaint = Color(hex: 0x8a8378)
  static let line = Color(hex: 0xddd4c6)
  static let lineStrong = Color(hex: 0xbfb3a1)
  static let accent = Color(hex: 0x55657a)
  static let link = Color(hex: 0x55657a)
  static let focus = Color(hex: 0x55657a)

  // Meaning colours
  static let foundation = Color(hex: 0x7d725f)
  static let vision = Color(hex: 0x556578)
  static let growth = Color(hex: 0x636a4a)
  static let reflection = Color(hex: 0x6f6173)
  static let celebration = Color(hex: 0x9a6d48)
  static let uncharted = Color(hex: 0x66625c)
}

// The Folio type scale from tokens.css, as SwiftUI fonts, using the bundled brand
// families (registered at launch — see AtelieraApp). Display = Cormorant Garamond
// (serif for anything read or written), interface = Figtree (controls, eyebrows,
// dates, counts), the hand = Nothing You Could Do (greetings + captions only).
enum StudioFont {
  static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Cormorant Garamond", size: size).weight(weight)
  }
  static func displayItalic(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Cormorant Garamond", size: size).weight(weight).italic()
  }
  static func interface(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    Font.custom("Figtree", size: size).weight(weight)
  }
  static func hand(_ size: CGFloat) -> Font {
    Font.custom("Nothing You Could Do", size: size)
  }

  // px = rem × 16. Cormorant's small x-height is why display sizes run large.
  static let roomTitle = display(44)              // 2.75rem
  static let section = display(22)                // 1.375rem
  static let cardTitle = display(22)              // 1.375rem
  static let greeting = hand(20)                  // 1.25rem, the accent hand
  static let quote = displayItalic(17)            // italic 1.0625rem
  static let pageSubtitle = displayItalic(19)     // italic 1.1875rem
  static let body = display(17)                   // 1.0625rem, long-form is serif
  static let meta = interface(12)                 // 0.75rem
  static let control = interface(13, weight: .medium)   // 0.8125rem
  static let label = interface(12, weight: .medium)     // 0.75rem
  static let eyebrow = interface(10.5, weight: .medium) // 0.65625rem
  static let signature = hand(16)
}
