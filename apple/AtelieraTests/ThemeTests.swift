import XCTest
import SwiftUI
@testable import Ateliera

// Golden values captured verbatim from apps/studio/src/styles/tokens.css after the
// Folio refresh (flat canvases, Cormorant display face, new muted meaning palette,
// new --studio-color-accent). Dark themes keep their hand-tuned ink ramps and stock
// tints (lighter touch); only canvas/surface/line/ink + accent + meaning changed.

final class ThemeTests: XCTestCase {

  // MARK: - Registry

  func testExactlySevenThemes() {
    XCTAssertEqual(StudioTheme.all.count, 7)
  }

  func testStableThemeIds() {
    let ids = StudioTheme.all.map { $0.id }
    XCTAssertEqual(ids, [
      "chamomile",
      "fig-leaf",
      "sunrise",
      "wisteria",
      "deep-ocean",
      "sunset",
      "forest",
    ])
  }

  func testLightAndDarkPartition() {
    let light = StudioTheme.all.filter { !$0.isDark }.map { $0.id }
    let dark  = StudioTheme.all.filter {  $0.isDark }.map { $0.id }
    XCTAssertEqual(light, ["chamomile", "fig-leaf", "sunrise", "wisteria"])
    XCTAssertEqual(dark,  ["deep-ocean", "sunset", "forest"])
  }

  func testByIdReturnsCorrectTheme() {
    XCTAssertEqual(StudioTheme.byId("wisteria").id, "wisteria")
    XCTAssertEqual(StudioTheme.byId("forest").id,   "forest")
  }

  func testByIdUnknownFallsToChamomile() {
    XCTAssertEqual(StudioTheme.byId("").id,              "chamomile")
    XCTAssertEqual(StudioTheme.byId("not-a-theme").id,   "chamomile")
  }

  // MARK: - Chamomile golden values

  func testChamomileStructuralColours() {
    let t = StudioTheme.chamomile
    assertHex(t.canvas,     0xeee8de, "canvas")
    assertHex(t.frame,      0xe9e3d8, "frame")
    assertHex(t.rail,       0xf2ede4, "rail")
    assertHex(t.surface,    0xf7f3ec, "surface")
    assertHex(t.sunken,     0xe6dfd3, "sunken")
    assertHex(t.ink,        0x2b2824, "ink")
    assertHex(t.inkStrong,  0x221f1b, "inkStrong")
    assertHex(t.ink1,       0x3a3631, "ink1")
    assertHex(t.inkMuted,   0x5b554d, "inkMuted")
    assertHex(t.inkSoft,    0x6c655b, "inkSoft")
    assertHex(t.inkFaint,   0x8a8378, "inkFaint")
    assertHex(t.line,       0xddd4c6, "line")
    assertHex(t.lineStrong, 0xbfb3a1, "lineStrong")
    assertHex(t.accent,     0x55657a, "accent")
    assertHex(t.link,       0x55657a, "link")
    assertHex(t.focus,      0x55657a, "focus")
  }

  func testChamomileSemanticAccents() {
    let t = StudioTheme.chamomile
    assertHex(t.foundation,  0x7d725f, "foundation")
    assertHex(t.vision,      0x556578, "vision")
    assertHex(t.growth,      0x636a4a, "growth")
    assertHex(t.reflection,  0x6f6173, "reflection")
    assertHex(t.celebration, 0x9a6d48, "celebration")
    assertHex(t.uncharted,   0x66625c, "uncharted")
  }

  func testChamomileStockPairs() {
    let t = StudioTheme.chamomile
    assertHex(t.stockFoundation,      0xe6ded1, "stockFoundation")
    assertHex(t.stockFoundationEdge,  0xcdc6bb, "stockFoundationEdge")
    assertHex(t.stockVision,          0xe0e3e4, "stockVision")
    assertHex(t.stockVisionEdge,      0xbfc2c4, "stockVisionEdge")
    assertHex(t.stockGrowth,          0xe2e3d2, "stockGrowth")
    assertHex(t.stockGrowthEdge,      0xc4c4b4, "stockGrowthEdge")
    assertHex(t.stockReflection,      0xe7e0e3, "stockReflection")
    assertHex(t.stockReflectionEdge,  0xc8c0c2, "stockReflectionEdge")
    assertHex(t.stockCelebration,     0xefe0d1, "stockCelebration")
    assertHex(t.stockCelebrationEdge, 0xd7c5b3, "stockCelebrationEdge")
    assertHex(t.stockUncharted,       0xe4e0da, "stockUncharted")
    assertHex(t.stockUnchartedEdge,   0xc5c1ba, "stockUnchartedEdge")
  }

