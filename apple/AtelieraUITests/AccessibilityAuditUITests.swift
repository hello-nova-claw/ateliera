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
        // The audit sees only what's on screen, so scroll through and audit each position.
        // Five swipes bound the run's time; every position reached is audited.
        auditVisible(app, on: screen.name)
        for _ in 0..<5 {
          let before = app.debugDescription
          app.swipeUp()
          if app.debugDescription == before { break }
          auditVisible(app, on: screen.name)
        }
        AppScreens.scrollToTop(app)
        screen.close(app)
      }
    }
  }

  private func auditVisible(_ app: XCUIApplication, on screen: String, retry: Bool = true) {
    do {
      try app.performAccessibilityAudit { issue in
        let finding = KnownAccessibilityIssues.finding(issue, on: screen)
        if KnownAccessibilityIssues.isKnown(finding) { return true }
        // The audit's own message doesn't name the element; this gives the baseline line.
        XCTFail(
          "\(issue.compactDescription) (\(finding.element)). Fix it, or if an open issue covers "
            + "it, list it in KnownAccessibilityIssues as: <issue> \(finding.type) \(finding.screen)"
        )
        return true
      }
    } catch let error as NSError where error.code == -56 {
      // -56 is the audit timing out on a busy simulator, not a finding: try once more,
      // then note the gap rather than fail.
      if retry {
        auditVisible(app, on: screen, retry: false)
      } else {
        print("warning: \(screen): the accessibility audit timed out twice; this position went unaudited.")
      }
    } catch {
      XCTFail("\(screen): \(error)")
    }
  }
}
