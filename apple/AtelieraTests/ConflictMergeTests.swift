import XCTest

@testable import Ateliera

// P8 (conflict merge): a stale-hash save surfaces a ConflictState with resolutions.
final class ConflictMergeTests: XCTestCase {
  private func makeStore(_ seedBody: String) throws -> (URL, VaultStore, String) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("conflict-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let note = StudioNote.capture(
      title: "Note", body: seedBody, id: "CONFLICT00000000000000000A",
      created: "2026-01-01T00:00:00.000Z", room: "inbox")
    let rel = "Inbox/note.md"
    let url = dir.appendingPathComponent(rel)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try note.serialize().data(using: .utf8)!.write(to: url)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store, rel)
  }

  // Open a note, let another writer change it, then save the stale edit.
  private func provokeConflict(_ store: VaultStore, path: String) -> EditableNote {
    let stale = store.beginEdit(path: path)!
    // A concurrent change bumps the file hash.
    let fresh = store.beginEdit(path: path)!
    var changed = fresh.note
    changed.body = "changed elsewhere"
    XCTAssertTrue(store.saveEdit(fresh, updatedNote: changed))
    // Now the stale editable's save loses the race.
    var draft = stale.note
    draft.body = "my local draft"
    XCTAssertFalse(store.saveEdit(stale, updatedNote: draft))
    return stale
  }

  func testStaleSaveSetsConflictState() throws {
    let (dir, store, path) = try makeStore("original")
    defer { try? FileManager.default.removeItem(at: dir) }
    _ = provokeConflict(store, path: path)
    let conflict = try XCTUnwrap(store.conflict)
    XCTAssertEqual(conflict.path, path)
    XCTAssertEqual(conflict.draft.body, "my local draft")
    XCTAssertTrue(conflict.storedText.contains("changed elsewhere"))
  }

  func testOverwriteResolvesConflict() throws {
    let (dir, store, path) = try makeStore("original")
    defer { try? FileManager.default.removeItem(at: dir) }
    _ = provokeConflict(store, path: path)
    XCTAssertTrue(store.resolveConflictOverwrite())
    XCTAssertNil(store.conflict)
    // The draft won.
    let reread = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertEqual(reread.note.body, "my local draft")
  }

  func testSaveAsNewKeepsBothVersions() throws {
    let (dir, store, path) = try makeStore("original")
    defer { try? FileManager.default.removeItem(at: dir) }
    _ = provokeConflict(store, path: path)
    XCTAssertTrue(store.resolveConflictSaveAsNew())
    XCTAssertNil(store.conflict)
    // The stored note is untouched; the draft exists as a second note.
    let stored = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertEqual(stored.note.body, "changed elsewhere")
    XCTAssertTrue(store.parsedNotesByPath.contains { $0.note.body == "my local draft" })
    XCTAssertEqual(store.parsedNotesByPath.count, 2)
  }

  func testDismissKeepsStored() throws {
    let (dir, store, path) = try makeStore("original")
    defer { try? FileManager.default.removeItem(at: dir) }
    _ = provokeConflict(store, path: path)
    store.dismissConflict()
    XCTAssertNil(store.conflict)
    let stored = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertEqual(stored.note.body, "changed elsewhere")
    XCTAssertEqual(store.parsedNotesByPath.count, 1)
  }
}
