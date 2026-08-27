import XCTest

@testable import Ateliera

// Golden fixtures captured verbatim from `@studio/content`'s serializeNote (the
// web ground truth). Each golden is fed through the native parser and re-serialized;
// the round trip must be byte-identical, which locks in the optional fields and
// scalar quoting that the simple base fixture doesn't exercise: landscape_anchor,
// the nested `source` map + source_notes, the resurface_* keys, YAML scalar
// quoting (colons, boolean/number-like strings, leading `#`), and \r\n endings.
final class NoteFixturesTests: XCTestCase {
  private func lf(_ lines: [String]) -> String { lines.joined(separator: "\n") }
  private func crlf(_ lines: [String]) -> String { lines.joined(separator: "\r\n") }

  private func assertRoundTrips(_ golden: String, file: StaticString = #filePath, line: UInt = #line)
    -> StudioNote
  {
    guard let note = NoteParser.parse(golden) else {
      XCTFail("golden did not parse", file: file, line: line)
      return StudioNote(
        id: "", cardType: "", semanticType: "", status: "", rooms: [], lifeAreas: [],
        seasons: [], tags: [], created: "", updated: "", attachments: [],
        display: NoteDisplay(cover: nil, featured: false),
        privacy: NotePrivacy(sensitivity: "private", aiAccess: "ask"), body: "")
    }
    XCTAssertEqual(note.serialize(), golden, file: file, line: line)
    return note
  }

  func testLandscapeAnchorRoundTrips() {
    let golden = lf([
      "---",
      "schema_version: 1",
      "id: 01JTEST",
      "title: A quiet morning that worked",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "landscape_anchor: practices",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - calm",
      "  - practice",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Fifteen minutes still counted.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.landscapeAnchor, "practices")
  }

  func testSourceObjectRoundTrips() {
    let golden = lf([
      "---",
      "schema_version: 1",
      "id: 01JTEST",
      "title: A quiet morning that worked",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - calm",
      "  - practice",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "source:",
      "  title: The Artist’s Way",
      "  creator: Julia Cameron",
      "  url: https://example.com/artists-way",
      "source_notes:",
      "  - 01JSOURCE1",
      "  - 01JSOURCE2",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Fifteen minutes still counted.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.source?.title, "The Artist’s Way")
    XCTAssertEqual(note.source?.creator, "Julia Cameron")
    XCTAssertEqual(note.source?.url, "https://example.com/artists-way")
    XCTAssertEqual(note.sourceNoteIds, ["01JSOURCE1", "01JSOURCE2"])
  }

  func testResurfaceKeysRoundTrip() {
    let golden = lf([
      "---",
      "schema_version: 1",
      "id: 01JTEST",
      "title: A quiet morning that worked",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - calm",
      "  - practice",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "resurface_kind: evidence",
      "resurface_due: 2026-08-01",
      "resurface_interval_days: 30",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Fifteen minutes still counted.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.resurfaceKind, "evidence")
    XCTAssertEqual(note.resurfaceDue, "2026-08-01")
    XCTAssertEqual(note.resurfaceIntervalDays, 30)
  }

  func testQuotedScalarsRoundTrip() {
    let golden = lf([
      "---",
      "note: \"value: with colon\"",
      "flag: yes",
      "schema_version: 1",
      "id: 01JTEST",
      "title: \"Morning: a beginning\"",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - \"true\"",
      "  - \"2026\"",
      "  - \"a #hashtag\"",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Fifteen minutes still counted.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.title, "Morning: a beginning")
    XCTAssertEqual(note.tags, ["true", "2026", "a #hashtag"])
    // Unknown quoted scalar survives unquoted in the model, re-quoted on write.
    XCTAssertEqual(note.extraFrontmatter.first?.0, "note")
    XCTAssertEqual(note.extraFrontmatter.first?.1, .scalar("value: with colon"))
  }

  func testCRLFLineEndingsRoundTrip() {
    let golden = crlf([
      "---",
      "schema_version: 1",
      "id: 01JTEST",
      "title: A quiet morning that worked",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - calm",
      "  - practice",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Line one.",
      "Line two.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.lineEnding, "\r\n")
    XCTAssertEqual(note.body, "Line one.\r\nLine two.\r\n")
  }

  func testEverythingAtOnceRoundTrips() {
    let golden = lf([
      "---",
      "mood: tender",
      "custom_list:",
      "  - a",
      "  - b",
      "schema_version: 1",
      "id: 01JTEST",
      "title: \"Everything at once: a test\"",
      "card_type: reflection",
      "semantic_type: celebration",
      "status: active",
      "rooms:",
      "  - reflection-garden",
      "life_areas:",
      "  - family",
      "landscape_anchor: structure-strategy",
      "seasons:",
      "  - 2026-winter",
      "tags:",
      "  - calm",
      "  - practice",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "source:",
      "  title: A Source",
      "  creator: An Author",
      "  url: https://x.test/y",
      "source_notes:",
      "  - 01JA",
      "  - 01JB",
      "resurface_kind: reframe",
      "resurface_due: 2026-09-01",
      "resurface_interval_days: 14",
      "attachments:",
      "  - media/photo.jpg",
      "display:",
      "  cover: media/photo.jpg",
      "  featured: true",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "Fifteen minutes still counted.",
      "",
    ])
    let note = assertRoundTrips(golden)
    XCTAssertEqual(note.display.cover, "media/photo.jpg")
    XCTAssertTrue(note.display.featured)
    XCTAssertEqual(note.attachments, ["media/photo.jpg"])
    // Unknown keys keep order and shape (scalar + list).
    XCTAssertEqual(note.extraFrontmatter.map(\.0), ["mood", "custom_list"])
    XCTAssertEqual(note.extraFrontmatter.last?.1, .list(["a", "b"]))
  }
}
