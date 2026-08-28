import XCTest

@testable import Ateliera

// The hemisphere shared with the widget round-trips through the store.
final class SharedStoreTests: XCTestCase {
  func testHemisphereRoundTrips() {
    SharedStore.hemisphere = .south
    XCTAssertEqual(SharedStore.hemisphere, .south)
    SharedStore.hemisphere = .north
    XCTAssertEqual(SharedStore.hemisphere, .north)
    SharedStore.hemisphere = nil
    XCTAssertNil(SharedStore.hemisphere)
  }

  func testRegionHemisphere() {
    XCTAssertEqual(RegionHemisphere.hemisphere(forRegion: "AU"), .south)
    XCTAssertEqual(RegionHemisphere.hemisphere(forRegion: "nz"), .south)  // case-insensitive
    XCTAssertEqual(RegionHemisphere.hemisphere(forRegion: "US"), .north)
    XCTAssertEqual(RegionHemisphere.hemisphere(forRegion: "GB"), .north)
    XCTAssertEqual(RegionHemisphere.hemisphere(forRegion: ""), .north)
  }

  func testBestHemispherePrefersStoredValue() {
    SharedStore.hemisphere = .south
    XCTAssertEqual(SharedStore.bestHemisphere, .south)
    SharedStore.hemisphere = nil
    XCTAssertEqual(SharedStore.bestHemisphere, RegionHemisphere.current)
  }
}
