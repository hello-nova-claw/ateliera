import XCTest

@testable import Ateliera

// The Today card for "How I want to feel": up to three feelings from the Identity board,
// shown only when the section is switched on and there is something to show. Pure, so
// the view stays a thin render over it.
final class DesiredFeelingsCardTests: XCTestCase {
  private func feeling(_ id: String, _ title: String) -> IdentityCardModel {
    IdentityCardModel(
      id: id, path: "\(id).md", title: title, excerpt: "", semanticType: "vision",
      hash: "", created: "2026-01-01T00:00:00.000Z", evidence: [])
  }

  private func board(_ feelings: [IdentityCardModel]) -> IdentityBoardModel {
    IdentityBoardModel(currentlyBecoming: nil, sections: [.desiredFeelings: feelings])
  }

  func testShowsTheFeelingsInBoardOrder() {
    let model = DesiredFeelingsCardModel(
      board([feeling("A", "Unhurried"), feeling("B", "Warm")]), sectionVisible: true)
    XCTAssertEqual(model, .feelings([feeling("A", "Unhurried"), feeling("B", "Warm")]))
  }

  func testKeepsToThreeFeelings() {
    let four = ["A", "B", "C", "D"].map { feeling($0, "Feeling \($0)") }
    let model = DesiredFeelingsCardModel(board(four), sectionVisible: true)
    XCTAssertEqual(model, .feelings(Array(four.prefix(3))))
  }

  func testHiddenWhenThereAreNoFeelings() {
    XCTAssertEqual(DesiredFeelingsCardModel(board([]), sectionVisible: true), .hidden)
    XCTAssertEqual(DesiredFeelingsCardModel(.empty, sectionVisible: true), .hidden)
  }

  func testHiddenWhenTheSectionIsSwitchedOff() {
    let model = DesiredFeelingsCardModel(board([feeling("A", "Unhurried")]), sectionVisible: false)
    XCTAssertEqual(model, .hidden)
  }

  func testSkipsBlankFeelings() {
    let model = DesiredFeelingsCardModel(
      board([feeling("A", "   "), feeling("B", "Warm")]), sectionVisible: true)
    XCTAssertEqual(model, .feelings([feeling("B", "Warm")]))
  }
}
