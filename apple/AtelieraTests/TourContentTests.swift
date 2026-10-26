import XCTest

@testable import Ateliera

// The first-visit tour's room descriptions are content, bundled as Content/tour-steps.json.
final class TourContentTests: XCTestCase {
  func testHoldsADescriptionForEachTourRoom() throws {
    let library = try XCTUnwrap(try contentResource("tour-steps") as? [String: String])
    XCTAssertEqual(Set(library.keys), Set(TourStep.allCases.map(\.rawValue)))
    for step in TourStep.allCases { XCTAssertEqual(step.body, library[step.rawValue]) }
  }

  func testTheTourSaysWhatItAlwaysSaid() {
    XCTAssertTrue(TourStep.foyer.body.hasPrefix("Your calm front room"))
    XCTAssertEqual(
      TourStep.season.body,
      "Name what matters now as a gentle chapter. A season is a humane present focus, not a deadline."
    )
  }
}
