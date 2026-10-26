import XCTest

@testable import Ateliera

// The reverse Possibility workshop's prompts are content, bundled as
// Content/reverse-workshop.json, with {it} standing for the possibility.
final class ReverseWorkshopContentTests: XCTestCase {
  func testHoldsAPromptForEveryRung() throws {
    let library = try contentObject("reverse-workshop")
    XCTAssertEqual(Set(library.keys), ["seed", "decisions", "practices", "structure-strategy"])
    let decisions = try XCTUnwrap(library["decisions"] as? [String: String])
    XCTAssertEqual(Set(decisions.keys), ["90d", "60d", "30d", "this-week", "today"])
  }

  func testTheWorkshopAsksWhatItAlwaysAsked() {
    let steps = ReverseWorkshopPlan.steps
    XCTAssertEqual(
      steps.first?.prompt(seed: "a house by the sea"),
      "Three months from now, on the way to “a house by the sea” — what big decision would already be made?"
    )
    XCTAssertEqual(
      steps.last?.prompt(seed: "  "),
      "What time, space, help, or money would give this possibility room to happen?")
  }
}
