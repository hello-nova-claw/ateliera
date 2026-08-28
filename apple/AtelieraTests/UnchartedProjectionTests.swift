import XCTest

@testable import Ateliera

// P6 (Uncharted): the pure near/beyond projection.
final class UnchartedProjectionTests: XCTestCase {
  private func note(
    id: String, rooms: [String] = ["uncharted"], semanticType: String = "uncharted",
    created: String = "2026-01-01T00:00:00.000Z", extra: [(String, YamlNode)] = []
  ) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: "Possibility \(id)", body: "what if \(id)", id: id, created: created,
      room: "uncharted")
    n.status = "active"
    n.cardType = "possibility"
    n.rooms = rooms
    n.semanticType = semanticType
    n.extraFrontmatter = extra
    return (path: "\(id).md", note: n)
  }

  func testNearDefaultHorizon() {
    let cards = UnchartedProjection.project(notes: [note(id: "A")])
    XCTAssertEqual(cards.first?.horizon, .near)
  }

  func testBeyondGateFlagHorizon() {
    let cards = UnchartedProjection.project(
      notes: [note(id: "A", extra: [("beyond_gate", .bool(true))])])
    XCTAssertEqual(cards.first?.horizon, .beyond)
  }

  func testBelongsBySemanticTypeEvenWithoutRoomTag() {
    let cards = UnchartedProjection.project(
      notes: [note(id: "A", rooms: ["inbox"], semanticType: "uncharted")])
    XCTAssertEqual(cards.count, 1)
  }

  func testExcludesNonUnchartedNotes() {
    let other = note(id: "X", rooms: ["reflection-garden"], semanticType: "reflection")
    XCTAssertTrue(UnchartedProjection.project(notes: [other]).isEmpty)
  }

  func testSeasonsCarriedThrough() {
    var loaded = note(id: "A")
    loaded.note.seasons = ["spring-2026"]
    XCTAssertEqual(UnchartedProjection.project(notes: [loaded]).first?.seasons, ["spring-2026"])
  }
}
