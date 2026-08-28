import XCTest

@testable import Ateliera

// Editing any metadata field mutates the StudioNote model and re-serializes the
// whole thing; these confirm each field survives a serialize→parse round trip and
// leaves the rest (including unknown keys) intact — the guarantee that P1's editor
// can touch any field without corrupting the note or breaking web interop.
final class MetadataRoundTripTests: XCTestCase {
  private func base() -> StudioNote {
    StudioNote.capture(
      title: "A note", body: "body text.", id: "01TESTMETA0000000000000000",
      created: "2026-08-28T00:00:00.000Z")
  }

  private func roundTrip(_ note: StudioNote) throws -> StudioNote {
    try XCTUnwrap(NoteParser.parse(note.serialize()))
  }

  func testStatusChangeRoundTrips() throws {
    var note = base()
    note.status = "resting"
    let result = try roundTrip(note)
    XCTAssertEqual(result.status, "resting")
    XCTAssertEqual(result.cardType, note.cardType)  // untouched
  }

  func testTagsRoundTrip() throws {
    var note = base()
    note.tags = ["calm", "practice"]
    XCTAssertEqual(try roundTrip(note).tags, ["calm", "practice"])
  }

  func testLifeAreasRoundTrip() throws {
    var note = base()
    note.lifeAreas = ["family", "creativity"]
    XCTAssertEqual(try roundTrip(note).lifeAreas, ["family", "creativity"])
  }

  func testLandscapeAnchorRoundTrip() throws {
    var note = base()
    note.landscapeAnchor = "decisions"
    XCTAssertEqual(try roundTrip(note).landscapeAnchor, "decisions")
  }

  func testSemanticTypeAndRoomsRoundTrip() throws {
    var note = base()
    note.semanticType = "growth"
    note.rooms = ["reflection-garden", "inbox"]
    let result = try roundTrip(note)
    XCTAssertEqual(result.semanticType, "growth")
    XCTAssertEqual(result.rooms, ["reflection-garden", "inbox"])
  }

  func testSourceRoundTrip() throws {
    var note = base()
    note.source = NoteSource(title: "A Book", creator: "An Author", url: "https://x.test/y")
    let result = try roundTrip(note)
    XCTAssertEqual(result.source?.url, "https://x.test/y")
    XCTAssertEqual(result.source?.title, "A Book")
  }

  func testPrivacyRoundTrip() throws {
    var note = base()
    note.privacy = NotePrivacy(sensitivity: "sensitive", aiAccess: "never")
    let result = try roundTrip(note)
    XCTAssertEqual(result.privacy.sensitivity, "sensitive")
    XCTAssertEqual(result.privacy.aiAccess, "never")
  }

  func testFeaturedToggleRoundTrips() throws {
    var note = base()
    note.display = NoteDisplay(cover: nil, featured: true)
    XCTAssertTrue(try roundTrip(note).display.featured)
  }

  func testUnknownFrontmatterPreservedAfterMetadataEdit() throws {
    var note = base()
    note.extraFrontmatter = [("mood", .scalar("tender"))]
    note.tags = ["changed"]
    let result = try roundTrip(note)
    XCTAssertEqual(result.tags, ["changed"])
    XCTAssertEqual(result.extraFrontmatter.first?.0, "mood")
    XCTAssertEqual(result.extraFrontmatter.first?.1, .scalar("tender"))
  }

  func testTypedEnumViews() {
    var note = base()
    note.status = "resting"
    note.semanticType = "growth"
    note.landscapeAnchor = "structure-strategy"
    XCTAssertEqual(note.statusEnum, .resting)
    XCTAssertEqual(note.semanticTypeEnum, .growth)
    XCTAssertEqual(note.landscapeAnchorEnum, .structureStrategy)
  }
}
