import XCTest

@testable import Ateliera

// The Life planning capture shows "I am becoming someone who…" and the person completes
// it. Someone who types the whole sentence anyway must get it saved once, not twice.
// All completions are invented test text.
final class BecomingStatementTests: XCTestCase {
  private let saved = "I am becoming someone who tends the test lighthouse."

  func testCompletesTheLeadIn() {
    XCTAssertEqual(BecomingStatement.compose("tends the test lighthouse."), saved)
  }

  func testTypingTheWholeSentenceSavesItOnce() {
    for typed in [
      "I am becoming someone who tends the test lighthouse.",
      "I'm becoming someone who tends the test lighthouse.",
      "I’m becoming someone who tends the test lighthouse.",
      "i am becoming someone who tends the test lighthouse.",
      "I am becoming someone who… tends the test lighthouse.",
      "I am becoming someone who... tends the test lighthouse.",
      "  I am becoming someone who   tends the test lighthouse.",
      "I am becoming someone who\ntends the test lighthouse.",
      "I am becoming someone who, tends the test lighthouse.",
    ] {
      XCTAssertEqual(BecomingStatement.compose(typed), saved, typed)
    }
  }

  func testKeepsAFullStopThatStartsTheCompletion() {
    XCTAssertEqual(
      BecomingStatement.compose("I am becoming someone who .Testlang programs."),
      "I am becoming someone who .Testlang programs.")
  }

  func testKeepsWordsThatOnlyStartLikeTheLeadIn() {
    XCTAssertEqual(
      BecomingStatement.compose("I am becoming someone whole again."),
      "I am becoming someone who I am becoming someone whole again.")
    XCTAssertEqual(
      BecomingStatement.compose("I am becoming someone who's testing."),
      "I am becoming someone who I am becoming someone who's testing.")
  }
}
