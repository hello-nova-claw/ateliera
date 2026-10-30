import XCTest

// Opens every screen in AppScreens and runs Xcode's accessibility audit on it: at the
// largest accessibility text size, right to left, and with every string doubled in
// length. An issue fails the test unless KnownAccessibilityIssues lists it against an
// open GitHub issue. Fix the cause and delete the entry; never widen an entry to hide
// a new problem. A finding whose element is gone by the time the test looks at it is
// confirmed by a second pass before it fails; AuditTriage holds the rules.
final class AccessibilityAuditUITests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  func testEveryScreenAtTheLargestTextSize() throws {
    try audit(
      variant: "largest text",
      arguments: [
        "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
      ])
  }

  func testEveryScreenRightToLeft() throws {
    try audit(
      variant: "right to left",
      arguments: [
        "-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
        "-AppleTextDirection", "YES", "-NSForceRightToLeftWritingDirection", "YES",
      ])
  }

  func testEveryScreenWithDoubledStrings() throws {
    try audit(variant: "doubled strings", arguments: ["-NSDoubleLocalizedStrings", "YES"])
  }

  private func audit(variant: String, arguments: [String]) throws {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_NOW"] = "2026-03-20T09:30:00Z"
    app.launchEnvironment["TZ"] = "Europe/London"
    app.launchArguments = arguments
    app.launch()

    for screen in AppScreens.all
    where !KnownAccessibilityIssues.isUnauditable(screen.name, in: variant) {
      XCTContext.runActivity(named: screen.name) { _ in
        screen.open(app)
        // Opening animates the screen in; auditing it mid-transition reports elements
        // that are gone a moment later.
        waitUntilSettled(app)
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

  private func auditVisible(_ app: XCUIApplication, on screen: String) {
    let first = newFindings(app, on: screen)
    var second: [AuditFinding] = []
    if AuditTriage.needsSecondPass(first) {
      waitUntilSettled(app)
      // Only the types that vanished, so the Dynamic Type pass that re-lays the screen out
      // stays out of the second pass unless one of its findings is what needs confirming.
      let types = KnownAccessibilityIssues.auditTypes(named: AuditTriage.secondPassTypes(first))
      second = newFindings(app, on: screen, for: types.isEmpty ? .all : types)
    }
    for finding in AuditTriage.confirmed(first: first, second: second) {
      // The audit's own message doesn't name the element; this gives the baseline line.
      XCTFail(
        "\(finding.description) (\(finding.element)). Fix it, or if an open issue covers "
          + "it, list it in KnownAccessibilityIssues as: <issue> \(finding.type) \(finding.screen)"
          + (finding.detail.isEmpty ? "" : " The audit said: \(finding.detail)")
      )
    }
  }

  /// One audit pass, returning the findings the baseline doesn't list. Each one says
  /// whether its element could still be found once the pass had finished.
  private func newFindings(
    _ app: XCUIApplication, on screen: String, for types: XCUIAccessibilityAuditType = .all,
    retry: Bool = true
  ) -> [AuditFinding] {
    var issues: [(issue: XCUIAccessibilityAuditIssue, finding: KnownAccessibilityIssues.Finding)] =
      []
    do {
      try app.performAccessibilityAudit(for: types) { issue in
        let finding = KnownAccessibilityIssues.finding(issue, on: screen)
        if !KnownAccessibilityIssues.isKnown(finding) { issues.append((issue, finding)) }
        return true
      }
    } catch let error as NSError where error.code == -56 {
      // -56 is the audit timing out on a busy simulator: try once more before failing,
      // since an unaudited position could hide a finding.
      if retry {
        return newFindings(app, on: screen, for: types, retry: false)
      }
      XCTFail(
        "\(screen): the accessibility audit timed out twice, so this position went unaudited.")
    } catch {
      XCTFail("\(screen): \(error)")
    }
    return issues.map { issue, finding in
      // A finding that can't name its element keeps the audit's longer description, so
      // the log still says what was flagged.
      let unnamed = finding.element == "-"
      return AuditFinding(
        type: finding.type, screen: finding.screen, element: finding.element,
        description: issue.compactDescription,
        onScreen: issue.element?.exists == true,
        detail: unnamed && issue.detailedDescription != issue.compactDescription
          ? issue.detailedDescription : "")
    }
  }

  /// Returns once two snapshots of the hierarchy taken half a second apart match, so an
  /// audit sees a screen at rest rather than one still animating or being laid out.
  /// Bounded at five beats, so a screen that never settles is still audited.
  private func waitUntilSettled(_ app: XCUIApplication) {
    var before = app.debugDescription
    for _ in 0..<5 {
      _ = XCTWaiter.wait(for: [XCTestExpectation(description: "a beat")], timeout: 0.5)
      let now = app.debugDescription
      if now == before { return }
      before = now
    }
  }
}
