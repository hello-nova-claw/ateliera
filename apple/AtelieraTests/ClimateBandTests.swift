import XCTest

@testable import Ateliera

final class ClimateBandTests: XCTestCase {
  func testBandsByLatitudeBoundaries() {
    let cases: [(Double, ClimateBand)] = [
      (0, .tropical), (23.4, .tropical),
      (23.5, .subtropical), (34.9, .subtropical),
      (35, .temperate), (54.9, .temperate),
      (55, .boreal), (66.4, .boreal),
      (66.5, .polar), (89, .polar),
    ]
    for (lat, expected) in cases {
      XCTAssertEqual(ClimateBand.forLatitude(lat), expected, "lat \(lat)")
    }
  }

  func testSouthernLatitudesUseAbsoluteValue() {
    XCTAssertEqual(ClimateBand.forLatitude(-37.8), .temperate)  // Melbourne
    XCTAssertEqual(ClimateBand.forLatitude(-10), .tropical)
    XCTAssertEqual(ClimateBand.forLatitude(-70), .polar)
  }
}
