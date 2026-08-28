# P2 Implementation Spec: Themes (all 7) + theme switching

**Status:** Design spec (implementation-ready)  
**Phase:** P2 in the native-parity roadmap  
**Value:** High (feature parity feel + user choice, low effort)  
**Effort:** S–M (theme token → Swift enum, UserDefaults persistence, UI control)

---

## 1. Scope

Port the remaining 6 themes from the web design system into the native app's theme engine, and add a Settings UI to switch among all 7 themes (Chamomile, Fig Leaf, Sunrise, Wisteria; Deep Ocean, Sunset, Forest) with immediate persistence and correct light/dark mode support.

**Web authority:** `apps/studio/src/styles/tokens.css` (lines 79–390) contains all 7 theme token sets, organized by `.studio-app[data-theme='<id>']` rules. The web uses CSS custom properties; native will use a Swift enum with a mode (light/dark) and computed property palettes. The theme picker UI (semantic radio menu with chips/swatches) is specified in the design addendum §4.1–4.6 and implemented in `apps/studio/src/app/App.tsx` (`ThemeMenu` / `ThemeChoice` components).

---

## 2. Native design

### 2.1 Files to ADD

#### `apple/Ateliera/Theme/ThemeDefinition.swift`
A new file holding the Swift enum representation of all 7 themes, mirroring the web's token structure.

```swift
import SwiftUI

enum ThemeId: String, Codable, CaseIterable {
  case chamomile = "chamomile"
  case figLeaf = "fig-leaf"
  case sunrise = "sunrise"
  case wisteria = "wisteria"
  case deepOcean = "deep-ocean"
  case sunset = "sunset"
  case forest = "forest"
  
  var name: String {
    switch self {
    case .chamomile: "Chamomile"
    case .figLeaf: "Fig Leaf"
    case .sunrise: "Sunrise"
    case .wisteria: "Wisteria"
    case .deepOcean: "Deep Ocean"
    case .sunset: "Sunset"
    case .forest: "Forest"
    }
  }
  
  var mode: ColorScheme {
    switch self {
    case .chamomile, .figLeaf, .sunrise, .wisteria: .light
    case .deepOcean, .sunset, .forest: .dark
    }
  }
  
  static let `default` = ThemeId.chamomile
}

// Themes grouped by mode for picker UI.
extension ThemeId {
  static var lightThemes: [ThemeId] {
    [.chamomile, .figLeaf, .sunrise, .wisteria]
  }
  
  static var darkThemes: [ThemeId] {
    [.deepOcean, .sunset, .forest]
  }
}
```

#### `apple/Ateliera/Theme/ThemeStore.swift`
An Observable store that manages the active theme and persists it to UserDefaults, mirroring the web's `StudioProviders` logic.

```swift
import Foundation
import Observation

@Observable
final class ThemeStore {
  private static let key = "ateliera.theme"
  
  var current: ThemeId {
    didSet { persist() }
  }
  
  init() {
    if let saved = UserDefaults.standard.string(forKey: Self.key),
       let id = ThemeId(rawValue: saved) {
      self.current = id
    } else {
      self.current = .default
    }
  }
  
  private func persist() {
    UserDefaults.standard.set(current.rawValue, forKey: Self.key)
  }
}
```

#### `apple/Ateliera/Theme/ThemePalette.swift`
A struct that maps a ThemeId to its complete color palette (all semantic and structural tokens).

