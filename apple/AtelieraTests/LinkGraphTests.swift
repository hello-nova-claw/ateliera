import XCTest

@testable import Ateliera

// Golden-matched to @studio/content/src/links.ts `extractLinks` (see links.test.ts)
// and @studio/index/src/sqlite-index.ts resolve/backlinks/forwardLinks. Ground
// truth was captured with a throwaway vitest over the same corpus, then deleted.
final class LinkGraphTests: XCTestCase {
  private func kinds(_ body: String) -> [String] {
    LinkExtractor.extractLinks(from: body).map { "\($0.kind.rawValue):\($0.target)|\($0.label)" }
  }

  // MARK: - extractLinks parity (from links.test.ts)

  func testExtractsWikiAliasStableAndLocalPathInOrder() {
    XCTAssertEqual(
      kinds(
        "Meet [[A quiet morning]] and [[Future Self|her]]. "
          + "See [proof](../Reflection/proof.md#today) and [identity](studio://note/01HX)."),
      [
        "wiki:A quiet morning|A quiet morning",
        "wiki:Future Self|her",
        "path:../Reflection/proof.md|proof",
        "id:01HX|identity",
      ])
  }

  func testIgnoresImagesExternalCodeAndFenced() {
    XCTAssertEqual(
      kinds(
        "![cover](image.jpg) [site](https://example.com) [network](//example.com) "
          + "[text](note.txt) `[[not a link]]`\n```md\n[[also ignored]]\n```\n[[kept]]"),
      ["wiki:kept|kept"])
  }

  func testDeduplicatesExactTargetsPreservingOrder() {
    XCTAssertEqual(
      kinds("[[One]] [[One|again]] [one](One.md)"),
      ["wiki:One|One", "path:One.md|one"])
  }

  func testPreservesMalformedUriPathAndDropsEmptyWiki() {
    XCTAssertEqual(
      kinds("[[   ]] [broken](%E0%A4%A.md)"),
      ["path:%E0%A4%A.md|broken"])
  }

  func testAngleBracketDestinationWithSpacesAndParens() {
    XCTAssertEqual(
      kinds("[room](<Life Landscape/My Room (now).md>)"),
      ["path:Life Landscape/My Room (now).md|room"])
  }

  func testResolvesFullCollapsedAndShortcutReferences() {
    XCTAssertEqual(
      kinds(
        "[proof][evidence] and [identity][] and [Evidence] plus [missing][absent] and [site][external]\n\n"
          + "[evidence]: <../Reflection/Proof (now).md>\n"
          + "[identity]: studio://note/01REF\n"
          + "[external]: https://example.com"),
      [
        "path:../Reflection/Proof (now).md|proof",
        "id:01REF|identity",
      ])
  }

  func testUsesFirstNormalizedReferenceDefinition() {
    XCTAssertEqual(
      kinds("[proof][SHARED]\n\n[shared]: first.md\n[SHARED]: second.md"),
      ["path:first.md|proof"])
  }

  // MARK: - Corpus (golden values captured from the web index)

  private func corpus() -> LinkGraph {
    LinkGraph([
      (id: "01H00000000000000000000001", path: "Reflection/morning.md", title: "A quiet morning",
        body:
          "Meet [[Future Self|her]]. See [proof](../Identity/proof.md#today) and [self](studio://note/01H00000000000000000000002)."),
      (id: "01H00000000000000000000002", path: "Identity/future.md", title: "Future Self",
        body:
          "Links to [[A quiet morning]] and `[[not a link]]`\n```md\n[[also ignored]]\n```\n[[A quiet morning|dup]]."),
      (id: "01H00000000000000000000003", path: "Identity/proof.md", title: "Proof of calm",
        body: "Evidence [[Ambiguous]] here. Also [ext](https://example.com) and [rel](note.txt)."),
      (id: "01H00000000000000000000004", path: "Landscape/ambig-a.md", title: "Ambiguous",
        body: "One of two with the same title."),
      (id: "01H00000000000000000000005", path: "Landscape/ambig-b.md", title: "Ambiguous",
        body: "The other Ambiguous note."),
    ])
  }

  func testForwardLinksResolveWikiPathAndId() {
    let states = corpus().forwardLinks(of: "01H00000000000000000000001").map { $0.state }
    XCTAssertEqual(
      states,
      [
        .resolved("01H00000000000000000000002"),  // wiki Future Self
        .resolved("01H00000000000000000000003"),  // path ../Identity/proof.md
        .resolved("01H00000000000000000000002"),  // id studio://note/...02
      ])
  }

  func testForwardLinkAmbiguousWiki() {
    let states = corpus().forwardLinks(of: "01H00000000000000000000003").map { $0.state }
    XCTAssertEqual(states, [.ambiguous(["01H00000000000000000000004", "01H00000000000000000000005"])])
  }

  func testBacklinks() {
    let graph = corpus()
    XCTAssertEqual(graph.backlinks(of: "01H00000000000000000000001").map(\.id), ["01H00000000000000000000002"])
    XCTAssertEqual(graph.backlinks(of: "01H00000000000000000000002").map(\.id), ["01H00000000000000000000001"])
    XCTAssertEqual(graph.backlinks(of: "01H00000000000000000000003").map(\.id), ["01H00000000000000000000001"])
    XCTAssertTrue(graph.backlinks(of: "01H00000000000000000000004").isEmpty)
  }

  func testBacklinksExcludeSelfAndSortByTitleThenId() {
    // Two notes both linking to a target; sorted by title then id.
    let graph = LinkGraph([
      (id: "target", path: "T.md", title: "Target", body: "self [[Target]]"),
      (id: "b-src", path: "B.md", title: "Beta", body: "[[Target]]"),
      (id: "a-src", path: "A.md", title: "Alpha", body: "[[Target]]"),
    ])
    XCTAssertEqual(graph.backlinks(of: "target").map(\.title), ["Alpha", "Beta"])
    XCTAssertFalse(graph.backlinks(of: "target").contains { $0.id == "target" })
  }

  func testBrokenWikiAndPathEscape() {
    let graph = LinkGraph([
      (id: "n1", path: "Deep/note.md", title: "Note",
        body: "[[Nowhere]] and [escape](../../outside.md) and [ok](sibling.md)"),
      (id: "n2", path: "Deep/sibling.md", title: "Sibling", body: ""),
    ])
    let states = graph.forwardLinks(of: "n1").map { $0.state }
    XCTAssertEqual(states, [.broken, .broken, .resolved("n2")])
  }

  func testUntitledFallbackInBacklinks() {
    let graph = LinkGraph([
      (id: "t", path: "T.md", title: "Target", body: ""),
      (id: "s", path: "S.md", title: "", body: "[[Target]]"),
    ])
    XCTAssertEqual(graph.backlinks(of: "t").map(\.title), ["Untitled"])
  }
}
