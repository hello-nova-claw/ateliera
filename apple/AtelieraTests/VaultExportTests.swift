import XCTest

@testable import Ateliera

// P8 (export): ZIP32 writer + manifest + disposition, golden-matched to zip32.ts /
// portability.ts, plus the exporter over a real vault.
final class VaultExportTests: XCTestCase {
  func testZip32GoldenBytes() throws {
    let zip = try Zip32.create([(path: "hello.md", bytes: Data("world\n".utf8))])
    let hex = zip.map { String(format: "%02x", $0) }.joined()
    let golden =
      "504b030414000008000000000000a86138dd06000000060000000800000068656c6c6f2e6d64776f726c640a"
      + "504b0102140014000008000000000000a86138dd0600000006000000080000000000000000000000000000000000"
      + "68656c6c6f2e6d64504b05060000000001000100360000002c0000000000"
    XCTAssertEqual(hex, golden)
  }

  func testSHA256Golden() {
    XCTAssertEqual(
      VaultExporter.sha256Hex(Data([0x00, 0x01, 0xFF])),
      "26a66b061e8f48f39927c312f25293959729eee95978e2892d49d3512a5cc092")
  }

  func testManifestGoldenBytes() {
    let manifest = PortableManifest.serialize(
      files: [ManifestFile(path: "Reflection Garden/note.md", sha256: "abc123", size: 42)],
      excludedCaches: [".studio/index/fts.db"], generatedAt: "2026-08-28T09:00:00.000Z")
    let golden = """
      {
        "format": "ateliera-vault",
        "exportVersion": 1,
        "schemaVersions": {
          "note": 1,
          "settings": 1
        },
        "generatedAt": "2026-08-28T09:00:00.000Z",
        "files": [
          {
            "path": "Reflection Garden/note.md",
            "sha256": "abc123",
            "size": 42
          }
        ],
        "excludedCaches": [
          ".studio/index/fts.db"
        ]
      }
      """ + "\n"
    XCTAssertEqual(manifest, golden)
  }

  func testEmptyManifestGolden() {
    let manifest = PortableManifest.serialize(
      files: [], excludedCaches: [], generatedAt: "2026-08-28T09:00:00.000Z")
    XCTAssertTrue(manifest.contains("\"files\": [],\n"))
    XCTAssertTrue(manifest.contains("\"excludedCaches\": []\n"))
  }

  func testPortablePathKey() {
    XCTAssertEqual(PortableManifest.portablePathKey("Réflexion/Note.md"), "réflexion/note.md")
  }

  func testDisposition() {
    XCTAssertEqual(PortableManifest.disposition("Reflection Garden/note.md"), .include)
    XCTAssertEqual(PortableManifest.disposition(".studio/config/landscape-areas.json"), .include)
    XCTAssertEqual(PortableManifest.disposition(".studio/settings.json"), .include)
    XCTAssertEqual(PortableManifest.disposition(".studio/index/fts.db"), .cache)
    XCTAssertEqual(PortableManifest.disposition(".studio/mystery"), .internalOnly)
    XCTAssertEqual(PortableManifest.disposition("evil.js"), .blocked)
    XCTAssertEqual(PortableManifest.disposition("Evil.app/Contents/MacOS/Evil"), .blocked)
    XCTAssertEqual(PortableManifest.disposition(".studio/backups/x/files/Evil.app/data"), .blocked)
    XCTAssertEqual(PortableManifest.disposition("Ideas.js/plan.md"), .include)
  }

  func testExporterOverVault() throws {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("export-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    // A note (include), a config file (include), and a cache file (excluded).
    let note = StudioNote.capture(
      title: "N", body: "body", id: "EXPORT0000000000000000000A",
      created: "2026-01-01T00:00:00.000Z", room: "inbox")
    try write(note.serialize(), to: dir, "Inbox/n.md")
    try write("{\"version\":1}", to: dir, ".studio/config/x.json")
    try write("cache", to: dir, ".studio/index/fts.db")

    let store = VaultStore()
    try store.openForTesting(at: dir)
    let plan = VaultExporter.plan(store: store)
    let includedPaths = Set(plan.files.map { $0.path })
    XCTAssertTrue(includedPaths.contains("Inbox/n.md"))
    XCTAssertTrue(includedPaths.contains(".studio/config/x.json"))
    XCTAssertFalse(includedPaths.contains(".studio/index/fts.db"))
    XCTAssertEqual(plan.excludedCaches, [".studio/index/fts.db"])
    // Manifest hashes match the actual bytes.
    for file in plan.manifestFiles {
      let bytes = try XCTUnwrap(store.readFileBytes(path: file.path))
      XCTAssertEqual(file.sha256, VaultExporter.sha256Hex(bytes))
      XCTAssertEqual(file.size, bytes.count)
    }
    // The full export produces a ZIP that begins with the local-file signature.
    let archive = try VaultExporter.export(store: store, generatedAt: "2026-08-28T09:00:00.000Z")
    XCTAssertEqual(Array(archive.prefix(4)), [0x50, 0x4B, 0x03, 0x04])
  }

  private func write(_ text: String, to root: URL, _ rel: String) throws {
    let url = root.appendingPathComponent(rel)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try text.data(using: .utf8)!.write(to: url)
  }
}
