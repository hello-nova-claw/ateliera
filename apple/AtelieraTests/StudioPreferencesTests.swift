import XCTest

@testable import Ateliera

// P9: progressive-disclosure preferences — room/section/rhythm visibility + persistence.
final class StudioPreferencesTests: XCTestCase {
  func testNewStudioHidesOptionalRoomsButKeepsCore() {
    let prefs = StoredStudioPreferences.newStudio
    XCTAssertTrue(Preferences.isRoomVisible("landscape", prefs))  // core, always on
    XCTAssertFalse(Preferences.isRoomVisible("uncharted", prefs))  // optional, seeded off
    XCTAssertFalse(Preferences.isRoomVisible("wisdom-garden", prefs))
    XCTAssertFalse(Preferences.isRoomVisible("current-season", prefs))
  }

  func testAbsentPreferencesShowEverything() {
    let prefs = StoredStudioPreferences()  // existing studio, nothing stored
    XCTAssertTrue(Preferences.isRoomVisible("uncharted", prefs))
    XCTAssertTrue(Preferences.isRoomVisible("landscape", prefs))
    XCTAssertTrue(Preferences.isFoyerSectionVisible("feelings", prefs))
  }

  func testFoyerSectionAlmanacGateOnRhythmLayers() {
    var prefs = StoredStudioPreferences()
    XCTAssertTrue(Preferences.isFoyerSectionVisible("almanac", prefs))
    // Turning every rhythm layer off hides the almanac.
    prefs.rhythm = .init(moon: false, microSeason: false, cycle: false)
    XCTAssertFalse(Preferences.isFoyerSectionVisible("almanac", prefs))
    // One layer on is enough.
    prefs.rhythm = .init(moon: false, microSeason: true, cycle: false)
    XCTAssertTrue(Preferences.isFoyerSectionVisible("almanac", prefs))
  }

  func testSectionToggleOverridesEvenWithRhythmOn() {
    var prefs = StoredStudioPreferences()
    prefs.foyerSections["almanac"] = "off"
    XCTAssertFalse(Preferences.isFoyerSectionVisible("almanac", prefs))
  }

  func testPersistenceRoundTrip() {
    let defaults = UserDefaults(suiteName: "prefs-\(UUID().uuidString)")!
    let store = PreferencesStore(defaults: defaults)
    var prefs = StoredStudioPreferences.newStudio
    prefs.rooms["uncharted"] = nil  // reveal it
    store.save(prefs, studioId: "vault-1")
    let loaded = store.load(studioId: "vault-1")
    XCTAssertEqual(loaded, prefs)
    XCTAssertTrue(Preferences.isRoomVisible("uncharted", loaded!))
    // A different vault sees nothing stored.
    XCTAssertNil(store.load(studioId: "vault-2"))
  }
}
