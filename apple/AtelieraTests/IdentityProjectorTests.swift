import XCTest

@testable import Ateliera

// P5: the pure Identity Studio projection (parity with projectIdentityStudioRoom).
final class IdentityProjectorTests: XCTestCase {
  private func note(
    id: String, title: String = "", cardType: String, semanticType: String = "growth",
    rooms: [String] = ["identity-studio"], updated: String = "2026-01-01T00:00:00.000Z",
    extra: [(String, YamlNode)] = []
  ) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: title.isEmpty ? nil : title, body: "body", id: id,
      created: "2026-01-01T00:00:00.000Z", room: "identity-studio")
    n.status = "active"
    n.cardType = cardType
    n.semanticType = semanticType
    n.rooms = rooms
    n.updated = updated
    n.extraFrontmatter = extra
    return (path: "\(id).md", note: n)
  }

  func testProjectsAllSevenSections() {
    let notes = IdentitySection.allCases.map {
      note(id: $0.rawValue, cardType: $0.cardType)
    }
    let board = IdentityProjector.project(notes: notes)
    for section in IdentitySection.allCases {
      XCTAssertEqual(board.sections[section]?.count, 1, "section \(section.rawValue)")
    }
  }

  func testLegacyCardTypeMapping() {
    // card_type "principle" → values-principles section.
    let board = IdentityProjector.project(notes: [note(id: "A", cardType: "principle")])
    XCTAssertEqual(board.sections[.valuesPrinciples]?.map { $0.id }, ["A"])
  }

  func testEvidenceLinkingByRelatedNotes() {
    let identity = note(id: "IDN", cardType: "identity-truth")
    let reflection = note(
      id: "REF", cardType: "reflection", semanticType: "reflection",
      rooms: ["reflection-garden"], extra: [("related_notes", .list(["IDN"]))])
    let board = IdentityProjector.project(notes: [identity, reflection])
    let card = board.sections[.alreadyTrue]?.first
    XCTAssertEqual(card?.evidence.map { $0.id }, ["REF"])
  }

  func testCurrentlyBecomingFromViewState() {
    let n = note(id: "PN", cardType: "identity-emerging")  // practicing-now
    let board = IdentityProjector.project(notes: [n], currentlyBecomingOrder: ["PN"])
    XCTAssertEqual(board.currentlyBecoming?.id, "PN")
  }

  func testCurrentlyBecomingFallsBackToLegacyFoyer() {
    let n = note(id: "LEG", cardType: "identity", rooms: ["identity-studio", "foyer"])
    let board = IdentityProjector.project(notes: [n])
    XCTAssertEqual(board.currentlyBecoming?.id, "LEG")
  }

  func testOnlyPracticingNowEligibleForPromotion() {
    // An already-true note named in the promote order is NOT promotable → nil.
    let n = note(id: "AT", cardType: "identity-truth")
    let board = IdentityProjector.project(notes: [n], currentlyBecomingOrder: ["AT"])
    XCTAssertNil(board.currentlyBecoming)
  }

  func testSectionManualOrder() {
    let a = note(id: "A", cardType: "identity-emerging", updated: "2026-05-01T00:00:00.000Z")
    let b = note(id: "B", cardType: "identity-emerging", updated: "2026-01-01T00:00:00.000Z")
    let board = IdentityProjector.project(
      notes: [a, b], sectionOrders: [.practicingNow: ["B", "A"]])
    XCTAssertEqual(board.sections[.practicingNow]?.map { $0.id }, ["B", "A"])
  }

  func testSectionForCardTypeMatchesWeb() {
    // The section-id-style card types return nil (they are not real card types).
    XCTAssertEqual(Identity.sectionForCardType("identity-truth"), .alreadyTrue)
    XCTAssertEqual(Identity.sectionForCardType("principle"), .valuesPrinciples)
    XCTAssertEqual(Identity.sectionForCardType("feeling"), .desiredFeelings)
    XCTAssertEqual(Identity.sectionForCardType("identity"), .practicingNow)
    XCTAssertEqual(Identity.sectionForCardType("value"), .valuesPrinciples)
    XCTAssertNil(Identity.sectionForCardType("values-principles"))
    XCTAssertNil(Identity.sectionForCardType("embodiment-cues"))
    XCTAssertNil(Identity.sectionForCardType("unknown"))
  }
}
