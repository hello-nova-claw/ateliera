import XCTest

@testable import Ateliera

// P4 repair: editable wiki links (offsets, code-skipping) + rewrite, golden-matched
// to link-edit.ts.
final class LinkEditorTests: XCTestCase {
  func testEditableWikiLinkOffsets() {
    let links = LinkEditor.editableLinks("See [[A quiet morning]] today.")
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links[0].kind, .wiki)
    XCTAssertEqual(links[0].target, "A quiet morning")
    XCTAssertEqual(links[0].label, "A quiet morning")
    XCTAssertEqual(links[0].start, 4)
    XCTAssertEqual(links[0].end, 23)
    XCTAssertEqual(links[0].index, 0)
  }

  func testEditableLinksSkipCodeAndCarryLabel() {
    let links = LinkEditor.editableLinks("[[Title|Label]] and `[[code]]` and [[Second]]")
    XCTAssertEqual(links.map { $0.target }, ["Title", "Second"])
    XCTAssertEqual(links[0].label, "Label")
    XCTAssertEqual(links[0].start, 0)
    XCTAssertEqual(links[0].end, 15)
    XCTAssertEqual(links[1].start, 35)
    XCTAssertEqual(links[1].end, 45)
    XCTAssertEqual(links[1].index, 1)
  }

  func testRewriteRemoveUnwrapsToLabel() throws {
    let out = try LinkEditor.rewrite("See [[A quiet morning]] today.", occurrence: 0, .remove)
    XCTAssertEqual(out, "See A quiet morning today.")
  }

  func testRewriteRelinkWikiKeepsLabel() throws {
    let out = try LinkEditor.rewrite(
      "See [[A quiet morning]] today.", occurrence: 0, .relink(kind: .wiki, target: "Morning"))
    XCTAssertEqual(out, "See [[Morning|A quiet morning]] today.")
  }

  func testRewriteRelinkWikiCollapsesWhenLabelMatches() throws {
    // Relinking [[Foo]] to Foo stays bare.
    let out = try LinkEditor.rewrite("A [[Foo]] b", occurrence: 0, .relink(kind: .wiki, target: "Foo"))
    XCTAssertEqual(out, "A [[Foo]] b")
  }

  func testRewriteRelinkIdEscapesLabelAndEncodesId() throws {
    let out = try LinkEditor.rewrite(
      "A [[Foo]] b", occurrence: 0, .relink(kind: .id, target: "01ABC"))
    XCTAssertEqual(out, "A [Foo](studio://note/01ABC) b")
  }

  func testRewriteInvalidOccurrenceThrows() {
    XCTAssertThrowsError(try LinkEditor.rewrite("no links", occurrence: 0, .remove))
    XCTAssertThrowsError(try LinkEditor.rewrite("[[A]]", occurrence: 5, .remove))
  }

  func testRewriteUnsafeWikiTargetThrows() {
    XCTAssertThrowsError(
      try LinkEditor.rewrite("[[A]]", occurrence: 0, .relink(kind: .wiki, target: "bad]]title")))
  }

  func testRewriteUnsafePathThrows() {
    // Escapes the vault root.
    XCTAssertThrowsError(
      try LinkEditor.rewrite("[[A]]", occurrence: 0, .relink(kind: .path, target: "../secret.md")))
    // Not a .md path.
    XCTAssertThrowsError(
      try LinkEditor.rewrite("[[A]]", occurrence: 0, .relink(kind: .path, target: "notes/thing")))
  }
}
