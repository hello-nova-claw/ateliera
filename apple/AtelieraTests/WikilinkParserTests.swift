import XCTest

@testable import Ateliera

// Golden-matched to @studio/content/src/links.ts (see links.test.ts).
final class WikilinkParserTests: XCTestCase {
  private func targets(_ body: String) -> [(String, String)] {
    WikilinkParser.parse(body).map { ($0.target, $0.label) }
  }

  func testExtractsBasicWikilink() {
    let links = WikilinkParser.parse("Meet [[A quiet morning]] today.")
    XCTAssertEqual(links.map(\.target), ["A quiet morning"])
    XCTAssertEqual(links.first?.label, "A quiet morning")
  }

  func testExtractsAliasedWikilink() {
    let link = WikilinkParser.parse("See [[Future Self|her]] soon.").first
    XCTAssertEqual(link?.target, "Future Self")
    XCTAssertEqual(link?.label, "her")
  }

  func testSkipsCodeSpanWikilink() {
    XCTAssertTrue(WikilinkParser.parse("`[[not a link]]`").isEmpty)
  }

  func testSkipsFencedCodeWikilink() {
    XCTAssertTrue(WikilinkParser.parse("```\n[[also ignored]]\n```").isEmpty)
  }

  func testKeepsLinkOutsideCode() {
    XCTAssertEqual(targets("`code` then [[kept]]").map(\.0), ["kept"])
  }

  func testIgnoresEmptyTarget() {
    XCTAssertTrue(WikilinkParser.parse("[[   ]]").isEmpty)
  }

  func testDeduplicatesSameTargetFirstWins() {
    // Same target twice (case-insensitive) → one link, the first's label.
    let links = WikilinkParser.parse("[[One]] and [[one|again]]")
    XCTAssertEqual(links.map { ($0.target, $0.label) }.map { "\($0.0)|\($0.1)" }, ["One|One"])
  }

  func testMultipleWikilinksInOrder() {
    XCTAssertEqual(targets("[[Alpha]] [[Beta]] [[Gamma]]").map(\.0), ["Alpha", "Beta", "Gamma"])
  }

  func testRangeMapsToTheSpan() {
    let body = "x [[Target]] y"
    let link = WikilinkParser.parse(body).first!
    XCTAssertEqual(String(body[link.range]), "[[Target]]")
  }

  func testGoldenFromLinksTestTs() {
    // The canonical case from packages/content/src/links.test.ts (wiki links only).
    let body =
      "Meet [[A quiet morning]] and [[Future Self|her]].\n"
      + "See [proof](../Reflection/proof.md#today) and [identity](studio://note/01HX)."
    XCTAssertEqual(
      targets(body).map { "\($0.0)|\($0.1)" },
      ["A quiet morning|A quiet morning", "Future Self|her"])
  }
}
