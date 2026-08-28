import XCTest

@testable import Ateliera

// P6 (Wisdom): domain golden values, projection, and the store's add/synthesize.
final class WisdomTests: XCTestCase {
  func testKindSemanticTypes() {
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "principle"), "foundations")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "synthesis"), "foundations")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "practice"), "growth")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "question"), "uncharted")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "insight"), "reflection")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "quote"), "reflection")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "resource"), "reflection")
  }

  func testDefaultThemesGolden() {
    XCTAssertEqual(WisdomDomain.defaultThemes.count, 13)
    XCTAssertEqual(WisdomDomain.defaultThemes.first, WisdomTheme(id: "alignment", title: "Alignment"))
    XCTAssertEqual(
      WisdomDomain.defaultThemes.last,
      WisdomTheme(id: "nervous-system-care", title: "Nervous-system care"))
  }

  func testTitleForTheme() {
    XCTAssertEqual(WisdomDomain.titleForTheme("decision-making"), "Decision Making")
  }

  private func note(id: String, kind: String, tags: [String]) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: "Idea \(id)", body: "wisdom body", id: id, created: "2026-01-01T00:00:00.000Z",
      room: "wisdom-garden")
    n.status = "active"
    n.cardType = kind
    n.semanticType = WisdomDomain.semanticType(forKind: kind)
    n.tags = tags
    return (path: "\(id).md", note: n)
  }

  func testProjectionCountsThemes() {
    let notes = [
      note(id: "A", kind: "quote", tags: ["identity"]),
      note(id: "B", kind: "insight", tags: ["identity", "rest"]),
    ]
    let projection = WisdomProjection.project(notes: notes)
    XCTAssertEqual(projection.cards.count, 2)
    let identity = projection.themes.first { $0.id == "identity" }
    XCTAssertEqual(identity?.count, 2)
    let rest = projection.themes.first { $0.id == "rest" }
    XCTAssertEqual(rest?.count, 1)
  }

  func testProjectionExcludesNonWisdomNotes() {
    var other = note(id: "X", kind: "quote", tags: [])
    other.note.rooms = ["inbox"]
    XCTAssertTrue(WisdomProjection.project(notes: [other]).cards.isEmpty)
  }

  // Store integration over a real vault.
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("wisdom-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testAddIdeaWritesThemedKindedNote() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    XCTAssertTrue(
      wisdom.addIdea(
        kind: "quote", title: "Keep going", body: "The obstacle is the way.",
        themes: ["rest"], source: NoteSource(title: nil, creator: "Marcus", url: nil)))
    let card = wisdom.projection.cards.first
    XCTAssertEqual(card?.kind, "quote")
    XCTAssertEqual(card?.themes, ["rest"])
    XCTAssertEqual(card?.source?.creator, "Marcus")
    XCTAssertEqual(wisdom.projection.themes.first { $0.id == "rest" }?.count, 1)
  }

  func testSynthesizeCreatesSynthesisCardWithSources() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    _ = wisdom.addIdea(kind: "insight", title: "One", body: "first", themes: [], source: nil)
    _ = wisdom.addIdea(kind: "insight", title: "Two", body: "second", themes: [], source: nil)
    let ids = wisdom.projection.cards.map { $0.id }
    XCTAssertEqual(ids.count, 2)
    XCTAssertTrue(wisdom.synthesize(sourceIds: ids, title: "Woven", body: "a bigger picture"))
    let synth = wisdom.projection.cards.first { $0.kind == "synthesis" }
    XCTAssertNotNil(synth)
    // Re-read the synthesis note: it records the source ids.
    let reread = try XCTUnwrap(store.beginEdit(path: synth!.path))
    XCTAssertEqual(reread.note.sourceNoteIds?.sorted(), ids.sorted())
  }
}