  func testChamomileAccentAndScript() {
    let t = StudioTheme.chamomile
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine")
    assertHex(t.script,          0xa3855a, "script")
    assertHex(t.scriptInk,       0x7a642f, "scriptInk")
  }

  // MARK: - Fig Leaf golden values

  func testFigLeafOverriddenTokens() {
    let t = StudioTheme.figLeaf
    assertHex(t.canvas,      0xe6e7dc, "canvas")
    assertHex(t.frame,       0xe1e2d6, "frame")
    assertHex(t.rail,        0xeaece2, "rail")
    assertHex(t.surface,     0xf1f2ea, "surface")
    assertHex(t.sunken,      0xe0ded1, "sunken")
    assertHex(t.ink,         0x272a22, "ink")
    assertHex(t.inkStrong,   0x1e2119, "inkStrong")
    assertHex(t.ink1,        0x36382f, "ink1")
    assertHex(t.inkMuted,    0x57574b, "inkMuted")
    assertHex(t.inkSoft,     0x686759, "inkSoft")
    assertHex(t.inkFaint,    0x868576, "inkFaint")
    assertHex(t.line,        0xd3d6c5, "line")
    assertHex(t.lineStrong,  0xb5b5a0, "lineStrong")
    assertHex(t.accent,      0x6f7556, "accent")
    assertHex(t.link,        0x4f7691, "link")
    assertHex(t.foundation,  0x7d725f, "foundation")
    assertHex(t.vision,      0x556578, "vision")
    assertHex(t.growth,      0x636a4a, "growth")
    assertHex(t.reflection,  0x6f6173, "reflection")
    assertHex(t.celebration, 0x9a6d48, "celebration")
    assertHex(t.uncharted,   0x66625c, "uncharted")
    assertHex(t.script,      0x7f8a5f, "script")
    assertHex(t.scriptInk,   0x5f6a30, "scriptInk")
  }

