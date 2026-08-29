import XCTest

@testable import Ateliera

// P7 media: cover path normalisation (golden vs cover-media.ts), magic-byte sniff,
// and the vault binary round-trip through the Rust core.
final class VaultMediaTests: XCTestCase {
  func testNormalizeCoverPathGolden() {
    let cases: [(note: String, ref: String, expected: String?)] = [
      ("Reflection Garden/note.md", "Media/photo.jpg", "Reflection Garden/Media/photo.jpg"),
      ("notes/note.md", "../evil.md", "evil.md"),  // single .. stays in-root (web parity)
      ("notes/note.md", "../../x.jpg", nil),  // escapes the root
      ("a/b/note.md", "../c.jpg", "a/c.jpg"),
      ("x/note.md", "/absolute.jpg", nil),
      ("x/note.md", "https://e.com/x.jpg", nil),
      ("x/note.md", ".studio-secret/x.jpg", nil),
      ("x/note.md", "a\\b.jpg", nil),
    ]
    for (note, ref, expected) in cases {
      XCTAssertEqual(
        VaultMedia.normalizeCoverPath(notePath: note, reference: ref), expected,
        "for \(ref) @ \(note)")
    }
  }

  func testMimeForExtension() {
    XCTAssertEqual(VaultMedia.mimeForExtension("Media/a.JPG"), "image/jpeg")
    XCTAssertEqual(VaultMedia.mimeForExtension("a.png"), "image/png")
    XCTAssertNil(VaultMedia.mimeForExtension("a.md"))
    XCTAssertNil(VaultMedia.mimeForExtension("noext"))
  }

  func testMagicByteSniff() {
    XCTAssertEqual(VaultMedia.sniff(Data([0xFF, 0xD8, 0xFF, 0xE0])), "image/jpeg")
    XCTAssertEqual(
      VaultMedia.sniff(Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), "image/png")
    XCTAssertEqual(VaultMedia.sniff(Data("GIF89a...".utf8)), "image/gif")
    var webp = Data("RIFF".utf8)
    webp.append(Data([0, 0, 0, 0]))
    webp.append(Data("WEBP".utf8))
    XCTAssertEqual(VaultMedia.sniff(webp), "image/webp")
    XCTAssertNil(VaultMedia.sniff(Data([0x00, 0x01, 0x02, 0x03])))
    XCTAssertNil(VaultMedia.sniff(Data()))
  }

  func testVaultCoverRoundTrip() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("media-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    // Seed a note so the folder exists.
    let note = StudioNote.capture(
      title: "With a cover", body: "body", id: "COVER0000000000000000000AA",
      created: "2026-01-01T00:00:00.000Z", room: "reflection-garden")
    let notePath = "Reflection Garden/note.md"
    let fileURL = dir.appendingPathComponent(notePath)
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try note.serialize().data(using: .utf8)!.write(to: fileURL)

    let store = VaultStore()
    try store.openForTesting(at: dir)

    // A tiny valid JPEG (magic + padding).
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0] + Array(repeating: 0, count: 32))
    let reference = try XCTUnwrap(store.setCover(data: jpeg, forNotePath: notePath))
    XCTAssertEqual(reference, "Media/cover.jpg")

    let read = try XCTUnwrap(store.readCover(reference: reference, forNotePath: notePath))
    XCTAssertEqual(read.mime, "image/jpeg")
    XCTAssertEqual(read.data, jpeg)
  }

  func testSetCoverRejectsUnsupportedFormat() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("media-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    XCTAssertNil(store.setCover(data: Data([0x00, 0x01, 0x02]), forNotePath: "note.md"))
    XCTAssertNotNil(store.error)
  }
}
