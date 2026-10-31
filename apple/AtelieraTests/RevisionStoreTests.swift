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
    XCTAssertTrue(
      listed.first!.manifest.files.first!.snapshotPath.hasPrefix(".studio/backups/2026-08-29/"))

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
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "OLD")
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-15T00:00:00.000Z", id: "NEW")
    XCTAssertEqual(revisions.list().map { $0.id }, ["NEW", "OLD"])
  }

  func testPruneRemovesSnapshotsPastRetention() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    // An old snapshot, then a recent one — the recent one's auto-prune drops the old.
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-01-01T00:00:00.000Z", id: "OLD")
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "NEW")
    XCTAssertEqual(revisions.list().map { $0.id }, ["NEW"])
  }

  func testPruneKeepsOnePerDay() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T10:00:00.000Z", id: "EARLY")
    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T11:00:00.000Z", id: "LATE")
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

  // MARK: - Untrusted manifests (#30)

  // Anything synced or imported into the vault can write under `.studio/backups/`, so a
  // manifest is only trusted when it matches the rules `revisions.ts` checks.

  private func write(_ data: Data, at path: String, in dir: URL) throws {
    let url = dir.appendingPathComponent(path)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url)
  }

  private func exists(_ path: String, in dir: URL) -> Bool {
    FileManager.default.fileExists(atPath: dir.appendingPathComponent(path).path)
  }

  private func manifestJSON(_ manifest: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys])
  }

  /// A manifest that follows every rule, for one copy of `original` at `bytes`.
  private func validManifest(
    original: String, bytes: Data, createdAt: String = "2026-08-29T10:00:00.000Z",
    id: String = "PLANTED"
  ) -> (root: String, manifest: [String: Any]) {
    let root = RevisionStore.snapshotRoot(createdAt: createdAt, id: id)
    let file: [String: Any] = [
      "originalPath": original, "snapshotPath": "\(root)/files/\(original)",
      "hash": VaultExporter.sha256Hex(bytes),
    ]
    return (
      root,
      [
        "version": 1, "id": id, "reason": "conflict-resolution", "createdAt": createdAt,
        "state": "complete", "files": [file],
      ]
    )
  }

  func testSnapshotRootMatchesTheWebLayout() {
    XCTAssertEqual(
      RevisionStore.snapshotRoot(createdAt: "2026-08-29T10:00:00.000Z", id: "01J ID/x"),
      ".studio/backups/2026-08-29/2026-08-29T10-00-00-000Z--01J%20ID%2Fx")
  }

  func testListAcceptsAManifestThatFollowsTheRules() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    let bytes = Data("copy".utf8)
    let (root, manifest) = validManifest(original: "Inbox/note.md", bytes: bytes)
    try write(bytes, at: "\(root)/files/Inbox/note.md", in: dir)
    try write(manifestJSON(manifest), at: "\(root)/manifest.json", in: dir)
    XCTAssertEqual(RevisionStore(store: store).list().map { $0.id }, ["PLANTED"])
  }

  func testListIgnoresAManifestThatBreaksAnyRule() throws {
    let bytes = Data("copy".utf8)
    let (root, base) = validManifest(original: "Inbox/note.md", bytes: bytes)
    let baseFile = try XCTUnwrap((base["files"] as? [[String: Any]])?.first)
    func with(file changes: [String: Any]) -> [String: Any] {
      var manifest = base
      manifest["files"] = [baseFile.merging(changes) { $1 }]
      return manifest
    }
    func with(_ key: String, _ value: Any) -> [String: Any] {
      var manifest = base
      manifest[key] = value
      return manifest
    }
    let broken: [(name: String, manifest: [String: Any])] = [
      ("a copy outside its own folder", with(file: ["snapshotPath": "Inbox/note.md"])),
      (
        "a copy in another snapshot's folder",
        with(file: ["snapshotPath": ".studio/backups/2026-08-28/x--y/files/Inbox/note.md"])
      ),
      ("a dot-dot original", with(file: ["originalPath": "../note.md"])),
      ("an absolute original", with(file: ["originalPath": "/note.md"])),
      ("an original in .studio", with(file: ["originalPath": ".studio/views/x.json"])),
      ("an original in .Studio-tmp", with(file: ["originalPath": ".Studio-tmp/x.md"])),
      ("an empty segment", with(file: ["originalPath": "Inbox//note.md"])),
      ("a backslash", with(file: ["originalPath": "Inbox\\note.md"])),
      ("a drive letter", with(file: ["originalPath": "C:note.md"])),
      ("a short hash", with(file: ["hash": "abc"])),
      ("an upper-case hash", with(file: ["hash": String(repeating: "A", count: 64)])),
      ("a duplicate file", with("files", [baseFile, baseFile])),
      ("an unknown reason", with("reason", "anything")),
      ("an unknown state", with("state", "done")),
      ("another version", with("version", 2)),
      ("an empty id", with("id", "")),
      ("a timestamp JavaScript wouldn't write", with("createdAt", "2026-08-29T10:00:00Z")),
    ]
    // The last one is valid but sits in a folder its timestamp and id don't name.
    let placed =
      broken.map { ($0, root) } + [
        (("a manifest in the wrong folder", base), ".studio/backups/2000-01-01/elsewhere")
      ]
    for ((name, manifest), folder) in placed {
      let (dir, store) = try makeVault()
      defer { try? FileManager.default.removeItem(at: dir) }
      try write(bytes, at: "\(folder)/files/Inbox/note.md", in: dir)
      try write(manifestJSON(manifest), at: "\(folder)/manifest.json", in: dir)
      XCTAssertEqual(RevisionStore(store: store).list().count, 0, name)
    }
  }

  func testPruneLeavesTheNoteAPlantedManifestNames() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Important", body: "keep me", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let noteBytes = try XCTUnwrap(store.readFileBytes(path: path))
    // An old manifest whose "copy" is the note itself.
    var (root, manifest) = validManifest(
      original: path, bytes: noteBytes, createdAt: "2000-01-01T00:00:00.000Z")
    manifest["files"] = [
      ["originalPath": path, "snapshotPath": path, "hash": VaultExporter.sha256Hex(noteBytes)]
    ]
    try write(manifestJSON(manifest), at: "\(root)/manifest.json", in: dir)

    // The next snapshot prunes.
    XCTAssertNotNil(
      RevisionStore(store: store).snapshot(
        reason: RevisionReason.conflictResolution, paths: [path],
        now: "2026-08-29T10:00:00.000Z", id: "NEW"))
    XCTAssertEqual(store.readFileBytes(path: path), noteBytes)
  }

  func testPruneLeavesASnapshotWhoseCopyChangedSinceItsManifest() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    let old = try XCTUnwrap(
      revisions.snapshot(
        reason: "migration", paths: [path], now: "2026-01-01T00:00:00.000Z", id: "OLD"))
    let copy = try XCTUnwrap(old.manifest.files.first?.snapshotPath)
    try write(Data("replaced".utf8), at: copy, in: dir)

    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "NEW")
    XCTAssertTrue(exists(copy, in: dir))
    XCTAssertTrue(exists(old.manifestPath, in: dir))
  }

  func testPruneLeavesASnapshotFolderHoldingAnUnexpectedFile() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    let path = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let revisions = RevisionStore(store: store)
    let old = try XCTUnwrap(
      revisions.snapshot(
        reason: "migration", paths: [path], now: "2026-01-01T00:00:00.000Z", id: "OLD"))
    let root = (old.manifestPath as NSString).deletingLastPathComponent
    try write(Data("stray".utf8), at: "\(root)/files/stray.md", in: dir)

    _ = revisions.snapshot(
      reason: "migration", paths: [path], now: "2026-06-01T00:00:00.000Z", id: "NEW")
    XCTAssertTrue(exists(old.manifestPath, in: dir))
    XCTAssertTrue(exists("\(root)/files/stray.md", in: dir))
  }

  func testPruneFinishesAPruneThatWasInterrupted() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "A", body: "a", room: "inbox"))
    XCTAssertTrue(store.capture(title: "B", body: "b", room: "inbox"))
    let paths = store.parsedNotesByPath.map { $0.path }
    XCTAssertEqual(paths.count, 2)
    let revisions = RevisionStore(store: store)
    let snapshot = try XCTUnwrap(
      revisions.snapshot(
        reason: "migration", paths: paths, now: "2026-06-01T00:00:00.000Z", id: "HALF"))
    // A prune that marked the snapshot and removed one copy before it stopped.
    var pruning = snapshot.manifest
    pruning.state = "pruning"
    try write(JSONEncoder.revision.encode(pruning), at: snapshot.manifestPath, in: dir)
    let copies = snapshot.manifest.files.map { $0.snapshotPath }
    try FileManager.default.removeItem(at: dir.appendingPathComponent(copies[0]))

    XCTAssertTrue(revisions.prune(now: "2026-06-02T00:00:00.000Z"))
    XCTAssertFalse(exists(copies[1], in: dir))
    XCTAssertFalse(exists(snapshot.manifestPath, in: dir))
    XCTAssertEqual(paths.compactMap { store.readFileBytes(path: $0) }.count, 2)
  }
}