```swift
import SwiftUI

struct ThemePalette {
  // Surfaces + ink (structural)
  let canvas: Color
  let frame: Color
  let rail: Color
  let surface: Color
  let sunken: Color
  let ink: Color
  let inkStrong: Color
  let ink1: Color
  let inkMuted: Color
  let inkSoft: Color
  let inkFaint: Color
  let line: Color
  let lineStrong: Color
  let topbar: Color
  
  // Semantic accents
  let foundation: Color
  let vision: Color
  let growth: Color
  let reflection: Color
  let celebration: Color
  let uncharted: Color
  let link: Color
  let script: Color
  let scriptInk: Color
  
  // Note stock (pastel pairs)
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
  
  // Quiet-action accents
  let accentSoft: Color
  let accentSoftHover: Color
  let accentLine: Color
  
  // Focus ring (dark themes override)
  let focus: Color
  
  static func palette(for themeId: ThemeId) -> ThemePalette {
    switch themeId {
    case .chamomile: chamomilePalette
    case .figLeaf: figLeafPalette
    case .sunrise: sunrisePalette
    case .wisteria: wisteriaPalette
    case .deepOcean: deepOceanPalette
    case .sunset: sunsetPalette
    case .forest: forestPalette
    }
  }
  
  private static let chamomilePalette = ThemePalette(
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
    topbar: Color(hex: 0xf7f5f0).opacity(0.86),
    foundation: Color(hex: 0x8c8d89),
    vision: Color(hex: 0xd5ab42),
    growth: Color(hex: 0x6f9478),
    reflection: Color(hex: 0x6e91ad),
    celebration: Color(hex: 0xd2874f),
    uncharted: Color(hex: 0x8976a7),
    link: Color(hex: 0x6e91ad),
    script: Color(hex: 0xb09a70),
    scriptInk: Color(hex: 0x7a642f),
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
    focus: Color(hex: 0x5b3d84)
  )
  
  // [Fig Leaf, Sunrise, Wisteria, Deep Ocean, Sunset, Forest palettes follow, 
  //  extracted from apps/studio/src/styles/tokens.css lines 121–366]
  
  private static let figLeafPalette = ThemePalette(
    canvas: Color(hex: 0xeef2e6), // Actually a gradient: radial+linear
    frame: Color(hex: 0xdde5cf),
    rail: Color(hex: 0xe9efdf),
    surface: Color(hex: 0xfbfdf7),
    sunken: Color(hex: 0xeef2e6),
    ink: Color(hex: 0x2a2d26),
    inkStrong: Color(hex: 0x222519),
    ink1: Color(hex: 0x353a2d),
    inkMuted: Color(hex: 0x54564f),
    inkSoft: Color(hex: 0x6f716c),
    inkFaint: Color(hex: 0x777a72),
    line: Color(hex: 0xdce4d1),
    lineStrong: Color(hex: 0xa9b59a),
    topbar: Color(hex: 0xeef2e6).opacity(0.85),
    foundation: Color(hex: 0x87897f),
    vision: Color(hex: 0xc6a94a),
    growth: Color(hex: 0x5f8f6a),
    reflection: Color(hex: 0x5f8aa0),
    celebration: Color(hex: 0xcf8a54),
    uncharted: Color(hex: 0x8478a4),
    link: Color(hex: 0x4f7691),
    script: Color(hex: 0x7f8a5f),
    scriptInk: Color(hex: 0x5f6a30),
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
    accentSoft: Color(hex: 0xf4ecd8), // Inherits Chamomile
    accentSoftHover: Color(hex: 0xefe4c9),
    accentLine: Color(hex: 0xd8c9a6),
    focus: Color(hex: 0x5b3d84)
  )
  
  private static let sunrisePalette = ThemePalette(
    canvas: Color(hex: 0xfbecdc), // Gradient
    frame: Color(hex: 0xf0dccc),
    rail: Color(hex: 0xf7e6d6),
    surface: Color(hex: 0xfffdf9),
    sunken: Color(hex: 0xf9eee1),
    ink: Color(hex: 0x2e2822),
    inkStrong: Color(hex: 0x261f18),
    ink1: Color(hex: 0x3d352c),
    inkMuted: Color(hex: 0x54564f),
    inkSoft: Color(hex: 0x6f716c),
    inkFaint: Color(hex: 0x8a8c86),
    line: Color(hex: 0xefdccb),
    lineStrong: Color(hex: 0xc7a98d),
    topbar: Color(hex: 0xfbecdc).opacity(0.85),
    foundation: Color(hex: 0x8f8a83),
    vision: Color(hex: 0xd5a742),
    growth: Color(hex: 0x6f9478),
    reflection: Color(hex: 0x6f8fb0),
    celebration: Color(hex: 0xd67f4f),
    uncharted: Color(hex: 0x9079ab),
    link: Color(hex: 0x6e91ad),
    script: Color(hex: 0xb98a5f),
    scriptInk: Color(hex: 0x8a5f30),
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
    focus: Color(hex: 0x5b3d84)
  )
  
  private static let wisteriaPalette = ThemePalette(
    canvas: Color(hex: 0xefe9f6), // Gradient
    frame: Color(hex: 0xe3d9ec),
    rail: Color(hex: 0xece5f3),
    surface: Color(hex: 0xfdfbff),
    sunken: Color(hex: 0xefe9f5),
    ink: Color(hex: 0x2b2830),
    inkStrong: Color(hex: 0x231f2a),
    ink1: Color(hex: 0x38333f),
    inkMuted: Color(hex: 0x54564f),
    inkSoft: Color(hex: 0x6f716c),
    inkFaint: Color(hex: 0x8a8c86),
    line: Color(hex: 0xe4dcee),
    lineStrong: Color(hex: 0xad9cc9),
    topbar: Color(hex: 0xefe9f6).opacity(0.85),
    foundation: Color(hex: 0x89858f),
    vision: Color(hex: 0xc6a24f),
    growth: Color(hex: 0x679277),
    reflection: Color(hex: 0x6987ad),
    celebration: Color(hex: 0xcd825a),
    uncharted: Color(hex: 0x8a6fb0),
    link: Color(hex: 0x6e91ad),
    script: Color(hex: 0x9a7fb0),
    scriptInk: Color(hex: 0x6a4f8a),
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
    accentSoft: Color(hex: 0xf4ecd8), // Inherits Chamomile
    accentSoftHover: Color(hex: 0xefe4c9),
    accentLine: Color(hex: 0xd8c9a6),
    focus: Color(hex: 0x5b3d84)
  )
  
  private static let deepOceanPalette = ThemePalette(
    canvas: Color(hex: 0x16293a), // Gradient
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
    topbar: Color(hex: 0x122232).opacity(0.80),
    foundation: Color(hex: 0x9fb0b3),
    vision: Color(hex: 0xe6c56a),
    growth: Color(hex: 0x79c0a0),
    reflection: Color(hex: 0x7fc2dc),
    celebration: Color(hex: 0xe8a06b),
    uncharted: Color(hex: 0xb39ad6),
    link: Color(hex: 0x7fc2dc),
    script: Color(hex: 0x8fc7cf),
    scriptInk: Color(hex: 0xe6c56a),
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
    focus: Color(hex: 0xf0d477)
  )
  
  private static let sunsetPalette = ThemePalette(
    canvas: Color(hex: 0x3a2436), // Gradient
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
    topbar: Color(hex: 0x2b1f34).opacity(0.80),
    foundation: Color(hex: 0xaaa1a6),
    vision: Color(hex: 0xeec06a),
    growth: Color(hex: 0x89b98f),
    reflection: Color(hex: 0x9aa6db),
    celebration: Color(hex: 0xec9463),
    uncharted: Color(hex: 0xc294c9),
    link: Color(hex: 0xe6a08f),
    script: Color(hex: 0xe2a6b0),
    scriptInk: Color(hex: 0xeec06a),
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
    focus: Color(hex: 0xf1ca78)
  )
  
  private static let forestPalette = ThemePalette(
    canvas: Color(hex: 0x1a271a), // Gradient
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
    topbar: Color(hex: 0x152014).opacity(0.80),
    foundation: Color(hex: 0xa4ac9c),
    vision: Color(hex: 0xdcc169),
    growth: Color(hex: 0x84c07f),
    reflection: Color(hex: 0x84b6cc),
    celebration: Color(hex: 0xe0a06a),
    uncharted: Color(hex: 0xaf9dce),
    link: Color(hex: 0x84b6cc),
    script: Color(hex: 0xb6c98a),
    scriptInk: Color(hex: 0xdcc169),
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
    focus: Color(hex: 0xe7cb72)
  )
}
```

