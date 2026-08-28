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

  let canvas: Color       // page background (solid fallback for gradient themes)
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
    canvas: Color(hex: 0xf7f5f0),
    frame: Color(hex: 0xeae6dd),
    rail: Color(hex: 0xf2eee6),
    surface: Color(hex: 0xfffdfa),
    sunken: Color(hex: 0xf6f3ec),
    ink: Color(hex: 0x292a28),
    inkStrong: Color(hex: 0x26271f),
    ink1: Color(hex: 0x3a3b34),
    inkMuted: Color(hex: 0x54564f),
    inkSoft: Color(hex: 0x6f716c),
    inkFaint: Color(hex: 0x8a8c86),
    line: Color(hex: 0xe2ddd2),
    lineStrong: Color(hex: 0xc9c2b3),
    link: Color(hex: 0x6e91ad),
    focus: Color(hex: 0x5b3d84),
    foundation: Color(hex: 0x8c8d89),
    vision: Color(hex: 0xd5ab42),
    growth: Color(hex: 0x6f9478),
    reflection: Color(hex: 0x6e91ad),
    celebration: Color(hex: 0xd2874f),
    uncharted: Color(hex: 0x8976a7),
    stockFoundation: Color(hex: 0xebe6da),
    stockFoundationEdge: Color(hex: 0xd8d3c1),
    stockVision: Color(hex: 0xf6e8bd),
    stockVisionEdge: Color(hex: 0xe6d497),
    stockGrowth: Color(hex: 0xdae9d0),
    stockGrowthEdge: Color(hex: 0xc3dab6),
    stockReflection: Color(hex: 0xd7e5ef),
    stockReflectionEdge: Color(hex: 0xbed5e6),
    stockCelebration: Color(hex: 0xf6dcc4),
    stockCelebrationEdge: Color(hex: 0xecc8a6),
    stockUncharted: Color(hex: 0xe4dbf0),
    stockUnchartedEdge: Color(hex: 0xd2c3e8),
    accentSoft: Color(hex: 0xf4ecd8),
    accentSoftHover: Color(hex: 0xefe4c9),
    accentLine: Color(hex: 0xd8c9a6),
    script: Color(hex: 0xb09a70),
    scriptInk: Color(hex: 0x7a642f)
  )

  static let figLeaf = StudioTheme(
    id: "fig-leaf",
    name: "Fig Leaf",
    isDark: false,
    canvas: Color(hex: 0xeef2e6),
    frame: Color(hex: 0xdde5cf),
    rail: Color(hex: 0xe9efdf),
    surface: Color(hex: 0xfbfdf7),
    sunken: Color(hex: 0xeef2e6),
    ink: Color(hex: 0x2a2d26),
    inkStrong: Color(hex: 0x222519),
    ink1: Color(hex: 0x353a2d),
    inkMuted: Color(hex: 0x54564f),   // inherits chamomile
    inkSoft: Color(hex: 0x6f716c),    // inherits chamomile
    inkFaint: Color(hex: 0x777a72),
    line: Color(hex: 0xdce4d1),
    lineStrong: Color(hex: 0xa9b59a),
    link: Color(hex: 0x4f7691),
    focus: Color(hex: 0x5b3d84),      // inherits chamomile
    foundation: Color(hex: 0x87897f),
    vision: Color(hex: 0xc6a94a),
    growth: Color(hex: 0x5f8f6a),
    reflection: Color(hex: 0x5f8aa0),
    celebration: Color(hex: 0xcf8a54),
    uncharted: Color(hex: 0x8478a4),
    stockFoundation: Color(hex: 0xecefe4),
    stockFoundationEdge: Color(hex: 0xdbe0cf),
    stockVision: Color(hex: 0xf2ecc9),
    stockVisionEdge: Color(hex: 0xe4d9a8),
    stockGrowth: Color(hex: 0xdfe9d3),
    stockGrowthEdge: Color(hex: 0xc9d9ba),
    stockReflection: Color(hex: 0xdde8ea),
    stockReflectionEdge: Color(hex: 0xc6d8da),
    stockCelebration: Color(hex: 0xf2e3d0),
    stockCelebrationEdge: Color(hex: 0xe6cdb0),
    stockUncharted: Color(hex: 0xe6e0ee),
    stockUnchartedEdge: Color(hex: 0xd3c9e2),
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
    canvas: Color(hex: 0xfbecdc),
    frame: Color(hex: 0xf0dccc),
    rail: Color(hex: 0xf7e6d6),
    surface: Color(hex: 0xfffdf9),
    sunken: Color(hex: 0xf9eee1),
    ink: Color(hex: 0x2e2822),
    inkStrong: Color(hex: 0x261f18),
    ink1: Color(hex: 0x3d352c),
    inkMuted: Color(hex: 0x54564f),   // inherits chamomile
    inkSoft: Color(hex: 0x6f716c),    // inherits chamomile
    inkFaint: Color(hex: 0x8a8c86),   // inherits chamomile
    line: Color(hex: 0xefdccb),
    lineStrong: Color(hex: 0xc7a98d),
    link: Color(hex: 0x6e91ad),       // inherits chamomile
    focus: Color(hex: 0x5b3d84),      // inherits chamomile
    foundation: Color(hex: 0x8f8a83),
    vision: Color(hex: 0xd5a742),
    growth: Color(hex: 0x6f9478),
    reflection: Color(hex: 0x6f8fb0),
    celebration: Color(hex: 0xd67f4f),
    uncharted: Color(hex: 0x9079ab),
    stockFoundation: Color(hex: 0xefe9df),
    stockFoundationEdge: Color(hex: 0xe0d7c6),
    stockVision: Color(hex: 0xf9e9bf),
    stockVisionEdge: Color(hex: 0xeed79a),
    stockGrowth: Color(hex: 0xe2ebda),
    stockGrowthEdge: Color(hex: 0xcddcc0),
    stockReflection: Color(hex: 0xe0e8ef),
    stockReflectionEdge: Color(hex: 0xccd9e6),
    stockCelebration: Color(hex: 0xf9ddc6),
    stockCelebrationEdge: Color(hex: 0xf0c6a6),
    stockUncharted: Color(hex: 0xecdff0),
    stockUnchartedEdge: Color(hex: 0xdcc9e6),
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
    canvas: Color(hex: 0xefe9f6),
    frame: Color(hex: 0xe3d9ec),
    rail: Color(hex: 0xece5f3),
    surface: Color(hex: 0xfdfbff),
    sunken: Color(hex: 0xefe9f5),
    ink: Color(hex: 0x2b2830),
    inkStrong: Color(hex: 0x231f2a),
    ink1: Color(hex: 0x38333f),
    inkMuted: Color(hex: 0x54564f),   // inherits chamomile
    inkSoft: Color(hex: 0x6f716c),    // inherits chamomile
    inkFaint: Color(hex: 0x8a8c86),   // inherits chamomile
    line: Color(hex: 0xe4dcee),
    lineStrong: Color(hex: 0xad9cc9),
    link: Color(hex: 0x6e91ad),       // inherits chamomile
    focus: Color(hex: 0x5b3d84),      // inherits chamomile
    foundation: Color(hex: 0x89858f),
    vision: Color(hex: 0xc6a24f),
    growth: Color(hex: 0x679277),
    reflection: Color(hex: 0x6987ad),
    celebration: Color(hex: 0xcd825a),
    uncharted: Color(hex: 0x8a6fb0),
    stockFoundation: Color(hex: 0xece9ef),
    stockFoundationEdge: Color(hex: 0xdcd6e4),
    stockVision: Color(hex: 0xf2ebcf),
    stockVisionEdge: Color(hex: 0xe5daae),
    stockGrowth: Color(hex: 0xe0ebe1),
    stockGrowthEdge: Color(hex: 0xcadccb),
    stockReflection: Color(hex: 0xe1e8f1),
    stockReflectionEdge: Color(hex: 0xccd8e8),
    stockCelebration: Color(hex: 0xf3e2da),
    stockCelebrationEdge: Color(hex: 0xe8cdc0),
    stockUncharted: Color(hex: 0xeadff3),
    stockUnchartedEdge: Color(hex: 0xd8c6ea),
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
    canvas: Color(hex: 0x16293a),
    frame: Color(hex: 0x0e1720),
    rail: Color(hex: 0x132534),
    surface: Color(hex: 0x183446),
    sunken: Color(hex: 0x1e3c50),
    ink: Color(hex: 0xe2edf2),
    inkStrong: Color(hex: 0xeef6f9),
    ink1: Color(hex: 0xd2e2ea),
    inkMuted: Color(hex: 0xa6bcc7),
    inkSoft: Color(hex: 0x86a0ad),
    inkFaint: Color(hex: 0x6d8794),
    line: Color(hex: 0x365669),
    lineStrong: Color(hex: 0x5d8294),
    link: Color(hex: 0x7fc2dc),
    focus: Color(hex: 0xf0d477),
    foundation: Color(hex: 0x9fb0b3),
    vision: Color(hex: 0xe6c56a),
    growth: Color(hex: 0x79c0a0),
    reflection: Color(hex: 0x7fc2dc),
    celebration: Color(hex: 0xe8a06b),
    uncharted: Color(hex: 0xb39ad6),
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
    canvas: Color(hex: 0x3a2436),
    frame: Color(hex: 0x1a1220),
    rail: Color(hex: 0x281c30),
    surface: Color(hex: 0x2f2338),
    sunken: Color(hex: 0x382a42),
    ink: Color(hex: 0xf1e6ec),
    inkStrong: Color(hex: 0xf8eff2),
    ink1: Color(hex: 0xe5d8e0),
    inkMuted: Color(hex: 0xc0b0bd),
    inkSoft: Color(hex: 0x9f8f9d),
    inkFaint: Color(hex: 0x82727f),
    line: Color(hex: 0x55405f),
    lineStrong: Color(hex: 0x7c6588),
    link: Color(hex: 0xe6a08f),
    focus: Color(hex: 0xf1ca78),
    foundation: Color(hex: 0xaaa1a6),
    vision: Color(hex: 0xeec06a),
    growth: Color(hex: 0x89b98f),
    reflection: Color(hex: 0x9aa6db),
    celebration: Color(hex: 0xec9463),
    uncharted: Color(hex: 0xc294c9),
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
    canvas: Color(hex: 0x1a271a),
    frame: Color(hex: 0x0f150f),
    rail: Color(hex: 0x182418),
    surface: Color(hex: 0x1c2a1b),
    sunken: Color(hex: 0x233324),
    ink: Color(hex: 0xe7eede),
    inkStrong: Color(hex: 0xf0f5e8),
    ink1: Color(hex: 0xd8e3cd),
    inkMuted: Color(hex: 0xaebca4),
    inkSoft: Color(hex: 0x8ba083),
    inkFaint: Color(hex: 0x728a6b),
    line: Color(hex: 0x3d503c),
    lineStrong: Color(hex: 0x5f775d),
    link: Color(hex: 0x84b6cc),
    focus: Color(hex: 0xe7cb72),
    foundation: Color(hex: 0xa4ac9c),
    vision: Color(hex: 0xdcc169),
    growth: Color(hex: 0x84c07f),
    reflection: Color(hex: 0x84b6cc),
    celebration: Color(hex: 0xe0a06a),
    uncharted: Color(hex: 0xaf9dce),
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
