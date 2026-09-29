import SwiftUI

// StudioTheme: a value type holding one complete colour palette for a named theme.
// Seven static palettes (4 light, 3 dark) are derived verbatim from
// apps/studio/src/styles/tokens.css. Views read colours from the environment key
// `studioTheme`; the ThemeStore owns persistence.

struct StudioTheme {
  // MARK: - Identity

  let id: String
  let name: String
  let isDark: Bool

  // MARK: - Structural colours

  let canvas: Color       // page background (flat — no gradients under Folio)
  let frame: Color        // sidebar / rail background
  let rail: Color         // inner nav rail
  let surface: Color      // card / sheet surface
  let sunken: Color       // recessed surface (inputs, well)
  let ink: Color          // primary text
  let inkStrong: Color    // headings / emphasis
  let ink1: Color         // secondary text
  let inkMuted: Color     // tertiary text
  let inkSoft: Color      // placeholder / subdued
  let inkFaint: Color     // disabled / ghost
  let line: Color         // dividers
  let lineStrong: Color   // borders / outlines
  let accent: Color       // the dusk indicator — selected chips, active dots
  let link: Color         // interactive links
  let focus: Color        // focus ring

  // MARK: - Semantic accent colours

  let foundation: Color   // Foundations life area
  let vision: Color       // Vision life area
  let growth: Color       // Growth life area
  let reflection: Color   // Reflection life area
  let celebration: Color  // Celebration life area
  let uncharted: Color    // Uncharted life area

  // MARK: - Note stock (pastel card backgrounds)

  let stockFoundation: Color
  let stockFoundationEdge: Color
  let stockVision: Color
  let stockVisionEdge: Color
  let stockGrowth: Color
  let stockGrowthEdge: Color
  let stockReflection: Color
  let stockReflectionEdge: Color
  let stockCelebration: Color
  let stockCelebrationEdge: Color
  let stockUncharted: Color
  let stockUnchartedEdge: Color

  // MARK: - Quiet-action accents

  let accentSoft: Color
  let accentSoftHover: Color
  let accentLine: Color

  // MARK: - Script / code tints

  let script: Color
  let scriptInk: Color
}

// MARK: - Static palette library

extension StudioTheme {

  // MARK: Light themes

  static let chamomile = StudioTheme(
    id: "chamomile",
    name: "Chamomile",
    isDark: false,
    canvas: Color(hex: 0xeee8de),
    frame: Color(hex: 0xe9e3d8),
    rail: Color(hex: 0xf2ede4),
    surface: Color(hex: 0xf7f3ec),
    sunken: Color(hex: 0xe6dfd3),
    ink: Color(hex: 0x2b2824),
    inkStrong: Color(hex: 0x221f1b),
    ink1: Color(hex: 0x3a3631),
    inkMuted: Color(hex: 0x5b554d),
    inkSoft: Color(hex: 0x6c655b),
    inkFaint: Color(hex: 0x8a8378),
    line: Color(hex: 0xddd4c6),
    lineStrong: Color(hex: 0xbfb3a1),
    accent: Color(hex: 0x55657a),
    link: Color(hex: 0x55657a),
    focus: Color(hex: 0x55657a),
    foundation: Color(hex: 0x7d725f),
    vision: Color(hex: 0x556578),
    growth: Color(hex: 0x636a4a),
    reflection: Color(hex: 0x6f6173),
    celebration: Color(hex: 0x9a6d48),
    uncharted: Color(hex: 0x66625c),
    stockFoundation: Color(hex: 0xe6ded1),
    stockFoundationEdge: Color(hex: 0xcdc6bb),
    stockVision: Color(hex: 0xe0e3e4),
    stockVisionEdge: Color(hex: 0xbfc2c4),
    stockGrowth: Color(hex: 0xe2e3d2),
    stockGrowthEdge: Color(hex: 0xc4c4b4),
    stockReflection: Color(hex: 0xe7e0e3),
    stockReflectionEdge: Color(hex: 0xc8c0c2),
    stockCelebration: Color(hex: 0xefe0d1),
    stockCelebrationEdge: Color(hex: 0xd7c5b3),
    stockUncharted: Color(hex: 0xe4e0da),
    stockUnchartedEdge: Color(hex: 0xc5c1ba),
    accentSoft: Color(hex: 0xf4ecd8),
    accentSoftHover: Color(hex: 0xefe4c9),
    accentLine: Color(hex: 0xd8c9a6),
    script: Color(hex: 0xa3855a),
    scriptInk: Color(hex: 0x7a642f)
  )