#### `apple/Ateliera/Theme/ThemeSettingsView.swift`
A new settings sheet/modal where users switch among the 7 themes. Organized by mode (light / dark) with swatches and keyboard navigation, matching the web design spec.

```swift
import SwiftUI

// A popover/menu for selecting a theme. Radio-menu semantics, keyboard nav
// (ArrowUp/Down, Home/End, Escape to close). Selected theme closes the menu.
struct ThemeSettingsView: View {
  let store: ThemeStore
  @Binding var isPresented: Bool
  @State private var focused: ThemeId?
  
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Light")
        .font(StudioFont.eyebrow)
        .foregroundStyle(Studio.inkFaint)
        .tracking(1.6)
        .padding(.horizontal, 12)
        .padding(.top, 12)
      
      ForEach(ThemeId.lightThemes, id: \.self) { themeId in
        ThemeOption(
          themeId: themeId,
          isSelected: store.current == themeId,
          isFocused: focused == themeId,
          onSelect: {
            store.current = themeId
            isPresented = false
          },
          onFocus: { focused = themeId }
        )
      }
      
      Text("Dark")
        .font(StudioFont.eyebrow)
        .foregroundStyle(Studio.inkFaint)
        .tracking(1.6)
        .padding(.horizontal, 12)
        .padding(.top, 8)
      
      ForEach(ThemeId.darkThemes, id: \.self) { themeId in
        ThemeOption(
          themeId: themeId,
          isSelected: store.current == themeId,
          isFocused: focused == themeId,
          onSelect: {
            store.current = themeId
            isPresented = false
          },
          onFocus: { focused = themeId }
        )
      }
    }
    .padding(.vertical, 8)
    .background(Studio.surface)
    .cornerRadius(12)
    .onAppear {
      focused = store.current
    }
  }
}

struct ThemeOption: View {
  let themeId: ThemeId
  let isSelected: Bool
  let isFocused: Bool
  let onSelect: () -> Void
  let onFocus: () -> Void
  
  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 12) {
        // Swatch: a gradient or solid color representing the theme
        RoundedRectangle(cornerRadius: 6)
          .fill(swatchGradient)
          .frame(width: 32, height: 32)
        
        VStack(alignment: .leading, spacing: 2) {
          Text(themeId.name)
            .font(StudioFont.control)
            .foregroundStyle(Studio.ink)
          Text(themeId.mode == .light ? "Light" : "Dark")
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkFaint)
        }
        
        Spacer()
        
        if isSelected {
          Image(systemName: "checkmark")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Studio.vision)
        }
      }
      .contentShape(Rectangle())
      .padding(.vertical, 8)
      .padding(.horizontal, 12)
    }
    .buttonStyle(.plain)
    .onFocus {
      onFocus()
    }
    .background(isFocused ? Studio.sunken : .clear)
    .cornerRadius(8)
  }
  
  private var swatchGradient: LinearGradient {
    // Simplified swatch: a gradient from the theme's canvas colors
    // (the web spec includes exact picker chips and swatches per theme)
    switch themeId {
    case .chamomile:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0xfdfaf3), Color(hex: 0xf0e6cf)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .figLeaf:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0xeef2e2), Color(hex: 0xcdd8bb)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .sunrise:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0xfde0cd), Color(hex: 0xf4d6cf)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .wisteria:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0xefe9f6), Color(hex: 0xd3c4e6)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .deepOcean:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0x1f4a63), Color(hex: 0x0f1b28)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .sunset:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0x5a3350), Color(hex: 0x201a2c)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    case .forest:
      LinearGradient(
        gradient: Gradient(colors: [Color(hex: 0x33512f), Color(hex: 0x111a11)]),
        startPoint: .topLeading, endPoint: .bottomTrailing)
    }
  }
}
```

