import XCTest

@testable import Ateliera

// Byte parity with the web serializer for every scalar quoting style. The goldens in
// fixtures/yaml-parity/scalars.json are written by `@studio/content`'s serializeNote
// (see packages/content/src/yaml-parity.test.ts); each one holds a single string as
// the title, a top-level unknown key, a nested map value, a list item and a value in
// a list of maps.
final class YamlParityTests: XCTestCase {
  private struct Golden: Decodable {
    let value: String
    let note: String
  }

  private let repo = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

  private func goldens() throws -> [Golden] {
    let url = repo.appendingPathComponent("fixtures/yaml-parity/scalars.json")
    return try JSONDecoder().decode([Golden].self, from: Data(contentsOf: url))
  }

  private func extras(_ value: String) -> [(String, YamlNode)] {
    [
      ("top", .scalar(value)),
      ("map", .map([("inner", .scalar(value))])),
      ("list", .list([value])),
      ("seq", .mapSeq([[("key", .scalar(value))]])),
    ]
  }

  private func note(_ value: String) -> StudioNote {
    StudioNote(
      id: "01JPARITY", title: value, cardType: "fragment", semanticType: "reflection",
      status: "active", rooms: [], lifeAreas: [], seasons: [], tags: [],
      created: "2026-07-14T09:00:00+10:00", updated: "2026-07-14T09:00:00+10:00",
      attachments: [], display: NoteDisplay(cover: nil, featured: false),
      privacy: NotePrivacy(sensitivity: "private", aiAccess: "ask"),
      extraFrontmatter: extras(value), body: "")
  }

  func testTheGoldenFileCoversEveryQuotingStyle() throws {
    let notes = try goldens().map(\.note)
    XCTAssertGreaterThan(notes.count, 100)
    XCTAssertTrue(notes.contains { $0.contains("title: 'Note: \"quoted\"'\n") })
    XCTAssertTrue(notes.contains { $0.contains("title: \"it's: here\"\n") })
    XCTAssertTrue(notes.contains { $0.contains("\\x01") })
    for header in ["|-", "|", "|+", "|2-"] {
      XCTAssertTrue(notes.contains { $0.contains("title: \(header)\n") }, header)
    }
    // A double-quoted string folded across lines, with an empty line for a line feed.
    XCTAssertTrue(notes.contains { $0.contains("\\x01 and\n\n  newline") })
  }

  func testSerializingMatchesTheWebByteForByte() throws {
    for golden in try goldens() {
      XCTAssertEqual(
        note(golden.value).serialize(), golden.note, "value: \(golden.value.debugDescription)")
    }
  }

  func testParsingTheWebOutputGivesTheStringBack() throws {
    for golden in try goldens() {
      let label = "value: \(golden.value.debugDescription)"
      guard let parsed = NoteParser.parse(golden.note) else {
        XCTFail("did not parse, \(label)")
        continue
      }
      XCTAssertEqual(parsed.title, golden.value, label)
      XCTAssertEqual(parsed.extraFrontmatter.map(\.0), ["top", "map", "list", "seq"], label)
      XCTAssertEqual(parsed.extraFrontmatter.map(\.1), extras(golden.value).map(\.1), label)
    }
  }

  func testATitleWithQuotesSurvivesRepeatedSaves() throws {
    var text = note("Note: \"quoted\" and a back\\slash").serialize()
    for _ in 0..<3 {
      let parsed = try XCTUnwrap(NoteParser.parse(text))
      XCTAssertEqual(parsed.title, "Note: \"quoted\" and a back\\slash")
      text = parsed.serialize()
    }
  }

  // Serialize then parse is the identity for any string, including line feeds,
  // quotes, backslashes, control characters and look-alikes of other YAML types, and
  // no string can add, remove or reorder a frontmatter key.
  func testRoundTripIsTheIdentityForGeneratedStrings() throws {
    let pieces = [
      "a", "Z", "0", "1", ".", "e", " ", "\t", "\r", ":", ": ", "#", " #", "-", "- ", "?",
      ",", "[", "]", "{", "}", "&", "*", "!", "|", ">", "'", "\"", "%", "@", "`", "\\", "~",
      "true", "null", "1e3", "\u{0}", "\u{1}", "\u{7}", "\u{8}", "\u{B}", "\u{C}", "\u{1B}",
      "\u{1F}", "\u{7F}", "\u{85}", "\u{A0}", "\u{2028}", "\u{2029}", "\u{3000}", "é",
      "\u{1F319}", "\\x41", "\\u0041", "''", "\n", "\n", "\n\n", " \n", "\n ", "\n  ",
      "---", "...", "key: value", "|-", "\"",
    ]
    var generator = SeededGenerator(seed: 0x5EED_2026)
    for _ in 0..<3000 {
      let length = Int.random(in: 0..<12, using: &generator)
      let value = (0..<length).map { _ in pieces.randomElement(using: &generator) ?? "" }.joined()
      let written = note(value).serialize()
      let parsed = try XCTUnwrap(NoteParser.parse(written), value.debugDescription)
      XCTAssertEqual(parsed.title, value, value.debugDescription)
      XCTAssertEqual(parsed.serialize(), written, value.debugDescription)
      XCTAssertEqual(
        parsed.extraFrontmatter.map(\.1), extras(value).map(\.1), value.debugDescription)
    }
  }

  func testALineFeedCannotInjectAKey() throws {
    let title = "x\nresurface_kind: wish\nresurface_due: 2020-01-01\nresurface_interval_days: 1"
    let parsed = try XCTUnwrap(NoteParser.parse(note(title).serialize()))
    XCTAssertEqual(parsed.title, title)
    XCTAssertNil(parsed.resurfaceKind)
    XCTAssertNil(parsed.resurfaceDue)
    XCTAssertNil(parsed.resurfaceIntervalDays)
  }

