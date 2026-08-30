import XCTest

@testable import Ateliera

// Golden values captured from `@studio/rhythm` (the web engine). If these pass,
// the native almanac computes the same season, micro-season, moon, and cycle the
// web app does — one rhythm, two apps.
final class RhythmTests: XCTestCase {
  private func ms(_ date: String) -> Int64 {
    Rhythm.utcMillis(
      year: Int(date.prefix(4))!, month: Int(date.dropFirst(5).prefix(2))!,
      day: Int(date.dropFirst(8).prefix(2))!)
  }

  func testResolveSeasonBothHemispheres() {
    let cases: [(Int, Hemisphere, Season)] = [
      (1, .north, .winter), (1, .south, .summer),
      (3, .north, .spring), (3, .south, .autumn),
      (6, .north, .summer), (6, .south, .winter),
      (9, .north, .autumn), (9, .south, .spring),
      (12, .north, .winter), (12, .south, .summer),
    ]
    for (month, hemisphere, expected) in cases {
      XCTAssertEqual(Rhythm.resolveSeason(month: month, hemisphere: hemisphere), expected, "month \(month) \(hemisphere)")
    }
  }

  func testSeasonProgressThroughTheMeteorologicalBlock() {
    // Percent through the current 3-month block (hemisphere-independent).
    let cases: [(String, Int)] = [
      ("2026-06-01", 0),  // first day of the Jun–Sep block
      ("2026-07-16", 49),  // ~halfway
      ("2026-08-30", 98),  // near the end
      ("2026-01-15", 50),  // Dec–Mar block spanning the year boundary
    ]
    for (date, expected) in cases {
      XCTAssertEqual(
        Int((Rhythm.seasonProgress(date: date) * 100).rounded()), expected, "progress \(date)")
    }
  }

  func testAstronomicalSeasonNameAndProgress() {
    // Named by the exact equinox/solstice boundaries; flips for the southern hemisphere.
    XCTAssertEqual(Rhythm.resolveSeasonAstronomical(date: "2026-08-30", hemisphere: .north), .summer)
    XCTAssertEqual(Rhythm.resolveSeasonAstronomical(date: "2026-08-30", hemisphere: .south), .winter)
    XCTAssertEqual(Rhythm.resolveSeasonAstronomical(date: "2026-03-19", hemisphere: .north), .winter)
    XCTAssertEqual(Rhythm.resolveSeasonAstronomical(date: "2026-06-30", hemisphere: .north), .summer)

    // Progress is measured between the exact solstice/equinox instants of the span.
    let ms = Rhythm.utcMillis(year: 2026, month: 8, day: 30)
    let span = Sky.astronomicalSeasonSpan(dateMs: ms)
    let expected = Double(ms - span.start) / Double(span.end - span.start)
    XCTAssertEqual(Rhythm.seasonProgressAstronomical(date: "2026-08-30"), expected, accuracy: 0.0001)

    // The style dispatchers agree with the specific functions.
    XCTAssertEqual(
      Rhythm.seasonProgress(date: "2026-08-30", style: .meteorological),
      Rhythm.seasonProgress(date: "2026-08-30"))
    XCTAssertEqual(
      Rhythm.seasonProgress(date: "2026-08-30", style: .astronomical),
      Rhythm.seasonProgressAstronomical(date: "2026-08-30"))
  }

  func testTurningPointsMatchTheEphemeris() {
    // Golden instants captured from astronomia's solstice.* (Meeus ch. 27), within a
    // couple of minutes — the low-accuracy method's tolerance.
    let cases: [(Sky.TurningPoint, Int64)] = [
      (.marchEquinox, 1_774_017_936_183),
      (.juneSolstice, 1_782_030_295_889),
      (.septemberEquinox, 1_790_121_930_727),
      (.decemberSolstice, 1_797_886_213_344),
    ]
    for (point, expected) in cases {
      let got = Sky.turningPointMs(year: 2026, point: point)
      XCTAssertLessThan(abs(got - expected), 120_000, "\(point) off by \((got - expected) / 1000)s")
    }
  }

  func testAstronomicalSeasonSpanIsExact() {
    // Late-August (southern winter): inside the Jun-solstice → Sep-equinox span.
    let ms = Rhythm.utcMillis(year: 2026, month: 8, day: 30)
    let span = Sky.astronomicalSeasonSpan(dateMs: ms)
    XCTAssertEqual(span.season, .summer)  // northern name; the view flips it for the south
    XCTAssertEqual(span.start, Sky.turningPointMs(year: 2026, point: .juneSolstice))
    XCTAssertEqual(span.end, Sky.turningPointMs(year: 2026, point: .septemberEquinox))
  }