### 2.2 Files to MODIFY

#### `apple/Ateliera/Theme/Theme.swift`
Replace the static `Studio` enum with a dynamic, theme-aware palette accessor. Instead of hardcoded Chamomile hex values, use the current theme from `ThemeStore`.

```swift
import SwiftUI

// BEFORE: static let canvas = Color(hex: 0xf7f5f0), etc.
// AFTER: computed properties that read from the current theme.

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

// Theme-aware color accessor. Use @EnvironmentObject or direct binding.
struct StudioTheme {
  let palette: ThemePalette
  
  // Structural
  var canvas: Color { palette.canvas }
  var surface: Color { palette.surface }
  var sunken: Color { palette.sunken }
  var ink: Color { palette.ink }
  var inkStrong: Color { palette.inkStrong }
  var ink1: Color { palette.ink1 }
  var inkMuted: Color { palette.inkMuted }
  var inkSoft: Color { palette.inkSoft }
  var inkFaint: Color { palette.inkFaint }
  var line: Color { palette.line }
  var lineStrong: Color { palette.lineStrong }
  var link: Color { palette.link }
  var focus: Color { palette.focus }
  
  // Semantic accents
  var foundation: Color { palette.foundation }
  var vision: Color { palette.vision }
  var growth: Color { palette.growth }
  var reflection: Color { palette.reflection }
  var celebration: Color { palette.celebration }
  var uncharted: Color { palette.uncharted }
  
  // ... stock / accent properties
}

// Backward-compatible accessor (for existing code) via environment.
// Views read the current theme via @Environment(\.studioTheme).
extension EnvironmentValues {
  @Entry var studioTheme: StudioTheme = StudioTheme(
    palette: ThemePalette.palette(for: .default))
}
```

