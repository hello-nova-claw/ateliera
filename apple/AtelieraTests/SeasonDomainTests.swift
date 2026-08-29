import XCTest

@testable import Ateliera

// P6 (Season): the wizard state machine, golden-matched to season.ts.
final class SeasonDomainTests: XCTestCase {
  private let now = "2026-06-01T00:00:00.000Z"

  private func draft() -> SeasonState { SeasonEngine.createDraft(id: "S1", now: now) }

  func testWizardStepOrder() {
    XCTAssertEqual(
      seasonWizardSteps.map { $0.rawValue },
      [
        "name-dates", "prior-reflection", "feelings", "priorities", "decisions-practices",
        "supports-constraints", "enough", "not-now", "confirm",
      ])
  }

  func testCreateDraftDefaults() {
    let d = draft()
    XCTAssertEqual(d.status, .draft)
    XCTAssertEqual(d.title, "")
    XCTAssertTrue(d.completedSteps.isEmpty)
    XCTAssertEqual(d.created, now)
  }

  func testNameDatesAdvancesCompletedSteps() throws {
    let next = try SeasonEngine.updateDraft(
      draft(), .nameDates(title: "Spring", startsOn: "2026-03-01", endsOn: "2026-05-31"), now: now)
    XCTAssertEqual(next.title, "Spring")
    XCTAssertEqual(next.startsOn, "2026-03-01")
    XCTAssertEqual(next.completedSteps, [.nameDates])
  }

  func testEmptyDatesNormalizeToNil() throws {
    let next = try SeasonEngine.updateDraft(
      draft(), .nameDates(title: "Spring", startsOn: "", endsOn: nil), now: now)
    XCTAssertNil(next.startsOn)
    XCTAssertNil(next.endsOn)
  }

  func testRejectsEmptyTitle() {
    XCTAssertThrowsError(
      try SeasonEngine.updateDraft(draft(), .nameDates(title: "  ", startsOn: nil, endsOn: nil), now: now)
    ) { XCTAssertEqual($0 as? SeasonError, .titleRequired) }
  }

  func testEndBeforeStartRejected() {
    XCTAssertThrowsError(
      try SeasonEngine.updateDraft(
        draft(), .nameDates(title: "S", startsOn: "2026-05-01", endsOn: "2026-03-01"), now: now)
    ) { XCTAssertEqual($0 as? SeasonError, .endBeforeStart) }
  }

  func testPriorityLimitNeedsOverrideForFourth() throws {
    var named = try SeasonEngine.updateDraft(
      draft(), .nameDates(title: "S", startsOn: nil, endsOn: nil), now: now)
    // Three is fine.
    named = try SeasonEngine.updateDraft(named, .priorities(["a", "b", "c"]), now: now)
    XCTAssertEqual(named.priorities.count, 3)
    // A fourth without override throws.
    XCTAssertThrowsError(
      try SeasonEngine.updateDraft(named, .priorities(["a", "b", "c", "d"]), now: now)
    ) { XCTAssertEqual($0 as? SeasonError, .priorityLimit) }
    // With override it's allowed.
    let four = try SeasonEngine.updateDraft(
      named, .priorities(["a", "b", "c", "d"]), now: now, priorityOverride: true)
    XCTAssertEqual(four.priorities.count, 4)
  }

  func testPriorReflectionRequiredUnlessSkipped() {
    let named = try! SeasonEngine.updateDraft(
      draft(), .nameDates(title: "S", startsOn: nil, endsOn: nil), now: now)
    XCTAssertThrowsError(
      try SeasonEngine.updateDraft(named, .priorReflection(text: "  ", skipped: false), now: now)
    ) { XCTAssertEqual($0 as? SeasonError, .reflectionRequired) }
    XCTAssertNoThrow(
      try SeasonEngine.updateDraft(named, .priorReflection(text: "", skipped: true), now: now))
  }

  func testActivateRejectsIncompleteSteps() {
    let named = try! SeasonEngine.updateDraft(
      draft(), .nameDates(title: "S", startsOn: nil, endsOn: nil), now: now)
    XCTAssertThrowsError(try SeasonEngine.activate(named, now: now)) {
      XCTAssertEqual($0 as? SeasonError, .incompleteSteps)
    }
  }

  func testActivateWhenAllStepsComplete() throws {
    var s = draft()
    let answers: [SeasonStepAnswers] = [
      .nameDates(title: "S", startsOn: nil, endsOn: nil),
      .priorReflection(text: "looking back", skipped: false),
      .feelings(feelings: ["calm"], statement: "steadiness"),
      .priorities(["a"]),
      .decisionsPractices(decisions: [], practices: ["walk"]),
      .supportsConstraints(supports: ["quiet mornings"], constraints: []),
      .enough("one true thing"),
      .notNow(["everything else"]),
      .confirm,
    ]
    for a in answers { s = try SeasonEngine.updateDraft(s, a, now: now) }
    XCTAssertEqual(SeasonEngine.progress(s), seasonWizardSteps.count - 1)
    let active = try SeasonEngine.activate(s, now: now)
    XCTAssertEqual(active.status, .active)
  }

  func testCloseRejectsDraft() {
    XCTAssertThrowsError(try SeasonEngine.close(draft(), now: now)) {
      XCTAssertEqual($0 as? SeasonError, .notActive)
    }
  }

  func testProgressIsFirstIncompleteStep() throws {
    let s = try SeasonEngine.updateDraft(
      draft(), .nameDates(title: "S", startsOn: nil, endsOn: nil), now: now)
    XCTAssertEqual(SeasonEngine.progress(s), 1)  // name-dates done → prior-reflection next
  }

  func testValidDate() {
    XCTAssertTrue(SeasonEngine.validDate("2026-02-28"))
    XCTAssertFalse(SeasonEngine.validDate("2026-02-30"))
    XCTAssertTrue(SeasonEngine.validDate("2028-02-29"))  // leap
    XCTAssertFalse(SeasonEngine.validDate("2026-13-01"))
    XCTAssertFalse(SeasonEngine.validDate("2026-1-1"))
    XCTAssertTrue(SeasonEngine.validDate(nil))
  }
}
