import XCTest

@testable import Ateliera

// The Details editor's Tags and Seasons fields: comma-separated text that edits a list.
// Typing must never be rewritten under the cursor, or a second item can't be typed.
final class CommaListTests: XCTestCase {
  func testTypingASecondTagKeepsTheCommaAndAddsTheTag() {
    var field = CommaListText(items: [])
    var items: [String] = []
    for text in ["c", "calm", "calm,", "calm, ", "calm, p", "calm, practice"] {
      items = field.edit(text)
      XCTAssertEqual(field.text, text, "the field rewrote what was typed")
    }
    XCTAssertEqual(items, ["calm", "practice"])
  }

  func testTrimsSpacesAndDropsEmptyItems() {
    var field = CommaListText(items: [])
    XCTAssertEqual(field.edit(" calm ,, practice ,"), ["calm", "practice"])
  }

  func testStartsFromTheNotesItems() {
    XCTAssertEqual(CommaListText(items: ["2026-winter", "rest"]).text, "2026-winter, rest")
  }

  func testFollowsAChangeMadeElsewhereButNotItsOwnEcho() {
    var field = CommaListText(items: [])
    let items = field.edit("calm, ")
    field.sync(items)
    XCTAssertEqual(field.text, "calm, ", "its own edit came back and reset the text")
    field.sync(["rest"])
    XCTAssertEqual(field.text, "rest")
  }
}
