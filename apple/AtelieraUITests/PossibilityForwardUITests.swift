import XCTest

// After capturing a Possibility and walking its gentle follow-up, the closing step
// offers a calm fork: leave it in Uncharted, or work it forward into a reverse,
// backwards-in-time Landscape thread. This exercises capture → possibility thread →
// "Work it forward" → anchor → a 90-day decision card, end-to-end in the running app.
final class PossibilityForwardUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func launchEmptyApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()
    return app
  }

  private func type(_ text: String, into element: XCUIElement, in app: XCUIApplication) {
    XCTAssertTrue(element.waitForExistence(timeout: 5), "field missing")
    element.tap()
    if !app.keyboards.firstMatch.waitForExistence(timeout: 5) {
      element.tap()
      _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
    }
    element.typeText(text)
  }

  // Open the hub, switch to Possibilities, name one, and keep it — leaving you at the
  // possibility guided thread.
  private func capturePossibility(_ app: XCUIApplication, _ text: String) {
    let capture = app.buttons["capture-button"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    capture.tap()
    let possibilities = app.buttons["Possibilities"]
    XCTAssertTrue(possibilities.waitForExistence(timeout: 5))
    possibilities.tap()
    type(text, into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()  // "Keep" for possibilities
  }

  // Skip through the two possibility follow-up prompts to reach the closing fork.
  private func skipToClosing(_ app: XCUIApplication) {
    for _ in 0..<2 {
      let skip = app.buttons["workshop-skip"]
      if skip.waitForExistence(timeout: 5) { skip.tap() }
    }
  }

  func testWorkingAPossibilityForwardWritesAReverseDecisionCard() {
    let app = launchEmptyApp()
    capturePossibility(app, "run a sabbatical year")
    skipToClosing(app)

    // The closing step offers the fork; choose to work it forward.
    let forward = app.buttons["possibility-forward"]
    XCTAssertTrue(forward.waitForExistence(timeout: 5))
    forward.tap()

    // The reverse workshop opens; anchor the Possibility to the Family area.
    let family = app.buttons["workshop-area-Family"]
    XCTAssertTrue(family.waitForExistence(timeout: 8))
    family.tap()

    // The first step is the 90-day decision, carrying the possibility forward.
    let far = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS[c] %@", "three months")).firstMatch
    XCTAssertTrue(far.waitForExistence(timeout: 5))
    XCTAssertTrue(far.label.contains("sabbatical"), "prompt was \(far.label)")

    // Answer it — this writes a decision card — then skip the rest and finish.
    type("Book the time off", into: app.textViews["workshop-editor"], in: app)
    app.buttons["workshop-next"].tap()
    for _ in 0..<6 {
      let skip = app.buttons["workshop-skip"]
      if skip.waitForExistence(timeout: 3) { skip.tap() }
    }
    let done = app.buttons["workshop-done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    // The closing confirms the decision card was written before we leave.
    XCTAssertTrue(
      app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "You added 1 note"))
        .firstMatch.exists, "the reverse thread should have written one decision card")
    done.tap()

    // The decision now lives on the Life Landscape under Family.
    app.tabBars.buttons["Browse"].tap()
    let landscape = app.buttons["room-landscape"]
    XCTAssertTrue(landscape.waitForExistence(timeout: 8))
    landscape.tap()
    let familyArea = app.buttons["area-family"]
    XCTAssertTrue(familyArea.waitForExistence(timeout: 8))
    familyArea.tap()
    // Decisions is the third anchor block, so the card can sit below the fold — scroll
    // until it comes into view. A decision card also carries a horizon badge, so match
    // the title by containment rather than an exact label.
    let card = app.buttons.containing(
      NSPredicate(format: "label CONTAINS %@", "Book the time off")).firstMatch
    var tries = 0
    while !card.exists && tries < 8 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(card.waitForExistence(timeout: 8))
  }

  func testLeavingAPossibilityHereKeepsItInUncharted() {
    let app = launchEmptyApp()
    capturePossibility(app, "learn to sail")
    skipToClosing(app)

    // Choose to leave it — no workshop opens; we return to Today.
    let leave = app.buttons["possibility-leave"]
    XCTAssertTrue(leave.waitForExistence(timeout: 5))
    leave.tap()

    // No reverse workshop appeared (its anchor area buttons never show).
    XCTAssertFalse(app.buttons["workshop-area-Family"].waitForExistence(timeout: 3))

    // The Possibility is in Uncharted.
    app.tabBars.buttons["Browse"].tap()
    let uncharted = app.buttons["room-uncharted"]
    XCTAssertTrue(uncharted.waitForExistence(timeout: 8))
    uncharted.tap()
    // A titleless note shows its text once — SwiftUI may expose it as a static text or
    // as the enclosing card button's label, so accept either.
    let inUncharted = NSPredicate(format: "label CONTAINS[c] %@", "learn to sail")
    let shown = app.staticTexts.containing(inUncharted).firstMatch.waitForExistence(timeout: 8)
      || app.buttons.containing(inUncharted).firstMatch.waitForExistence(timeout: 2)
    XCTAssertTrue(shown, "the Possibility's text should show in Uncharted")
  }
}
