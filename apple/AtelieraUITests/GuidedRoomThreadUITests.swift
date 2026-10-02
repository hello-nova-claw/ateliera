import XCTest

// The guided threads inside the Reflection and Garden/celebration rooms: each room leads
// with ONE opening prompt (no blank page, no wall of options); answering it opens a
// gentle, skippable follow-up thread that deepens the same entry. Exercises both the
// Reflect and Celebrate intentions end-to-end in the running app.
final class GuidedRoomThreadUITests: XCTestCase {
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

  private func openReflectionGarden(_ app: XCUIApplication) {
    app.tabBars.buttons["Browse"].tap()
    let room = app.buttons["room-reflection-garden"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Reflection Garden"].waitForExistence(timeout: 5))
  }

  func testReflectionEntryLeadsWithOnePromptAndUnspoolsAFollowUp() {
    let app = launchEmptyApp()
    openReflectionGarden(app)

    // The room leads with a single inviting prompt — not a blank page.
    let opener = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "look back")).firstMatch
    XCTAssertTrue(opener.waitForExistence(timeout: 5))

    // Answer it; the guided thread opens with a contextual follow-up prompt.
    type("I kept rushing today", into: app.textViews["guided-opening-editor"], in: app)
    app.buttons["guided-opening-begin"].tap()
    let followUp = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "notice or learn")).firstMatch
    XCTAssertTrue(followUp.waitForExistence(timeout: 8))

    // Deepen the same entry, then skip the last step and finish.
    type("I slow down when I name it", into: app.textViews["workshop-editor"], in: app)
    app.buttons["workshop-next"].tap()
    let skip = app.buttons["workshop-skip"]
    if skip.waitForExistence(timeout: 3) { skip.tap() }
    let done = app.buttons["guided-done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()

    // The entry is kept in the Garden.
    XCTAssertTrue(app.staticTexts["I kept rushing today"].firstMatch.waitForExistence(timeout: 5))
  }

  func testCelebrateEntryCapturesAWinAndCanBeLeftEarly() {
    let app = launchEmptyApp()
    openReflectionGarden(app)

    // Switch to the Celebrate intention — its single prompt asks what went well.
    app.segmentedControls["reflection-kind"].buttons["Celebrate"].tap()
    let opener = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "went well")).firstMatch
    XCTAssertTrue(opener.waitForExistence(timeout: 5))

    type("Finished the hard email", into: app.textViews["guided-opening-editor"], in: app)
    app.buttons["guided-opening-begin"].tap()

    // The celebration follow-up opens; leave it early — the entry is already saved.
    let leave = app.buttons["guided-leave"]
    XCTAssertTrue(leave.waitForExistence(timeout: 8))
    leave.tap()

    // It lands under the Celebration tab.
    app.segmentedControls["reflection-tabs"].buttons["Celebration"].tap()
    XCTAssertTrue(app.staticTexts["Finished the hard email"].firstMatch.waitForExistence(timeout: 5))
  }
}