  static let figLeaf = StudioTheme(
    id: "fig-leaf",
    name: "Fig Leaf",
    isDark: false,
    canvas: Color(hex: 0xe6e7dc),
    frame: Color(hex: 0xe1e2d6),
    rail: Color(hex: 0xeaece2),
    surface: Color(hex: 0xf1f2ea),
    sunken: Color(hex: 0xe0ded1),
    ink: Color(hex: 0x272a22),
    inkStrong: Color(hex: 0x1e2119),
    ink1: Color(hex: 0x36382f),
    inkMuted: Color(hex: 0x57574b),
    inkSoft: Color(hex: 0x686759),
    inkFaint: Color(hex: 0x868576),
    line: Color(hex: 0xd3d6c5),
    lineStrong: Color(hex: 0xb5b5a0),
    accent: Color(hex: 0x6f7556),
    link: Color(hex: 0x4f7691),
    focus: Color(hex: 0x55657a),      // inherits chamomile
    foundation: Color(hex: 0x7d725f),
    vision: Color(hex: 0x556578),
    growth: Color(hex: 0x636a4a),
    reflection: Color(hex: 0x6f6173),
    celebration: Color(hex: 0x9a6d48),
    uncharted: Color(hex: 0x66625c),
    stockFoundation: Color(hex: 0xdeddd3),
    stockFoundationEdge: Color(hex: 0xc9c6ba),
    stockVision: Color(hex: 0xd7dbd7),
    stockVisionEdge: Color(hex: 0xbbc1c2),
    stockGrowth: Color(hex: 0xdadcd0),
    stockGrowthEdge: Color(hex: 0xc0c3b3),
    stockReflection: Color(hex: 0xdcdad6),
    stockReflectionEdge: Color(hex: 0xc4c0c1),
    stockCelebration: Color(hex: 0xe3dccf),
    stockCelebrationEdge: Color(hex: 0xd3c4b2),
    stockUncharted: Color(hex: 0xdadad3),
    stockUnchartedEdge: Color(hex: 0xc1c0b9),
    accentSoft: Color(hex: 0xf4ecd8),      // inherits chamomile
    accentSoftHover: Color(hex: 0xefe4c9), // inherits chamomile
    accentLine: Color(hex: 0xd8c9a6),      // inherits chamomile
    script: Color(hex: 0x7f8a5f),
    scriptInk: Color(hex: 0x5f6a30)
  )

  static let sunrise = StudioTheme(
    id: "sunrise",
    name: "Sunrise",
    isDark: false,
    canvas: Color(hex: 0xf0e6dc),
    frame: Color(hex: 0xebe1d6),
    rail: Color(hex: 0xf4ebe2),
    surface: Color(hex: 0xf7f0e8),
    sunken: Color(hex: 0xe6dccf),
    ink: Color(hex: 0x2e2620),
    inkStrong: Color(hex: 0x251d17),
    ink1: Color(hex: 0x3d342d),
    inkMuted: Color(hex: 0x5e5349),
    inkSoft: Color(hex: 0x6f6357),
    inkFaint: Color(hex: 0x8d8174),
    line: Color(hex: 0xe3d3c4),
    lineStrong: Color(hex: 0xc5b29f),
    accent: Color(hex: 0xb0805c),
    link: Color(hex: 0x55657a),       // inherits chamomile
    focus: Color(hex: 0x55657a),      // inherits chamomile
    foundation: Color(hex: 0x7d725f),
    vision: Color(hex: 0x556578),
    growth: Color(hex: 0x636a4a),
    reflection: Color(hex: 0x6f6173),
    celebration: Color(hex: 0x9a6d48),
    uncharted: Color(hex: 0x66625c),
    stockFoundation: Color(hex: 0xe3dbd1),
    stockFoundationEdge: Color(hex: 0xcdc4b9),
    stockVision: Color(hex: 0xdcd9d6),
    stockVisionEdge: Color(hex: 0xbfc0c1),
    stockGrowth: Color(hex: 0xdfdace),
    stockGrowthEdge: Color(hex: 0xc4c2b1),
    stockReflection: Color(hex: 0xe1d8d5),
    stockReflectionEdge: Color(hex: 0xc8bebf),
    stockCelebration: Color(hex: 0xe8dace),
    stockCelebrationEdge: Color(hex: 0xd7c3b1),
    stockUncharted: Color(hex: 0xdfd9d1),
    stockUnchartedEdge: Color(hex: 0xc5bfb7),
    accentSoft: Color(hex: 0xf8ead2),
    accentSoftHover: Color(hex: 0xf2ddc0),
    accentLine: Color(hex: 0xd2ad76),
    script: Color(hex: 0xb98a5f),
    scriptInk: Color(hex: 0x8a5f30)
  )

