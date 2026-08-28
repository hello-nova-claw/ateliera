import XCTest

// P3 end-to-end: the Foyer's Today's Gift over a seeded vault (ATELIERA_UITEST_GIFT
// seeds one due wish card). Grade "Keep" → the copy is filed and the schedule
// advances through the real Rust-core write path, and the card shows a calm
// confirmation. This exercises button → GiftStore → VaultStore → core write →
// reload in the running app.
final class GiftFlowUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  private func launchGiftApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_GIFT"] = "1"
    app.launch()
    return app
  }

  func testGiftCardAppearsAndKeepFilesACopy() {
    let app = launchGiftApp()
    // The seeded wish surfaces as a real Gift card with the grade actions.
    XCTAssertTrue(app.otherElements["gift-card"].waitForExistence(timeout: 8))
    let keep = app.buttons["gift-grade-keep"]
    XCTAssertTrue(keep.waitForExistence(timeout: 5))
    keep.tap()

    // The "Kept." confirmation only appears once BOTH the keepsake copy was filed
    // and the source schedule advanced through the core — the whole loop worked.
    let status = app.staticTexts["gift-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 5))
    XCTAssertEqual(status.label, "Kept.")
  }
}
