import XCTest

@testable import Ateliera

// P8 (revision history): snapshot → list → restore over a real vault, plus the
// automatic snapshot on a conflict overwrite.
final class RevisionStoreTests: XCTestCase {
  private func makeVault() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("rev-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testSnapshotListRestoreRoundTrip() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Note", body: "original", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    let revisions = RevisionStore(store: store)
    let snapshot = try XCTUnwrap(
      revisions.snapshot(
        reason: RevisionReason.conflictResolution, paths: [path],
        now: "2026-08-29T10:00:00.000Z", id: "SNAP1"))
    XCTAssertEqual(snapshot.manifest.files.count, 1)

    // The snapshot is listed.
    let listed = revisions.list()
    XCTAssertEqual(listed.map { $0.id }, ["SNAP1"])
    XCTAssertTrue(listed.first!.manifest.files.first!.snapshotPath.hasPrefix(".studio/backups/2026-08-29/"))

    // Change the note, then restore the snapshot to bring the original back.
    let editable = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertTrue(store.saveEdit(editable, title: "Note", body: "changed"))
    XCTAssertTrue(revisions.restore(listed.first!))
    let reread = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertEqual(reread.note.body, "original")
  }

  func testSnapshotsListNewestFirst() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    // Different days within the retention window both survive pruning.
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "OLD")
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-06-15T00:00:00.000Z", id: "NEW")
    XCTAssertEqual(revisions.list().map { $0.id }, ["NEW", "OLD"])
  }

  func testPruneRemovesSnapshotsPastRetention() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    // An old snapshot, then a recent one — the recent one's auto-prune drops the old.
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-01-01T00:00:00.000Z", id: "OLD")
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "NEW")
    XCTAssertEqual(revisions.list().map { $0.id }, ["NEW"])
  }

  func testPruneKeepsOnePerDay() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-06-01T10:00:00.000Z", id: "EARLY")
    _ = revisions.snapshot(reason: "migration", paths: [path], now: "2026-06-01T11:00:00.000Z", id: "LATE")
    // Same day → only the newest is kept.
    XCTAssertEqual(revisions.list().map { $0.id }, ["LATE"])
  }

  func testConflictOverwriteLeavesASnapshot() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "N", body: "stored", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    // Provoke a conflict: a stale editable saves after a concurrent change.
    let stale = try XCTUnwrap(store.beginEdit(path: path))
    let fresh = try XCTUnwrap(store.beginEdit(path: path))
    var concurrent = fresh.note
    concurrent.body = "changed elsewhere"
    XCTAssertTrue(store.saveEdit(fresh, updatedNote: concurrent))
    var draft = stale.note
    draft.body = "my draft"
    XCTAssertFalse(store.saveEdit(stale, updatedNote: draft))
    XCTAssertNotNil(store.conflict)

    // Overwriting snapshots the version being replaced.
    XCTAssertTrue(store.resolveConflictOverwrite())
    let snapshots = RevisionStore(store: store).list()
    XCTAssertEqual(snapshots.count, 1)
    XCTAssertEqual(snapshots.first?.manifest.reason, RevisionReason.conflictResolution)
  }
}