  static let wisteria = StudioTheme(
    id: "wisteria",
    name: "Wisteria",
    isDark: false,
    canvas: Color(hex: 0xe8e4e9),
    frame: Color(hex: 0xe3dfe3),
    rail: Color(hex: 0xece9ef),
    surface: Color(hex: 0xf2eff2),
    sunken: Color(hex: 0xe1dbd9),
    ink: Color(hex: 0x2a2630),
    inkStrong: Color(hex: 0x211d27),
    ink1: Color(hex: 0x39343d),
    inkMuted: Color(hex: 0x5a5359),
    inkSoft: Color(hex: 0x6b6367),
    inkFaint: Color(hex: 0x898184),
    line: Color(hex: 0xd8d1da),
    lineStrong: Color(hex: 0xbab0b5),
    accent: Color(hex: 0x7d6f86),
    link: Color(hex: 0x55657a),       // inherits chamomile
    focus: Color(hex: 0x55657a),      // inherits chamomile
    foundation: Color(hex: 0x7d725f),
    vision: Color(hex: 0x556578),
    growth: Color(hex: 0x636a4a),
    reflection: Color(hex: 0x6f6173),
    celebration: Color(hex: 0x9a6d48),
    uncharted: Color(hex: 0x66625c),
    stockFoundation: Color(hex: 0xdfdada),
    stockFoundationEdge: Color(hex: 0xc9c4bf),
    stockVision: Color(hex: 0xd8d8de),
    stockVisionEdge: Color(hex: 0xbcbfc8),
    stockGrowth: Color(hex: 0xdad9d6),
    stockGrowthEdge: Color(hex: 0xc0c1b8),
    stockReflection: Color(hex: 0xdcd8dd),
    stockReflectionEdge: Color(hex: 0xc5bec6),
    stockCelebration: Color(hex: 0xe3dad6),
    stockCelebrationEdge: Color(hex: 0xd4c2b7),
    stockUncharted: Color(hex: 0xdbd8d9),
    stockUnchartedEdge: Color(hex: 0xc1bebe),
    accentSoft: Color(hex: 0xf4ecd8),      // inherits chamomile
    accentSoftHover: Color(hex: 0xefe4c9), // inherits chamomile
    accentLine: Color(hex: 0xd8c9a6),      // inherits chamomile
    script: Color(hex: 0x9a7fb0),
    scriptInk: Color(hex: 0x6a4f8a)
  )

  // MARK: Dark themes

  static let deepOcean = StudioTheme(
    id: "deep-ocean",
    name: "Deep Ocean",
    isDark: true,
    canvas: Color(hex: 0x1f262d),
    frame: Color(hex: 0x0e1720),
    rail: Color(hex: 0x132534),
    surface: Color(hex: 0x283039),
    sunken: Color(hex: 0x1e3c50),
    ink: Color(hex: 0xe4e8ea),
    inkStrong: Color(hex: 0xeef6f9),
    ink1: Color(hex: 0xd2e2ea),
    inkMuted: Color(hex: 0xa6bcc7),
    inkSoft: Color(hex: 0x86a0ad),
    inkFaint: Color(hex: 0x6d8794),
    line: Color(hex: 0x3a4550),
    lineStrong: Color(hex: 0x5d8294),
    accent: Color(hex: 0x93a5b5),
    link: Color(hex: 0x7fc2dc),
    focus: Color(hex: 0xf0d477),
    foundation: Color(hex: 0x9f9789),
    vision: Color(hex: 0x8f99a6),
    growth: Color(hex: 0x989d88),
    reflection: Color(hex: 0xa097a3),
    celebration: Color(hex: 0xb49378),
    uncharted: Color(hex: 0x9a9793),
    stockFoundation: Color(hex: 0x1e3646),
    stockFoundationEdge: Color(hex: 0x2c4a5c),
    stockVision: Color(hex: 0x333820),
    stockVisionEdge: Color(hex: 0x4a4e2b),
    stockGrowth: Color(hex: 0x183a35),
    stockGrowthEdge: Color(hex: 0x265049),
    stockReflection: Color(hex: 0x173a4c),
    stockReflectionEdge: Color(hex: 0x265264),
    stockCelebration: Color(hex: 0x3a2f24),
    stockCelebrationEdge: Color(hex: 0x4e3f2e),
    stockUncharted: Color(hex: 0x2b2f45),
    stockUnchartedEdge: Color(hex: 0x3b3f5b),
    accentSoft: Color(hex: 0x123246),
    accentSoftHover: Color(hex: 0x17405a),
    accentLine: Color(hex: 0x4b829d),
    script: Color(hex: 0x8fc7cf),
    scriptInk: Color(hex: 0xe6c56a)
  )

