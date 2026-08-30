import XCTest

@testable import Ateliera

// The Foyer invitation engine: contextual, suppressible, one-at-a-time.
final class InvitationTests: XCTestCase {
  private func note(cardType: String, status: String, extra: [(String, YamlNode)] = []) -> StudioNote {
    var n = StudioNote.capture(
      title: nil, body: "x", id: "n", created: "2026-01-01T00:00:00.000Z", room: "reflection-garden")
    n.cardType = cardType
    n.status = status
    n.extraFrontmatter = extra
    return n
  }

  func testNewMoonInvitationOnTheNewMoonDay() {
    // 2026-09-11 is a new moon.
    let inv = InvitationEngine.current(
      date: "2026-09-11", hemisphere: .south, notes: [], dismissed: [])
    XCTAssertEqual(inv?.kind, .newMoonIntention(lunation: "2026-09-11"))
    XCTAssertEqual(inv?.id, "newmoon:2026-09-11")
  }

  func testNewMoonSuppressedWhenIntentionAlreadyExists() {
    let existing = note(
      cardType: "moon-intention", status: "active",
      extra: [("moon_lunation", .scalar("2026-09-11"))])
    let inv = InvitationEngine.current(
      date: "2026-09-11", hemisphere: .south, notes: [existing], dismissed: [])
    XCTAssertNil(inv)  // already set, and no turning point within a week
  }

  func testNewMoonSuppressedWhenDismissed() {
    let inv = InvitationEngine.current(
      date: "2026-09-11", hemisphere: .south, notes: [], dismissed: ["newmoon:2026-09-11"])
    XCTAssertNil(inv)
  }

  func testSeasonInvitationBeforeAnEquinox() {
    // Five days before the September equinox; south → spring begins.
    let inv = InvitationEngine.current(
      date: "2026-09-18", hemisphere: .south, notes: [], dismissed: [])
    XCTAssertEqual(inv?.kind, .seasonAtTurningPoint(.septemberEquinox))
    XCTAssertTrue(inv?.body.contains("spring") ?? false, "was \(inv?.body ?? "nil")")
  }

  func testSeasonInvitationSuppressedWhenOneIsUnderway() {
    let active = note(cardType: "season", status: "active")
    let inv = InvitationEngine.current(
      date: "2026-09-18", hemisphere: .south, notes: [active], dismissed: [])
    XCTAssertNil(inv)
  }
}
