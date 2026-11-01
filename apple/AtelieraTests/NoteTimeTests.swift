import XCTest

@testable import Ateliera

// An entry keeps the day and offset it was written in. Expected values come from the
// web engine (`packages/domain/src/written-time.test.ts` and the content serializer),
// so both apps write and read the same timestamps.
final class NoteTimeTests: XCTestCase {
  // 08:00 on 2 November 2026 in Melbourne (UTC+11) is still 1 November in UTC and in
  // Los Angeles.
  private let melbourneMorning = Date(timeIntervalSince1970: 1_793_566_800)
  private let readers = ["Australia/Melbourne", "America/Los_Angeles", "UTC"]
  private var savedDefault: TimeZone!

  override func setUp() {
    super.setUp()
    savedDefault = NSTimeZone.default
  }

  override func tearDown() {
    NSTimeZone.default = savedDefault
    super.tearDown()
  }

  private func zone(_ identifier: String) throws -> TimeZone {
    try XCTUnwrap(TimeZone(identifier: identifier))
  }

  func testTimestampKeepsTheWritersWallClockAndOffset() throws {
    let goldens: [(String, Date, String)] = [
      ("Australia/Melbourne", melbourneMorning, "2026-11-02T08:00:00.000+11:00"),
      (
        "Australia/Melbourne", Date(timeIntervalSince1970: 1_782_943_200),
        "2026-07-02T08:00:00.000+10:00"
      ),
      (
        "America/Los_Angeles", Date(timeIntervalSince1970: 1_793_547_005.25),
        "2026-11-01T07:30:05.250-08:00"
      ),
      (
        "America/Los_Angeles", Date(timeIntervalSince1970: 1_793_460_600),
        "2026-10-31T08:30:00.000-07:00"
      ),
      ("UTC", melbourneMorning, "2026-11-01T21:00:00.000+00:00"),
      ("Asia/Kolkata", melbourneMorning, "2026-11-02T02:30:00.000+05:30"),
      ("Pacific/Kiritimati", melbourneMorning, "2026-11-02T11:00:00.000+14:00"),
      ("Pacific/Pago_Pago", melbourneMorning, "2026-11-01T10:00:00.000-11:00"),
    ]
    for (identifier, instant, expected) in goldens {
      XCTAssertEqual(
        NoteFactory.isoTimestamp(instant, timeZone: try zone(identifier)), expected, identifier)
      XCTAssertEqual(NoteTime.instant(expected), instant, identifier)
    }
  }

  func testWrittenDayIsTheWritersDate() {
    XCTAssertEqual(NoteTime.writtenDay("2026-11-02T08:00:00.000+11:00"), "2026-11-02")
    XCTAssertEqual(NoteTime.writtenDay("2026-11-01T07:30:05.250-08:00"), "2026-11-01")
    XCTAssertEqual(NoteTime.writtenDay("2026-11-01T21:00:00.000Z"), "2026-11-01")
    XCTAssertNil(NoteTime.writtenDay("yesterday"))
    XCTAssertNil(NoteTime.writtenDay("2026-02-30T08:00:00+11:00"))
  }

  func testAMelbourneMorningStaysOnItsDateWhereverItIsRead() throws {
    let created = NoteFactory.isoTimestamp(
      melbourneMorning, timeZone: try zone("Australia/Melbourne"))
    let note = StudioNote.capture(
      title: "A quiet morning", body: "Fifteen minutes still counted.",
      id: "00000000000000000000ABCDEF", created: created)
    // Byte-identical to the web serializer for the same note.
    XCTAssertEqual(
      note.serialize(),
      "---\nschema_version: 1\nid: 00000000000000000000ABCDEF\ntitle: A quiet morning\n"
        + "card_type: capture\nsemantic_type: reflection\nstatus: draft\nrooms:\n  - inbox\n"
        + "life_areas: []\nseasons: []\ntags: []\ncreated: 2026-11-02T08:00:00.000+11:00\n"
        + "updated: 2026-11-02T08:00:00.000+11:00\nattachments: []\ndisplay:\n"
        + "  featured: false\nprivacy:\n  sensitivity: private\n  ai_access: ask\n---\n"
        + "Fifteen minutes still counted.")
    XCTAssertEqual(
      NoteFactory.suggestFilename(
        created: created, title: note.title, cardType: note.cardType, id: note.id),
      "2026-11-02--a-quiet-morning--abcdef.md")

    for reader in readers {
      NSTimeZone.default = try zone(reader)
      let parsed = try XCTUnwrap(NoteParser.parse(note.serialize()), reader)
      XCTAssertEqual(parsed.created, "2026-11-02T08:00:00.000+11:00", reader)
      XCTAssertEqual(JournalEntryRow.dateLabel(parsed.created), "2 November 2026", reader)
    }
  }

  func testNotesSortByWhenTheyWereWrittenNotByTheirText() throws {
    // 08:00 in Melbourne is 21:00 UTC, two hours before the UTC note, though its text
    // sorts later.
    let melbourne = StudioNote.capture(
      title: "Melbourne", body: "", id: "melbourne", created: "2026-11-02T08:00:00.000+11:00")
    let utc = StudioNote.capture(
      title: "UTC", body: "", id: "utc", created: "2026-11-01T23:00:00.000Z")
    for reader in readers {
      NSTimeZone.default = try zone(reader)
      XCTAssertTrue(Projection.before(utc, melbourne), reader)
      XCTAssertFalse(Projection.before(melbourne, utc), reader)
      XCTAssertTrue(
        NoteTime.isNewer("2026-11-01T23:00:00.000Z", than: "2026-11-02T08:00:00.000+11:00"),
        reader)
    }
  }
}
