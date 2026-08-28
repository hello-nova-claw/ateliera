import XCTest

@testable import Ateliera

// P4 repair: the queue (duplicate-id metadata + broken/ambiguous links, ordered).
final class RepairQueueTests: XCTestCase {
  private func note(id: String, title: String, body: String) -> StudioNote {
    var n = StudioNote.capture(
      title: title, body: body, id: id, created: "2026-01-01T00:00:00.000Z", room: "inbox")
    n.status = "active"
    return n
  }

  func testBrokenWikiLinkSurfaces() {
    let notes = [
      (path: "a.md", note: note(id: "A", title: "Anchor", body: "See [[Ghost note]] here.")),
    ]
    let items = RepairQueue.build(notes: notes)
    XCTAssertEqual(items.count, 1)
    guard case .brokenLink(let broken) = items[0] else { return XCTFail("expected a broken link") }
    XCTAssertEqual(broken.target, "Ghost note")
    XCTAssertEqual(broken.occurrence, 0)
    XCTAssertEqual(broken.state, .broken)
  }

  func testResolvedLinkIsNotQueued() {
    let notes = [
      (path: "a.md", note: note(id: "A", title: "Anchor", body: "body")),
      (path: "b.md", note: note(id: "B", title: "Pointer", body: "See [[Anchor]] here.")),
    ]
    XCTAssertTrue(RepairQueue.build(notes: notes).isEmpty)
  }

  func testAmbiguousLinkSurfaces() {
    // Two notes share a title → a wiki link to it is ambiguous.
    let notes = [
      (path: "a.md", note: note(id: "A", title: "Twin", body: "body")),
      (path: "b.md", note: note(id: "B", title: "Twin", body: "body")),
      (path: "c.md", note: note(id: "C", title: "Ref", body: "See [[Twin]].")),
    ]
    let items = RepairQueue.build(notes: notes)
    let broken = items.compactMap { item -> BrokenLinkItem? in
      if case .brokenLink(let b) = item { return b }
      return nil
    }
    XCTAssertEqual(broken.first?.target, "Twin")
    XCTAssertTrue(broken.first?.isAmbiguous ?? false)
  }

  func testDuplicateIdMetadataSurfaces() {
    let notes = [
      (path: "a.md", note: note(id: "DUP", title: "First", body: "body")),
      (path: "b.md", note: note(id: "DUP", title: "Second", body: "body")),
    ]
    let items = RepairQueue.build(notes: notes)
    let metadata = items.compactMap { item -> MetadataItem? in
      if case .metadata(let m) = item { return m }
      return nil
    }
    XCTAssertEqual(metadata.count, 1)
    XCTAssertEqual(metadata.first?.path, "b.md")  // later path is the duplicate
    XCTAssertTrue(metadata.first?.message.contains("a.md") ?? false)  // canonical named
  }

  func testOrderingPathThenKind() {
    // a.md has a broken link; a.md also is the canonical of a dup at z.md.
    let notes = [
      (path: "a.md", note: note(id: "DUP", title: "A", body: "See [[Ghost]].")),
      (path: "z.md", note: note(id: "DUP", title: "Z", body: "body")),
    ]
    let items = RepairQueue.build(notes: notes)
    // a.md broken-link sorts before z.md metadata (path order).
    guard case .brokenLink = items.first else { return XCTFail("expected a.md broken link first") }
    guard case .metadata = items.last else { return XCTFail("expected z.md metadata last") }
  }
}
