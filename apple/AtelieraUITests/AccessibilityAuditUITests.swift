import XCTest

// Opens every screen in AppScreens and runs Xcode's accessibility audit on it: at the
// largest accessibility text size, right to left, and with every string doubled in
// length. An issue fails the test unless KnownAccessibilityIssues lists it against an
// open GitHub issue. Fix the cause and delete the entry; never widen an entry to hide
// a new problem.
final class AccessibilityAuditUITests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  func testEveryScreenAtTheLargestTextSize() throws {
    try audit(arguments: [
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
    ])
  }

  func testEveryScreenRightToLeft() throws {
    try audit(arguments: [
      "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
      "-AppleTextDirection", "YES", "-NSForceRightToLeftWritingDirection", "YES",
    ])
  }

  func testEveryScreenWithDoubledStrings() throws {
    try audit(arguments: ["-NSDoubleLocalizedStrings", "YES"])
  }

  private func audit(arguments: [String]) throws {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_NOW"] = "2026-03-20T09:30:00Z"
    app.launchEnvironment["TZ"] = "Europe/London"
    app.launchArguments = arguments
    app.launch()

    for screen in AppScreens.all {
      XCTContext.runActivity(named: screen.name) { _ in
        screen.open(app)
        do {
          try app.performAccessibilityAudit { issue in
            KnownAccessibilityIssues.isKnown(issue, on: screen.name)
          }
        } catch {
          XCTFail("\(screen.name): \(error)")
        }
        screen.close(app)
      }
    }
  }
}
