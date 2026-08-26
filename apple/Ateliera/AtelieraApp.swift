import CoreText
import SwiftUI

@main
struct AtelieraApp: App {
  init() {
    Self.registerBrandFonts()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }

  // Register the bundled OFL brand fonts at launch so `Font.custom` resolves them,
  // rather than relying on the Info.plist UIAppFonts array.
  private static func registerBrandFonts() {
    let files = ["SourceSerif4", "SourceSerif4-Italic", "Figtree", "NothingYouCouldDo"]
    for name in files {
      guard let url = Bundle.main.url(forResource: name, withExtension: "ttf") else { continue }
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
  }
}
