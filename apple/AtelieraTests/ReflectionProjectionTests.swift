import XCTest

@testable import Ateliera

// P6 (Reflection): chronology + evidence-connection resolution.
final class ReflectionProjectionTests: XCTestCase {
  private func note(
    id: String, semanticType: String = "reflection", created: String,
    lifeAreas: [String] = [], seasons: [String] = [], tags: [String] = [],
    status: String = "active", cardType: String = "reflection",
    extra: [(String, YamlNode)] = []
  ) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: "Entry \(id)", body: "reflected on \(id)", id: id, created: created,
      room: "reflection-garden")
    n.status = status
    n.cardType = cardType
    n.semanticType = semanticType
    n.lifeAreas = lifeAreas
    n.seasons = seasons
    n.tags = tags
    n.extraFrontmatter = extra
    return (path: "\(id).md", note: n)
  }

  func testChronologicalNewestFirst() {
    let cards = ReflectionProjection.project(notes: [
      note(id: "old", created: "2026-01-01T00:00:00.000Z"),
      note(id: "new", created: "2026-06-01T00:00:00.000Z"),
    ]).cards
    XCTAssertEqual(cards.map { $0.id }, ["new", "old"])
  }

  func testCelebrationIncludedBySemanticType() {
    let cards = ReflectionProjection.project(notes: [
      note(id: "C", semanticType: "celebration", created: "2026-01-01T00:00:00.000Z", cardType: "celebration")
    ]).cards
    XCTAssertEqual(cards.first?.semanticType, "celebration")
  }

  func testEvidenceNoteAvailableArchivedMissing() {
    let target = note(id: "T", created: "2026-01-01T00:00:00.000Z")
    let archivedTarget = note(id: "AR", created: "2026-01-01T00:00:00.000Z", status: "archived")
    let source = note(
      id: "S", created: "2026-02-01T00:00:00.000Z",
      extra: [("related_notes", .list(["T", "AR", "GONE"]))])
    let card = ReflectionProjection.project(notes: [target, archivedTarget, source]).cards
      .first { $0.id == "S" }
    let byTarget = Dictionary(uniqueKeysWithValues: (card?.evidence ?? []).map { ($0.targetId, $0.state) })
    XCTAssertEqual(byTarget["T"], .available)
    XCTAssertEqual(byTarget["AR"], .archived)
    XCTAssertEqual(byTarget["GONE"], .missing)
  }

  func testEvidenceLifeAreaHiddenIsArchived() {
    let source = note(id: "S", created: "2026-02-01T00:00:00.000Z", lifeAreas: ["family", "secret"])
    let areas = [
      ReflectionLifeAreaTarget(id: "family", title: "Family", hidden: false),
      ReflectionLifeAreaTarget(id: "secret", title: "Secret", hidden: true),
    ]
    let card = ReflectionProjection.project(notes: [source], lifeAreas: areas).cards.first
    let byId = Dictionary(uniqueKeysWithValues: (card?.evidence ?? []).map { ($0.targetId, $0.state) })
    XCTAssertEqual(byId["family"], .available)
    XCTAssertEqual(byId["secret"], .archived)
  }

  func testEvidenceSeasonActive() {
    var season = note(
      id: "SEA", semanticType: "growth", created: "2026-01-01T00:00:00.000Z", status: "active",
      cardType: "season", extra: [("season_id", .scalar("spring-2026"))])
    season.note.title = "Spring"
    let source = note(id: "S", created: "2026-02-01T00:00:00.000Z", seasons: ["spring-2026"])
    let card = ReflectionProjection.project(notes: [season, source]).cards.first { $0.id == "S" }
    let connection = card?.evidence.first { $0.kind == .season }
    XCTAssertEqual(connection?.state, .available)
    XCTAssertEqual(connection?.label, "Spring")
  }

  func testThemesCountedAndSorted() {
    let garden = ReflectionProjection.project(notes: [
      note(id: "A", created: "2026-01-01T00:00:00.000Z", tags: ["calm", "work"]),
      note(id: "B", created: "2026-02-01T00:00:00.000Z", tags: ["calm"]),
    ])
    XCTAssertEqual(garden.themes.map { $0.name }, ["calm", "work"])  // calm(2) before work(1)
    XCTAssertEqual(garden.themes.first?.count, 2)
  }

  func testThenNoteAndCoverCarried() {
    var loaded = note(
      id: "S", created: "2026-02-01T00:00:00.000Z", extra: [("then_note_id", .scalar("PAST"))])
    loaded.note.display = NoteDisplay(cover: "cover.jpg", featured: false)
    let card = ReflectionProjection.project(notes: [loaded]).cards.first
    XCTAssertEqual(card?.thenNoteId, "PAST")
    XCTAssertEqual(card?.coverReference, "cover.jpg")
  }
}
