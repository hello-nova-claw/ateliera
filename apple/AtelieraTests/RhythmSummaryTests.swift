import XCTest

@testable import Ateliera

final class RhythmSummaryTests: XCTestCase {
  func testSummaryLineForAKnownContext() {
    // 2026-01-10, northern, with a cycle (matches RhythmTests' golden context).
    let context = Rhythm.computeContext(
      profile: RhythmProfile(
        hemisphere: .north, cycle: CycleProfile(lastPeriodStart: "2026-01-01", avgLengthDays: 28)),
      date: "2026-01-10")
    let line = RhythmSummary.line(for: context)
    XCTAssertEqual(
      line,
      "Today's rhythm: Lesser Cold, Winter. The moon is Last quarter, 56% lit. Cycle day 10, Follicular."
    )
  }

  func testSummaryOmitsCycleWhenAbsent() {
    let context = Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: .south, cycle: nil), date: "2026-06-21")
    let line = RhythmSummary.line(for: context)
    XCTAssertFalse(line.contains("Cycle"))
    XCTAssertTrue(line.hasPrefix("Today's rhythm: Winter Solstice, Winter."))
  }
}
