import CoreText
import SwiftUI

@main
struct AtelieraApp: App {
  @State private var themeStore = ThemeStore()

  init() {
    Self.registerBrandFonts()
  }

  var body: some Scene {
    WindowGroup {
      RootView(themeStore: themeStore)
        .studioTheme(themeStore.current)
    }
  }

  // Register the bundled OFL brand fonts at launch so `Font.custom` resolves them,
  // rather than relying on the Info.plist UIAppFonts array.
  private static func registerBrandFonts() {
    let files = ["CormorantGaramond", "CormorantGaramond-Italic", "Figtree", "NothingYouCouldDo"]
    for name in files {
      guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
  }
}
