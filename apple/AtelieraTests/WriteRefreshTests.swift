import XCTest

@testable import Ateliera

// A write that reached the disk is a successful write, even when re-reading the vault
// straight afterwards fails (#13). Reporting it as a failure made people tap Keep
// again (a duplicate note) or hit a conflict against their own save.
final class WriteRefreshTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("refresh-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore(discovering: false)
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private func notesOnDisk(_ dir: URL) -> [String] {
    let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)
    return (walker?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "md" }
      .map(\.lastPathComponent)
  }

  func testACaptureWhoseRefreshFailsStillSucceedsOnce() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    store.failRefreshesForTesting = true

    XCTAssertTrue(
      store.capture(title: nil, body: "I keep my word", destination: .identity(.alreadyTrue)))
    XCTAssertEqual(notesOnDisk(dir).count, 1)
    XCTAssertNotNil(store.lastCapturedPath)
    XCTAssertNotNil(store.refreshError)
  }

  func testAQuickCaptureWhoseRefreshFailsStillSucceeds() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    store.failRefreshesForTesting = true

    XCTAssertTrue(store.capture(title: "Morning", body: "A slow start."))
    XCTAssertEqual(notesOnDisk(dir).count, 1)
    XCTAssertNotNil(store.lastCapturedPath)
    XCTAssertNotNil(store.refreshError)
  }

  func testAnEditWhoseRefreshFailsStillSucceedsAndTheNextRefreshClearsTheWarning() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Morning", body: "A slow start."))
    let path = try XCTUnwrap(store.lastCapturedPath)
    let editable = try XCTUnwrap(store.beginEdit(path: path))

    store.failRefreshesForTesting = true
    XCTAssertTrue(store.saveEdit(editable, title: "Morning", body: "A slow, good start."))
    XCTAssertNil(store.conflict)
    XCTAssertNotNil(store.refreshError)

    store.failRefreshesForTesting = false
    let reopened = try XCTUnwrap(store.beginEdit(path: path))
    XCTAssertTrue(store.saveEdit(reopened, title: "Morning", body: "A slow, good start, again."))
    XCTAssertNil(store.refreshError)
    XCTAssertEqual(store.beginEdit(path: path)?.note.body, "A slow, good start, again.")
  }
}
