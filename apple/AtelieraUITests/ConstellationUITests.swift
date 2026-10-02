import XCTest

// Smoke test for the Constellation spike: launch with a two-note fixture (one note
// wiki-links the other, giving two dots and one line), open the room from Browse,
// and confirm the visual map renders tappable dots and the accessible List
// alternative lists the moments. Drives the real app end-to-end.
final class ConstellationUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  private func launchWithFixture() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_CONSTELLATION"] = "1"
    app.launch()
    return app
  }

  private func openConstellation(_ app: XCUIApplication) {
    let browse = app.tabBars.buttons["Browse"]
    XCTAssertTrue(browse.waitForExistence(timeout: 10))
    browse.tap()
    let room = app.buttons["room-constellation"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    if !room.isHittable { app.swipeUp() }
    room.tap()
  }

  func testConstellationRendersTappableDots() {
    let app = launchWithFixture()
    openConstellation(app)

    // The visual map is the default mode and shows at least one dot. The dots are
    // graphical buttons, so query across any element type by their identifier.
    XCTAssertTrue(app.otherElements["constellation-canvas"].waitForExistence(timeout: 8))
    let dotPredicate = NSPredicate(format: "identifier BEGINSWITH 'constellation-dot-'")
    let anyDot = app.descendants(matching: .any).matching(dotPredicate).firstMatch
    XCTAssertTrue(anyDot.waitForExistence(timeout: 8), "expected at least one moment dot")

    // Capture the rendered constellation for review.
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = "constellation-map"
    shot.lifetime = .keepAlways
    add(shot)

    // Tapping a dot reveals the moment with an "Open this moment" affordance.
    anyDot.tap()
    let open = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH 'constellation-open-'")).firstMatch
    XCTAssertTrue(open.waitForExistence(timeout: 5), "tapping a dot should reveal the moment")
  }

  func testAccessibleListAlternativeShowsMoments() {
    let app = launchWithFixture()
    openConstellation(app)

    // Flip to the non-visual List alternative.
    let picker = app.segmentedControls["constellation-mode-picker"]
    XCTAssertTrue(picker.waitForExistence(timeout: 8))
    picker.buttons["List"].tap()

    XCTAssertTrue(app.collectionViews["constellation-list"].waitForExistence(timeout: 5)
      || app.tables["constellation-list"].waitForExistence(timeout: 5))
    // Both seeded moments are listed as rows.
    let rows = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH 'constellation-list-row-'"))
    XCTAssertGreaterThanOrEqual(rows.count, 1, "the list should enumerate the moments")
  }
}
