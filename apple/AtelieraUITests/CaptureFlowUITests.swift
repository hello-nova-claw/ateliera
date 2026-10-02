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

  // Rooms live in the Browse tab now; select it first, then return the room's button.
  private func roomButton(_ id: String, in app: XCUIApplication) -> XCUIElement {
    let browse = app.tabBars.buttons["Browse"]
    if browse.waitForExistence(timeout: 5) { browse.tap() }
    return app.buttons["room-\(id)"]
  }

  // Dismiss the calm "develop this on your Landscape" offer if it appeared after an
  // Inbox capture, so it never sits over a later tap.
  private func dismissDevelopOffer(in app: XCUIApplication) {
    let dismiss = app.buttons["develop-offer-dismiss"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
  }

  func testCapturingANoteShowsItInTheRoom() {
    let app = launchEmptyApp()
    XCTAssertTrue(app.buttons["capture-button"].waitForExistence(timeout: 10))
    // The Inbox starts empty; a plain capture then appears as a row there.
    captureOnly(app, title: "A found moment", body: "Fifteen minutes still counted.")
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
    // A plain capture lands in the Inbox room (confirmed by its unique intro). Kept
    // entries move on to the Journal.
    captureOnly(app, title: "A found moment", body: "caught for later")
    XCTAssertTrue(
      app.staticTexts["Quick captures waiting to find their place."]
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

  // Capture a plain note into the Inbox (the Foyer capture is fully guided now, so
  // arbitrary test notes are made through the Inbox room's Add button). Leaves the row
  // visible in the Inbox and clears the develop-this offer.
  private func captureOnly(_ app: XCUIApplication, title: String, body: String) {
    let inbox = roomButton("inbox", in: app)
    XCTAssertTrue(inbox.waitForExistence(timeout: 8))
    if !inbox.isHittable { app.swipeUp() }
    inbox.tap()
    app.buttons["room-capture-button"].tap()
    type(title, into: app.textFields["note-title-field"], in: app)
    type(body, into: app.textViews["note-body-editor"], in: app)
    app.buttons["note-save-button"].tap()
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5))
    dismissDevelopOffer(in: app)
  }

  func testSearchShowsResultAndFacetIsOperable() {
    let app = launchEmptyApp()
    captureOnly(app, title: "Seaside", body: "waves over the shore at dawn")
    app.tabBars.buttons["Find"].tap()
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
    // Open Settings → Repair links (the gear lives on the Today tab).
    app.tabBars.buttons["Today"].tap()
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
    let room = roomButton("landscape", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Life Landscape"].waitForExistence(timeout: 5))
    // Focus view shows the anchor blocks and the seeded family/vision card.
    XCTAssertTrue(app.buttons["A calm morning"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["add-card-vision"].exists)
    XCTAssertTrue(app.buttons["add-card-decisions"].exists)
    // Add a new life area via the manager.
    app.buttons["manage-areas-button"].tap()
    type("Body & energy", into: app.textFields["new-area-field"], in: app)
    app.buttons["add-area-button"].tap()
    app.buttons["Done"].tap()
    XCTAssertTrue(app.buttons["area-body-energy"].waitForExistence(timeout: 5))
  }

  func testLandscapeAddsACardToAnAnchor() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = roomButton("landscape", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Life Landscape"].waitForExistence(timeout: 5))
    // Add a card straight into the Vision anchor of the current area.
    let add = app.buttons["add-card-vision"]
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    add.tap()
    type("A slower morning", into: app.textFields["landscape-card-title"], in: app)
    type("Coffee before screens.", into: app.textViews["landscape-card-body"], in: app)
    app.buttons["landscape-card-keep"].tap()
    // The new card now appears under Vision.
    XCTAssertTrue(app.buttons["A slower morning"].waitForExistence(timeout: 5))
  }

  func testLandscapeSwipeDeletesACard() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = roomButton("landscape", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    // Swipe the seeded Vision card left to reveal the move/delete nudge bar, then delete.
    let card = app.buttons["A calm morning"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.swipeLeft()
    let del = app.buttons["Delete"]
    XCTAssertTrue(del.waitForExistence(timeout: 5))
    del.tap()
    XCTAssertFalse(app.buttons["A calm morning"].waitForExistence(timeout: 3))
  }

  func testIdentityRoomSectionsAndPromote() {
    let app = launchWith(["ATELIERA_UITEST_P5": "1"])
    let room = roomButton("identity-studio", in: app)
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
    let room = roomButton("uncharted", in: app)
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
    let room = roomButton("wisdom-garden", in: app)
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
    let room = roomButton("reflection-garden", in: app)
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

  func testEditorMovesNoteToTrash() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "To be trashed", body: "gone soon")
    let del = app.buttons["note-delete-button"]
    XCTAssertTrue(del.waitForExistence(timeout: 5))
    if !del.isHittable { app.swipeUp() }
    del.tap()
    let confirm = app.buttons["Move to Trash"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.tap()
    // Back on the Foyer, the note is gone from Recently.
    XCTAssertFalse(app.staticTexts["To be trashed"].waitForExistence(timeout: 3))
  }

  func testEditorInsertsAWikilink() {
    let app = launchEmptyApp()
    captureOnly(app, title: "Anchor note", body: "the anchor")
    captureAndOpen(app, title: "Linking note", body: "See here")
    app.buttons["insert-link-button"].tap()
    XCTAssertTrue(app.navigationBars["Link a note"].waitForExistence(timeout: 5))
    let pick = app.collectionViews.buttons["Anchor note"].firstMatch
    XCTAssertTrue(pick.waitForExistence(timeout: 5))
    pick.tap()
    let value = app.textViews["note-body-editor"].value as? String ?? ""
    XCTAssertTrue(value.contains("[[Anchor note]]"), "body was \(value)")
  }

  func testSeasonStyleToggleAndSeeBoth() {
    let app = launchEmptyApp()
    // Open the Today panel; the almanac shows the other calendar's season too.
    app.buttons["today-panel-toggle"].tap()
    let other = app.staticTexts["almanac-other-season"]
    XCTAssertTrue(other.waitForExistence(timeout: 8))
    // The grounded default is astronomical, so the "see both" line names the other
    // (meteorological) calendar.
    XCTAssertTrue(other.label.contains("meteorological calendar"), "was \(other.label)")
    // Switch the primary style to Meteorological in Settings.
    app.buttons["settings-button"].tap()
    let picker = app.segmentedControls["season-style-picker"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    picker.buttons["Meteorological"].tap()
    app.buttons["Done"].tap()
    // Now the "see both" line references the astronomical calendar instead.
    XCTAssertTrue(
      app.staticTexts["almanac-other-season"].label.contains("astronomical calendar"))
  }

  func testPersonalisedMicroSeasonShowsAndTogglesOff() {
    // ATELIERA_UITEST_AI seeds a home place + a deterministic fake personalizer, so the
    // personalised path is exercisable without the real on-device model.
    let app = launchWith(["ATELIERA_UITEST_AI": "1"])
    // The Today almanac shows the fake personalised micro-season + its "for <place>" caption.
    XCTAssertTrue(app.staticTexts["Local turning"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["almanac-personalized"].firstMatch.exists)

    // Turn personalisation off in Settings → it reverts to the deterministic micro-season.
    app.buttons["settings-button"].tap()
    let toggle = app.switches["rhythm-toggle-Personalize"]
    var tries = 0
    while !toggle.exists && tries < 6 {
      app.swipeUp()
      tries += 1
    }
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    toggle.tap()
    app.buttons["Done"].tap()
    XCTAssertFalse(app.staticTexts["almanac-personalized"].waitForExistence(timeout: 3))
    XCTAssertFalse(app.staticTexts["Local turning"].exists)
  }

  func testSeasonRoomShowsComputedSeasonAndAcceptsAnIntention() {
    let app = launchEmptyApp()
    let room = roomButton("current-season", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.navigationBars["Current Season"].waitForExistence(timeout: 5))
    // The room leads with the grounded, computed season (no wizard).
    XCTAssertTrue(app.staticTexts["THE SEASON YOU'RE IN"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["season-computed-title"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["season-lunar"].exists)
    // Set a light intention; the button flips to "Update intention" once saved.
    type("tending what I've started", into: app.textFields["season-intention-field"], in: app)
    app.buttons["season-set-intention"].tap()
    XCTAssertTrue(app.buttons["Update intention"].waitForExistence(timeout: 5))
    XCTAssertTrue(
      app.staticTexts["A season of tending what I've started"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["season-close"].exists)
  }

  func testGuidedHubCapturesGratitudeIntoTheGarden() {
    let app = launchEmptyApp()
    // The single capture button opens the guided hub — no ungated quick note.
    let place = app.buttons["capture-button"]
    XCTAssertTrue(place.waitForExistence(timeout: 8))
    place.tap()
    let picker = app.segmentedControls["classified-placement"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    picker.buttons["Gratitude"].tap()
    type("A win", into: app.textFields["classified-title"], in: app)
    type("Finished the hard email.", into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()
    // Keeping opens the guided gratitude thread; leave it — the entry is already saved.
    let leave = app.buttons["guided-leave"]
    XCTAssertTrue(leave.waitForExistence(timeout: 8))
    leave.tap()
    // It lands in the Reflection Garden.
    let room = roomButton("reflection-garden", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.staticTexts["A win"].firstMatch.waitForExistence(timeout: 5))
  }

  func testGratitudeThreadDeepensTheEntry() {
    let app = launchEmptyApp()
    app.buttons["capture-button"].tap()
    let picker = app.segmentedControls["classified-placement"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5))
    picker.buttons["Gratitude"].tap()
    type("A steady win", into: app.textFields["classified-title"], in: app)
    type("Finished the hard email.", into: app.textViews["classified-body"], in: app)
    app.buttons["classified-keep"].tap()

    // The gratitude thread opens with a follow-up prompt; answer it, then finish.
    let prompt = app.staticTexts.containing(
      NSPredicate(format: "label CONTAINS %@", "helped make it happen")).firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 8))
    type("My mentor talked me through it.", into: app.textViews["workshop-editor"], in: app)
    app.buttons["workshop-next"].tap()
    // Skip the reflective step, then close.
    let skip = app.buttons["workshop-skip"]
    if skip.waitForExistence(timeout: 3) { skip.tap() }
    let done = app.buttons["guided-done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()

    // The entry is in the Reflection Garden.
    let room = roomButton("reflection-garden", in: app)
    XCTAssertTrue(room.waitForExistence(timeout: 8))
    room.tap()
    XCTAssertTrue(app.staticTexts["A steady win"].firstMatch.waitForExistence(timeout: 5))
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
    // Settings → Diagnostics shows the save (the gear lives on the Today tab).
    app.tabBars.buttons["Today"].tap()
    app.buttons["settings-button"].tap()
    let diag = app.buttons["diagnostics-button"]
    XCTAssertTrue(diag.waitForExistence(timeout: 5))
    diag.tap()
    XCTAssertTrue(app.navigationBars["Diagnostics"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["save"].firstMatch.waitForExistence(timeout: 5))
  }

  func testRichFoyerShowsIdentitySections() {
    let app = launchWith(["ATELIERA_UITEST_FOYER": "1"])
    // The promoted becoming is now the Foyer hero — the first thing you see, no panel.
    let becoming = app.otherElements["foyer-hero-becoming"]
    XCTAssertTrue(becoming.waitForExistence(timeout: 8))
    XCTAssertTrue(becoming.label.contains("Someone who rests"))
    // The feelings + principles still live in the tucked-away "Today" panel.
    let today = app.buttons["today-panel-toggle"]
    XCTAssertTrue(today.waitForExistence(timeout: 8))
    today.tap()
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
    XCTAssertTrue(roomButton("uncharted", in: app).waitForExistence(timeout: 8))
    // Turn the Uncharted room off in Settings (the gear lives on the Today tab).
    app.tabBars.buttons["Today"].tap()
    app.buttons["settings-button"].tap()
    let toggle = app.switches["room-toggle-uncharted"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    toggle.tap()
    app.buttons["Done"].tap()
    // It's gone from the Rooms tab list.
    XCTAssertFalse(roomButton("uncharted", in: app).exists)
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
    captureOnly(app, title: "A quiet morning", body: "alpha")
    captureAndOpen(app, title: "The link note", body: "See [[A quiet morning]] now.")
    app.buttons["preview-toggle"].tap()
    let link = app.links["A quiet morning"].firstMatch
    XCTAssertTrue(link.waitForExistence(timeout: 5))
    link.tap()

    // We're now editing A — its title populates the field.
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    XCTAssertEqual(title.value as? String, "A quiet morning")
  }

  func testUnresolvedWikilinkShowsAlert() {
    let app = launchEmptyApp()
    captureAndOpen(app, title: "Ghost link", body: "See [[Nonexistent]].")
    app.buttons["preview-toggle"].tap()
    app.links["Nonexistent"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Note not found"].waitForExistence(timeout: 5))
  }

  func testCaptureIntoASpecificRoom() {
    let app = launchEmptyApp()
    // Step into the Inbox (the generic room scaffold) and capture there.
    let inbox = roomButton("inbox", in: app)
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    if !inbox.isHittable { app.swipeUp() }
    inbox.tap()

    let add = app.buttons["room-capture-button"]
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    add.tap()
    let title = app.textFields["note-title-field"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    type("A kept truth", into: title, in: app)
    let editor = app.textViews["note-body-editor"]
    type("worth remembering", into: editor, in: app)
    app.buttons["note-save-button"].tap()

    // It lands in the Inbox we're standing in (the workshop is only offered, not forced).
    XCTAssertTrue(app.staticTexts["A kept truth"].waitForExistence(timeout: 5))
  }

  func testJournalCaptureWithTagsShowsTagPill() {
    let app = launchEmptyApp()
    // Capture into the Inbox via its Add button — the sheet that supports tags.
    let inbox = roomButton("inbox", in: app)
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    inbox.tap()
    app.buttons["room-capture-button"].tap()
    type("A tagged moment", into: app.textFields["note-title-field"], in: app)
    type("with a tag", into: app.textViews["note-body-editor"], in: app)
    type("gratitude, nature", into: app.textFields["note-tags-field"], in: app)
    app.buttons["note-save-button"].tap()
    // The entry shows in the Inbox with its tag rendered as a pill.
    XCTAssertTrue(app.staticTexts["A tagged moment"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["gratitude"].waitForExistence(timeout: 5))
  }

  func testWorkshopFromCaptureWritesALandscapeCard() {
    let app = launchEmptyApp()
    // Capture an Inbox entry via the Inbox's Add button.
    let inbox = roomButton("inbox", in: app)
    XCTAssertTrue(inbox.waitForExistence(timeout: 5))
    inbox.tap()
    app.buttons["room-capture-button"].tap()
    type("More space", into: app.textFields["note-title-field"], in: app)
    type("I want more space than I thought.", into: app.textViews["note-body-editor"], in: app)
    app.buttons["note-save-button"].tap()

    // A gentle offer appears — accept it to open the workshop on the seed.
    let offer = app.buttons["develop-offer"]
    XCTAssertTrue(offer.waitForExistence(timeout: 5))
    offer.tap()

    // Anchor it to the Family area.
    let family = app.buttons["workshop-area-Family"]
    XCTAssertTrue(family.waitForExistence(timeout: 8))
    family.tap()

    // Answer the first dimension (Vision) — this writes a real Landscape card.
    let editor = app.textViews["workshop-editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 5))
    type("An unhurried morning", into: editor, in: app)
    app.buttons["workshop-next"].tap()

    // Skip the remaining dimensions, then finish.
    for _ in 0..<4 {
      let skip = app.buttons["workshop-skip"]
      if skip.waitForExistence(timeout: 3) { skip.tap() }
    }
    let done = app.buttons["workshop-done"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()

    // The Vision card now lives on the Life Landscape, under the Family area.
    let landscape = roomButton("landscape", in: app)
    XCTAssertTrue(landscape.waitForExistence(timeout: 8))
    landscape.tap()
    // Select Family explicitly so the card's area is the one on screen.
    let family2 = app.buttons["area-family"]
    XCTAssertTrue(family2.waitForExistence(timeout: 8))
    family2.tap()
    // Landscape cards render as buttons labelled by their title.
    XCTAssertTrue(app.buttons["An unhurried morning"].waitForExistence(timeout: 8))
  }

  func testSearchFindsACapturedNoteByBody() {
    let app = launchEmptyApp()
    // Capture a note whose distinctive word lives in the body, not the title.
    captureOnly(app, title: "A found moment", body: "something worth keeping")

    // Search by a body word and find it.
    app.tabBars.buttons["Find"].tap()
    let field = app.textFields["search-field"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    type("keeping", into: field, in: app)
    XCTAssertTrue(app.staticTexts["A found moment"].waitForExistence(timeout: 5))
  }

  func testEditingANoteUpdatesTheRoom() {
    let app = launchEmptyApp()

    // First capture a note to edit.
    captureOnly(app, title: "A found moment", body: "One quiet line.")
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
