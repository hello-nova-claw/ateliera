import XCTest

@testable import Ateliera

// The Foyer invitation engine: contextual, real, suppressible, one-at-a-time.
final class InvitationTests: XCTestCase {
  private func note(
    id: String = "n", cardType: String, status: String, rooms: [String] = ["reflection-garden"],
    tags: [String] = [], created: String = "2026-01-01T00:00:00.000Z",
    extra: [(String, YamlNode)] = []
  ) -> StudioNote {
    var n = StudioNote.capture(
      title: nil, body: "x", id: id, created: created, room: rooms.first ?? "inbox")
    n.rooms = rooms
    n.cardType = cardType
    n.status = status
    n.tags = tags
    n.extraFrontmatter = extra
    return n
  }

  private func ctx(
    _ date: String, hemisphere: Hemisphere = .north, notes: [StudioNote] = [],
    cycle: CycleProfile? = nil, birthDate: String? = nil, dismissed: Set<String> = []
  ) -> InvitationContext {
    InvitationContext(
      date: date, hemisphere: hemisphere, notes: notes, cycle: cycle, birthDate: birthDate,
      dismissed: dismissed)
  }

  func testNewMoonInvitationOnTheNewMoonDay() {
    let inv = InvitationEngine.current(ctx("2026-09-11", hemisphere: .south))
    XCTAssertEqual(inv?.kind, .newMoonIntention(lunation: "2026-09-11"))
  }

  func testNewMoonSuppressedWhenIntentionAlreadyExists() {
    let existing = note(
      cardType: "moon-intention", status: "active",
      extra: [("moon_lunation", .scalar("2026-09-11"))])
    XCTAssertNil(InvitationEngine.current(ctx("2026-09-11", hemisphere: .south, notes: [existing])))
  }

  func testNewMoonSuppressedWhenDismissed() {
    XCTAssertNil(
      InvitationEngine.current(
        ctx("2026-09-11", hemisphere: .south, dismissed: ["newmoon:2026-09-11"])))
  }

  func testFullMoonReflectionOnTheFullMoonDay() {
    let inv = InvitationEngine.current(ctx("2026-08-28", hemisphere: .north))
    XCTAssertEqual(inv?.kind, .fullMoonReflection(lunation: "2026-08-28"))
  }

  func testSeasonInvitationBeforeAnEquinox() {
    let inv = InvitationEngine.current(ctx("2026-09-18", hemisphere: .south))
    XCTAssertEqual(inv?.kind, .seasonAtTurningPoint(.septemberEquinox))
    XCTAssertTrue(inv?.body.contains("spring") ?? false, "was \(inv?.body ?? "nil")")
  }

  func testSeasonClosingWhenEndIsNear() {
    let season = note(
      cardType: "season", status: "active",
      extra: [("date_end", .scalar("2026-08-10")), ("season_id", .scalar("S1"))])
    let inv = InvitationEngine.current(ctx("2026-08-05", notes: [season]))
    XCTAssertEqual(inv?.kind, .seasonClosing(seasonId: "S1"))
  }

  func testSolarReturnOnBirthday() {
    let inv = InvitationEngine.current(ctx("2026-08-05", birthDate: "1990-08-05"))
    XCTAssertEqual(inv?.kind, .solarReturn(year: 2026))
  }

  func testInboxWaitingIsAGentleFallback() {
    // A quiet sky day (north, 2026-08-05) with an unfiled draft resting in the Inbox.
    let waiting = note(cardType: "capture", status: "draft", rooms: ["inbox"])
    let inv = InvitationEngine.current(ctx("2026-08-05", notes: [waiting]))
    XCTAssertEqual(inv?.kind, .inboxWaiting)
  }

  func testInboxWaitingIgnoresKeptJournalEntries() {
    // A kept (active) entry has already found its place in the Journal — no nag.
    let kept = note(cardType: "capture", status: "active", rooms: ["inbox"])
    XCTAssertNil(InvitationEngine.current(ctx("2026-08-05", notes: [kept])))
  }

  func testSynthesizeWhenAThemeHasEnoughIdeas() {
    let ideas = (1...3).map {
      note(id: "w\($0)", cardType: "quote", status: "active", rooms: ["wisdom-garden"], tags: ["rest"])
    }
    let inv = InvitationEngine.current(ctx("2026-08-05", notes: ideas))
    XCTAssertEqual(inv?.kind, .synthesizeWisdom(theme: "rest"))
  }
}
