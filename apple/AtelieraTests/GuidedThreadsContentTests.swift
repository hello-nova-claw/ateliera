import XCTest

@testable import Ateliera

// The guided threads' prompts are content, bundled as Content/guided-threads.json.
final class GuidedThreadsContentTests: XCTestCase {
  func testHoldsTheThreeThreadsAndTheirSharedLines() throws {
    let library = try contentObject("guided-threads")
    XCTAssertEqual(
      Set(library.keys), ["reflection", "gratitude", "possibilities", "workForward", "stepFooter"])
    for kind in ["reflection", "gratitude", "possibilities"] {
      let thread = try XCTUnwrap(library[kind] as? [String: Any], kind)
      XCTAssertEqual(Set(thread.keys), ["opening", "steps", "closing"], kind)
      XCTAssertEqual((thread["steps"] as? [[String: String]])?.count, 2, kind)
    }
    let reflection = try XCTUnwrap(library["reflection"] as? [String: Any])
    let opening = try XCTUnwrap(reflection["opening"] as? [String: String])
    XCTAssertEqual(opening["prompt"], "What's on your mind as you look back?")
  }

  func testTheThreadsAskWhatTheyAlwaysAsked() {
    XCTAssertEqual(GuidedThreadKind.reflection.opening.prompt, "What's on your mind as you look back?")
    XCTAssertEqual(
      GuidedThreadKind.gratitude.opening.placeholder,
      "A win, a small mercy, something you're grateful for.")
    XCTAssertEqual(GuidedThreadKind.possibilities.steps.map(\.prompt), [
      "What draws you to it?", "What's the smallest hint of it you could notice or try?",
    ])
    XCTAssertEqual(GuidedThreadKind.possibilities.closingTitle, "Left as a possibility.")
    XCTAssertEqual(GuidedThreadKind.gratitude.closingBody, "This is on your Reflection Garden.")
  }
}
