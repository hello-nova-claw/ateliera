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
}
