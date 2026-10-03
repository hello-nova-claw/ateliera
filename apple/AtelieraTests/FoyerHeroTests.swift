import XCTest

@testable import Ateliera

// The Foyer hero: the user's current becoming is the first meaningful thing on the home
// screen, with the app wordmark receded to a quiet rail. Pure selection + empty-state
// logic, so the view stays a thin render over it.
final class FoyerHeroTests: XCTestCase {
  private func card(_ id: String, _ title: String, excerpt: String = "") -> IdentityCardModel {
    IdentityCardModel(
      id: id, path: "\(id).md", title: title, excerpt: excerpt, semanticType: "growth",
      hash: "", created: "2026-01-01T00:00:00.000Z", evidence: [])
  }

  private func becoming(_ id: String, _ title: String, created: String) -> BecomingModel {
    BecomingModel(
      id: id, path: "\(id).md", title: title, excerpt: "", lifeAreaId: nil, created: created)
  }

  func testPrefersPromotedCurrentlyBecoming() {
    let board = IdentityBoardModel(
      currentlyBecoming: card("PN", "Someone who rests", excerpt: "A gentler pace."),
      sections: [:],
      activeBecomings: [becoming("B1", "Someone wealthy", created: "2026-05-01T00:00:00.000Z")])
    let hero = FoyerHeroModel(board)
    guard case .becoming(let statement, let path) = hero else {
      return XCTFail("expected a becoming hero, got \(hero)")
    }
    XCTAssertEqual(statement, "Someone who rests")
    XCTAssertEqual(path, "PN.md")
  }

  func testFallsBackToNewestActiveBecoming() {
    let board = IdentityBoardModel(
      currentlyBecoming: nil, sections: [:],
      activeBecomings: [
        becoming("NEW", "Someone steady", created: "2026-06-01T00:00:00.000Z"),
        becoming("OLD", "Someone brave", created: "2026-01-01T00:00:00.000Z"),
      ])
    let hero = FoyerHeroModel(board)
    guard case .becoming(let statement, let path) = hero else {
      return XCTFail("expected a becoming hero, got \(hero)")
    }
    // activeBecomings arrive newest-first from the projector; the hero takes the first.
    XCTAssertEqual(statement, "Someone steady")
    XCTAssertEqual(path, "NEW.md")
  }

  func testEmptyBoardInvitesBeginning() {
    XCTAssertEqual(FoyerHeroModel(.empty), .invite)
  }

  func testBlankBecomingTitleFallsThroughToInvite() {
    // A becoming with only whitespace for a title is not a hero worth showing.
    let board = IdentityBoardModel(
      currentlyBecoming: nil, sections: [:],
      activeBecomings: [becoming("B", "   ", created: "2026-01-01T00:00:00.000Z")])
    XCTAssertEqual(FoyerHeroModel(board), .invite)
  }
}