  func testAClosingFenceInsideAValueStaysInTheValue() throws {
    var archived = note("x")
    archived.extraFrontmatter = [("archived_reason", .scalar("done\n---\nbody"))]
    let parsed = try XCTUnwrap(NoteParser.parse(archived.serialize()))
    XCTAssertEqual(parsed.frontmatterScalar("archived_reason"), "done\n---\nbody")
    XCTAssertEqual(parsed.body, "")
  }

  func testQuotedScalarsFoldedByOtherWritersAreRead() throws {
    let text = [
      "---",
      "double: \"one",
      "  two\\",
      "  \\ three",
      "",
      "  four \\",
      "  five\"",
      "single: 'it''s",
      "",
      "",
      "  folded'",
      "block: |",
      "  kept",
      "",
      "    indented",
      "after: yes",
      "schema_version: 1",
      "id: 01JPARITY",
      "card_type: fragment",
      "semantic_type: reflection",
      "status: active",
      "rooms: []",
      "life_areas: []",
      "seasons: []",
      "tags: []",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "",
    ].joined(separator: "\n")
    let parsed = try XCTUnwrap(NoteParser.parse(text))
    XCTAssertEqual(parsed.frontmatterScalar("double"), "one two three\nfour five")
    XCTAssertEqual(parsed.frontmatterScalar("single"), "it's\n\nfolded")
    XCTAssertEqual(parsed.frontmatterScalar("block"), "kept\n\n  indented\n")
    XCTAssertEqual(parsed.frontmatterScalar("after"), "yes")
  }

  private func noteText(_ frontmatter: [String]) -> String {
    (["---"] + frontmatter + [
      "schema_version: 1", "id: 01JPARITY", "card_type: fragment", "semantic_type: reflection",
      "status: active", "rooms: []", "life_areas: []", "seasons: []", "tags: []",
      "created: 2026-07-14T09:00:00+10:00", "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []", "display:", "  featured: false", "privacy:", "  sensitivity: private",
      "  ai_access: ask", "---", "",
    ]).joined(separator: "\n")
  }

  // The web's strict parse rejects these (BAD_DQ_ESCAPE), so the native reader does too
  // and the note goes to Repair unchanged rather than being saved with an altered value.
  func testMalformedEscapesRejectTheNote() {
    for escape in ["\\q", "\\xZZ", "\\u12", "\\U00110000"] {
      XCTAssertNil(NoteParser.parse(noteText(["x: \"a\(escape)b\""])), escape)
      XCTAssertNil(NoteParser.parse(noteText(["list:", "  - \"\(escape)\""])), escape)
    }
    // A lone surrogate is valid YAML but cannot live in a Swift string.
    let lone = NoteParser.parse(noteText(["x: \"a\\uD800b\""]))
    XCTAssertEqual(lone?.frontmatterScalar("x"), "a\u{FFFD}b")
  }

  func testAListItemIsAMapOnlyWhenItsColonIsFollowedBySpaceOrEnd() throws {
    let parsed = try XCTUnwrap(
      NoteParser.parse(
        noteText(["plain:", "  - a:b", "  - c", "maps:", "  - first:", "    second: x"])))
    XCTAssertEqual(parsed.frontmatterList("plain"), ["a:b", "c"])
    XCTAssertEqual(
      parsed.extraFrontmatter.last?.1, .mapSeq([[("first", .map([])), ("second", .scalar("x"))]]))
  }

  func testDoubleQuotedEscapesFromOtherWritersAreDecoded() throws {
    let text = [
      "---",
      "escapes: \"\\0\\a\\b\\t\\\t\\n\\v\\f\\r\\e\\ \\\"\\/\\\\\\N\\_\\L\\P\"",
      "hex: \"\\x41\\u00e9\\U0001F319\\ud83c\\udf19\"",
      "single: 'it''s'",
      "spaced:",
      "  - \"a\"  ",
      "  - 'b'\t",
      "schema_version: 1",
      "id: 01JPARITY",
      "card_type: fragment",
      "semantic_type: reflection",
      "status: active",
      "rooms: []",
      "life_areas: []",
      "seasons: []",
      "tags: []",
      "created: 2026-07-14T09:00:00+10:00",
      "updated: 2026-07-14T09:00:00+10:00",
      "attachments: []",
      "display:",
      "  featured: false",
      "privacy:",
      "  sensitivity: private",
      "  ai_access: ask",
      "---",
      "",
    ].joined(separator: "\n")
    let parsed = try XCTUnwrap(NoteParser.parse(text))
    XCTAssertEqual(
      parsed.frontmatterScalar("escapes"),
      "\u{0}\u{7}\u{8}\t\t\n\u{B}\u{C}\r\u{1B} \"/\\\u{85}\u{A0}\u{2028}\u{2029}")
    XCTAssertEqual(parsed.frontmatterScalar("hex"), "Aé\u{1F319}\u{1F319}")
    XCTAssertEqual(parsed.frontmatterScalar("single"), "it's")
    XCTAssertEqual(parsed.frontmatterList("spaced"), ["a", "b"])
  }
}

// SplitMix64: a fixed seed gives the same strings on every run.
private struct SeededGenerator: RandomNumberGenerator {
  private var state: UInt64
  init(seed: UInt64) { state = seed }
  mutating func next() -> UInt64 {
    state &+= 0x9E37_79B9_7F4A_7C15
    var mixed = state
    mixed = (mixed ^ (mixed >> 30)) &* 0xBF58_476D_1CE4_E5B9
    mixed = (mixed ^ (mixed >> 27)) &* 0x94D0_49BB_1331_11EB
    return mixed ^ (mixed >> 31)
  }
}
