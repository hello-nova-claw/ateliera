import XCTest

@testable import Ateliera

final class AppClockTests: XCTestCase {
  func testUITestsCanPinNow() {
    let now = AppClock.now(environment: [
      "ATELIERA_UITEST": "1", "ATELIERA_UITEST_NOW": "2026-03-20T09:30:00Z",
    ])
    XCTAssertEqual(now, Date(timeIntervalSince1970: 1_773_999_000))
  }

  func testThePinIsIgnoredOutsideUITests() {
    let before = Date()
    let now = AppClock.now(environment: ["ATELIERA_UITEST_NOW": "2026-03-20T09:30:00Z"])
    XCTAssertGreaterThanOrEqual(now, before)
  }

  func testAnUnreadablePinFallsBackToTheRealTime() {
    let before = Date()
    let now = AppClock.now(environment: [
      "ATELIERA_UITEST": "1", "ATELIERA_UITEST_NOW": "next Tuesday",
    ])
    XCTAssertGreaterThanOrEqual(now, before)
  }
}
