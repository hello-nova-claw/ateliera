import XCTest

@testable import Ateliera

final class WikilinkNavigatorTests: XCTestCase {
  private func note(path: String, id: String, title: String) -> NoteSummary {
    NoteSummary(id: path, noteId: id, title: title, snippet: "", meaning: "reflection", timestamp: "", rooms: [])
  }

  func testResolvesExactTitleCaseInsensitively() {
    let notes = [note(path: "Inbox/a.md", id: "01A", title: "A Quiet Morning")]
    XCTAssertEqual(WikilinkNavigator.resolvePath(target: "a quiet morning", in: notes), "Inbox/a.md")
  }

  func testResolvesStudioUriById() {
    let notes = [note(path: "Inbox/a.md", id: "01ABC", title: "A")]
    XCTAssertEqual(
      WikilinkNavigator.resolvePath(target: "studio://note/01ABC", in: notes), "Inbox/a.md")
  }

  func testReturnsNilWhenUnresolved() {
    let notes = [note(path: "Inbox/a.md", id: "01A", title: "A")]
    XCTAssertNil(WikilinkNavigator.resolvePath(target: "Nonexistent", in: notes))
    XCTAssertNil(WikilinkNavigator.resolvePath(target: "studio://note/nope", in: notes))
  }

  func testFirstPathWinsForDuplicateTitles() {
    let notes = [
      note(path: "Inbox/z.md", id: "01Z", title: "Twin"),
      note(path: "Inbox/a.md", id: "01A", title: "Twin"),
    ]
    XCTAssertEqual(WikilinkNavigator.resolvePath(target: "Twin", in: notes), "Inbox/a.md")
  }
}
