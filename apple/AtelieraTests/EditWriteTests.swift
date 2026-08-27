import XCTest

@testable import Ateliera

// N3 (edit half): reading a note, changing it, and writing it back through the
// Rust core with optimistic concurrency (expected_hash). Exercises the real FFI:
// an edit preserves unknown frontmatter keys, advances the revision, and a write
// against a stale hash is refused.
final class EditWriteTests: XCTestCase {
  private func makeTempVault() throws -> (URL, Vault) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("ateliera-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return (dir, try Vault.open(path: dir.path))
  }

  func testEditRewritesWithExpectedHashAndKeepsUnknownKeys() throws {
    let (dir, vault) = try makeTempVault()
    defer { try? FileManager.default.removeItem(at: dir) }

    // A captured note carrying an unknown frontmatter key the native model doesn't
    // model — it must survive the edit round trip.
    var original = StudioNote.capture(
      title: "First light", body: "One quiet line.", id: "00000000000000000000ABCDEF",
      created: "2026-08-27T09:00:00.000Z")
    original.extraFrontmatter = [("mood", .scalar("tender"))]
    let path = "Inbox/note.md"
    _ = try vault.writeText(
      path: path, text: original.serialize(), expectedHash: nil, createNew: true)

    // Read back, parse, and confirm the unknown key is there.
    let firstRead = try vault.readText(path: path)
    let baseHash = firstRead.hash
    var edited = try XCTUnwrap(NoteParser.parse(firstRead.text))
    XCTAssertEqual(edited.extraFrontmatter.first?.0, "mood")

    // Change the note the way the editor does: new body/title, bumped `updated`.
    edited.title = "First light, revisited"
    edited.body = "One quiet line, then another."
    edited.updated = "2026-08-28T10:00:00.000Z"
    let expected = edited.serialize()

    let outcome = try vault.writeText(
      path: path, text: expected, expectedHash: baseHash, createNew: false)
    XCTAssertEqual(outcome.revision, "2")

    // The bytes on disk are exactly what we serialized, and the unknown key and
    // edits round-trip.
    let secondRead = try vault.readText(path: path)
    XCTAssertEqual(secondRead.text, expected)
    let reparsed = try XCTUnwrap(NoteParser.parse(secondRead.text))
    XCTAssertEqual(reparsed.title, "First light, revisited")
    XCTAssertEqual(reparsed.body, "One quiet line, then another.")
    XCTAssertEqual(reparsed.updated, "2026-08-28T10:00:00.000Z")
    XCTAssertEqual(reparsed.extraFrontmatter.first?.1, .scalar("tender"))
  }

  func testEditAgainstAStaleHashIsRefused() throws {
    let (dir, vault) = try makeTempVault()
    defer { try? FileManager.default.removeItem(at: dir) }

    let path = "Inbox/note.md"
    let outcome = try vault.writeText(
      path: path, text: "---\nid: x\n---\none\n", expectedHash: nil, createNew: true)
    _ = outcome
    let staleHash = try vault.readText(path: path).hash

    // A first edit succeeds and changes the file's hash.
    _ = try vault.writeText(
      path: path, text: "---\nid: x\n---\ntwo\n", expectedHash: staleHash, createNew: false)

    // A second edit still holding the stale hash is refused, and nothing changes.
    XCTAssertThrowsError(
      try vault.writeText(
        path: path, text: "---\nid: x\n---\nthree\n", expectedHash: staleHash, createNew: false))
    XCTAssertEqual(try vault.readText(path: path).text, "---\nid: x\n---\ntwo\n")
  }
}
