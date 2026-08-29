import XCTest

@testable import Ateliera

// P8 (diagnostics + parse-error repair): the recorder ring buffer, and unparseable
// notes surfacing as repair items + save diagnostics over a real vault.
final class DiagnosticsRepairTests: XCTestCase {
  func testRecorderIsNewestFirstAndCaps() {
    let recorder = DiagnosticsRecorder()
    for i in 0..<5 {
      recorder.record(operation: "save", outcome: "success", now: "2026-01-0\(i)T00:00:00.000Z")
    }
    XCTAssertEqual(recorder.count, 5)
    XCTAssertEqual(recorder.entries.first?.occurredAt, "2026-01-04T00:00:00.000Z")  // newest first
    recorder.clear()
    XCTAssertEqual(recorder.count, 0)
  }

  func testRecorderCapsAtMax() {
    let recorder = DiagnosticsRecorder()
    for _ in 0..<(DiagnosticsRecorder.maxEntries + 50) {
      recorder.record(operation: "save", outcome: "success")
    }
    XCTAssertEqual(recorder.count, DiagnosticsRecorder.maxEntries)
  }

  func testParseErrorSurfacesAsRepairItem() {
    // Two clean notes + one unparseable path → one metadata repair item for the bad one.
    let good = StudioNote.capture(
      title: "Good", body: "body", id: "GOOD00000000000000000000AA",
      created: "2026-01-01T00:00:00.000Z", room: "inbox")
    let items = RepairQueue.build(
      notes: [(path: "Inbox/good.md", note: good)], unparsedPaths: ["Inbox/broken.md"])
    let metadata = items.compactMap { item -> MetadataItem? in
      if case .metadata(let m) = item { return m }
      return nil
    }
    XCTAssertEqual(metadata.map { $0.path }, ["Inbox/broken.md"])
  }

  // Integration: an unparseable file in the vault shows up in the repair queue, and a
  // successful save records a diagnostic.
  func testVaultSurfacesParseErrorAndRecordsSave() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("diag-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    // A clean note plus a garbage .md file the parser rejects.
    let good = StudioNote.capture(
      title: "Clean", body: "body", id: "CLEAN0000000000000000000AA",
      created: "2026-01-01T00:00:00.000Z", room: "inbox")
    try FileManager.default.createDirectory(
      at: dir.appendingPathComponent("Inbox"), withIntermediateDirectories: true)
    try good.serialize().data(using: .utf8)!.write(to: dir.appendingPathComponent("Inbox/clean.md"))
    try "not a note at all".data(using: .utf8)!.write(to: dir.appendingPathComponent("Inbox/junk.md"))

    let store = VaultStore()
    try store.openForTesting(at: dir)
    XCTAssertTrue(store.unparsedPaths.contains("Inbox/junk.md"))
    XCTAssertTrue(
      store.repairQueue().contains { item in
        if case .metadata(let m) = item { return m.path == "Inbox/junk.md" }
        return false
      })

    // A save records a success diagnostic.
    let editable = try XCTUnwrap(store.beginEdit(path: "Inbox/clean.md"))
    XCTAssertTrue(store.saveEdit(editable, title: "Clean", body: "changed"))
    XCTAssertTrue(store.diagnostics.entries.contains { $0.operation == "save" && $0.outcome == "success" })
  }
}
