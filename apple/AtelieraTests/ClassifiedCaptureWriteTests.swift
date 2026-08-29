import XCTest

@testable import Ateliera

// P7: the classified capture write path over a real vault.
final class ClassifiedCaptureWriteTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("classified-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private func onlyNote(_ store: VaultStore) throws -> StudioNote {
    XCTAssertEqual(store.parsedNotesByPath.count, 1)
    return try XCTUnwrap(store.parsedNotesByPath.first?.note)
  }

  func testIdentityCaptureWritesToIdentityStudio() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: nil, body: "I keep my word", destination: .identity(.alreadyTrue)))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    XCTAssertTrue(path.hasPrefix("Identity Studio/"))
    let note = try onlyNote(store)
    XCTAssertEqual(note.cardType, "identity-truth")
    XCTAssertEqual(note.semanticType, "foundations")
    XCTAssertEqual(note.rooms, ["identity-studio"])
    XCTAssertEqual(note.status, "active")
  }

  func testLandscapeDecisionsWritesHorizonAndFolder() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(
      store.capture(
        title: nil, body: "choose the sabbatical",
        destination: .landscape(lifeArea: "Work & Money", anchor: .decisions, horizon: .d60)))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    XCTAssertTrue(path.hasPrefix("Life Landscape/Work & Money/"))
    let note = try onlyNote(store)
    XCTAssertEqual(note.landscapeAnchor, "decisions")
    XCTAssertEqual(note.lifeAreas, ["Work & Money"])
    XCTAssertEqual(note.frontmatterScalar("decision_horizon"), "60d")
  }

  func testWisdomCaptureDeduplicatesThemesAndKeepsSource() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(
      store.capture(
        title: "Keep going", body: "the obstacle is the way",
        destination: .wisdom(
          kind: "quote", themes: ["rest", "rest", "identity"],
          source: NoteSource(title: nil, creator: "Marcus", url: "https://example.com"),
          sourceNoteIds: ["abc"])))
    let note = try onlyNote(store)
    XCTAssertEqual(note.cardType, "quote")
    XCTAssertEqual(note.tags, ["rest", "identity"])
    XCTAssertEqual(note.source?.creator, "Marcus")
    XCTAssertEqual(note.sourceNoteIds, ["abc"])
  }

  func testUnchartedBeyondWritesGate() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: nil, body: "learning to sail", destination: .uncharted(beyond: true)))
    let note = try onlyNote(store)
    XCTAssertTrue(note.frontmatterBool("beyond_gate"))
    XCTAssertEqual(note.semanticType, "uncharted")
  }

  func testFoyerCaptureSetsFeatured() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: nil, body: "becoming steadier", destination: .foyer(.becoming)))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    XCTAssertTrue(path.hasPrefix("Foyer/"))
    let note = try onlyNote(store)
    XCTAssertTrue(note.display.featured)
    XCTAssertEqual(note.cardType, "identity")
    XCTAssertEqual(note.rooms, ["foyer", "identity-studio"])
  }

  func testInvalidCaptureWritesNothing() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertFalse(store.capture(title: nil, body: "   ", destination: .quickCapture))
    XCTAssertTrue(store.parsedNotesByPath.isEmpty)
    XCTAssertNotNil(store.error)
  }
}
