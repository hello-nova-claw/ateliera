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
    cycle: CycleProfile? = nil, birthDate: String? = nil, dismissed: Set<String> = [],
    timeZone: TimeZone = .gmt
  ) -> InvitationContext {
    InvitationContext(
      date: date, hemisphere: hemisphere, notes: notes, cycle: cycle, birthDate: birthDate,
      dismissed: dismissed, timeZone: timeZone)
  }

  // A zone in which `instant` falls at 01:00 local, and the local date there.
  private func zoneWhereItIsOneAM(at instant: Int64) throws -> (TimeZone, String) {
    var offset = 3600 - Int((instant % 86_400_000) / 1000)
    if offset < -12 * 3600 { offset += 86_400 }
    if offset > 14 * 3600 { offset -= 86_400 }
    let zone = try XCTUnwrap(TimeZone(secondsFromGMT: offset))
    return (zone, Sky.isoDate(ms: instant + Int64(offset) * 1000))
  }

  func testAFullMoonAtOneInTheMorningIsTonightOnItsLocalDate() throws {
    let full = Sky.nextMoonPhase(afterMs: Rhythm.utcMillis(year: 2026, month: 10, day: 1), phase: .full)
    let (zone, localDay) = try zoneWhereItIsOneAM(at: full)
    let lunation = Sky.isoDate(ms: full)

    let onTheDay = InvitationEngine.current(ctx(localDay, timeZone: zone))
    XCTAssertEqual(onTheDay?.kind, .fullMoonReflection(lunation: lunation))
    XCTAssertTrue(onTheDay?.body.contains("tonight") == true, onTheDay?.body ?? "none")

    let dayBefore = Sky.isoDate(ms: Rhythm.dayMillis(date: localDay) - 86_400_000)
    let eve = InvitationEngine.current(ctx(dayBefore, timeZone: zone))
    XCTAssertEqual(eve?.kind, .fullMoonReflection(lunation: lunation))
    XCTAssertTrue(eve?.body.contains("tomorrow") == true, eve?.body ?? "none")
  }

  func testMoonInvitationsCountDaysInTheWritersZoneEastAndWest() throws {
    // The same new moon is "today" on its local date in UTC+11 and in UTC−8.
    let new = Sky.nextMoonPhase(afterMs: Rhythm.utcMillis(year: 2026, month: 10, day: 1), phase: .new)
    for hours in [11, -8] {
      let zone = try XCTUnwrap(TimeZone(secondsFromGMT: hours * 3600))
      let localDay = Sky.isoDate(ms: new + Int64(hours) * 3_600_000)
      let inv = InvitationEngine.current(ctx(localDay, timeZone: zone))
      XCTAssertEqual(inv?.kind, .newMoonIntention(lunation: Sky.isoDate(ms: new)), "UTC\(hours)")
      XCTAssertTrue(inv?.body.contains("today") == true, "UTC\(hours): \(inv?.body ?? "none")")
    }
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