  func testRhythmPreferencesDecodeWithoutSeasonStyle() throws {
    // Preferences saved before season style existed must still decode (→ meteorological).
    let json = Data(#"{"moon":true,"microSeason":false,"cycle":true}"#.utf8)
    let prefs = try JSONDecoder().decode(StoredStudioPreferences.RhythmPreferences.self, from: json)
    XCTAssertEqual(prefs.resolvedSeasonStyle, .meteorological)
    XCTAssertFalse(prefs.microSeason)
  }

  func testResolveMicroSeasonBoundariesAndSouthernShift() {
    let cases: [(String, Hemisphere, String)] = [
      ("2026-01-10", .north, "Lesser Cold"),
      ("2026-02-04", .north, "Start of Spring"),
      ("2026-03-20", .north, "Spring Equinox"),
      ("2026-06-21", .north, "Summer Solstice"),
      ("2026-12-21", .north, "Winter Solstice"),
      ("2026-01-01", .north, "Winter Solstice"),  // wraps to the final term
      ("2026-06-21", .south, "Winter Solstice"),  // six-month shift
      ("2026-12-21", .south, "Summer Solstice"),
    ]
    for (date, hemisphere, term) in cases {
      let month = Int(date.dropFirst(5).prefix(2))!
      let day = Int(date.dropFirst(8).prefix(2))!
      XCTAssertEqual(Rhythm.resolveMicroSeason(month: month, day: day, hemisphere: hemisphere).term, term, date)
    }
  }

  func testComputeMoonPhaseAndIllumination() {
    let cases: [(String, MoonPhase, Double)] = [
      ("2026-01-03", .full, 0.9974130966013235),
      ("2026-01-18", .new, 0.006887122598245143),
      ("2026-06-21", .firstQuarter, 0.4072239791796528),
      ("2026-07-10", .waningCrescent, 0.2627836813530618),
      ("2026-11-15", .waxingCrescent, 0.27147353480116726),
      ("2000-01-06", .new, 0.005281140550297381),
    ]
    for (date, phase, illumination) in cases {
      let moon = Rhythm.computeMoon(dateMs: ms(date))
      XCTAssertEqual(moon.phase, phase, date)
      XCTAssertEqual(moon.illumination, illumination, accuracy: 1e-12, date)
    }
  }

  func testComputeCycleFirstCycleAndWrap() {
    let cycle = CycleProfile(lastPeriodStart: "2026-01-01", avgLengthDays: 28)
    let cases: [(String, Int, CyclePhase)] = [
      ("2026-01-01", 1, .menstrual),
      ("2026-01-06", 6, .follicular),
      ("2026-01-14", 14, .ovulation),
      ("2026-01-17", 17, .luteal),
      ("2026-02-10", 12, .follicular),  // 40 days in, avg 28 -> day 12
    ]
    for (date, day, phase) in cases {
      let state = Rhythm.computeCycle(cycle, dateMs: ms(date))
      XCTAssertEqual(state?.day, day, date)
      XCTAssertEqual(state?.phase, phase, date)
    }
  }

  func testOrientationMatchesTheWebEngine() {
    let cases: [(String, Hemisphere, CycleProfile?, RhythmOrientation)] = [
      ("2026-01-10", .north, CycleProfile(lastPeriodStart: "2026-01-01", avgLengthDays: 28), .inward),
      ("2026-06-21", .south, nil, .inward),
      ("2026-04-18", .north, nil, .outward),
      ("2026-01-18", .north, nil, .outward),
      ("2026-07-01", .north, CycleProfile(lastPeriodStart: "2026-06-20", avgLengthDays: 28), .outward),
    ]
    for (date, hemisphere, cycle, expected) in cases {
      let ctx = Rhythm.computeContext(
        profile: RhythmProfile(hemisphere: hemisphere, cycle: cycle), date: date)
      XCTAssertEqual(Rhythm.orientation(ctx), expected, date)
    }
  }

  func testComputeContextMatchesTheWebEngine() {
    let north = RhythmProfile(
      hemisphere: .north, cycle: CycleProfile(lastPeriodStart: "2026-01-01", avgLengthDays: 28))
    let a = Rhythm.computeContext(profile: north, date: "2026-01-10")
    XCTAssertEqual(a.season, .winter)
    XCTAssertEqual(a.microSeason.term, "Lesser Cold")
    XCTAssertEqual(a.moon.phase, .lastQuarter)
    XCTAssertEqual(a.moon.illumination, 0.5643686941316037, accuracy: 1e-12)
    XCTAssertEqual(a.cycle?.day, 10)
    XCTAssertEqual(a.cycle?.phase, .follicular)

    let south = RhythmProfile(hemisphere: .south, cycle: nil)
    let b = Rhythm.computeContext(profile: south, date: "2026-06-21")
    XCTAssertEqual(b.season, .winter)
    XCTAssertEqual(b.microSeason.term, "Winter Solstice")
    XCTAssertEqual(b.moon.phase, .firstQuarter)
    XCTAssertNil(b.cycle)
  }
}
