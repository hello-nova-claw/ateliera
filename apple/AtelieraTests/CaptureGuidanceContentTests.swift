import XCTest

@testable import Ateliera

// Context-guided capture copy is content, bundled as Content/capture-guidance.json.
final class CaptureGuidanceContentTests: XCTestCase {
  func testHoldsTheGenericGuidedAndFoyerCaptureCopy() throws {
    let library = try contentObject("capture-guidance")
    XCTAssertEqual(Set(library.keys), ["generic", "celebration", "possibilities", "foyer"])
    let foyer = try XCTUnwrap(library["foyer"] as? [String: [String: String]])
    XCTAssertEqual(Set(foyer.keys), ["foyer-becoming", "foyer-feeling", "foyer-principle"])
    let generic = try XCTUnwrap(library["generic"] as? [String: String])
    XCTAssertEqual(generic["title"], "Hold this thought")
  }

  func testTheCaptureSheetSaysWhatItAlwaysSaid() {
    XCTAssertEqual(CaptureGuidance.generic.prompt, "What would you like remembered?")
    XCTAssertEqual(CaptureGuidance.celebration.title, "Celebrate something")
    XCTAssertEqual(
      CaptureGuidance.possibilities.example, "e.g. What if we spent a whole winter somewhere warm?")
    XCTAssertEqual(CaptureGuidance.foyer(.feeling).example, "e.g. Unhurried.")
    XCTAssertEqual(CaptureGuidance.foyer(.principle).prompt, "What supports this life?")
  }
}
