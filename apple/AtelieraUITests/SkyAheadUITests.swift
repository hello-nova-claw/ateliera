import XCTest

// The "Sky ahead" timeline, reached from the tucked-away Today panel. Confirms the
// view renders its computed layers + events and that a per-layer toggle responds —
// exercising the link → SkyAheadView → SkyAhead engine → layer-store path in the app.
final class SkyAheadUITests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
  }

  private func launchApp() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()
    return app
  }

  private func openSkyAhead(_ app: XCUIApplication) {
    let today = app.buttons["today-panel-toggle"]
    XCTAssertTrue(today.waitForExistence(timeout: 10))
    today.tap()
    let link = app.buttons["sky-ahead-button"]
    var tries = 0
    while !link.isHittable && tries < 6 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(link.waitForExistence(timeout: 5))
    link.tap()
    // Wait for the sheet's content to settle before asserting on it.
    XCTAssertTrue(app.staticTexts["LAYERS"].waitForExistence(timeout: 8))
  }

  func testSkyAheadShowsTheLayersAndAnEvent() {
    let app = launchApp()
    openSkyAhead(app)
    // The computed timeline leads with the Sky-ahead heading and renders a turning point
    // (the next equinox/solstice is always within the default horizon).
    XCTAssertTrue(app.staticTexts["Sky ahead"].waitForExistence(timeout: 5))
    let anEvent = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "solstice", "equinox")
    ).firstMatch
    XCTAssertTrue(anEvent.waitForExistence(timeout: 5), "expected a turning-point event in the list")
  }

  func testTurningPointsLayerToggleIsOperable() {
    let app = launchApp()
    openSkyAhead(app)
    let toggle = app.switches["sky-layer-turning-points"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    XCTAssertEqual(toggle.value as? String, "1", "turning points should start on")
    toggle.tap()
    XCTAssertEqual(toggle.value as? String, "0", "turning points should turn off")
  }
}
