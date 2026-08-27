import XCTest

@testable import Ateliera

final class NoteParserTests: XCTestCase {
  private let golden = [
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

  func testParsesTheKnownFieldsAndKeepsUnknownKeys() throws {
    let note = try XCTUnwrap(NoteParser.parse(golden))
    XCTAssertEqual(note.schemaVersion, 1)
    XCTAssertEqual(note.id, "01JTEST")
    XCTAssertEqual(note.title, "A quiet morning that worked")
    XCTAssertEqual(note.cardType, "reflection")
    XCTAssertEqual(note.semanticType, "celebration")
    XCTAssertEqual(note.rooms, ["reflection-garden"])
    XCTAssertEqual(note.tags, ["calm", "practice"])
    XCTAssertEqual(note.attachments, [])
    XCTAssertFalse(note.display.featured)
    XCTAssertEqual(note.privacy.sensitivity, "private")
    XCTAssertEqual(note.privacy.aiAccess, "ask")
    XCTAssertEqual(note.body, "Fifteen minutes still counted.\n")
    // Unknown key survives, in place.
    XCTAssertEqual(note.extraFrontmatter.count, 1)
    XCTAssertEqual(note.extraFrontmatter.first?.0, "custom_key")
    XCTAssertEqual(note.extraFrontmatter.first?.1, .scalar("keep-me"))
  }

  func testParseThenSerializeRoundTripsByteForByte() throws {
    let note = try XCTUnwrap(NoteParser.parse(golden))
    XCTAssertEqual(note.serialize(), golden)
  }
}
