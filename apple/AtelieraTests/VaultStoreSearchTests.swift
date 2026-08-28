import XCTest

@testable import Ateliera

// P4 integration: VaultStore wiring the disposable index. The pure ranking/facets/
// link-graph algorithms are golden-tested in SearchIndexTests/LinkGraphTests; here
// we prove reload() builds the index from real parsed notes and the accessors
// (searchHits / facets / backlinks / forwardLinks by path) return the expected shape.
final class VaultStoreSearchTests: XCTestCase {
  private func note(
    id: String, title: String, body: String, room: String, tags: [String] = []
  ) -> StudioNote {
    var n = StudioNote.capture(
      title: title, body: body, id: id, created: "2026-01-01T00:00:00.000Z", room: room)
    n.tags = tags
    return n
  }

  private func makeStore(_ seed: [(rel: String, note: StudioNote)]) throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("search-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (rel, note) in seed {
      let fileURL = dir.appendingPathComponent(rel)
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try note.serialize().data(using: .utf8)!.write(to: fileURL)
    }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private func fixture() throws -> (URL, VaultStore) {
    try makeStore([
      (
        "Reflection Garden/morning.md",
        note(
          id: "MORNING0000000000000000AA", title: "Morning pages",
          body: "\nI wrote about the quiet garden.\n", room: "reflection-garden",
          tags: ["ritual"])
      ),
      (
        "Inbox/evening.md",
        note(
          id: "EVENING0000000000000000BB", title: "Evening",
          body: "\nLinking to [[Morning pages]] here.\n", room: "inbox")
      ),
    ])
  }

  func testSearchHitsFindNoteByBodyToken() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    let hits = store.searchHits("quiet")
    XCTAssertEqual(hits.count, 1)
    XCTAssertEqual(hits.first?.title, "Morning pages")
    XCTAssertEqual(hits.first?.path, "Reflection Garden/morning.md")
  }

  func testSearchRanksTitleMatchFirst() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    // "morning" hits Morning pages' title (score 3) and Evening's wikilink text
    // (body, score 1) → the title match ranks first.
    let hits = store.searchHits("morning")
    XCTAssertEqual(hits.count, 2)
    XCTAssertEqual(hits.first?.title, "Morning pages")
  }

  func testFacetsCountRooms() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    let facets = store.facets("")
    let rooms = Dictionary(uniqueKeysWithValues: facets.rooms.map { ($0.value, $0.count) })
    XCTAssertEqual(rooms["reflection-garden"], 1)
    XCTAssertEqual(rooms["inbox"], 1)
    XCTAssertTrue(facets.tags.contains { $0.value == "ritual" && $0.count == 1 })
  }

  func testBacklinksResolveWikilinkByTitle() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    // Evening links [[Morning pages]] → Morning pages has one backlink from Evening.
    let backlinks = store.backlinks(path: "Reflection Garden/morning.md")
    XCTAssertEqual(backlinks.map { $0.title }, ["Evening"])
    XCTAssertEqual(backlinks.first?.path, "Inbox/evening.md")
  }

  func testForwardLinksTagResolvedState() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    let forward = store.forwardLinks(path: "Inbox/evening.md")
    XCTAssertEqual(forward.count, 1)
    guard case .resolved(let id) = forward.first?.state else {
      return XCTFail("expected the wikilink to resolve, got \(String(describing: forward.first?.state))")
    }
    XCTAssertEqual(id, "MORNING0000000000000000AA")
  }

  func testFilterNarrowsToRoom() throws {
    let (dir, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: dir) }
    // "morning" matches both notes; filtering to the Inbox room keeps only Evening.
    let hits = store.searchHits("morning", filters: SearchFilters(rooms: ["inbox"]))
    XCTAssertEqual(hits.map { $0.title }, ["Evening"])
  }
}
