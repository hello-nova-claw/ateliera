import XCTest

@testable import Ateliera

// A note body is text the person may have imported from anywhere, so its links can only
// open web pages and mail: never files or other apps' URL schemes.
final class BodyPreviewLinkTests: XCTestCase {
  private func links(_ markdown: String) -> [URL] {
    BodyPreviewView.markdownChunk(markdown).runs.compactMap(\.link)
  }

  func testWebAndMailLinksStayLinks() {
    XCTAssertEqual(links("[site](https://example.com)"), [URL(string: "https://example.com")!])
    XCTAssertEqual(links("[plain](http://example.com)"), [URL(string: "http://example.com")!])
    XCTAssertEqual(
      links("[mail](mailto:someone@example.com)"), [URL(string: "mailto:someone@example.com")!])
  }

  func testOtherSchemesShowAsPlainText() {
    let cases = [
      ("[planted](file:///Applications/Calculator.app)", "planted"),
      ("[scheme](someapp://do-something)", "scheme"),
      ("[script](javascript:alert(1))", "script"),
    ]
    for (markdown, label) in cases {
      XCTAssertEqual(links(markdown), [], markdown)
      XCTAssertEqual(String(BodyPreviewView.markdownChunk(markdown).characters), label, markdown)
    }
  }

  func testOnlyWikilinksWebAndMailAreOpened() throws {
    let wikilink = try XCTUnwrap(BodyPreviewView.wikilinkURL("A note"))
    XCTAssertEqual(BodyPreviewView.linkAction(for: wikilink), .wikilink("A note"))
    XCTAssertEqual(BodyPreviewView.linkAction(for: URL(string: "https://example.com")!), .system)
    XCTAssertEqual(BodyPreviewView.linkAction(for: URL(string: "MAILTO:a@example.com")!), .system)
    XCTAssertEqual(BodyPreviewView.linkAction(for: URL(string: "file:///etc/hosts")!), .refuse)
    XCTAssertEqual(BodyPreviewView.linkAction(for: URL(string: "someapp://x")!), .refuse)
  }
}
