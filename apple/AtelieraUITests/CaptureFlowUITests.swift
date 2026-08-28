import XCTest

// Drives the real app UI against a fresh, empty vault (ATELIERA_UITEST): capture a
// note through the sheet, confirm it lands in the room, then edit it and confirm
// the change. This exercises the button → VaultStore → Rust-core write → reload →
// list path end-to-end in the running app — the one thing the headless unit tests
// can't reach.
final class CaptureFlowUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  private func launchEmptyApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()
    return app
  }

  // Robust typing: focus the field and wait for the software keyboard before
  // typing. On a cold simulator the keyboard can lag a tap, which otherwise fails
  // with "no keyboard focus" — flaky, not a real defect.
  private func type(
    _ text: String, into element: XCUIElement, in app: XCUIApplication,
    file: StaticString = #filePath, line: UInt = #line
  ) {
    XCTAssertTrue(element.waitForExistence(timeout: 5), "field missing", file: file, line: line)
    element.tap()
    if !app.keyboards.firstMatch.waitForExistence(timeout: 5) {
      element.tap()  // one more nudge if the keyboard didn't attach
      _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
    }
    element.typeText(text)
  }

  func testCapturingANoteShowsItInTheRoom() {
    let app = launchEmptyApp()

    let capture = app.buttons["capture-button"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    // The room starts empty.
    XCTAssertFalse(app.staticTexts["A found moment"].exists)

    capture.tap()

    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A found moment", into: title, in: app)

    let editor = app.textViews["note-body-editor"]
    type("Fifteen minutes still counted.", into: editor, in: app)

    app.buttons["note-save-button"].tap()

    // The captured note is now a row in the room.
    XCTAssertTrue(app.staticTexts["A found moment"].waitForExistence(timeout: 5))
  }

  func testRhythmSheetShowsTheChart() {
    let app = launchEmptyApp()
    let rhythm = app.buttons["rhythm-button"]
    XCTAssertTrue(rhythm.waitForExistence(timeout: 10))
    rhythm.tap()
    // The natal chart card renders (computed on-device, no crash).
    XCTAssertTrue(app.staticTexts["Your chart"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["SUN"].exists)
    app.buttons["Cancel"].tap()
  }

  func testCapturedNoteAppearsInItsRoom() {
    let app = launchEmptyApp()
    // A quick capture lands in the Inbox room.
    app.buttons["capture-button"].tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A found moment", into: title, in: app)
    let editor = app.textViews["note-body-editor"]
    type("caught for later", into: editor, in: app)
    app.buttons["note-save-button"].tap()
    XCTAssertTrue(app.staticTexts["A found moment"].waitForExistence(timeout: 5))

    // Step into the Inbox room (confirmed by its unique intro) and find the note.
    let inbox = app.buttons["room-inbox"]
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    if !inbox.isHittable { app.swipeUp() }
    inbox.tap()
    XCTAssertTrue(
      app.staticTexts["Quick captures, waiting here until they find their room."]
        .waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["A found moment"].exists)
  }

  func testCaptureIntoASpecificRoom() {
    let app = launchEmptyApp()
    // Step into Wisdom Garden and capture there.
    let wisdom = app.buttons["room-wisdom-garden"]
    XCTAssertTrue(wisdom.waitForExistence(timeout: 5))
    if !wisdom.isHittable { app.swipeUp() }
    wisdom.tap()

    let add = app.buttons["room-capture-button"]
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    add.tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A kept truth", into: title, in: app)
    let editor = app.textViews["note-body-editor"]
    type("worth remembering", into: editor, in: app)
    app.buttons["note-save-button"].tap()

    // It lands in the Wisdom Garden room we're standing in.
    XCTAssertTrue(app.staticTexts["A kept truth"].waitForExistence(timeout: 5))
  }

  func testSearchFindsACapturedNoteByBody() {
    let app = launchEmptyApp()
    // Capture a note whose distinctive word lives in the body, not the title.
    app.buttons["capture-button"].tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A found moment", into: title, in: app)
    let editor = app.textViews["note-body-editor"]
    type("something worth keeping", into: editor, in: app)
    app.buttons["note-save-button"].tap()
    XCTAssertTrue(app.staticTexts["A found moment"].waitForExistence(timeout: 5))

    // Search by a body word and find it.
    app.buttons["search-button"].tap()
    let field = app.textFields["search-field"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    type("keeping", into: field, in: app)
    XCTAssertTrue(app.staticTexts["A found moment"].waitForExistence(timeout: 5))
  }

  func testEditingANoteUpdatesTheRoom() {
    let app = launchEmptyApp()

    // First capture a note to edit.
    app.buttons["capture-button"].tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A found moment", into: title, in: app)
    let editor = app.textViews["note-body-editor"]
    type("One quiet line.", into: editor, in: app)
    app.buttons["note-save-button"].tap()

    let row = app.staticTexts["A found moment"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))

    // Open it, extend the title, save; the room reflects the edit.
    row.tap()
    let editTitle = app.textFields["note-title-field"]
    XCTAssertTrue(editTitle.waitForExistence(timeout: 5))
    type(" again", into: editTitle, in: app)
    app.buttons["note-save-button"].tap()

    XCTAssertTrue(app.staticTexts["A found moment again"].waitForExistence(timeout: 5))
  }
}
