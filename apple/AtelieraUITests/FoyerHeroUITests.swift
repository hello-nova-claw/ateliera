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

// The profile avatar in Today's wordmark rail opens a small profile sheet, with the
// same name field and photo picker as Settings.
final class ProfileSheetUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTappingTheAvatarOpensTheProfileSheet() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()

    let avatar = app.buttons["profile-avatar"]
    XCTAssertTrue(avatar.waitForExistence(timeout: 10), "avatar should be a button on Today")
    XCTAssertEqual(avatar.label, "Profile")
    avatar.tap()

    XCTAssertTrue(
      app.navigationBars["Profile"].waitForExistence(timeout: 5), "profile sheet missing")
    XCTAssertTrue(app.textFields["profile-name-field"].exists)
    XCTAssertTrue(app.buttons["profile-photo-picker"].exists)
    XCTAssertFalse(app.buttons["profile-photo-remove"].exists, "no photo, no remove")

    app.buttons["Done"].tap()
    XCTAssertTrue(avatar.waitForExistence(timeout: 5))
  }
}

// The Today card's rhythm badges: a season and a drawn moon for everyone, and a cycle
// badge only when Health shares a cycle, which under UI tests it never does.
final class RhythmBadgesUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTodayShowsSeasonAndMoonBadgesAndNoCycleBadge() {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    app.launch()

    let season = app.otherElements["rhythm-badge-season"]
    XCTAssertTrue(season.waitForExistence(timeout: 10), "season badge missing")
    XCTAssertFalse(season.label.isEmpty, "season badge needs a spoken label")

    let moon = app.otherElements["rhythm-badge-moon"]
    XCTAssertTrue(moon.exists, "moon badge missing")
    XCTAssertTrue(
      moon.label.lowercased().contains("moon") && moon.label.contains("lit"),
      "moon badge should name the phase and how lit it is; label was \(moon.label)")

    XCTAssertFalse(app.otherElements["rhythm-badge-cycle"].exists, "no cycle, no badge")
  }
}
