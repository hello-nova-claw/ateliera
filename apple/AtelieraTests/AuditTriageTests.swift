import XCTest

// AuditTriage decides which accessibility findings fail the audit. It is pure, so these
// tests pin its rules without a simulator: a finding still on screen fails at once, a
// finding whose element vanished fails only if a second, settled pass repeats it.
final class AuditTriageTests: XCTestCase {
  private func finding(
    _ type: String = "hitRegion", element: String = "-", onScreen: Bool
  ) -> AuditFinding {
    AuditFinding(
      type: type, screen: "room-inbox", element: element,
      description: "Hit area is too small", onScreen: onScreen)
  }

  func testAFindingStillOnScreenFailsWithoutASecondPass() {
    let real = finding(element: "inbox-open", onScreen: true)
    XCTAssertFalse(AuditTriage.needsSecondPass([real]))
    XCTAssertEqual(AuditTriage.confirmed(first: [real], second: []), [real])
  }

  func testNoFindingsNeedNoSecondPass() {
    XCTAssertFalse(AuditTriage.needsSecondPass([]))
    XCTAssertEqual(AuditTriage.confirmed(first: [], second: []), [])
  }

  func testAVanishedFindingAsksForASecondPass() {
    XCTAssertTrue(AuditTriage.needsSecondPass([finding(onScreen: false)]))
    XCTAssertTrue(
      AuditTriage.needsSecondPass([
        finding(element: "inbox-open", onScreen: true), finding(onScreen: false),
      ]))
  }

  func testTheSecondPassAuditsOnlyTheTypesThatVanished() {
    XCTAssertEqual(
      AuditTriage.secondPassTypes([
        finding("hitRegion", onScreen: false),
        finding("textClipped", onScreen: false),
        finding("contrast", element: "inbox-title", onScreen: true),
      ]),
      ["hitRegion", "textClipped"])
    XCTAssertEqual(
      AuditTriage.secondPassTypes([finding("dynamicType", onScreen: false)]), ["dynamicType"])
  }

  func testAVanishedFindingThatDoesNotRecurIsDropped() {
    XCTAssertEqual(AuditTriage.confirmed(first: [finding(onScreen: false)], second: []), [])
  }

  func testAVanishedFindingThatRecursFails() {
    let transient = finding(onScreen: false)
    XCTAssertEqual(
      AuditTriage.confirmed(first: [transient], second: [transient]), [transient])
    // Recurring on screen, it fails as an on-screen finding.
    let settled = finding(onScreen: true)
    XCTAssertEqual(
      AuditTriage.confirmed(first: [transient], second: [settled]), [settled])
  }

  func testAVanishedFindingRecursOnlyAsTheSameTypeAndElement() {
    let hitRegion = finding("hitRegion", onScreen: false)
    let contrast = finding("contrast", onScreen: false)
    XCTAssertEqual(AuditTriage.confirmed(first: [hitRegion], second: [contrast]), [])
    let named = finding(element: "inbox-open", onScreen: false)
    XCTAssertEqual(AuditTriage.confirmed(first: [hitRegion], second: [named]), [])
  }

  func testANewOnScreenFindingInTheSecondPassFails() {
    let real = finding("contrast", element: "inbox-title", onScreen: true)
    XCTAssertEqual(
      AuditTriage.confirmed(first: [finding(onScreen: false)], second: [real]), [real])
  }

  func testANewVanishedFindingInTheSecondPassIsDropped() {
    let other = finding("contrast", onScreen: false)
    XCTAssertEqual(
      AuditTriage.confirmed(first: [finding(onScreen: false)], second: [other]), [])
  }

  func testAFirstPassFindingStillOnScreenFailsEvenIfTheSecondPassMissesIt() {
    let real = finding(element: "inbox-open", onScreen: true)
    XCTAssertEqual(
      AuditTriage.confirmed(first: [real, finding(onScreen: false)], second: []), [real])
  }

  func testRepeatsAreListedOnce() {
    let transient = finding(onScreen: false)
    let real = finding(element: "inbox-open", onScreen: true)
    XCTAssertEqual(
      AuditTriage.confirmed(
        first: [transient, transient, real],
        second: [transient, transient, real]),
      [real, transient])
  }
}
