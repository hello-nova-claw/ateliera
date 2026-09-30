import XCTest

@testable import Ateliera

// The Inbox and the Journal are two views onto the same `inbox` vault room, split by
// status: unfiled quick-capture drafts triage in the Inbox; kept (active) entries live
// in the Journal. Keeping or filing a draft moves it out of the Inbox.
final class InboxJournalTests: XCTestCase {
  private let inbox = Room.all.first { $0.id == "inbox" }!
  private let journal = Room.all.first { $0.id == "journal" }!

  private func makeStore(_ seed: [(rel: String, note: StudioNote)] = []) throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("inbox-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (rel, note) in seed {
      let fileURL = dir.appendingPathComponent(rel)
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try note.serialize().data(using: .utf8)!.write(to: fileURL)
    }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private func note(id: String, status: String) -> StudioNote {
    var n = StudioNote.capture(
      title: "n\(id)", body: "body", id: id, created: "2026-01-01T00:00:00.000Z", room: "inbox")
    n.status = status
    return n
  }

  private func count(_ store: VaultStore, in room: Room) -> Int {
    store.liveNotes.filter { room.matches(rooms: $0.rooms, status: $0.status) }.count
  }

  func testQuickCaptureLandsInInboxAsDraft() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Hi", body: "a thought"))
    XCTAssertEqual(count(store, in: inbox), 1)
    XCTAssertEqual(count(store, in: journal), 0)
  }

  func testKeepCaptureIsActiveInJournal() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Kept", body: "keeper", keep: true))
    XCTAssertEqual(count(store, in: journal), 1)
    XCTAssertEqual(count(store, in: inbox), 0)
  }

  func testKeepInJournalPromotesDraftInPlace() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Draft", body: "text"))
    let path = try XCTUnwrap(store.lastCapturedPath)
    XCTAssertTrue(store.keepInJournal(path: path))
    let pair = store.parsedNotesByPath.first { $0.path == path }
    XCTAssertEqual(pair?.note.status, "active")
    XCTAssertEqual(pair?.note.rooms, ["inbox"])  // stays in the same vault room
    XCTAssertEqual(count(store, in: journal), 1)
    XCTAssertEqual(count(store, in: inbox), 0)
  }

  func testMigrationFlipsExistingInboxDraftsToActiveOnce() throws {
    let (dir, store) = try makeStore([
      ("Inbox/one.md", note(id: "AAA0000000000000000000000A", status: "draft")),
      ("Inbox/two.md", note(id: "BBB0000000000000000000000B", status: "draft")),
    ])
    defer { try? FileManager.default.removeItem(at: dir) }

    // On first open, pre-existing inbox drafts became kept Journal entries.
    XCTAssertEqual(count(store, in: journal), 2)
    XCTAssertEqual(count(store, in: inbox), 0)

    // A capture after migration is a fresh draft in the Inbox (migration ran once).
    XCTAssertTrue(store.capture(title: "New", body: "later"))
    XCTAssertEqual(count(store, in: inbox), 1)
    XCTAssertEqual(count(store, in: journal), 2)
  }
}
