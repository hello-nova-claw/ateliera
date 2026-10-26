import XCTest

@testable import Ateliera

// The 24 micro-seasons are content, bundled as Content/micro-seasons.json — the same
// file, byte for byte, as packages/rhythm/src/content/micro-seasons.json.
final class MicroSeasonsContentTests: XCTestCase {
  private func table() throws -> [[String: Any]] {
    try XCTUnwrap(try contentResource("micro-seasons") as? [[String: Any]])
  }

  func testHoldsTheTwentyFourMicroSeasonsInCalendarOrder() throws {
    let terms = try table()
    XCTAssertEqual(terms.count, 24)
    XCTAssertEqual(terms.first?["term"] as? String, "The Deep Quiet")
    XCTAssertEqual(terms.first?["gloss"] as? String, "the year at its stillest, everything held")
    XCTAssertEqual(terms.last?["term"] as? String, "The Long Night")
    for entry in terms {
      XCTAssertEqual(Set(entry.keys), ["month", "day", "term", "gloss"])
    }
  }

  func testIsTheTableTheEngineResolvesAgainst() throws {
    for entry in try table() {
      let month = try XCTUnwrap(entry["month"] as? Int)
      let day = try XCTUnwrap(entry["day"] as? Int)
      let resolved = Rhythm.resolveMicroSeason(month: month, day: day, hemisphere: .north)
      XCTAssertEqual(resolved.term, entry["term"] as? String)
      XCTAssertEqual(resolved.gloss, entry["gloss"] as? String)
    }
  }
}
