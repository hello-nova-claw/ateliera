import XCTest

@testable import Ateliera

// P5 integration: LandscapeStore + IdentityStore over a real on-disk vault through
// VaultStore. The projectors/codecs are unit-tested elsewhere; here we prove the
// stores load config/board, write moves + area config + view-state through the
// atomic path, and re-project.
final class P5StoreTests: XCTestCase {
  private func landscapeNote(
    id: String, lifeAreas: [String], anchor: String, featured: Bool = false
  ) -> StudioNote {
    var n = StudioNote.capture(
      title: "Card \(id)", body: "body", id: id, created: "2026-01-01T00:00:00.000Z",
      room: "landscape")
    n.status = "active"
    n.lifeAreas = lifeAreas
    n.landscapeAnchor = anchor
    n.display = NoteDisplay(cover: nil, featured: featured)
    return n
  }

  private func makeStore(_ seed: [(rel: String, note: StudioNote)]) throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("p5-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (rel, note) in seed {
      let url = dir.appendingPathComponent(rel)
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try note.serialize().data(using: .utf8)!.write(to: url)
    }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // MARK: - Landscape

  func testLandscapeStoreLoadsDefaultAreasAndBoard() throws {
    let (dir, store) = try makeStore([
      ("Life/vision.md", landscapeNote(id: "V1", lifeAreas: ["family"], anchor: "vision"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    XCTAssertEqual(landscape.areas.map { $0.id }.prefix(5).first, "family")
    XCTAssertEqual(landscape.board.cell(area: "family", anchor: .vision)?.featured?.id, "V1")
  }

  func testLandscapeMovePersistsAnchorAndReprojects() throws {
    let (dir, store) = try makeStore([
      ("Life/vision.md", landscapeNote(id: "V1", lifeAreas: ["family"], anchor: "vision"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    let card = try XCTUnwrap(landscape.board.cell(area: "family", anchor: .vision)?.featured)

    XCTAssertTrue(landscape.move(card: card, toAnchor: .decisions))

    // Re-projected: gone from vision, present under decisions.
    XCTAssertNil(landscape.board.cell(area: "family", anchor: .vision)?.featured)
    XCTAssertEqual(landscape.board.cell(area: "family", anchor: .decisions)?.featured?.id, "V1")
    // Persisted to the note file: anchor + card_type + semantic_type updated.
    let reread = try XCTUnwrap(store.beginEdit(path: "Life/vision.md"))
    XCTAssertEqual(reread.note.landscapeAnchor, "decisions")
    XCTAssertEqual(reread.note.cardType, "decisions")
    XCTAssertEqual(reread.note.semanticType, "growth")
  }

  func testLandscapeAddAreaWritesConfigAndAppears() throws {
    let (dir, store) = try makeStore([])
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    XCTAssertFalse(landscape.areas.contains { $0.id == "body-energy" })

    XCTAssertTrue(landscape.addArea(title: "Body & energy"))

    XCTAssertTrue(landscape.areas.contains { $0.id == "body-energy" && $0.title == "Body & energy" })
    // The config file now exists and round-trips.
    let raw = try XCTUnwrap(store.readRawFile(path: LifeAreaConfig.path))
    guard case .ok(let parsed) = LifeAreaConfig.parse(raw.text) else {
      return XCTFail("config did not parse")
    }
    XCTAssertTrue(parsed.contains { $0.id == "body-energy" })
  }

  func testLandscapeReorderWritesViewState() throws {
    let (dir, store) = try makeStore([
      ("Life/a.md", landscapeNote(id: "A", lifeAreas: ["family"], anchor: "vision")),
      ("Life/b.md", landscapeNote(id: "B", lifeAreas: ["family"], anchor: "vision")),
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    XCTAssertTrue(landscape.reorder(area: "family", anchor: .vision, noteIds: ["B", "A"]))
    XCTAssertEqual(
      landscape.board.cell(area: "family", anchor: .vision)?.cards.map { $0.id }, ["B", "A"])
  }

  // MARK: - Identity

  private func identityNote(id: String, cardType: String, rooms: [String] = ["identity-studio"])
    -> StudioNote
  {
    var n = StudioNote.capture(
      title: "Truth \(id)", body: "body", id: id, created: "2026-01-01T00:00:00.000Z",
      room: "identity-studio")
    n.status = "active"
    n.cardType = cardType
    n.rooms = rooms
    return n
  }

  func testIdentityStoreProjectsSection() throws {
    let (dir, store) = try makeStore([
      ("Identity Studio/pn.md", identityNote(id: "PN", cardType: "identity-emerging"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let identity = IdentityStore(store: store)
    XCTAssertEqual(identity.model.sections[.practicingNow]?.map { $0.id }, ["PN"])
  }

  func testIdentityAddCapturesIntoSection() throws {
    let (dir, store) = try makeStore([])
    defer { try? FileManager.default.removeItem(at: dir) }
    let identity = IdentityStore(store: store)
    XCTAssertEqual(identity.model.sections[.alreadyTrue]?.count ?? 0, 0)

    XCTAssertTrue(identity.add(section: .alreadyTrue, title: "I keep my word", body: "and I do."))

    XCTAssertEqual(identity.model.sections[.alreadyTrue]?.count, 1)
    XCTAssertEqual(identity.model.sections[.alreadyTrue]?.first?.title, "I keep my word")
  }

  func testIdentityPromoteSetsCurrentlyBecoming() throws {
    let (dir, store) = try makeStore([
      ("Identity Studio/pn.md", identityNote(id: "PN", cardType: "identity-emerging"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let identity = IdentityStore(store: store)
    XCTAssertNil(identity.model.currentlyBecoming)
    XCTAssertTrue(identity.promote(noteId: "PN"))
    XCTAssertEqual(identity.model.currentlyBecoming?.id, "PN")
  }
}
