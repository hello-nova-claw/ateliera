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

  func testCapturingANoteShowsItInTheRoom() {
    let app = launchEmptyApp()

    let capture = app.buttons["capture-button"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    // The room starts empty.
    XCTAssertFalse(app.staticTexts["A found moment"].exists)

    capture.tap()

    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    title.tap()
    title.typeText("A found moment")

    let editor = app.textViews["note-body-editor"]
    editor.tap()
    editor.typeText("Fifteen minutes still counted.")

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

  func testEditingANoteUpdatesTheRoom() {
    let app = launchEmptyApp()

    // First capture a note to edit.
    app.buttons["capture-button"].tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    title.tap()
    title.typeText("A found moment")
    let editor = app.textViews["note-body-editor"]
    editor.tap()
    editor.typeText("One quiet line.")
    app.buttons["note-save-button"].tap()

    let row = app.staticTexts["A found moment"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))

    // Open it, extend the title, save; the room reflects the edit.
    row.tap()
    let editTitle = app.textFields["note-title-field"]
    XCTAssertTrue(editTitle.waitForExistence(timeout: 5))
    editTitle.tap()
    editTitle.typeText(" again")
    app.buttons["note-save-button"].tap()

    XCTAssertTrue(app.staticTexts["A found moment again"].waitForExistence(timeout: 5))
  }
}
