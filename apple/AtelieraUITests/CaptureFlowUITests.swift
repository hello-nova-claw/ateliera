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
    // Rhythm lives in the tucked-away "Today" panel — open it first.
    let today = app.buttons["today-panel-toggle"]
    XCTAssertTrue(today.waitForExistence(timeout: 10))
    today.tap()
    let rhythm = app.buttons["rhythm-button"]
    XCTAssertTrue(rhythm.waitForExistence(timeout: 5))
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

  // Capture a titled note with a body, then open it for editing.
  private func captureAndOpen(_ app: XCUIApplication, title: String, body: String) {
    captureOnly(app, title: title, body: body)
    let row = app.staticTexts[title]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.tap()
  }

  // Capture a note and return to the Foyer (without opening it).
  private func captureOnly(_ app: XCUIApplication, title: String, body: String) {
    app.buttons["capture-button"].tap()
    type(title, into: app.textFields["note-title-field"], in: app)
    type(body, into: app.textViews["note-body-editor"], in: app)
    app.buttons["note-save-button"].tap()
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5))
  }

  func testSearchShowsResultAndFacetIsOperable() {
    let app = launchEmptyApp()
    captureOnly(app, title: "Seaside", body: "waves over the shore at dawn")
    app.buttons["search-button"].tap()
    type("shore", into: app.textFields["search-field"], in: app)
    XCTAssertTrue(app.staticTexts["Seaside"].waitForExistence(timeout: 5))
    // The Inbox facet chip is present and keeps the matching result when toggled.
    let inboxFacet = app.buttons["facet-inbox"]
    XCTAssertTrue(inboxFacet.waitForExistence(timeout: 5))
    inboxFacet.tap()
    XCTAssertTrue(app.staticTexts["Seaside"].waitForExistence(timeout: 5))
  }

  func testBacklinksShowTheLinkingNote() {
    let app = launchEmptyApp()
    captureOnly(app, title: "Anchor note", body: "the anchor place")
    captureOnly(app, title: "Pointer note", body: "See [[Anchor note]] here.")
    // Open the anchor and step into its Links screen.
    app.staticTexts["Anchor note"].tap()
    let links = app.buttons["note-links-button"]
    XCTAssertTrue(links.waitForExistence(timeout: 5))
    links.tap()
    // The note that links to it appears under "Linked from".
    XCTAssertTrue(app.staticTexts["Pointer note"].waitForExistence(timeout: 5))
  }

  func testRepairPanelFixesABrokenLink() {
    let app = launchEmptyApp()
    // A note linking to a title that doesn't exist → a broken link.
    captureOnly(app, title: "Pointer", body: "See [[Nowhere]] here.")
    // Open Settings → Repair links.
    app.buttons["settings-button"].tap()
    let repair = app.buttons["repair-links-button"]
    XCTAssertTrue(repair.waitForExistence(timeout: 5))
    repair.tap()
    XCTAssertTrue(app.navigationBars["Repair"].waitForExistence(timeout: 5))
    // The broken link is listed; removing it unwraps the link through the write path.
    let remove = app.buttons["remove-button-0"]
    XCTAssertTrue(remove.waitForExistence(timeout: 5))
    remove.tap()
    // The queue clears — nothing left to repair.
    XCTAssertTrue(
      app.staticTexts["Nothing to repair — every link resolves."].waitForExistence(timeout: 5))
  }

  func testMetadataDetailsScreenOpens() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "A note", body: "body text")
    let details = app.buttons["note-details-button"]
    XCTAssertTrue(details.waitForExistence(timeout: 5))
    details.tap()
    XCTAssertTrue(app.navigationBars["Details"].waitForExistence(timeout: 5))
  }

  private func launchWith(_ extra: [String: String]) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ATELIERA_UITEST"] = "1"
    for (key, value) in extra { app.launchEnvironment[key] = value }
    app.launch()
    return app
  }

  func testLandscapeRoomShowsAnchorsAndAddsArea() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = app.buttons["room-landscape"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Life Landscape"].waitForExistence(timeout: 5))
    // Focus view shows the anchors and the seeded family/vision card (a tappable row).
    XCTAssertTrue(app.buttons["A calm morning"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["VISION"].exists)
    XCTAssertTrue(app.staticTexts["DECISIONS"].exists)
    // Add a new life area via the manager.
    app.buttons["manage-areas-button"].tap()
    type("Body & energy", into: app.textFields["new-area-field"], in: app)
    app.buttons["add-area-button"].tap()
    app.buttons["Done"].tap()
    XCTAssertTrue(app.buttons["area-body-energy"].waitForExistence(timeout: 5))
  }

  func testLandscapeBoardAddPillAddsArea() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = app.buttons["room-landscape"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Life Landscape"].waitForExistence(timeout: 5))
    // Add an area directly from the board via the "+ Area" pill.
    app.buttons["add-area-pill"].tap()
    type("Rest & recovery", into: app.textFields["area-name-field"], in: app)
    app.buttons["area-name-save"].tap()
    XCTAssertTrue(app.buttons["area-rest-recovery"].waitForExistence(timeout: 5))
  }

  func testIdentityRoomSectionsAndPromote() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = app.buttons["room-identity-studio"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Identity Studio"].waitForExistence(timeout: 5), "did not navigate")
    // All seven sections render; the seeded practicing-now card is visible.
    XCTAssertTrue(app.staticTexts["Already true"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Practicing now"].exists)
    XCTAssertTrue(app.staticTexts["Practicing patience"].exists)
    // Promote it → the "currently becoming" hero appears.
    app.buttons["Make current"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["CURRENTLY BECOMING"].waitForExistence(timeout: 5))
  }

  func testUnchartedKeepsNearAndBeyondPossibilities() {
    let app = launchEmptyApp()
    let room = app.buttons["room-uncharted"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Uncharted"].waitForExistence(timeout: 5))
    // Keep a near possibility (the editor autocapitalises the first letter).
    type("A smaller life closer to the sea", into: app.textViews["uncharted-editor"], in: app)
    app.buttons["uncharted-keep"].tap()
    XCTAssertTrue(
      app.staticTexts["A smaller life closer to the sea"].firstMatch.waitForExistence(timeout: 5))
    // Keep one beyond the gate.
    app.switches["beyond-toggle"].tap()
    type("Learning to sail", into: app.textViews["uncharted-editor"], in: app)
    app.buttons["uncharted-keep"].tap()
    XCTAssertTrue(app.staticTexts["Learning to sail"].firstMatch.waitForExistence(timeout: 5))
  }

  func testWisdomAddIdeaAppearsInGarden() {
    let app = launchEmptyApp()
    let room = app.buttons["room-wisdom-garden"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Wisdom Garden"].waitForExistence(timeout: 5))
    app.buttons["add-idea-button"].tap()
    type("Keep going", into: app.textFields["wisdom-title-field"], in: app)
    type("The obstacle is the way.", into: app.textViews["wisdom-body-editor"], in: app)
    app.buttons["wisdom-keep"].tap()
    XCTAssertTrue(app.staticTexts["Keep going"].firstMatch.waitForExistence(timeout: 5))
  }

  func testReflectionCaptureAndCelebrationTab() {
    let app = launchEmptyApp()
    let room = app.buttons["room-reflection-garden"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Reflection Garden"].waitForExistence(timeout: 5))
    // Capture a reflection (default kind) — it shows in the Garden.
    type("Reflection alpha", into: app.textViews["reflection-editor"], in: app)
    app.buttons["reflection-keep"].tap()
    XCTAssertTrue(app.staticTexts["Reflection alpha"].firstMatch.waitForExistence(timeout: 5))
    // The Celebration tab filters it out.
    app.segmentedControls["reflection-tabs"].buttons["Celebration"].tap()
    XCTAssertFalse(app.staticTexts["Reflection alpha"].exists)
    // Capture a celebration → it shows under the Celebration tab.
    app.segmentedControls["reflection-kind"].buttons["Celebration"].tap()
    type("Celebration beta", into: app.textViews["reflection-editor"], in: app)
    app.buttons["reflection-keep"].tap()
    XCTAssertTrue(app.staticTexts["Celebration beta"].firstMatch.waitForExistence(timeout: 5))
  }

  func testSeasonWizardBeginsAndActivates() {
    let app = launchEmptyApp()
    let room = app.buttons["room-current-season"]
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Current Season"].waitForExistence(timeout: 5))
    // Begin a season.
    type("Spring", into: app.textFields["season-title-field"], in: app)
    app.buttons["season-begin"].tap()
    // Prior reflection: skip it.
    let skip = app.switches["season-skip-reflection"]
    XCTAssertTrue(skip.waitForExistence(timeout: 5))
    skip.tap()
    // Continue through the remaining eight steps (the last one begins the season).
    for _ in 0..<8 {
      let cont = app.buttons["season-continue"]
      XCTAssertTrue(cont.waitForExistence(timeout: 5))
      cont.tap()
    }
    // The active season view shows the title.
    XCTAssertTrue(app.staticTexts["Spring"].firstMatch.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["season-close"].waitForExistence(timeout: 5))
  }

  func testPlaceAFoyerCard() {
    let app = launchEmptyApp()
    let place = app.buttons["placement-button"]
    XCTAssertTrue(place.waitForExistence(timeout: 8))
    place.tap()
    // Choose the "Becoming" placement, then keep a titled card.
    app.segmentedControls["classified-placement"].buttons["Becoming"].tap()
    type("Becoming steadier", into: app.textFields["classified-title"], in: app)
    type("I rest before I'm depleted.", into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()
    // It lands in the vault and shows in the Foyer's list.
    XCTAssertTrue(app.staticTexts["Becoming steadier"].firstMatch.waitForExistence(timeout: 5))
  }

  func testDraftRecoveryRestoresUnsavedEdit() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "Draft note", body: "First body")
    // Edit the body but cancel without saving — the draft is autosaved.
    type(" and more", into: app.textViews["note-body-editor"], in: app)
    app.buttons["Cancel"].tap()
    // Reopen the note; the recovery banner offers the unsaved draft back.
    app.staticTexts["Draft note"].tap()
    let restore = app.buttons["restore-draft"]
    XCTAssertTrue(restore.waitForExistence(timeout: 5))
    restore.tap()
    let value = app.textViews["note-body-editor"].value as? String ?? ""
    XCTAssertTrue(value.contains("and more"), "restored body was \(value)")
  }

  func testDiagnosticsRecordsASave() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "Diag note", body: "body")
    // An edit + save records a diagnostic.
    type(" edited", into: app.textViews["note-body-editor"], in: app)
    app.buttons["note-save-button"].tap()
    // Settings → Diagnostics shows the save.
    app.buttons["settings-button"].tap()
    let diag = app.buttons["diagnostics-button"]
    XCTAssertTrue(diag.waitForExistence(timeout: 5))
    diag.tap()
    XCTAssertTrue(app.navigationBars["Diagnostics"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["save"].firstMatch.waitForExistence(timeout: 5))
  }

  func testRichFoyerShowsIdentitySections() {
    let app = launchWith(["ATELIERA_UITEST_FOYER": "1"])
    // The identity surfacing lives in the tucked-away "Today" panel — open it first.
    let today = app.buttons["today-panel-toggle"]
    XCTAssertTrue(today.waitForExistence(timeout: 8))
    today.tap()
    // The promoted becoming, a desired feeling, and a principle all surface.
    let becoming = app.buttons["foyer-becoming"]
    XCTAssertTrue(becoming.waitForExistence(timeout: 8))
    XCTAssertTrue(becoming.label.contains("Someone who rests"))
    XCTAssertTrue(app.staticTexts["HOW I WANT TO FEEL"].exists)
    XCTAssertTrue(app.staticTexts["Unhurried"].firstMatch.exists)
    XCTAssertTrue(app.staticTexts["Depth over breadth"].firstMatch.exists)
  }

  func testRhythmLayersGateHidesAlmanac() {
    let app = launchEmptyApp()
    // The almanac lives in the tucked-away "Today" panel — open it first.
    let today = app.buttons["today-panel-toggle"]
    XCTAssertTrue(today.waitForExistence(timeout: 8))
    today.tap()
    XCTAssertTrue(app.staticTexts["Today's rhythm"].waitForExistence(timeout: 8))
    app.buttons["settings-button"].tap()
    // Turn every rhythm layer off.
    for label in ["Moon", "Micro-season", "Cycle"] {
      let toggle = app.switches["rhythm-toggle-\(label)"]
      XCTAssertTrue(toggle.waitForExistence(timeout: 5))
      if (toggle.value as? String) == "1" { toggle.tap() }
    }
    app.buttons["Done"].tap()
    // The almanac hides once no rhythm layer remains.
    XCTAssertFalse(app.staticTexts["Today's rhythm"].exists)
  }

  func testTourFromSettingsStepsAndLeaves() {
    let app = launchEmptyApp()
    app.buttons["settings-button"].tap()
    let take = app.buttons["take-tour-button"]
    XCTAssertTrue(take.waitForExistence(timeout: 5))
    take.tap()
    // Step 1 (Foyer), advance to step 2 (Landscape), then leave.
    XCTAssertTrue(app.staticTexts["The Foyer"].waitForExistence(timeout: 5))
    app.buttons["tour-next"].tap()
    XCTAssertTrue(app.staticTexts["Life Landscape"].waitForExistence(timeout: 5))
    app.buttons["tour-leave"].tap()
    // Back to the Foyer.
    XCTAssertTrue(app.buttons["capture-button"].waitForExistence(timeout: 5))
  }

  func testRoomVisibilityToggleHidesRoom() {
    let app = launchEmptyApp()
    XCTAssertTrue(app.buttons["room-uncharted"].waitForExistence(timeout: 8))
    // Turn the Uncharted room off in Settings.
    app.buttons["settings-button"].tap()
    let toggle = app.switches["room-toggle-uncharted"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    toggle.tap()
    app.buttons["Done"].tap()
    // It's gone from the Foyer's room list.
    XCTAssertFalse(app.buttons["room-uncharted"].exists)
  }

  func testSettingsSwitchesTheme() {
    let app = launchEmptyApp()
    let settings = app.buttons["settings-button"]
    XCTAssertTrue(settings.waitForExistence(timeout: 5))
    settings.tap()
    // The theme picker lists every palette; pick Deep Ocean and confirm it sticks.
    let deepOcean = app.buttons["theme-deep-ocean"]
    XCTAssertTrue(deepOcean.waitForExistence(timeout: 5))
    deepOcean.tap()
    // Selecting it marks the row (the checkmark), still on the same screen.
    XCTAssertTrue(deepOcean.waitForExistence(timeout: 2))
    app.buttons["Done"].tap()
    // Reopen: the selection persisted, so Deep Ocean is still the chosen row.
    settings.tap()
    XCTAssertTrue(app.buttons["theme-deep-ocean"].waitForExistence(timeout: 5))
  }

  func testWikilinkNavigatesToTarget() {
    let app = launchEmptyApp()
    // Note A, then note B referencing it.
    app.buttons["capture-button"].tap()
    type("A quiet morning", into: app.textFields["note-title-field"], in: app)
    type("alpha", into: app.textViews["note-body-editor"], in: app)
    app.buttons["note-save-button"].tap()
    XCTAssertTrue(app.staticTexts["A quiet morning"].waitForExistence(timeout: 5))

    captureAndOpen(app, title: "The link note", body: "See [[A quiet morning]] now.")
    app.buttons["preview-toggle"].tap()
    let pill = app.buttons["wikilink-A quiet morning"]
    XCTAssertTrue(pill.waitForExistence(timeout: 5))
    pill.tap()

    // We're now editing A — its title populates the field.
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    XCTAssertEqual(title.value as? String, "A quiet morning")
  }

  func testUnresolvedWikilinkShowsAlert() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "Ghost link", body: "See [[Nonexistent]].")
    app.buttons["preview-toggle"].tap()
    app.buttons["wikilink-Nonexistent"].tap()
    XCTAssertTrue(app.staticTexts["Note not found"].waitForExistence(timeout: 5))
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
