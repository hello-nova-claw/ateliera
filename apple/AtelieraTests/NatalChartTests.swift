import XCTest

@testable import Ateliera

// Sign-level parity with `@studio/rhythm`'s computeNatalChart (values captured
// from the TS engine). The chart's product surface is the zodiac sign, so the
// Meeus port only has to land in the same 30° bucket the astronomia-backed web
// app does.
final class NatalChartTests: XCTestCase {
  func testHonestDegradation() {
    XCTAssertEqual(Natal.compute(birthDate: "not-a-date", birthTimeUTC: nil, birthLat: nil, birthLon: nil), NatalChart.empty)

    // Date only -> sun only.
    let sunOnly = Natal.compute(birthDate: "1990-08-15", birthTimeUTC: nil, birthLat: nil, birthLon: nil)
    XCTAssertEqual(sunOnly.sun, "Leo")
    XCTAssertEqual(sunOnly.moon, "")
    XCTAssertNil(sunOnly.rising)

    // Date + time -> sun + moon, still no rising without a location.
    let sunMoon = Natal.compute(birthDate: "1990-08-15", birthTimeUTC: "14:30", birthLat: nil, birthLon: nil)
    XCTAssertEqual(sunMoon.moon, "Gemini")
    XCTAssertNil(sunMoon.rising)
  }

  func testFullChartsMatchTheWebEngine() {
    let cases: [(String, String, Double, Double, String, String, String)] = [
      // date, time, lat, lon, sun, moon, rising
      ("1990-08-15", "14:30", -37.81, 144.96, "Leo", "Gemini", "Scorpio"),
      ("1988-03-21", "06:00", 51.51, -0.13, "Aries", "Taurus", "Virgo"),
      ("2001-12-25", "23:15", 40.71, -74.01, "Capricorn", "Taurus", "Capricorn"),
      ("1995-07-04", "09:45", 35.68, 139.69, "Cancer", "Virgo", "Cancer"),
      ("1979-11-02", "17:20", -33.87, 151.21, "Scorpio", "Aries", "Aries"),
    ]
    for (date, time, lat, lon, sun, moon, rising) in cases {
      let chart = Natal.compute(birthDate: date, birthTimeUTC: time, birthLat: lat, birthLon: lon)
      XCTAssertEqual(chart.sun, sun, "\(date) sun")
      XCTAssertEqual(chart.moon, moon, "\(date) moon")
      XCTAssertEqual(chart.rising, rising, "\(date) rising")
    }
  }
}
