import XCTest

@testable import Ateliera

// P8 (import + round-trip): Zip32Reader, VaultImporter over the Rust batch write, and
// a full export→import round-trip into a fresh vault.
final class VaultImportTests: XCTestCase {
  private func makeVault() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("import-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testReaderRoundTripsWriterOutput() throws {
    let zip = try Zip32.create([
      (path: "a.md", bytes: Data("one\n".utf8)),
      (path: "sub/b.md", bytes: Data("two\n".utf8)),
    ])
    let parsed = try Zip32Reader.parse(zip)
    XCTAssertEqual(parsed.map { $0.path }, ["a.md", "sub/b.md"])
    XCTAssertEqual(parsed[1].bytes, Data("two\n".utf8))
  }

  func testReaderRejectsCorruptChecksum() throws {
    var zip = try Zip32.create([(path: "aaaa.md", bytes: Data("the quick brown fox\n".utf8))])
    // The content sits after the 30-byte local header + 7-byte name; flip a byte
    // inside it so the CRC no longer matches.
    zip[30 + 7 + 3] ^= 0xFF
    XCTAssertThrowsError(try Zip32Reader.parse(zip))
  }

  func testPlanClassifiesCreateVsOverwrite() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    // Seed one note that the archive will overwrite.
    XCTAssertTrue(store.capture(title: "Existing", body: "old", room: "inbox"))
    let existingPath = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    let zip = try Zip32.create([
      (path: existingPath, bytes: Data("replacement\n".utf8)),
      (path: "Inbox/brand-new.md", bytes: Data("fresh\n".utf8)),
      (path: PortableManifest.manifestPath, bytes: Data("{}".utf8)),
    ])
    let plan = try VaultImporter.prepare(archive: zip, store: store)
    XCTAssertTrue(plan.manifestPresent)
    XCTAssertEqual(plan.createCount, 1)
    XCTAssertEqual(plan.overwriteCount, 1)
  }

  func testPerItemSkipLeavesTheExistingFileUntouched() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Keep", body: "original", room: "inbox"))
    let existingPath = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    let zip = try Zip32.create([
      (path: existingPath, bytes: Data("replacement\n".utf8)),
      (path: "Inbox/brand-new.md", bytes: Data("fresh\n".utf8)),
      (path: PortableManifest.manifestPath, bytes: Data("{}".utf8)),
    ])
    let plan = try VaultImporter.prepare(archive: zip, store: store)

    // Skip the overwrite; keep the create.
    let resolutions: [String: ImportAction] = [existingPath: .skip]
    let counts = plan.counts(resolutions: resolutions)
    XCTAssertEqual(counts.created, 1)
    XCTAssertEqual(counts.replaced, 0)
    XCTAssertEqual(counts.skipped, 1)

    XCTAssertTrue(VaultImporter.apply(plan: plan, resolutions: resolutions, store: store))
    // The existing note kept its original body; the new file was still created.
    let kept = try XCTUnwrap(store.parsedNotesByPath.first { $0.path == existingPath })
    XCTAssertEqual(kept.note.body, "original")
    XCTAssertTrue(store.listAllPaths().contains("Inbox/brand-new.md"))
  }

  func testFullExportImportRoundTrip() throws {
    // Source vault with two notes → export → import into an empty vault → same notes.
    let (sourceDir, source) = try makeVault()
    defer { try? FileManager.default.removeItem(at: sourceDir) }
    XCTAssertTrue(source.capture(title: "First", body: "first body", room: "inbox"))
    XCTAssertTrue(source.capture(title: "Second", body: "second body", room: "reflection-garden"))
    let archive = try VaultExporter.export(store: source, generatedAt: "2026-08-28T09:00:00.000Z")

    let (destDir, dest) = try makeVault()
    defer { try? FileManager.default.removeItem(at: destDir) }
    XCTAssertTrue(dest.parsedNotesByPath.isEmpty)

    let plan = try VaultImporter.prepare(archive: archive, store: dest)
    XCTAssertEqual(plan.createCount, 2)
    XCTAssertTrue(VaultImporter.apply(plan: plan, store: dest))

    // The destination now holds both notes, byte-identical.
    XCTAssertEqual(dest.parsedNotesByPath.count, 2)
    let bodies = Set(dest.parsedNotesByPath.map { $0.note.body })
    XCTAssertEqual(bodies, ["first body", "second body"])
  }

  func testStaleRevisionRejectsApply() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    let zip = try Zip32.create([(path: "Inbox/x.md", bytes: Data("x\n".utf8))])
    let plan = try VaultImporter.prepare(archive: zip, store: store)
    // A concurrent write moves the revision on after the plan was made.
    XCTAssertTrue(store.capture(title: "Concurrent", body: "meanwhile", room: "inbox"))
    XCTAssertFalse(VaultImporter.apply(plan: plan, store: store))
    XCTAssertNotNil(store.error)
  }
}
