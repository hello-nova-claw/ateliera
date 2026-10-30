import XCTest

// The Foyer hero: the current becoming is the first meaningful thing on the home screen,
// and when there's no becoming yet the hero calmly invites you to begin one. The app
// wordmark has receded to a quiet rail, so neither test looks for a big "Ateliera" title.
final class FoyerHeroUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testBecomingIsTheHeroWhenOneIsInPlay() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_FOYER"] = "1"  // seeds a promoted becoming
    app.launch()

    // The hero carries the becoming statement from the seeded fixture.
    let hero = app.otherElements["foyer-hero-becoming"]
    XCTAssertTrue(hero.waitForExistence(timeout: 10), "becoming hero missing")
    XCTAssertTrue(
      hero.label.contains("Someone who rests"),
      "hero should name the becoming; label was \(hero.label)")
    XCTAssertTrue(
      hero.label.lowercased().contains("becoming"),
      "hero should frame it as a becoming; label was \(hero.label)")

    // Capture is still reachable, composed around the hero.
    XCTAssertTrue(app.buttons["capture-button"].waitForExistence(timeout: 5))
  }

  func testEmptyStateInvitesBeginningABecoming() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"  // empty vault, no becoming
    app.launch()

    // With no becoming yet, the hero asks the question and offers a calm way to begin —
    // not a nag. The begin button is the reliable anchor for the invite state.
    XCTAssertTrue(
      app.buttons["foyer-hero-begin"].waitForExistence(timeout: 10),
      "empty state should invite beginning a becoming")
    XCTAssertTrue(
      app.staticTexts["Who are you becoming?"].waitForExistence(timeout: 5),
      "empty state should ask who you are becoming")
  }
}

// The Today card's rhythm badges: a season and a drawn moon for everyone, and a cycle
// badge only when Health shares a cycle, which under UI tests it does only when the
// launch asks for an invented one. Each badge is a button that opens its own sheet.
final class RhythmBadgesUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTodayShowsSeasonAndMoonBadgesAndNoCycleBadge() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()

    let season = app.buttons["rhythm-badge-season"]
    XCTAssertTrue(season.waitForExistence(timeout: 10), "season badge missing")
    XCTAssertFalse(season.label.isEmpty, "season badge needs a spoken label")

    let moon = app.buttons["rhythm-badge-moon"]
    XCTAssertTrue(moon.exists, "moon badge missing")
    XCTAssertTrue(
      moon.label.lowercased().contains("moon") && moon.label.contains("lit"),
      "moon badge should name the phase and how lit it is; label was \(moon.label)")

    XCTAssertFalse(app.buttons["rhythm-badge-cycle"].exists, "no cycle, no badge")
  }

  func testTappingABadgeOpensItsSheetAndTheFeltLineDoesNothing() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_CYCLE"] = "1"
    app.launchEnvironment["ATELIERA_UITEST_NOW"] = "2026-03-20T09:30:00Z"
    app.launchEnvironment["TZ"] = "Europe/London"
    app.launch()

    for rhythm in ["season", "moon", "cycle"] {
      let badge = app.buttons["rhythm-badge-\(rhythm)"]
      XCTAssertTrue(badge.waitForExistence(timeout: 10), "\(rhythm) badge missing")
      badge.tap()
      let headline = app.staticTexts["rhythm-sheet-\(rhythm)-headline"]
      XCTAssertTrue(headline.waitForExistence(timeout: 8), "\(rhythm) sheet did not open")
      if rhythm == "cycle" {
        XCTAssertTrue(headline.label.contains("estimated"), "was \(headline.label)")
        XCTAssertTrue(app.staticTexts["rhythm-sheet-cycle-note"].exists, "cycle note missing")
      }
      app.buttons["Done"].tap()
      XCTAssertTrue(badge.waitForExistence(timeout: 8), "\(rhythm) sheet did not close")
    }

    // The felt line beside the badges names the cycle day but is not a button.
    let feltLine = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "Day 11")
    ).firstMatch
    XCTAssertTrue(feltLine.waitForExistence(timeout: 5), "felt line missing")
    XCTAssertEqual(
      app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Day 11")).count, 0,
      "the felt line must not be tappable")
  }
}
