import XCTest

@testable import Ateliera

// P5: the pure Life Landscape board projection (parity with projectLandscapeBoard).
final class LandscapeProjectorTests: XCTestCase {
  private func note(
    id: String, title: String = "", body: String = "body",
    lifeAreas: [String], anchor: String?, featured: Bool = false,
    status: String = "active", updated: String = "2026-01-01T00:00:00.000Z",
    extra: [(String, YamlNode)] = []
  ) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: title.isEmpty ? nil : title, body: body, id: id,
      created: "2026-01-01T00:00:00.000Z", room: "reflection-garden")
    n.status = status
    n.lifeAreas = lifeAreas
    n.landscapeAnchor = anchor
    n.updated = updated
    n.display = NoteDisplay(cover: nil, featured: featured)
    n.extraFrontmatter = extra
    return (path: "\(id).md", note: n)
  }

  func testEmptyBoardWhenNoNotes() {
    let board = LandscapeProjector.project(notes: [], areas: ["family"])
    XCTAssertEqual(board.cells.count, 5)  // one per anchor
    XCTAssertTrue(board.cells.allSatisfy { $0.featured == nil && $0.additionalCount == 0 })
  }

  func testSingleNoteAppearsInCorrectCell() {
    let board = LandscapeProjector.project(
      notes: [note(id: "A", lifeAreas: ["family"], anchor: "vision")], areas: ["family"])
    let cell = board.cell(area: "family", anchor: .vision)
    XCTAssertEqual(cell?.featured?.id, "A")
    XCTAssertEqual(board.cell(area: "family", anchor: .decisions)?.featured, nil)
  }

  func testManualOrderOverride() {
    let notes = [
      note(id: "A", lifeAreas: ["family"], anchor: "vision", updated: "2026-05-01T00:00:00.000Z"),
      note(id: "B", lifeAreas: ["family"], anchor: "vision", updated: "2026-01-01T00:00:00.000Z"),
    ]
    let board = LandscapeProjector.project(
      notes: notes, areas: ["family"],
      orders: ["landscape:family:vision": ["B", "A"]])
    XCTAssertEqual(board.cell(area: "family", anchor: .vision)?.cards.map { $0.id }, ["B", "A"])
  }

  func testFeaturedCardPromotedToIndex0() {
    // A is newer (would sort first) but B is featured → B leads.
    let notes = [
      note(id: "A", lifeAreas: ["family"], anchor: "vision", updated: "2026-05-01T00:00:00.000Z"),
      note(
        id: "B", lifeAreas: ["family"], anchor: "vision", featured: true,
        updated: "2026-01-01T00:00:00.000Z"),
    ]
    let board = LandscapeProjector.project(notes: notes, areas: ["family"])
    XCTAssertEqual(board.cell(area: "family", anchor: .vision)?.featured?.id, "B")
  }

  func testAdditionalCountIsCorrect() {
    let notes = ["A", "B", "C"].map { note(id: $0, lifeAreas: ["family"], anchor: "vision") }
    let cell = LandscapeProjector.project(notes: notes, areas: ["family"])
      .cell(area: "family", anchor: .vision)
    XCTAssertEqual(cell?.cards.count, 3)
    XCTAssertEqual(cell?.additionalCount, 2)
  }

  func testDecisionHorizonParsedFromExtraFrontmatter() {
    let n = note(
      id: "A", lifeAreas: ["family"], anchor: "decisions",
      extra: [("decision_horizon", .scalar("30d"))])
    let cell = LandscapeProjector.project(notes: [n], areas: ["family"])
      .cell(area: "family", anchor: .decisions)
    XCTAssertEqual(cell?.featured?.decisionHorizon, .d30)
  }

  func testExcludedNoteNotProjected() {
    let n = note(
      id: "A", lifeAreas: ["family"], anchor: "vision",
      extra: [("excluded_from_views", .bool(true))])
    XCTAssertNil(
      LandscapeProjector.project(notes: [n], areas: ["family"]).cell(area: "family", anchor: .vision)?
        .featured)
  }

  func testArchivedNoteNotProjected() {
    let n = note(id: "A", lifeAreas: ["family"], anchor: "vision", status: "archived")
    XCTAssertNil(
      LandscapeProjector.project(notes: [n], areas: ["family"]).cell(area: "family", anchor: .vision)?
        .featured)
  }

  func testMultipleAreasIncludesNoteInBothCells() {
    let n = note(id: "A", lifeAreas: ["family", "work-business"], anchor: "vision")
    let board = LandscapeProjector.project(notes: [n], areas: ["family", "work-business"])
    XCTAssertEqual(board.cell(area: "family", anchor: .vision)?.featured?.id, "A")
    XCTAssertEqual(board.cell(area: "work-business", anchor: .vision)?.featured?.id, "A")
  }
}
