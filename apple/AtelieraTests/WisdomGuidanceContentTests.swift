import XCTest

@testable import Ateliera

// Wisdom field guidance is content, bundled as Content/wisdom-guidance.json — the same
// file as apps/studio/src/content/wisdom-guidance.json.
final class WisdomGuidanceContentTests: XCTestCase {
  func testHoldsGuidanceForTheSevenWisdomFields() throws {
    let library = try contentObject("wisdom-guidance")
    XCTAssertEqual(
      Set(library.keys),
      ["idea", "title", "creator", "sourceTitle", "sourceUrl", "synthesis", "makeItMine"])
    let idea = try XCTUnwrap(library["idea"] as? [String: String])
    XCTAssertEqual(idea["example"], "e.g. You don't rise to your goals; you fall to your systems.")
  }

  func testTheWisdomRoomSaysWhatItAlwaysSaid() throws {
    let library = try contentObject("wisdom-guidance")
    let synthesis = try XCTUnwrap(library["synthesis"] as? [String: String])
    XCTAssertEqual(WisdomGuidance.synthesis.description, synthesis["description"])
    XCTAssertEqual(WisdomGuidance.creator.example, "e.g. James Clear")
  }
}