  func testFigLeafInheritedTokens() {
    let t = StudioTheme.figLeaf
    // focus + the quiet-action accents track chamomile.
    assertHex(t.focus,           0x55657a, "focus (chamomile)")
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft (chamomile)")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover (chamomile)")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine (chamomile)")
  }

  // MARK: - Sunrise golden values

  func testSunriseOverriddenTokens() {
    let t = StudioTheme.sunrise
    assertHex(t.canvas,      0xf0e6dc, "canvas")
    assertHex(t.frame,       0xebe1d6, "frame")
    assertHex(t.rail,        0xf4ebe2, "rail")
    assertHex(t.surface,     0xf7f0e8, "surface")
    assertHex(t.sunken,      0xe6dccf, "sunken")
    assertHex(t.ink,         0x2e2620, "ink")
    assertHex(t.inkStrong,   0x251d17, "inkStrong")
    assertHex(t.ink1,        0x3d342d, "ink1")
    assertHex(t.inkMuted,    0x5e5349, "inkMuted")
    assertHex(t.inkSoft,     0x6f6357, "inkSoft")
    assertHex(t.inkFaint,    0x8d8174, "inkFaint")
    assertHex(t.line,        0xe3d3c4, "line")
    assertHex(t.lineStrong,  0xc5b29f, "lineStrong")
    assertHex(t.accent,      0xb0805c, "accent")
    assertHex(t.foundation,  0x7d725f, "foundation")
    assertHex(t.vision,      0x556578, "vision")
    assertHex(t.growth,      0x636a4a, "growth")
    assertHex(t.reflection,  0x6f6173, "reflection")
    assertHex(t.celebration, 0x9a6d48, "celebration")
    assertHex(t.uncharted,   0x66625c, "uncharted")
    assertHex(t.accentSoft,      0xf8ead2, "accentSoft")
    assertHex(t.accentSoftHover, 0xf2ddc0, "accentSoftHover")
    assertHex(t.accentLine,      0xd2ad76, "accentLine")
    assertHex(t.script,      0xb98a5f, "script")
    assertHex(t.scriptInk,   0x8a5f30, "scriptInk")
  }

  func testSunriseInheritsChamomileTokens() {
    let t = StudioTheme.sunrise
    // link + focus track chamomile's new dusk.
    assertHex(t.link,     0x55657a, "link (chamomile)")
    assertHex(t.focus,    0x55657a, "focus (chamomile)")
  }

  // MARK: - Wisteria golden values

  func testWisteriaOverriddenTokens() {
    let t = StudioTheme.wisteria
    assertHex(t.canvas,      0xe8e4e9, "canvas")
    assertHex(t.frame,       0xe3dfe3, "frame")
    assertHex(t.rail,        0xece9ef, "rail")
    assertHex(t.surface,     0xf2eff2, "surface")
    assertHex(t.sunken,      0xe1dbd9, "sunken")
    assertHex(t.ink,         0x2a2630, "ink")
    assertHex(t.inkStrong,   0x211d27, "inkStrong")
    assertHex(t.ink1,        0x39343d, "ink1")
    assertHex(t.inkMuted,    0x5a5359, "inkMuted")
    assertHex(t.inkSoft,     0x6b6367, "inkSoft")
    assertHex(t.inkFaint,    0x898184, "inkFaint")
    assertHex(t.line,        0xd8d1da, "line")
    assertHex(t.lineStrong,  0xbab0b5, "lineStrong")
    assertHex(t.accent,      0x7d6f86, "accent")
    assertHex(t.foundation,  0x7d725f, "foundation")
    assertHex(t.vision,      0x556578, "vision")
    assertHex(t.growth,      0x636a4a, "growth")
    assertHex(t.reflection,  0x6f6173, "reflection")
    assertHex(t.celebration, 0x9a6d48, "celebration")
    assertHex(t.uncharted,   0x66625c, "uncharted")
    assertHex(t.script,      0x9a7fb0, "script")
    assertHex(t.scriptInk,   0x6a4f8a, "scriptInk")
  }

  func testWisteriaInheritsChamomileTokens() {
    let t = StudioTheme.wisteria
    assertHex(t.link,            0x55657a, "link (chamomile)")
    assertHex(t.focus,           0x55657a, "focus (chamomile)")
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft (chamomile)")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover (chamomile)")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine (chamomile)")
  }

  // MARK: - Deep Ocean golden values (dark, lighter touch)

  func testDeepOceanStructural() {
    let t = StudioTheme.deepOcean
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x1f262d, "canvas")
    assertHex(t.frame,      0x0e1720, "frame")
    assertHex(t.rail,       0x132534, "rail")
    assertHex(t.surface,    0x283039, "surface")
    assertHex(t.sunken,     0x1e3c50, "sunken")
    assertHex(t.ink,        0xe4e8ea, "ink")
    assertHex(t.inkStrong,  0xeef6f9, "inkStrong")
    assertHex(t.ink1,       0xd2e2ea, "ink1")
    assertHex(t.inkMuted,   0xa6bcc7, "inkMuted")
    assertHex(t.inkSoft,    0x86a0ad, "inkSoft")
    assertHex(t.inkFaint,   0x6d8794, "inkFaint")
    assertHex(t.line,       0x3a4550, "line")
    assertHex(t.lineStrong, 0x5d8294, "lineStrong")
    assertHex(t.accent,     0x93a5b5, "accent")
    assertHex(t.link,       0x7fc2dc, "link")
    assertHex(t.focus,      0xf0d477, "focus")
  }

  func testDeepOceanAccents() {
    let t = StudioTheme.deepOcean
    assertHex(t.foundation,      0x9f9789, "foundation")
    assertHex(t.vision,          0x8f99a6, "vision")
    assertHex(t.growth,          0x989d88, "growth")
    assertHex(t.reflection,      0xa097a3, "reflection")
    assertHex(t.celebration,     0xb49378, "celebration")
    assertHex(t.uncharted,       0x9a9793, "uncharted")
    assertHex(t.accentSoft,      0x123246, "accentSoft")
    assertHex(t.accentSoftHover, 0x17405a, "accentSoftHover")
    assertHex(t.accentLine,      0x4b829d, "accentLine")
    assertHex(t.script,          0x8fc7cf, "script")
    assertHex(t.scriptInk,       0xe6c56a, "scriptInk")
  }

  // MARK: - Sunset golden values (dark, lighter touch)

  func testSunsetStructural() {
    let t = StudioTheme.sunset
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x2a2227, "canvas")
    assertHex(t.frame,      0x1a1220, "frame")
    assertHex(t.rail,       0x281c30, "rail")
    assertHex(t.surface,    0x342b31, "surface")
    assertHex(t.sunken,     0x382a42, "sunken")
    assertHex(t.ink,        0xefe6e7, "ink")
    assertHex(t.inkStrong,  0xf8eff2, "inkStrong")
    assertHex(t.ink1,       0xe5d8e0, "ink1")
    assertHex(t.inkMuted,   0xc0b0bd, "inkMuted")
    assertHex(t.inkSoft,    0x9f8f9d, "inkSoft")
    assertHex(t.inkFaint,   0x82727f, "inkFaint")
    assertHex(t.line,       0x4b3e46, "line")
    assertHex(t.lineStrong, 0x7c6588, "lineStrong")
    assertHex(t.accent,     0xc49c8c, "accent")
    assertHex(t.link,       0xe6a08f, "link")
    assertHex(t.focus,      0xf1ca78, "focus")
  }

  func testSunsetAccents() {
    let t = StudioTheme.sunset
    assertHex(t.foundation,      0x9f9789, "foundation")
    assertHex(t.vision,          0x8f99a6, "vision")
    assertHex(t.growth,          0x959a84, "growth")
    assertHex(t.reflection,      0x9d94a0, "reflection")
    assertHex(t.celebration,     0xb29074, "celebration")
    assertHex(t.uncharted,       0x9a9793, "uncharted")
    assertHex(t.accentSoft,      0x3a2a1c, "accentSoft")
    assertHex(t.accentSoftHover, 0x472f22, "accentSoftHover")
    assertHex(t.accentLine,      0x80604a, "accentLine")
    assertHex(t.script,          0xe2a6b0, "script")
    assertHex(t.scriptInk,       0xeec06a, "scriptInk")
  }

  // MARK: - Forest golden values (dark, lighter touch)

  func testForestStructural() {
    let t = StudioTheme.forest
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x1f241e, "canvas")
    assertHex(t.frame,      0x0f150f, "frame")
    assertHex(t.rail,       0x182418, "rail")
    assertHex(t.surface,    0x282e26, "surface")
    assertHex(t.sunken,     0x233324, "sunken")
    assertHex(t.ink,        0xe6eadf, "ink")
    assertHex(t.inkStrong,  0xf0f5e8, "inkStrong")
    assertHex(t.ink1,       0xd8e3cd, "ink1")
    assertHex(t.inkMuted,   0xaebca4, "inkMuted")
    assertHex(t.inkSoft,    0x8ba083, "inkSoft")
    assertHex(t.inkFaint,   0x728a6b, "inkFaint")
    assertHex(t.line,       0x3b4337, "line")
    assertHex(t.lineStrong, 0x5f775d, "lineStrong")
    assertHex(t.accent,     0x9ca688, "accent")
    assertHex(t.link,       0x84b6cc, "link")
    assertHex(t.focus,      0xe7cb72, "focus")
  }

  func testForestAccents() {
    let t = StudioTheme.forest
    assertHex(t.foundation,      0x9c9485, "foundation")
    assertHex(t.vision,          0x8b96a3, "vision")
    assertHex(t.growth,          0x959a84, "growth")
    assertHex(t.reflection,      0x9d94a0, "reflection")
    assertHex(t.celebration,     0xb29074, "celebration")
    assertHex(t.uncharted,       0x979490, "uncharted")
    assertHex(t.accentSoft,      0x293618, "accentSoft")
    assertHex(t.accentSoftHover, 0x33421f, "accentSoftHover")
    assertHex(t.accentLine,      0x687943, "accentLine")
    assertHex(t.script,          0xb6c98a, "script")
    assertHex(t.scriptInk,       0xdcc169, "scriptInk")
  }

  // MARK: - ThemeStore persistence

  func testThemeStoreDefaultsToChamomile() {
    let defaults = makeIsolatedDefaults()
    let store = ThemeStore(defaults: defaults)
    XCTAssertEqual(store.selectedId, "chamomile")
    XCTAssertEqual(store.current.id, "chamomile")
  }

  func testThemeStoreRoundTripsSelection() {
    let defaults = makeIsolatedDefaults()
    let store = ThemeStore(defaults: defaults)

    store.selectedId = "deep-ocean"
    XCTAssertEqual(defaults.string(forKey: "ateliera.theme"), "deep-ocean")
    XCTAssertEqual(store.current.id, "deep-ocean")
    XCTAssertTrue(store.current.isDark)

    // Simulate a fresh launch reading the persisted key.
    let store2 = ThemeStore(defaults: defaults)
    XCTAssertEqual(store2.selectedId, "deep-ocean")
    XCTAssertEqual(store2.current.id, "deep-ocean")
  }

  func testThemeStoreInvalidKeyFallsToChamomile() {
    let defaults = makeIsolatedDefaults()
    defaults.set("banana", forKey: "ateliera.theme")
    let store = ThemeStore(defaults: defaults)
    XCTAssertEqual(store.selectedId, "chamomile")
  }

  func testThemeStoreMissingKeyFallsToChamomile() {
    let defaults = makeIsolatedDefaults()
    // No value written — simulates first launch.
    let store = ThemeStore(defaults: defaults)
    XCTAssertEqual(store.selectedId, "chamomile")
  }

  func testThemeStoreMultipleRapidSwitches() {
    let defaults = makeIsolatedDefaults()
    let store = ThemeStore(defaults: defaults)
    let ids = ["forest", "sunset", "wisteria", "fig-leaf", "sunrise", "deep-ocean", "chamomile"]
    for id in ids {
      store.selectedId = id
    }
    XCTAssertEqual(store.selectedId, "chamomile")
    XCTAssertEqual(defaults.string(forKey: "ateliera.theme"), "chamomile")
  }

  func testThemeStoreAllSevenIdsRoundTrip() {
    let defaults = makeIsolatedDefaults()
    let store = ThemeStore(defaults: defaults)
    for theme in StudioTheme.all {
      store.selectedId = theme.id
      let restored = ThemeStore(defaults: defaults)
      XCTAssertEqual(restored.selectedId, theme.id, "Failed round-trip for \(theme.id)")
    }
  }

  // MARK: - Helpers

  // Decode sRGB components from a SwiftUI Color and compare against a UInt32 hex.
  private func assertHex(_ color: Color, _ hex: UInt32, _ label: String,
                          file: StaticString = #file, line: UInt = #line) {
    let expectedR = Double((hex >> 16) & 0xff) / 255.0
    let expectedG = Double((hex >>  8) & 0xff) / 255.0
    let expectedB = Double( hex        & 0xff) / 255.0
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    #if canImport(UIKit)
    let resolved = UIColor(color).resolvedColor(
      with: UITraitCollection(userInterfaceStyle: .light))
    resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
    #else
    NSColor(color).usingColorSpace(.sRGB)?.getRed(&r, green: &g, blue: &b, alpha: &a)
    #endif
    let epsilon = 1.0 / 510.0  // half an 8-bit step
    XCTAssertEqual(Double(r), expectedR, accuracy: epsilon,
                   "\(label) red",   file: file, line: line)
    XCTAssertEqual(Double(g), expectedG, accuracy: epsilon,
                   "\(label) green", file: file, line: line)
    XCTAssertEqual(Double(b), expectedB, accuracy: epsilon,
                   "\(label) blue",  file: file, line: line)
  }

  // Each test gets its own UserDefaults suite to avoid cross-test pollution.
  private func makeIsolatedDefaults() -> UserDefaults {
    let suiteName = "ThemeTests.\(UUID().uuidString)"
    let d = UserDefaults(suiteName: suiteName)!
    d.removePersistentDomain(forName: suiteName)
    return d
  }
}