Alternatively, use a simpler approach: keep `Studio` as a namespace but inject it dynamically via a view modifier or environment variable.

#### `apple/Ateliera/RootView.swift`
Add theme state and a theme picker button in the top bar or settings menu.

```swift
// Add to RootView:
@State private var themeStore = ThemeStore()
@State private var showThemeSettings = false

// In the view hierarchy, pass themeStore down and add a button:
Button("Theme") {
  showThemeSettings = true
}
.sheet(isPresented: $showThemeSettings) {
  ThemeSettingsView(store: themeStore, isPresented: $showThemeSettings)
}

// Apply the theme globally:
.environment(\.colorScheme, themeStore.current.mode)
.preferredColorScheme(themeStore.current.mode == .light ? .light : .dark)
```

#### `apple/Ateliera/AtelieraApp.swift`
Initialize `ThemeStore` at app launch and inject it globally so all views access the current theme.

```swift
@main
struct AtelieraApp: App {
  @State private var themeStore = ThemeStore()
  
  init() {
    Self.registerBrandFonts()
  }
  
  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(\.colorScheme, themeStore.current.mode)
    }
  }
  
  // ...
}
```

---

## 3. Data & format

No frontmatter changes. The theme is purely a client-side preference stored in `UserDefaults` (key: `ateliera.theme`), not in the vault. The 7 theme definitions are translated verbatim from the web's CSS token rules (tokens.css §4.1–4.6).

**Golden values to capture from the web:**
- Run a simple TypeScript test that exports all 7 theme token sets (hex values, exact semantic accents, stock pairs, accent overrides).
- Store as a snapshot JSON in `apple/Ateliera/Golden/themes-golden.json`.
- Verify each Swift `ThemePalette` constant matches its golden counterpart (hex for hex).

**Gradient note:** The light themes (Fig Leaf, Sunrise, Wisteria) and dark themes (Deep Ocean, Sunset, Forest) have radial+linear gradient canvases in CSS. SwiftUI's `LinearGradient` + `RadialGradient` can approximate, but the exact visual match is not required for this phase — use a simplified fallback color or a basic gradient; visual parity is a future polish task.

---

## 4. TDD plan

### Unit tests (Swift, `AtelieraTests`)

1. **ThemeStore persistence**
   - Save a theme, kill the app, reboot → persisted theme loads.
   - Invalid or missing key → defaults to Chamomile.

2. **ThemeId enum**
   - All 7 cases present + name/mode properties correct.
   - `lightThemes` and `darkThemes` grouping correct.

3. **ThemePalette values**
   - Each of 7 palettes contains all required color properties.
   - Golden test: assert each hex value matches the golden JSON snapshot.

4. **Theme switching**
   - Setting `themeStore.current = .figLeaf` updates the persistent key.
   - Multiple rapid switches don't corrupt state.

### UI tests (XCUITest, `AtelieraUITests`)

1. **Theme picker opens and closes**
   - Tap a "Theme" button → menu appears with 7 options grouped by mode.
   - Tap outside or press Escape → menu closes, focus restored.