  static let sunset = StudioTheme(
    id: "sunset",
    name: "Sunset",
    isDark: true,
    canvas: Color(hex: 0x2a2227),
    frame: Color(hex: 0x1a1220),
    rail: Color(hex: 0x281c30),
    surface: Color(hex: 0x342b31),
    sunken: Color(hex: 0x382a42),
    ink: Color(hex: 0xefe6e7),
    inkStrong: Color(hex: 0xf8eff2),
    ink1: Color(hex: 0xe5d8e0),
    inkMuted: Color(hex: 0xc0b0bd),
    inkSoft: Color(hex: 0x9f8f9d),
    inkFaint: Color(hex: 0x82727f),
    line: Color(hex: 0x4b3e46),
    lineStrong: Color(hex: 0x7c6588),
    accent: Color(hex: 0xc49c8c),
    link: Color(hex: 0xe6a08f),
    focus: Color(hex: 0xf1ca78),
    foundation: Color(hex: 0x9f9789),
    vision: Color(hex: 0x8f99a6),
    growth: Color(hex: 0x959a84),
    reflection: Color(hex: 0x9d94a0),
    celebration: Color(hex: 0xb29074),
    uncharted: Color(hex: 0x9a9793),
    stockFoundation: Color(hex: 0x332a3a),
    stockFoundationEdge: Color(hex: 0x443850),
    stockVision: Color(hex: 0x3a2f1e),
    stockVisionEdge: Color(hex: 0x50402a),
    stockGrowth: Color(hex: 0x26342c),
    stockGrowthEdge: Color(hex: 0x374a3b),
    stockReflection: Color(hex: 0x2b2f45),
    stockReflectionEdge: Color(hex: 0x3d4160),
    stockCelebration: Color(hex: 0x3d2a26),
    stockCelebrationEdge: Color(hex: 0x543a30),
    stockUncharted: Color(hex: 0x382a42),
    stockUnchartedEdge: Color(hex: 0x4c3959),
    accentSoft: Color(hex: 0x3a2a1c),
    accentSoftHover: Color(hex: 0x472f22),
    accentLine: Color(hex: 0x80604a),
    script: Color(hex: 0xe2a6b0),
    scriptInk: Color(hex: 0xeec06a)
  )

  static let forest = StudioTheme(
    id: "forest",
    name: "Forest",
    isDark: true,
    canvas: Color(hex: 0x1f241e),
    frame: Color(hex: 0x0f150f),
    rail: Color(hex: 0x182418),
    surface: Color(hex: 0x282e26),
    sunken: Color(hex: 0x233324),
    ink: Color(hex: 0xe6eadf),
    inkStrong: Color(hex: 0xf0f5e8),
    ink1: Color(hex: 0xd8e3cd),
    inkMuted: Color(hex: 0xaebca4),
    inkSoft: Color(hex: 0x8ba083),
    inkFaint: Color(hex: 0x728a6b),
    line: Color(hex: 0x3b4337),
    lineStrong: Color(hex: 0x5f775d),
    accent: Color(hex: 0x9ca688),
    link: Color(hex: 0x84b6cc),
    focus: Color(hex: 0xe7cb72),
    foundation: Color(hex: 0x9c9485),
    vision: Color(hex: 0x8b96a3),
    growth: Color(hex: 0x959a84),
    reflection: Color(hex: 0x9d94a0),
    celebration: Color(hex: 0xb29074),
    uncharted: Color(hex: 0x979490),
    stockFoundation: Color(hex: 0x2a352a),
    stockFoundationEdge: Color(hex: 0x3a473a),
    stockVision: Color(hex: 0x333820),
    stockVisionEdge: Color(hex: 0x484e2b),
    stockGrowth: Color(hex: 0x22371f),
    stockGrowthEdge: Color(hex: 0x324b2d),
    stockReflection: Color(hex: 0x213a3f),
    stockReflectionEdge: Color(hex: 0x315056),
    stockCelebration: Color(hex: 0x37301f),
    stockCelebrationEdge: Color(hex: 0x4c412b),
    stockUncharted: Color(hex: 0x2d2f3f),
    stockUnchartedEdge: Color(hex: 0x3f4155),
    accentSoft: Color(hex: 0x293618),
    accentSoftHover: Color(hex: 0x33421f),
    accentLine: Color(hex: 0x687943),
    script: Color(hex: 0xb6c98a),
    scriptInk: Color(hex: 0xdcc169)
  )

  // MARK: - Registry

  static let all: [StudioTheme] = [
    chamomile, figLeaf, sunrise, wisteria,
    deepOcean, sunset, forest,
  ]

  static func byId(_ id: String) -> StudioTheme {
    all.first { $0.id == id } ?? chamomile
  }
}

// MARK: - SwiftUI environment integration

private struct StudioThemeKey: EnvironmentKey {
  static let defaultValue: StudioTheme = .chamomile
}

extension EnvironmentValues {
  var studioTheme: StudioTheme {
    get { self[StudioThemeKey.self] }
    set { self[StudioThemeKey.self] = newValue }
  }
}

extension View {
  func studioTheme(_ theme: StudioTheme) -> some View {
    environment(\.studioTheme, theme)
  }
}
