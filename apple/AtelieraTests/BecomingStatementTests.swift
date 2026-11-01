import XCTest

@testable import Ateliera

// The Life planning capture shows "I am becoming someone who…" and the person completes
// it. Someone who types the whole sentence anyway must get it saved once, not twice.
final class BecomingStatementTests: XCTestCase {
  func testCompletesTheLeadIn() {
    XCTAssertEqual(
      BecomingStatement.compose("rests before they're depleted."),
      "I am becoming someone who rests before they're depleted.")
  }

  func testTypingTheWholeSentenceSavesItOnce() {
    for typed in [
      "I am becoming someone who rests before they're depleted.",
      "I'm becoming someone who rests before they're depleted.",
      "I’m becoming someone who rests before they're depleted.",
      "i am becoming someone who rests before they're depleted.",
      "I am becoming someone who… rests before they're depleted.",
      "  I am becoming someone who   rests before they're depleted.",
    ] {
      XCTAssertEqual(
        BecomingStatement.compose(typed),
        "I am becoming someone who rests before they're depleted.", typed)
    }
  }

  func testKeepsWordsThatOnlyStartLikeTheLeadIn() {
    XCTAssertEqual(
      BecomingStatement.compose("I am becoming someone whole again."),
      "I am becoming someone who I am becoming someone whole again.")
  }
}
