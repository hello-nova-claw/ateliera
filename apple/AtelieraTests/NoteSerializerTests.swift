import XCTest

@testable import Ateliera

// The golden is the exact byte output of @studio/content's serializeNote for the
// same note (captured from the TS serializer). If this passes, a note written by
// the native app is byte-identical to one written by the web app — one vault.
final class NoteSerializerTests: XCTestCase {
  func testSerializerMatchesTheWebSerializerByteForByte() {
    let note = StudioNote(
      schemaVersion: 1,
      id: "01JTEST",
      title: "A quiet morning that worked",
      cardType: "reflection",
      semanticType: "celebration",
      status: "active",
      rooms: ["reflection-garden"],
      lifeAreas: ["family"],
      landscapeAnchor: nil,
      seasons: ["2026-winter"],
      tags: ["calm", "practice"],
      created: "2026-07-14T09:00:00+10:00",
      updated: "2026-07-14T09:00:00+10:00",
      source: nil,
      sourceNoteIds: nil,
      resurfaceKind: nil,
      resurfaceDue: nil,
      resurfaceIntervalDays: nil,
      attachments: [],
      display: NoteDisplay(cover: nil, featured: false),
      privacy: NotePrivacy(sensitivity: "private", aiAccess: "ask"),
      extraFrontmatter: [("custom_key", .scalar("keep-me"))],
      body: "Fifteen minutes still counted.\n"
    )

    let golden = [
      "---",
      "custom_key: keep-me",
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
      "Fifteen minutes still counted.",
      "",
    ].joined(separator: "\n")

    XCTAssertEqual(note.serialize(), golden)
  }
}
