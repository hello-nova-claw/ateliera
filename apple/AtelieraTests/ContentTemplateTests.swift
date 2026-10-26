import XCTest

@testable import Ateliera

// Content templates carry `{name}` placeholders that the call site fills.
final class ContentTemplateTests: XCTestCase {
  func testFillsEveryPlaceholder() {
    XCTAssertEqual(
      "The {point} is {when} — {season} begins.".filled([
        "point": "March equinox", "when": "tomorrow", "season": "spring",
      ]),
      "The March equinox is tomorrow — spring begins.")
  }

  func testNeverRereadsAFilledValueAsAPlaceholder() {
    XCTAssertEqual("“{title}” is closing".filled(["title": "{when}", "when": "x"]), "“{when}” is closing")
  }

  func testLeavesUnknownAndUnclosedPlaceholdersAsWritten() {
    XCTAssertEqual("{known} {unknown}".filled(["known": "a"]), "a {unknown}")
    XCTAssertEqual("a { b".filled([:]), "a { b")
  }
}
