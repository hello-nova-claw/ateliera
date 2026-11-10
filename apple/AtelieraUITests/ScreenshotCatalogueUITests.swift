import XCTest

// Photographs every screen in AppScreens for the Screenshots pull request comment: in an
// empty and a furnished vault, in three locales, with the clock and time zone pinned.
// Each shot is an attachment named <screen>--<state>--<locale>--<device>, which CI
// exports and compares with main. The vaults are invented fixtures. The app has one
// light palette, so there's no dark pass.
final class ScreenshotCatalogueUITests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  static let locales: [(name: String, arguments: [String])] = [
    ("en-GB", ["-AppleLanguages", "(en-GB)", "-AppleLocale", "en_GB"]),
    // The app has no Arabic strings yet, so right to left has to be forced.
    (
      "ar",
      [
        "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA", "-AppleTextDirection", "YES",
        "-NSForceRightToLeftWritingDirection", "YES",
      ]
    ),
    ("de-DE", ["-AppleLanguages", "(de-DE)", "-AppleLocale", "de_DE"]),
  ]

  /// Every seeded fixture at once, so each room has something in it.
  static let states: [(name: String, environment: [String: String])] = [
    ("empty", [:]),
    (
      "furnished",
      [
        "ATELIERA_UITEST_GIFT": "1", "ATELIERA_UITEST_P5": "1", "ATELIERA_UITEST_FOYER": "1",
        "ATELIERA_UITEST_CONSTELLATION": "1",
      ]
    ),
  ]

  /// Mean-moon times for each phase of one lunation in 2026.
  static let moonPhases: [(name: String, now: String)] = [
    ("new", "2026-03-18T16:00:00Z"),
    ("waxing-crescent", "2026-03-22T08:00:00Z"),
    ("first-quarter", "2026-03-26T01:00:00Z"),
    ("waxing-gibbous", "2026-03-29T17:00:00Z"),
    ("full", "2026-04-02T10:00:00Z"),
    ("waning-gibbous", "2026-04-06T03:00:00Z"),
    ("last-quarter", "2026-04-09T19:00:00Z"),
    ("waning-crescent", "2026-04-13T12:00:00Z"),
  ]

  func testEveryScreen() {
    for state in Self.states {
      for locale in Self.locales {
        let app = launch(now: "2026-03-20T09:30:00Z", state.environment, locale.arguments)
        for screen in AppScreens.all {
          XCTContext.runActivity(named: "\(screen.name) \(state.name) \(locale.name)") { _ in
            let before = app.debugDescription
            screen.open(app)
            waitForChange(in: app, from: before)
            snap(screen.name, state.name, locale.name)
            screen.close(app)
          }
        }
        app.terminate()
      }
    }
  }

  func testTodayInEachMoonPhase() {
    for phase in Self.moonPhases {
      let app = launch(now: phase.now, [:], Self.locales[0].arguments)
      AppScreens.tab(app, .today)
      snap("today", "moon-\(phase.name)", Self.locales[0].name)
      app.terminate()
    }
  }

  private func launch(now: String, _ environment: [String: String], _ arguments: [String])
    -> XCUIApplication
  {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_NOW"] = now
    app.launchEnvironment["TZ"] = "Europe/London"
    for (key, value) in environment { app.launchEnvironment[key] = value }
    app.launchArguments = arguments
    app.launch()
    return app
  }

  private func snap(_ screen: String, _ state: String, _ locale: String) {
    let attachment = XCTAttachment(screenshot: settledScreenshot())
    attachment.name = "\(screen)--\(state)--\(locale)--\(Self.device)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  /// Waits until what's on screen differs from before the screen opened, so a sheet that
  /// hasn't started to appear isn't photographed as the screen beneath it. A screen that
  /// was already showing never changes, and gives up after ten looks.
  private func waitForChange(in app: XCUIApplication, from before: String) {
    for _ in 0..<10 where app.debugDescription == before {}
  }

  /// Takes screenshots until two in a row match, so a sheet or push that's still moving
  /// isn't caught halfway. Each screenshot takes long enough to space them out.
  private func settledScreenshot() -> XCUIScreenshot {
    var last = XCUIScreen.main.screenshot()
    for _ in 0..<10 {
      let next = XCUIScreen.main.screenshot()
      if next.pngRepresentation == last.pngRepresentation { return next }
      last = next
    }
    return last
  }

  /// "iPhone 17 Pro Max" becomes "iphone-17-pro-max".
  static let device: String = {
    let name = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? "device"
    return name.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber })
      .joined(separator: "-")
  }()
}
