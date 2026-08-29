import XCTest

@testable import Ateliera

// P6 (Reflection): the store over a real vault — connect evidence, and pair Then-&-Now.
final class ReflectionStoreTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("reflection-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testConnectEvidenceUnionMergesFrontmatter() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let reflection = ReflectionStore(store: store)
    XCTAssertTrue(reflection.keep(kind: "reflection", body: "a change I noticed"))
    let card = try XCTUnwrap(reflection.garden.cards.first)

    XCTAssertTrue(
      reflection.connectEvidence(
        card: card, noteIds: ["note-1"], lifeAreas: ["work"], seasons: ["spring"]))
    // A second connection unions rather than replaces.
    let refreshed = try XCTUnwrap(reflection.garden.cards.first)
    XCTAssertTrue(reflection.connectEvidence(card: refreshed, noteIds: ["note-2"], lifeAreas: ["work"]))

    let reread = try XCTUnwrap(store.beginEdit(path: card.path))
    XCTAssertEqual(reread.note.frontmatterList("related_notes"), ["note-1", "note-2"])
    XCTAssertEqual(reread.note.lifeAreas, ["work"])
    XCTAssertEqual(reread.note.seasons, ["spring"])
  }

  func testConnectEvidenceRefusesNonReflectionNotes() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    // A note whose semantic type is neither reflection nor celebration.
    XCTAssertTrue(store.capture(title: "Note", body: "x", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let editable = try XCTUnwrap(store.beginEdit(path: path))
    var note = editable.note
    note.semanticType = "foundations"
    XCTAssertTrue(store.saveEdit(editable, updatedNote: note))
    let card = ReflectionCard(
      id: note.id, path: path, title: "Note", excerpt: "x", created: note.created,
      semanticType: "foundations", lifeAreas: [], seasons: [], tags: [],
      linkedNoteIds: [], evidence: [], thenNoteId: nil, coverReference: nil)
    let reflection = ReflectionStore(store: store)
    XCTAssertFalse(reflection.connectEvidence(card: card, noteIds: ["x"]))
    XCTAssertNotNil(reflection.error)
  }

  func testLinkThenSetsAndClearsThenNoteId() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let reflection = ReflectionStore(store: store)
    XCTAssertTrue(reflection.keep(kind: "reflection", body: "now"))
    XCTAssertTrue(reflection.keep(kind: "reflection", body: "then"))
    let now = try XCTUnwrap(reflection.garden.cards.first)
    let then = try XCTUnwrap(reflection.garden.cards.last)

    XCTAssertTrue(reflection.linkThen(card: now, thenNoteId: then.id))
    XCTAssertEqual(reflection.garden.cards.first { $0.id == now.id }?.thenNoteId, then.id)

    // Clearing removes the key.
    let refreshed = try XCTUnwrap(reflection.garden.cards.first { $0.id == now.id })
    XCTAssertTrue(reflection.linkThen(card: refreshed, thenNoteId: nil))
    let reread = try XCTUnwrap(store.beginEdit(path: now.path))
    XCTAssertNil(reread.note.frontmatterScalar("then_note_id"))
  }
}
