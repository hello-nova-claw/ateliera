import XCTest

@testable import Ateliera

// P4 repair integration: VaultStore.repairQueue + repairLink over a real vault.
final class VaultStoreRepairTests: XCTestCase {
  private func note(id: String, title: String, body: String) -> StudioNote {
    var n = StudioNote.capture(
      title: title, body: body, id: id, created: "2026-01-01T00:00:00.000Z", room: "inbox")
    n.status = "active"
    return n
  }

  private func makeStore(_ seed: [(rel: String, note: StudioNote)]) throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("repair-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (rel, note) in seed {
      let url = dir.appendingPathComponent(rel)
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try note.serialize().data(using: .utf8)!.write(to: url)
    }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testRepairLinkResolvesABrokenWikiLink() throws {
    let (dir, store) = try makeStore([
      ("Inbox/anchor.md", note(id: "A", title: "Anchor note", body: "the anchor")),
      ("Inbox/pointer.md", note(id: "B", title: "Pointer", body: "See [[Anchor notee]] here.")),
    ])
    defer { try? FileManager.default.removeItem(at: dir) }

    // The typo'd link is broken.
    var queue = store.repairQueue()
    XCTAssertEqual(queue.count, 1)
    guard case .brokenLink(let broken) = queue[0] else { return XCTFail("expected broken link") }
    XCTAssertEqual(broken.path, "Inbox/pointer.md")
    XCTAssertEqual(broken.target, "Anchor notee")

    // Relink to the real title → the queue clears and the note body is rewritten.
    XCTAssertTrue(
      store.repairLink(path: broken.path, occurrence: broken.occurrence,
        edit: .relink(kind: .wiki, target: "Anchor note")))
    queue = store.repairQueue()
    XCTAssertTrue(queue.isEmpty)

    let reread = try XCTUnwrap(store.beginEdit(path: "Inbox/pointer.md"))
    // The link target is corrected; the original display label is preserved (web semantics).
    XCTAssertTrue(reread.note.body.contains("[[Anchor note|Anchor notee]]"))
    // And now it resolves as a backlink.
    XCTAssertEqual(store.backlinks(path: "Inbox/anchor.md").map { $0.title }, ["Pointer"])
  }

  func testRepairLinkRemoveUnwraps() throws {
    let (dir, store) = try makeStore([
      ("Inbox/pointer.md", note(id: "B", title: "Pointer", body: "See [[Ghost]] here."))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let broken = store.repairQueue()
    guard case .brokenLink(let item) = broken.first else { return XCTFail("expected broken link") }
    XCTAssertTrue(store.repairLink(path: item.path, occurrence: item.occurrence, edit: .remove))
    let reread = try XCTUnwrap(store.beginEdit(path: "Inbox/pointer.md"))
    XCTAssertTrue(reread.note.body.contains("See Ghost here."))
    XCTAssertTrue(store.repairQueue().isEmpty)
  }
}