2. **Theme selection**
   - Select "Deep Ocean" → the app's colors visibly change (test the canvas color in a known view).
   - Verify that the same theme persists after a restart (navigate away, relaunch app, confirm).

3. **Keyboard navigation**
   - Focus on the theme menu, press ArrowDown → next theme is focused.
   - Press Home → first theme focused.
   - Press End → last theme focused.

4. **Accessibility**
   - Theme menu has `role="menu"` equivalent (custom accessibility API).
   - Selected theme announced or marked with a checkmark.
   - Focus visible in all themes (light and dark).

---

## 5. Dependencies

**P2 requires completion of:**
- **P1 or earlier:** Note model, capture/edit, vault I/O (already shipped).
- **N5:** Room navigation, Foyer, search (already shipped).

**P2 **does not** require:**
- P3 (Gift/SM-2).
- Any room richness (landscape, identity, wisdom).

**P2 provides to later phases:**
- Theme infrastructure (ThemeStore, ThemePalette enum) that all rooms will use.
- Environment injection pattern for dynamic color scheme in subsequent UIs.

---

## 6. Risks & first vertical slice

### Risks
1. **Gradient rendering:** Light-theme gradients (Fig Leaf, Sunrise, Wisteria) use radial+linear in CSS; SwiftUI's API may not match exactly. Mitigation: use simplified fallback colors for canvas; visual precision can be added later.
2. **Dark-mode text contrast:** Existing text styles (e.g., `Studio.inkMuted` in Chamomile) may not meet WCAG AA in dark themes. Mitigation: test all themes with a contrast checker; flag any failures in the dev log.
3. **Environmental injection complexity:** Passing theme state through all views requires either `@Environment`, `@EnvironmentObject`, or a singleton. Mitigation: start with a simple `@StateObject` in `RootView`, passing down via `.environment()`.

### First vertical slice
1. **Create `ThemeDefinition.swift`:** Define `ThemeId` enum (7 cases) and `ThemeId.mode` property.
2. **Create `ThemeStore.swift`:** Observable store, UserDefaults persistence, unit test persistence.
3. **Create `ThemePalette.swift`:** All 7 palettes with hex values from tokens.css. Unit test one palette's values against golden.
4. **Modify `Theme.swift`:** Add extension to read current theme's palette (via environment).
5. **Add "Theme" button to RootView:** Show/hide a simple menu with all 7 themes as buttons.
6. **Implement ThemeSettingsView (basic):** List 7 themes, tap to select, close menu, verify color change in app.
7. **UI test:** Tap "Theme", select "Deep Ocean", verify app background changed to dark, relaunch, confirm persisted.
8. **Golden test:** Extract actual hex values from tokens.css, verify Swift constants match.

---

## Key decisions

1. **No CSS—pure Swift enums:** Themes are data-driven Swift enums + color palettes, not CSS classes. Environment variables pass the palette down, avoiding global state pollution.
2. **UserDefaults persistence (not vault):** Theme preference is a client choice, not part of the portable vault. No frontmatter changes.
3. **Backward-compatible Studio enum:** Existing code referencing `Studio.ink` continues to work; the enum reads from environment or a default palette.
4. **Gradient simplification:** Canvas gradients are simplified (one fallback color) for Phase 2; future visual polish (Phase 9?) can refine them.
5. **Light + dark modes:** Dark themes automatically set `preferredColorScheme(.dark)`, ensuring system UI (keyboards, sheets) matches.

---

## Hard dependencies

- **@studio/rhythm + Rust core:** Already shipped; no changes needed.
- **Note model (P1 frontmatter):** Already complete; no semantic type/tags/status changes.
- **VaultStore (N5):** Already provides note list; theme doesn't modify I/O.
- **Type system (StudioFont):** Existing font.swift is independent; no changes.

---

**Summary:** P2 is a self-contained feature: translate 7 web theme token sets into 7 Swift palettes, add a theme switcher UI, and persist selection. No vault changes, no note model changes, no algorithm changes. Gate: all 7 themes load, switch instantly, persist across restart, and pass WCAG 2.2 AA contrast in both light and dark modes.
