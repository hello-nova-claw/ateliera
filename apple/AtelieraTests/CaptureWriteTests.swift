import CryptoKit
import XCTest

@testable import Ateliera

// N3: the capture/write path. A note built natively is serialized byte-identically
// to the web app and written to a real vault through the Rust core, then read back.
// These tests exercise the actual `Vault.write_text` FFI (atomic, path-contained),
// not a stub.
final class CaptureWriteTests: XCTestCase {
  private func makeTempVault() throws -> (URL, Vault) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("ateliera-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return (dir, try Vault.open(path: dir.path))
  }

  private func sha256Hex(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  func testCaptureWritesByteIdenticalAndReadsBack() throws {
    let (dir, vault) = try makeTempVault()
    defer { try? FileManager.default.removeItem(at: dir) }

    let id = "00000000000000000000ABCDEF"
    let created = "2026-08-27T09:00:00.000Z"
    let note = StudioNote.capture(
      title: "A quiet morning", body: "Fifteen minutes still counted.", id: id, created: created)
    let serialized = note.serialize()
    let path = "Inbox/\(NoteFactory.suggestFilename(created: created, title: note.title, cardType: note.cardType, id: id))"

    let outcome = try vault.writeText(
      path: path, text: serialized, expectedHash: nil, createNew: true)

    XCTAssertEqual(outcome.hash, sha256Hex(serialized))
    XCTAssertEqual(outcome.revision, "1")

    // Read the bytes back through the core: byte-identical to what we serialized.
    let read = try vault.readText(path: path)
    XCTAssertEqual(read.text, serialized)

    // And the round trip reconstructs the capture defaults.
    let parsed = try XCTUnwrap(NoteParser.parse(read.text))
    XCTAssertEqual(parsed.cardType, "capture")
    XCTAssertEqual(parsed.status, "draft")
    XCTAssertEqual(parsed.rooms, ["inbox"])
    XCTAssertEqual(parsed.title, "A quiet morning")
    XCTAssertEqual(parsed.body, "Fifteen minutes still counted.")
  }

  func testFilenameMatchesTheWebConvention() {
    let name = NoteFactory.suggestFilename(
      created: "2026-08-27T09:00:00.000Z", title: "Hello, World!", cardType: "capture",
      id: "00000000000000000000ABCDEF")
    XCTAssertEqual(name, "2026-08-27--hello-world--abcdef.md")
  }

  func testCreateNewRefusesADuplicatePath() throws {
    let (dir, vault) = try makeTempVault()
    defer { try? FileManager.default.removeItem(at: dir) }

    _ = try vault.writeText(path: "Inbox/a.md", text: "one\n", expectedHash: nil, createNew: true)
    XCTAssertThrowsError(
      try vault.writeText(path: "Inbox/a.md", text: "two\n", expectedHash: nil, createNew: true))
    // The original content is untouched.
    XCTAssertEqual(try vault.readText(path: "Inbox/a.md").text, "one\n")
  }

  func testWriteRejectsPathEscape() throws {
    let (dir, vault) = try makeTempVault()
    defer { try? FileManager.default.removeItem(at: dir) }

    for bad in ["../evil.md", "a/../b.md", ".studio-x.md"] {
      XCTAssertThrowsError(
        try vault.writeText(path: bad, text: "x", expectedHash: nil, createNew: true),
        "expected \(bad) to be refused")
    }
  }

  func testNoteFactoryIdAndSlug() {
    // Deterministic id: zero millis + zero bytes -> 26 base-32 zeros.
    let zeros = NoteFactory.createNoteId(millis: 0, randomBytes: [UInt8](repeating: 0, count: 16))
    XCTAssertEqual(zeros, String(repeating: "0", count: 26))
    XCTAssertEqual(NoteFactory.createNoteId().count, 26)

    XCTAssertEqual(NoteFactory.slugify("A quiet morning that worked!"), "a-quiet-morning-that-worked")
    XCTAssertEqual(NoteFactory.slugify("Café déjà vu"), "cafe-deja-vu")
    XCTAssertEqual(NoteFactory.slugify("   "), "note")
  }
}
