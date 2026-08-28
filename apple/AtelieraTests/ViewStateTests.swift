import XCTest

@testable import Ateliera

final class ViewStateTests: XCTestCase {

  // MARK: - Path encoding

  func testPathEncodesColonsAsPercent3A() {
    let result = ViewState.path("landscape:family:decisions")
    XCTAssertEqual(result, ".studio/views/landscape%3Afamily%3Adecisions.json")
  }

  func testPathReturnsNilForEmptyKey() {
    XCTAssertNil(ViewState.path(""))
  }

  func testPathReturnsNilForWhitespaceOnlyKey() {
    XCTAssertNil(ViewState.path("   "))
  }

  // MARK: - Serialize golden bytes

  func testSerializeGoldenTwoIds() {
    let result = ViewState.serialize(["AAA", "BBB"])
    let expected =
      "{\n  \"version\": 1,\n  \"noteIds\": [\n    \"AAA\",\n    \"BBB\"\n  ]\n}\n"
    XCTAssertEqual(result, expected)
  }

  func testSerializeGoldenEmptyList() {
    let result = ViewState.serialize([])
    let expected = "{\n  \"version\": 1,\n  \"noteIds\": []\n}\n"
    XCTAssertEqual(result, expected)
  }

  // MARK: - Parse round-trip

  func testParseRoundTrip() {
    let ids = ["note-001", "note-002", "note-003"]
    let serialized = ViewState.serialize(ids)
    let parsed = ViewState.parse(serialized)
    XCTAssertEqual(parsed, ids)
  }

  // MARK: - Parse deduplication

  func testParseDeduplicates() {
    let json = "{\"version\":1,\"noteIds\":[\"A\",\"A\",\"B\"]}"
    let result = ViewState.parse(json)
    XCTAssertEqual(result, ["A", "B"])
  }

  // MARK: - Parse garbage

  func testParseGarbageReturnsEmpty() {
    XCTAssertEqual(ViewState.parse("not json {{"), [])
  }

  func testParseWrongVersionReturnsEmpty() {
    let json = "{\"version\":2,\"noteIds\":[\"A\"]}"
    XCTAssertEqual(ViewState.parse(json), [])
  }

  func testParseMissingNoteIdsReturnsEmpty() {
    let json = "{\"version\":1}"
    XCTAssertEqual(ViewState.parse(json), [])
  }
}
