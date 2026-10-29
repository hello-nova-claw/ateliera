import XCTest

@testable import Ateliera

// The vaults the UI tests launch into are seeded by VaultStore. These tests pin what each
// fixture writes, so a UI test that looks for "Someone who rests" or a due wish fails
// here first, with a reason, rather than as a missing element on a screen.
final class UITestFixtureTests: XCTestCase {
  private func makeVault() throws -> URL {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("fixture-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func open(_ dir: URL) throws -> VaultStore {
    let store = VaultStore(discovering: false)
    try store.openForTesting(at: dir)
    return store
  }

  func testGiftFixtureSeedsOneDueWish() throws {
    let dir = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    VaultStore.seedGiftFixture(at: dir)
    let store = try open(dir)
    let wishes = store.parsedNotesByPath.filter { $0.note.resurfaceKind == "wish" }
    XCTAssertEqual(wishes.count, 1)
    XCTAssertEqual(wishes.first?.path, "Reflection Garden/a-wish.md")
    XCTAssertEqual(wishes.first?.note.resurfaceDue, "2020-01-01", "far in the past, so always due")
    XCTAssertEqual(wishes.first?.note.resurfaceIntervalDays, 6)
    XCTAssertEqual(wishes.first?.note.title, "A wish worth keeping")
  }

  func testConstellationFixtureSeedsTwoLinkedJournalEntries() throws {
    let dir = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    VaultStore.seedConstellationFixture(at: dir)
    let store = try open(dir)
    let journal = store.parsedNotesByPath.filter { $0.path.hasPrefix("Journal/") }
    XCTAssertEqual(journal.count, 2)
    XCTAssertTrue(journal.allSatisfy { $0.note.status == "active" && $0.note.tags == ["calm"] })
    let first = journal.first { $0.path == "Journal/a-quiet-morning.md" }
    XCTAssertEqual(first?.note.title, "A quiet morning")
    let later = journal.first { $0.path == "Journal/a-later-thought.md" }
    XCTAssertTrue(
      later?.note.body.contains("[[A quiet morning]]") ?? false, "the line between the dots")
    XCTAssertEqual(
      WikilinkNavigator.resolvePath(target: "A quiet morning", in: store.liveNotes),
      "Journal/a-quiet-morning.md", "the link resolves to the first note")
  }

  func testFoyerFixtureSeedsAPromotedBecomingAFeelingAndAPrinciple() throws {
    let dir = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    VaultStore.seedFoyerFixture(at: dir)
    let store = try open(dir)
    let board = store.foyerIdentity()
    XCTAssertEqual(board.currentlyBecoming?.title, "Someone who rests")
    XCTAssertEqual(board.sections[.desiredFeelings]?.map(\.title), ["Unhurried"])
    XCTAssertEqual(board.sections[.valuesPrinciples]?.map(\.title), ["Depth over breadth"])
  }

  func testP5FixtureSeedsALandscapeCardAndAPracticingNowCard() throws {
    let dir = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    VaultStore.seedP5Fixture(at: dir)
    let store = try open(dir)
    let landscape = store.parsedNotesByPath.first { $0.path == "Life Landscape/a-calm-morning.md" }
    XCTAssertEqual(landscape?.note.lifeAreas, ["family"])
    XCTAssertEqual(landscape?.note.landscapeAnchor, "vision")
    XCTAssertEqual(landscape?.note.status, "active")
    let identity = store.parsedNotesByPath.first {
      $0.path == "Identity Studio/practicing-patience.md"
    }
    XCTAssertEqual(identity?.note.cardType, "identity-emerging")
    XCTAssertEqual(
      store.foyerIdentity().sections[.practicingNow]?.map(\.title), ["Practicing patience"])
  }
}
