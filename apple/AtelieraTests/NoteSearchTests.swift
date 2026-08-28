import XCTest

@testable import Ateliera

final class NoteSearchTests: XCTestCase {
  private let docs = [
    SearchDoc(id: "a", title: "A quiet morning that worked", body: "Fifteen minutes still counted."),
    SearchDoc(id: "b", title: "I chose the slower answer", body: "A calm morning helped me choose."),
    SearchDoc(id: "c", title: "Evening walk", body: "The light was gold and the air was still."),
  ]

  func testEmptyQueryReturnsNothing() {
    XCTAssertTrue(NoteSearch.rank(docs, query: "").isEmpty)
    XCTAssertTrue(NoteSearch.rank(docs, query: "   ").isEmpty)
  }

  func testTitleHitsOutrankBodyHits() {
    // "morning" is in a's title and b's body -> a first.
    let results = NoteSearch.rank(docs, query: "morning")
    XCTAssertEqual(results.map(\.id), ["a", "b"])
  }

  func testAllTokensMustMatch() {
    // "quiet" only in a; "answer" only in b -> nothing matches both.
    XCTAssertTrue(NoteSearch.rank(docs, query: "quiet answer").isEmpty)
    // Both tokens in a.
    XCTAssertEqual(NoteSearch.rank(docs, query: "quiet worked").map(\.id), ["a"])
  }

  func testCaseInsensitiveAndAcrossTitleAndBody() {
    // "still" appears in a's body and c's body; ranks tie on score, title A→Z:
    // "A quiet morning…" before "Evening walk".
    XCTAssertEqual(NoteSearch.rank(docs, query: "STILL").map(\.id), ["a", "c"])
  }

  func testMatchesSpanningTitleAndBody() {
    // b: "calm" (body) + "slower" (title) both present.
    XCTAssertEqual(NoteSearch.rank(docs, query: "slower calm").map(\.id), ["b"])
  }
}
