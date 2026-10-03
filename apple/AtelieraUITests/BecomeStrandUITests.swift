import XCTest

// The flagship guided flow: from the single Capture entry, choose Life planning, name a
// becoming, and the thread opens with the statement woven into the prompt. Answering a
// dimension writes a real Landscape card. Exercises hub → becoming capture → thread
// (with prefill) → Landscape end-to-end in the running app.
final class BecomeStrandUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  // The becoming field opens pre-filled with this starter; a capture completes the
  // sentence, so the stored statement is the starter + the typed completion.
  private let becomingStarter = "I am becoming someone who "

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

  func testLifePlanningCaptureOpensAThreadThatWritesALandscapeCard() {
    let app = launchEmptyApp()

    // Open the single guided hub and name a becoming (Life planning is the default).
    let capture = app.buttons["capture-button"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    capture.tap()
    let body = app.textViews["classified-body"]
    // The becoming opens with a fixed lead-in; you complete the sentence in the field.
    XCTAssertTrue(app.staticTexts["becoming-lead-in"].waitForExistence(timeout: 5))
    type("has plenty", into: body, in: app)  // completes "I am becoming someone who …"
    XCTAssertEqual(body.value as? String, "has plenty")
    app.buttons["classified-keep"].tap()  // labelled "Begin" for life planning

    // The Become thread opens; anchor the seed to the Family area.
    let family = app.buttons["workshop-area-Family"]
    XCTAssertTrue(family.waitForExistence(timeout: 8))
    family.tap()

    // The first dimension's prompt carries the statement forward (prefill).
    let prefilled = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "ordinary Tuesday")).firstMatch
    XCTAssertTrue(prefilled.waitForExistence(timeout: 5))
    XCTAssertTrue(prefilled.label.contains("has plenty"), "prompt was \(prefilled.label)")

    // Answer Vision — this writes a Landscape card — then skip the rest and finish.
    type("An unhurried morning", into: app.textViews["workshop-editor"], in: app)
    app.buttons["workshop-next"].tap()
    for _ in 0..<4 {
      let skip = app.buttons["workshop-skip"]
      if skip.waitForExistence(timeout: 3) { skip.tap() }
    }
    let done = app.buttons["workshop-done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()

    // The card now lives on the Life Landscape under Family.
    let browse = app.tabBars.buttons["Browse"]
    XCTAssertTrue(browse.waitForExistence(timeout: 5))
    browse.tap()
    let landscape = app.buttons["room-landscape"]
    XCTAssertTrue(landscape.waitForExistence(timeout: 8))
    landscape.tap()
    let familyArea = app.buttons["area-family"]
    XCTAssertTrue(familyArea.waitForExistence(timeout: 8))
    familyArea.tap()
    XCTAssertTrue(app.buttons["An unhurried morning"].waitForExistence(timeout: 8))
  }

  // Open the hub and name a becoming by completing the pre-filled starter (leaves you at
  // the thread's anchor step). The stored statement is `becomingStarter + completion`.
  private func startBecoming(_ app: XCUIApplication, completing completion: String) {
    let capture = app.buttons["capture-button"]
    XCTAssertTrue(capture.waitForExistence(timeout: 10))
    capture.tap()
    type(completion, into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()
  }

  func testStartingASecondBecomingInAnAreaOffersToRetireTheFirst() {
    let app = launchEmptyApp()

    // First becoming, anchored to Family (no existing one, so no prompt), then leave.
    startBecoming(app, completing: "stays calm")
    let family1 = app.buttons["workshop-area-Family"]
    XCTAssertTrue(family1.waitForExistence(timeout: 8))
    family1.tap()
    let leave1 = app.buttons["workshop-leave"]
    XCTAssertTrue(leave1.waitForExistence(timeout: 8))
    leave1.tap()

    // Second becoming, Family again — now the thread offers to retire the first.
    startBecoming(app, completing: "has plenty")
    let family2 = app.buttons["workshop-area-Family"]
    XCTAssertTrue(family2.waitForExistence(timeout: 8))
    family2.tap()
    let changed = app.buttons["Changed direction"]
    XCTAssertTrue(changed.waitForExistence(timeout: 5))
    changed.tap()

    // The thread then advances to the first dimension for the new becoming.
    let prefilled = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "ordinary Tuesday")).firstMatch
    XCTAssertTrue(prefilled.waitForExistence(timeout: 5))
    app.buttons["workshop-leave"].tap()

    // Identity Studio: the new becoming is active, the first is retired with its reason.
    app.tabBars.buttons["Browse"].tap()
    let room = app.buttons["room-identity-studio"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(
      app.staticTexts[becomingStarter + "has plenty"].firstMatch.waitForExistence(timeout: 5))
    // The first becoming now sits under Retired becomings with its reason — scroll down
    // until that reason itself comes into view (the list realises rows lazily).
    let retiredReason = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "Changed direction")).firstMatch
    var tries = 0
    while !retiredReason.exists && tries < 8 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(retiredReason.waitForExistence(timeout: 3))
  }

  func testRetiringABecomingMovesItToTheRetiredGroupWithItsReason() {
    let app = launchEmptyApp()

    // Name a becoming, then leave the thread — the becoming itself is already saved.
    app.buttons["capture-button"].tap()
    type("has plenty", into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()
    let leave = app.buttons["workshop-leave"]
    XCTAssertTrue(leave.waitForExistence(timeout: 8))
    leave.tap()

    // Into Identity Studio — the becoming is listed under Becomings.
    app.tabBars.buttons["Browse"].tap()
    let room = app.buttons["room-identity-studio"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.staticTexts["Becomings"].waitForExistence(timeout: 5))
    XCTAssertTrue(
      app.staticTexts[becomingStarter + "has plenty"].firstMatch.waitForExistence(timeout: 5))

    // Retire it, choosing a reason.
    let retire = app.buttons["Retire…"].firstMatch
    XCTAssertTrue(retire.waitForExistence(timeout: 5))
    retire.tap()
    app.buttons["No longer desired"].tap()

    // It now sits under Retired becomings (at the foot of the list) with its reason —
    // scroll down until that group comes into view.
    let retiredHeader = app.staticTexts["Retired becomings"]
    var tries = 0
    while !retiredHeader.exists && tries < 6 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(retiredHeader.waitForExistence(timeout: 3))
    let retiredReason = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "No longer desired")).firstMatch
    XCTAssertTrue(retiredReason.waitForExistence(timeout: 3))
  }
}
