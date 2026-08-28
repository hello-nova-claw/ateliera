import XCTest
import SwiftUI
@testable import Ateliera

// Golden values captured verbatim from apps/studio/src/styles/tokens.css
// (lines 79-366, CSS custom properties under .studio-app and its theme overrides).
// Inherited values (no CSS override) are marked "inherits chamomile".

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

  // MARK: - Chamomile golden values (tokens.css lines 80-119)

  func testChamomileStructuralColours() {
    let t = StudioTheme.chamomile
    assertHex(t.canvas,     0xf7f5f0, "canvas")
    assertHex(t.frame,      0xeae6dd, "frame")
    assertHex(t.rail,       0xf2eee6, "rail")
    assertHex(t.surface,    0xfffdfa, "surface")
    assertHex(t.sunken,     0xf6f3ec, "sunken")
    assertHex(t.ink,        0x292a28, "ink")
    assertHex(t.inkStrong,  0x26271f, "inkStrong")
    assertHex(t.ink1,       0x3a3b34, "ink1")
    assertHex(t.inkMuted,   0x54564f, "inkMuted")
    assertHex(t.inkSoft,    0x6f716c, "inkSoft")
    assertHex(t.inkFaint,   0x8a8c86, "inkFaint")
    assertHex(t.line,       0xe2ddd2, "line")
    assertHex(t.lineStrong, 0xc9c2b3, "lineStrong")
    assertHex(t.link,       0x6e91ad, "link")
    assertHex(t.focus,      0x5b3d84, "focus")
  }

  func testChamomileSemanticAccents() {
    let t = StudioTheme.chamomile
    assertHex(t.foundation,  0x8c8d89, "foundation")
    assertHex(t.vision,      0xd5ab42, "vision")
    assertHex(t.growth,      0x6f9478, "growth")
    assertHex(t.reflection,  0x6e91ad, "reflection")
    assertHex(t.celebration, 0xd2874f, "celebration")
    assertHex(t.uncharted,   0x8976a7, "uncharted")
  }

  func testChamomileStockPairs() {
    let t = StudioTheme.chamomile
    assertHex(t.stockFoundation,      0xebe6da, "stockFoundation")
    assertHex(t.stockFoundationEdge,  0xd8d3c1, "stockFoundationEdge")
    assertHex(t.stockVision,          0xf6e8bd, "stockVision")
    assertHex(t.stockVisionEdge,      0xe6d497, "stockVisionEdge")
    assertHex(t.stockGrowth,          0xdae9d0, "stockGrowth")
    assertHex(t.stockGrowthEdge,      0xc3dab6, "stockGrowthEdge")
    assertHex(t.stockReflection,      0xd7e5ef, "stockReflection")
    assertHex(t.stockReflectionEdge,  0xbed5e6, "stockReflectionEdge")
    assertHex(t.stockCelebration,     0xf6dcc4, "stockCelebration")
    assertHex(t.stockCelebrationEdge, 0xecc8a6, "stockCelebrationEdge")
    assertHex(t.stockUncharted,       0xe4dbf0, "stockUncharted")
    assertHex(t.stockUnchartedEdge,   0xd2c3e8, "stockUnchartedEdge")
  }

  func testChamomileAccentAndScript() {
    let t = StudioTheme.chamomile
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine")
    assertHex(t.script,          0xb09a70, "script")
    assertHex(t.scriptInk,       0x7a642f, "scriptInk")
  }

  // MARK: - Fig Leaf golden values (tokens.css lines 121-159)

  func testFigLeafOverriddenTokens() {
    let t = StudioTheme.figLeaf
    assertHex(t.canvas,      0xeef2e6, "canvas")   // solid fallback; CSS uses gradient
    assertHex(t.frame,       0xdde5cf, "frame")
    assertHex(t.rail,        0xe9efdf, "rail")
    assertHex(t.surface,     0xfbfdf7, "surface")
    assertHex(t.sunken,      0xeef2e6, "sunken")
    assertHex(t.ink,         0x2a2d26, "ink")
    assertHex(t.inkStrong,   0x222519, "inkStrong")
    assertHex(t.ink1,        0x353a2d, "ink1")
    assertHex(t.inkFaint,    0x777a72, "inkFaint")  // differs from chamomile
    assertHex(t.line,        0xdce4d1, "line")
    assertHex(t.lineStrong,  0xa9b59a, "lineStrong")
    assertHex(t.link,        0x4f7691, "link")       // overrides chamomile
    assertHex(t.foundation,  0x87897f, "foundation")
    assertHex(t.vision,      0xc6a94a, "vision")
    assertHex(t.growth,      0x5f8f6a, "growth")
    assertHex(t.reflection,  0x5f8aa0, "reflection")
    assertHex(t.celebration, 0xcf8a54, "celebration")
    assertHex(t.uncharted,   0x8478a4, "uncharted")
    assertHex(t.script,      0x7f8a5f, "script")
    assertHex(t.scriptInk,   0x5f6a30, "scriptInk")
  }

  func testFigLeafInheritsChamomileAccents() {
    let t = StudioTheme.figLeaf
    assertHex(t.inkMuted,        0x54564f, "inkMuted (chamomile)")
    assertHex(t.inkSoft,         0x6f716c, "inkSoft (chamomile)")
    assertHex(t.focus,           0x5b3d84, "focus (chamomile)")
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft (chamomile)")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover (chamomile)")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine (chamomile)")
  }

  // MARK: - Sunrise golden values (tokens.css lines 161-198)

  func testSunriseOverriddenTokens() {
    let t = StudioTheme.sunrise
    assertHex(t.canvas,      0xfbecdc, "canvas")
    assertHex(t.frame,       0xf0dccc, "frame")
    assertHex(t.rail,        0xf7e6d6, "rail")
    assertHex(t.surface,     0xfffdf9, "surface")
    assertHex(t.sunken,      0xf9eee1, "sunken")
    assertHex(t.ink,         0x2e2822, "ink")
    assertHex(t.inkStrong,   0x261f18, "inkStrong")
    assertHex(t.ink1,        0x3d352c, "ink1")
    assertHex(t.line,        0xefdccb, "line")
    assertHex(t.lineStrong,  0xc7a98d, "lineStrong")
    assertHex(t.foundation,  0x8f8a83, "foundation")
    assertHex(t.vision,      0xd5a742, "vision")
    assertHex(t.growth,      0x6f9478, "growth")
    assertHex(t.reflection,  0x6f8fb0, "reflection")
    assertHex(t.celebration, 0xd67f4f, "celebration")
    assertHex(t.uncharted,   0x9079ab, "uncharted")
    assertHex(t.accentSoft,      0xf8ead2, "accentSoft")
    assertHex(t.accentSoftHover, 0xf2ddc0, "accentSoftHover")
    assertHex(t.accentLine,      0xd2ad76, "accentLine")
    assertHex(t.script,      0xb98a5f, "script")
    assertHex(t.scriptInk,   0x8a5f30, "scriptInk")
  }

  func testSunriseInheritsChamomileTokens() {
    let t = StudioTheme.sunrise
    // ink-muted, ink-soft, ink-faint, link, focus are not overridden in CSS.
    assertHex(t.inkMuted, 0x54564f, "inkMuted (chamomile)")
    assertHex(t.inkSoft,  0x6f716c, "inkSoft (chamomile)")
    assertHex(t.inkFaint, 0x8a8c86, "inkFaint (chamomile)")
    assertHex(t.link,     0x6e91ad, "link (chamomile)")
    assertHex(t.focus,    0x5b3d84, "focus (chamomile)")
  }

  // MARK: - Wisteria golden values (tokens.css lines 200-234)

  func testWisteriaOverriddenTokens() {
    let t = StudioTheme.wisteria
    assertHex(t.canvas,      0xefe9f6, "canvas")
    assertHex(t.frame,       0xe3d9ec, "frame")
    assertHex(t.rail,        0xece5f3, "rail")
    assertHex(t.surface,     0xfdfbff, "surface")
    assertHex(t.sunken,      0xefe9f5, "sunken")
    assertHex(t.ink,         0x2b2830, "ink")
    assertHex(t.inkStrong,   0x231f2a, "inkStrong")
    assertHex(t.ink1,        0x38333f, "ink1")
    assertHex(t.line,        0xe4dcee, "line")
    assertHex(t.lineStrong,  0xad9cc9, "lineStrong")
    assertHex(t.foundation,  0x89858f, "foundation")
    assertHex(t.vision,      0xc6a24f, "vision")
    assertHex(t.growth,      0x679277, "growth")
    assertHex(t.reflection,  0x6987ad, "reflection")
    assertHex(t.celebration, 0xcd825a, "celebration")
    assertHex(t.uncharted,   0x8a6fb0, "uncharted")
    assertHex(t.script,      0x9a7fb0, "script")
    assertHex(t.scriptInk,   0x6a4f8a, "scriptInk")
  }

  func testWisteriaInheritsChamomileTokens() {
    let t = StudioTheme.wisteria
    assertHex(t.inkMuted,        0x54564f, "inkMuted (chamomile)")
    assertHex(t.inkSoft,         0x6f716c, "inkSoft (chamomile)")
    assertHex(t.inkFaint,        0x8a8c86, "inkFaint (chamomile)")
    assertHex(t.link,            0x6e91ad, "link (chamomile)")
    assertHex(t.focus,           0x5b3d84, "focus (chamomile)")
    assertHex(t.accentSoft,      0xf4ecd8, "accentSoft (chamomile)")
    assertHex(t.accentSoftHover, 0xefe4c9, "accentSoftHover (chamomile)")
    assertHex(t.accentLine,      0xd8c9a6, "accentLine (chamomile)")
  }

  // MARK: - Deep Ocean golden values (tokens.css lines 236-278)

  func testDeepOceanStructural() {
    let t = StudioTheme.deepOcean
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x16293a, "canvas")
    assertHex(t.frame,      0x0e1720, "frame")
    assertHex(t.rail,       0x132534, "rail")
    assertHex(t.surface,    0x183446, "surface")
    assertHex(t.sunken,     0x1e3c50, "sunken")
    assertHex(t.ink,        0xe2edf2, "ink")
    assertHex(t.inkStrong,  0xeef6f9, "inkStrong")
    assertHex(t.ink1,       0xd2e2ea, "ink1")
    assertHex(t.inkMuted,   0xa6bcc7, "inkMuted")
    assertHex(t.inkSoft,    0x86a0ad, "inkSoft")
    assertHex(t.inkFaint,   0x6d8794, "inkFaint")
    assertHex(t.line,       0x365669, "line")
    assertHex(t.lineStrong, 0x5d8294, "lineStrong")
    assertHex(t.link,       0x7fc2dc, "link")
    assertHex(t.focus,      0xf0d477, "focus")
  }

  func testDeepOceanAccents() {
    let t = StudioTheme.deepOcean
    assertHex(t.foundation,      0x9fb0b3, "foundation")
    assertHex(t.vision,          0xe6c56a, "vision")
    assertHex(t.growth,          0x79c0a0, "growth")
    assertHex(t.reflection,      0x7fc2dc, "reflection")
    assertHex(t.celebration,     0xe8a06b, "celebration")
    assertHex(t.uncharted,       0xb39ad6, "uncharted")
    assertHex(t.accentSoft,      0x123246, "accentSoft")
    assertHex(t.accentSoftHover, 0x17405a, "accentSoftHover")
    assertHex(t.accentLine,      0x4b829d, "accentLine")
    assertHex(t.script,          0x8fc7cf, "script")
    assertHex(t.scriptInk,       0xe6c56a, "scriptInk")
  }

  // MARK: - Sunset golden values (tokens.css lines 280-322)

  func testSunsetStructural() {
    let t = StudioTheme.sunset
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x3a2436, "canvas")
    assertHex(t.frame,      0x1a1220, "frame")
    assertHex(t.rail,       0x281c30, "rail")
    assertHex(t.surface,    0x2f2338, "surface")
    assertHex(t.sunken,     0x382a42, "sunken")
    assertHex(t.ink,        0xf1e6ec, "ink")
    assertHex(t.inkStrong,  0xf8eff2, "inkStrong")
    assertHex(t.ink1,       0xe5d8e0, "ink1")
    assertHex(t.inkMuted,   0xc0b0bd, "inkMuted")
    assertHex(t.inkSoft,    0x9f8f9d, "inkSoft")
    assertHex(t.inkFaint,   0x82727f, "inkFaint")
    assertHex(t.line,       0x55405f, "line")
    assertHex(t.lineStrong, 0x7c6588, "lineStrong")
    assertHex(t.link,       0xe6a08f, "link")
    assertHex(t.focus,      0xf1ca78, "focus")
  }

  func testSunsetAccents() {
    let t = StudioTheme.sunset
    assertHex(t.foundation,      0xaaa1a6, "foundation")
    assertHex(t.vision,          0xeec06a, "vision")
    assertHex(t.growth,          0x89b98f, "growth")
    assertHex(t.reflection,      0x9aa6db, "reflection")
    assertHex(t.celebration,     0xec9463, "celebration")
    assertHex(t.uncharted,       0xc294c9, "uncharted")
    assertHex(t.accentSoft,      0x3a2a1c, "accentSoft")
    assertHex(t.accentSoftHover, 0x472f22, "accentSoftHover")
    assertHex(t.accentLine,      0x80604a, "accentLine")
    assertHex(t.script,          0xe2a6b0, "script")
    assertHex(t.scriptInk,       0xeec06a, "scriptInk")
  }

  // MARK: - Forest golden values (tokens.css lines 324-366)

  func testForestStructural() {
    let t = StudioTheme.forest
    XCTAssertTrue(t.isDark)
    assertHex(t.canvas,     0x1a271a, "canvas")
    assertHex(t.frame,      0x0f150f, "frame")
    assertHex(t.rail,       0x182418, "rail")
    assertHex(t.surface,    0x1c2a1b, "surface")
    assertHex(t.sunken,     0x233324, "sunken")
    assertHex(t.ink,        0xe7eede, "ink")
    assertHex(t.inkStrong,  0xf0f5e8, "inkStrong")
    assertHex(t.ink1,       0xd8e3cd, "ink1")
    assertHex(t.inkMuted,   0xaebca4, "inkMuted")
    assertHex(t.inkSoft,    0x8ba083, "inkSoft")
    assertHex(t.inkFaint,   0x728a6b, "inkFaint")
    assertHex(t.line,       0x3d503c, "line")
    assertHex(t.lineStrong, 0x5f775d, "lineStrong")
    assertHex(t.link,       0x84b6cc, "link")
    assertHex(t.focus,      0xe7cb72, "focus")
  }

  func testForestAccents() {
    let t = StudioTheme.forest
    assertHex(t.foundation,      0xa4ac9c, "foundation")
    assertHex(t.vision,          0xdcc169, "vision")
    assertHex(t.growth,          0x84c07f, "growth")
    assertHex(t.reflection,      0x84b6cc, "reflection")
    assertHex(t.celebration,     0xe0a06a, "celebration")
    assertHex(t.uncharted,       0xaf9dce, "uncharted")
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
