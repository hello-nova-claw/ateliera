import XCTest

@testable import Ateliera

// P6 (Season): the store over a real vault — begin, walk the wizard, activate, close.
final class SeasonStoreTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("season-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private func completeWizard(_ season: SeasonStore) {
    XCTAssertTrue(season.saveStep(.priorReflection(text: "looking back", skipped: false)))
    XCTAssertTrue(season.saveStep(.feelings(feelings: ["calm"], statement: "steadiness")))
    XCTAssertTrue(season.saveStep(.priorities(["a"])))
    XCTAssertTrue(season.saveStep(.decisionsPractices(decisions: [], practices: ["walk"])))
    XCTAssertTrue(season.saveStep(.supportsConstraints(supports: ["mornings"], constraints: [])))
    XCTAssertTrue(season.saveStep(.enough("one true thing")))
    XCTAssertTrue(season.saveStep(.notNow(["everything else"])))
    XCTAssertTrue(season.saveStep(.confirm))
  }

  func testLoadWithNoSeasonIsNil() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertNil(SeasonStore(store: store).record)
  }

  func testBeginCreatesDraft() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let season = SeasonStore(store: store)
    XCTAssertTrue(season.beginSeason(title: "Spring", startsOn: "2026-03-01", endsOn: nil))
    XCTAssertEqual(season.record?.state.title, "Spring")
    XCTAssertEqual(season.record?.state.status, .draft)
    XCTAssertEqual(season.record?.state.startsOn, "2026-03-01")
    XCTAssertTrue(store.notes.contains { $0.title == "Spring" })
  }

  func testWizardThroughActivate() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let season = SeasonStore(store: store)
    XCTAssertTrue(season.beginSeason(title: "Spring", startsOn: nil, endsOn: nil))
    completeWizard(season)
    XCTAssertTrue(season.activate())
    XCTAssertEqual(season.record?.state.status, .active)
    XCTAssertEqual(season.record?.state.feelings, ["calm"])
    XCTAssertEqual(season.record?.state.practices, ["walk"])
  }

  func testActivateBeforeCompletingFails() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let season = SeasonStore(store: store)
    XCTAssertTrue(season.beginSeason(title: "Spring", startsOn: nil, endsOn: nil))
    XCTAssertFalse(season.activate())  // steps incomplete
    XCTAssertEqual(season.record?.state.status, .draft)
  }

  func testCloseArchivesAndWritesLetter() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let season = SeasonStore(store: store)
    XCTAssertTrue(season.beginSeason(title: "Spring", startsOn: nil, endsOn: nil))
    completeWizard(season)
    XCTAssertTrue(season.activate())

    let reflection = SeasonCloseReflection(
      celebration: "we did", learning: "a lot", identity: "braver",
      dispositions: [SeasonCloseDisposition(noteId: "a", title: "a", disposition: "archive")])
    XCTAssertTrue(season.close(reflection))
    // No active/draft season remains, and a closing letter was filed.
    XCTAssertNil(season.record)
    XCTAssertTrue(store.notes.contains { $0.title == "A letter from Spring" })
  }
}
