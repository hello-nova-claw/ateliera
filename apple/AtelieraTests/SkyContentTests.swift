import XCTest

@testable import Ateliera

// Moon-phase and almanac lines are content: Content/sky-ahead.json and
// Content/almanac.json (the same file as apps/studio/src/content/almanac.json).
final class SkyContentTests: XCTestCase {
  func testSkyAheadHoldsTheMoonPhaseAndSolarReturnLines() throws {
    let library = try contentObject("sky-ahead")
    XCTAssertEqual(Set(library.keys), ["moonPhases", "solarReturn"])
    let phases = try XCTUnwrap(library["moonPhases"] as? [String: String])
    XCTAssertEqual(Set(phases.keys), ["new", "firstQuarter", "full", "lastQuarter"])
    XCTAssertEqual(phases["new"], "the dark, a seed — a time to set an intention")
  }

  func testTheSkyAheadTimelineSaysWhatItAlwaysSaid() {
    let events = SkyAhead.events(
      nowMs: Rhythm.utcMillis(year: 2026, month: 10, day: 2), hemisphere: .north,
      layers: .moonPhases, birthDate: nil, horizonDays: 40)
    let full = events.first { $0.title == "Full moon" }
    XCTAssertEqual(full?.detail, "fullness at its height — what has grown")
  }

  func testAlmanacHoldsTheInwardAndOutwardDayLines() throws {
    let library = try contentObject("almanac")
    let orientation = try XCTUnwrap(library["orientation"] as? [String: String])
    XCTAssertEqual(
      orientation["inward"], "A gathering day — a good time to notice how far you have come.")
    XCTAssertEqual(
      orientation["outward"], "An opening day — a good time to name what you want to make room for.")
  }
}
