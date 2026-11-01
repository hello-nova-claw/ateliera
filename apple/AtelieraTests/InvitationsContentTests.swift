import XCTest

@testable import Ateliera

// The Foyer invitations' wording is content, bundled as Content/invitations.json, with
// {placeholders} the engine fills. The engine must still say exactly what it said.
final class InvitationsContentTests: XCTestCase {
  func testHoldsTheTenInvitations() throws {
    let library = try contentObject("invitations")
    XCTAssertEqual(
      Set(library.keys),
      [
        "solarReturn", "seasonClosing", "newMoon", "fullMoon", "seasonTurning",
        "microSeasonShift", "cyclePhase", "inboxWaiting", "synthesizeWisdom", "promoteIdentity",
      ])
    let solar = try XCTUnwrap(library["solarReturn"] as? [String: Any])
    XCTAssertEqual(solar["title"] as? String, "Your solar return")
    let cycle = try XCTUnwrap(library["cyclePhase"] as? [String: Any])
    XCTAssertEqual((cycle["body"] as? [String: String])?.count, 4)
  }

  func testTheEngineSaysWhatItAlwaysSaid() {
    let solar = InvitationEngine.current(
      InvitationContext(
        date: "2026-08-05", hemisphere: .north, notes: [], cycle: nil, birthDate: "1990-08-05",
        dismissed: [], timeZone: .gmt))
    XCTAssertEqual(solar?.title, "Your solar return")
    XCTAssertEqual(
      solar?.body, "A year around the sun today — begin a new personal year in step with it?")
    XCTAssertEqual(solar?.acceptLabel, "Begin a season")

    var waiting = StudioNote.capture(
      title: nil, body: "x", id: "n", created: "2026-01-01T00:00:00.000Z", room: "inbox")
    waiting.cardType = "capture"
    waiting.status = "draft"
    let inbox = InvitationEngine.current(
      date: "2026-08-05", hemisphere: .north, notes: [waiting], dismissed: [])
    XCTAssertEqual(inbox?.title, "Notes to sort")
    XCTAssertEqual(inbox?.body, "1 note is waiting in the Inbox — sort it into place?")
    XCTAssertEqual(inbox?.acceptLabel, "Open the Inbox")

    let newMoon = InvitationEngine.current(
      date: "2026-09-11", hemisphere: .south, notes: [], dismissed: [])
    XCTAssertEqual(newMoon?.body, "New moon today — set an intention to carry through the month?")

    let turning = InvitationEngine.current(
      date: "2026-09-18", hemisphere: .south, notes: [], dismissed: [])
    XCTAssertEqual(turning?.title, "A season is turning")
    XCTAssertTrue(
      turning?.body.hasSuffix("— spring begins. Begin a personal season in step with it?") ?? false,
      "was \(turning?.body ?? "nil")")
  }
}
