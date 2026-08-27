import XCTest

@testable import Ateliera

final class CycleDeriverTests: XCTestCase {
  func testNoDaysYieldsNoProfile() {
    XCTAssertNil(CycleDeriver.derive(periodDays: []))
  }

  func testSinglePeriodDefaultsToTwentyEight() {
    let profile = CycleDeriver.derive(periodDays: [
      "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04",
    ])
    XCTAssertEqual(profile?.lastPeriodStart, "2026-08-01")
    XCTAssertEqual(profile?.avgLengthDays, 28)
  }

  func testTwoPeriodsGiveTheSpacingAndLatestStart() {
    // 28 days apart; unordered + a duplicate to prove robustness.
    let profile = CycleDeriver.derive(periodDays: [
      "2026-08-29", "2026-08-01", "2026-08-02", "2026-08-30", "2026-08-31", "2026-08-01",
    ])
    XCTAssertEqual(profile?.lastPeriodStart, "2026-08-29")
    XCTAssertEqual(profile?.avgLengthDays, 28)
  }

  func testMissingMidPeriodDayDoesNotSplitThePeriod() {
    // 1, 2, (gap) 4 — still one period starting on the 1st.
    let profile = CycleDeriver.derive(periodDays: ["2026-08-01", "2026-08-02", "2026-08-04"])
    XCTAssertEqual(profile?.lastPeriodStart, "2026-08-01")
    XCTAssertEqual(profile?.avgLengthDays, 28)
  }

  func testAverageOfSeveralCyclesIsRounded() {
    // Starts 28 then 30 days apart -> mean 29.
    let profile = CycleDeriver.derive(periodDays: [
      "2026-06-01", "2026-06-29", "2026-07-29",
    ])
    XCTAssertEqual(profile?.lastPeriodStart, "2026-07-29")
    XCTAssertEqual(profile?.avgLengthDays, 29)
  }

  func testImplausibleSpacingIsClamped() {
    // ~60 days apart clamps to the 35-day ceiling.
    let profile = CycleDeriver.derive(periodDays: ["2026-05-01", "2026-06-30"])
    XCTAssertEqual(profile?.avgLengthDays, 35)
  }

  func testDerivedProfileFeedsTheCycleState() {
    // End to end: derive a basis, then compute the cycle for a later day.
    let profile = CycleDeriver.derive(periodDays: ["2026-08-01", "2026-08-02", "2026-08-03"])!
    let state = Rhythm.computeCycle(
      profile, dateMs: Rhythm.utcMillis(year: 2026, month: 8, day: 10))
    XCTAssertEqual(state?.day, 10)
    XCTAssertEqual(state?.phase, .follicular)
  }
}
