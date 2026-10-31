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

  /// A backup ZIP as the Studio writes one: the files plus a manifest listing them.
  /// `unlisted` entries go into the ZIP without a manifest line.
  private func portable(
    _ files: [(path: String, bytes: Data)], unlisted: [(path: String, bytes: Data)] = [],
    excludedCaches: [String] = []
  ) throws -> Data {
    let listed = files.sorted { $0.path < $1.path }.map {
      ManifestFile(path: $0.path, sha256: VaultExporter.sha256Hex($0.bytes), size: $0.bytes.count)
    }
    let manifest = PortableManifest.serialize(
      files: listed, excludedCaches: excludedCaches, generatedAt: "2026-08-28T09:00:00.000Z")
    return try Zip32.create(
      files + unlisted + [(PortableManifest.manifestPath, Data(manifest.utf8))])
  }

  private func assertRefused(
    _ archive: Data, as expected: ImportError, file: StaticString = #filePath, line: UInt = #line
  ) throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertThrowsError(
      try VaultImporter.prepare(archive: archive, store: store), file: file, line: line
    ) { error in
      XCTAssertEqual(error as? ImportError, expected, file: file, line: line)
    }
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

  func testReaderRejectsADuplicateEntry() throws {
    let zip = try Zip32.create([
      (path: "a.md", bytes: Data("one\n".utf8)),
      (path: "a.md", bytes: Data("two\n".utf8)),
    ])
    XCTAssertThrowsError(try Zip32Reader.parse(zip))
  }

  func testImportOfADuplicateEntryWritesNothing() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    let zip = try Zip32.create([
      (path: "Inbox/a.md", bytes: Data("one\n".utf8)),
      (path: "Inbox/a.md", bytes: Data("two\n".utf8)),
    ])
    XCTAssertThrowsError(try VaultImporter.prepare(archive: zip, store: store))
    XCTAssertFalse(store.listAllPaths().contains("Inbox/a.md"))
  }

  // MARK: - The reader's attack surface (#104)

  /// A one-entry archive whose name is written as given, bypassing any check the writer
  /// might make, so the reader's own checks are what's under test.
  private func archive(named name: String, bytes: Data = Data("x\n".utf8)) throws -> Data {
    let placeholder = String(repeating: "n", count: name.utf8.count)
    var zip = try Zip32.create([(path: placeholder, bytes: bytes)])
    let encoded = Data(name.utf8)
    // The name follows the 30-byte local header, and the 46-byte central header.
    zip.replaceSubrange(30..<30 + encoded.count, with: encoded)
    let central = try XCTUnwrap(zip.range(of: Data([0x50, 0x4B, 0x01, 0x02])))
    let nameStart = central.lowerBound + 46
    zip.replaceSubrange(nameStart..<nameStart + encoded.count, with: encoded)
    return zip
  }

  func testReaderRejectsATraversalEntry() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "../escape.md")))
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox/../../escape.md")))
  }

  func testReaderRejectsAnAbsoluteEntry() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "/etc/escape.md")))
  }

  func testReaderRejectsADriveLetterEntry() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "C:escape.md")))
  }

  func testReaderRejectsABackslashEntry() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox\\escape.md")))
  }

  func testReaderRejectsAnInternalEntry() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: ".studio-revision")))
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox/.Studio-write.lock")))
  }

  func testReaderRejectsEmptyAndDotSegments() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox//a.md")))
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox/./a.md")))
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "Inbox/")))
  }

  func testReaderRejectsANulInAName() throws {
    XCTAssertThrowsError(try Zip32Reader.parse(archive(named: "a\u{0}.md")))
  }

  func testReaderRejectsATruncatedArchive() throws {
    let zip = try Zip32.create([(path: "a.md", bytes: Data("the quick brown fox\n".utf8))])
    // Cut inside the entry's data, and inside its local header.
    XCTAssertThrowsError(try Zip32Reader.parse(zip.prefix(30 + 4 + 5)))
    XCTAssertThrowsError(try Zip32Reader.parse(zip.prefix(20)))
  }

  func testReaderRejectsABadSignature() throws {
    var zip = try Zip32.create([(path: "a.md", bytes: Data("x\n".utf8))])
    zip[0] = 0x00
    XCTAssertThrowsError(try Zip32Reader.parse(zip))
  }

  func testReaderRejectsADeflatedEntry() throws {
    var zip = try Zip32.create([(path: "a.md", bytes: Data("x\n".utf8))])
    // The compression method is the local header's fifth field; 8 is deflate.
    zip[8] = 8
    XCTAssertThrowsError(try Zip32Reader.parse(zip)) { error in
      XCTAssertEqual(error as? Zip32Reader.ReaderError, .unsupported)
    }
  }

  func testReaderRoundTripsAUnicodePath() throws {
    let path = "Reflection Garden/été — 日記 🌙.md"
    let zip = try Zip32.create([(path: path, bytes: Data("x\n".utf8))])
    XCTAssertEqual(try Zip32Reader.parse(zip).map { $0.path }, [path])
  }

  func testReaderHandlesAnEmptyArchive() throws {
    XCTAssertEqual(try Zip32Reader.parse(Zip32.create([])).count, 0)
  }

  func testPlanClassifiesCreateVsOverwrite() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    // Seed one note that the archive will overwrite.
    XCTAssertTrue(store.capture(title: "Existing", body: "old", room: "inbox"))
    let existingPath = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    let zip = try portable([
      (path: existingPath, bytes: Data("replacement\n".utf8)),
      (path: "Inbox/brand-new.md", bytes: Data("fresh\n".utf8)),
    ])
    let plan = try VaultImporter.prepare(archive: zip, store: store)
    XCTAssertEqual(plan.createCount, 1)
    XCTAssertEqual(plan.overwriteCount, 1)
  }

  func testPerItemSkipLeavesTheExistingFileUntouched() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Keep", body: "original", room: "inbox"))
    let existingPath = try XCTUnwrap(store.parsedNotesByPath.first?.path)

    let zip = try portable([
      (path: existingPath, bytes: Data("replacement\n".utf8)),
      (path: "Inbox/brand-new.md", bytes: Data("fresh\n".utf8)),
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
    let zip = try portable([(path: "Inbox/x.md", bytes: Data("x\n".utf8))])
    let plan = try VaultImporter.prepare(archive: zip, store: store)
    // A concurrent write moves the revision on after the plan was made.
    XCTAssertTrue(store.capture(title: "Concurrent", body: "meanwhile", room: "inbox"))
    XCTAssertFalse(VaultImporter.apply(plan: plan, store: store))
    XCTAssertNotNil(store.error)
  }

  // MARK: - The web's import checks (#32)

  func testImportRefusesABackupWithNoManifest() throws {
    try assertRefused(
      Zip32.create([(path: "Inbox/a.md", bytes: Data("a\n".utf8))]), as: .invalidManifest)
  }

  func testImportRefusesAManifestThatIsNotTheStudios() throws {
    try assertRefused(
      Zip32.create([
        (path: "Inbox/a.md", bytes: Data("a\n".utf8)),
        (path: PortableManifest.manifestPath, bytes: Data("{}".utf8)),
      ]), as: .invalidManifest)
  }

  func testImportRefusesActiveContent() throws {
    for path in [
      "Inbox/run.command", "Evil.app/Contents/MacOS/Evil", "Inbox/page.HTML",
      ".studio/backups/x/files/Evil.app/data",
    ] {
      try assertRefused(
        portable([(path: path, bytes: Data("x".utf8))]), as: .activeContent(path: path))
    }
  }

  func testImportRefusesEntriesTheManifestDoesNotList() throws {
    try assertRefused(
      portable(
        [(path: "Inbox/a.md", bytes: Data("a\n".utf8))],
        unlisted: [(path: "Inbox/b.md", bytes: Data("b\n".utf8))]),
      as: .outsideManifest)
  }

  func testImportRefusesAFileWhoseChecksumDiffers() throws {
    let listed = ManifestFile(
      path: "Inbox/a.md", sha256: VaultExporter.sha256Hex(Data("other\n".utf8)), size: 6)
    let manifest = PortableManifest.serialize(
      files: [listed], excludedCaches: [], generatedAt: "2026-08-28T09:00:00.000Z")
    try assertRefused(
      Zip32.create([
        (path: "Inbox/a.md", bytes: Data("a-b-c\n".utf8)),
        (path: PortableManifest.manifestPath, bytes: Data(manifest.utf8)),
      ]), as: .checksumFailed)
  }

  func testImportRefusesPathsThatCollideInCase() throws {
    try assertRefused(
      portable([
        (path: "Inbox/Note.md", bytes: Data("a\n".utf8)),
        (path: "Inbox/note.md", bytes: Data("b\n".utf8)),
      ]), as: .pathCollision(path: "Inbox/note.md"))
  }

  func testImportRefusesAPathThatIsNotNFC() throws {
    // Decomposed, so it could name the same file as its precomposed twin.
    let path = "Inbox/cafe\u{301}.md"
    try assertRefused(
      portable([(path: path, bytes: Data("b\n".utf8))]), as: .unsafePath(path: path))
  }

  func testImportRefusesTwoSpellingsOfOneName() throws {
    // Swift compares them as equal, so the reader already counts them as one entry twice.
    try assertRefused(
      portable([
        (path: "Inbox/caf\u{E9}.md", bytes: Data("a\n".utf8)),
        (path: "Inbox/cafe\u{301}.md", bytes: Data("b\n".utf8)),
      ]), as: .invalidArchive)
  }

  func testImportRefusesAPathThatCollidesWithADifferentlyCasedFile() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: "Existing", body: "old", room: "inbox"))
    let existingPath = try XCTUnwrap(store.parsedNotesByPath.first?.path)
    let shouted = existingPath.uppercased()
    XCTAssertThrowsError(
      try VaultImporter.prepare(
        archive: portable([(path: shouted, bytes: Data("new\n".utf8))]), store: store)
    ) { error in
      XCTAssertEqual(error as? ImportError, .pathCollision(path: shouted))
    }
  }

  func testImportRefusesReservedAndNonPortablePaths() throws {
    for path in [
      ".studio/mystery.json", ".studio/index/fts.db", "Inbox/CON.md",
      "Inbox/trailing.", "Inbox/trailing ", "Inbox/tab\there.md",
    ] {
      try assertRefused(
        portable([(path: path, bytes: Data("x".utf8))]), as: .unsafePath(path: path))
    }
  }

  func testImportAcceptsTheStudiosOwnSettingsAndBackups() throws {
    let (dir, store) = try makeVault()
    defer { try? FileManager.default.removeItem(at: dir) }
    let plan = try VaultImporter.prepare(
      archive: portable(
        [
          (path: ".studio/settings.json", bytes: Data("{}\n".utf8)),
          (path: "Inbox/a.md", bytes: Data("a\n".utf8)),
        ], excludedCaches: [".studio/index/fts.db"]), store: store)
    XCTAssertEqual(plan.items.map { $0.path }, [".studio/settings.json", "Inbox/a.md"])
  }

  func testImportRefusesAnExcludedCacheThatIsNotACache() throws {
    try assertRefused(
      portable([(path: "Inbox/a.md", bytes: Data("a\n".utf8))], excludedCaches: ["Inbox/b.md"]),
      as: .invalidManifest)
  }

  func testWhatExportIncludesImportAccepts() throws {
    // A folder with an active extension, a bundle, and the same inside the backups folder.
    let (sourceDir, source) = try makeVault()
    defer { try? FileManager.default.removeItem(at: sourceDir) }
    XCTAssertTrue(source.capture(title: "Note", body: "body", room: "inbox"))
    for path in [
      "Ideas.js/plan.md", "Evil.app/Contents/MacOS/Evil",
      ".studio/backups/2026-08-29/x--y/files/Evil.app/data",
    ] {
      let url = sourceDir.appendingPathComponent(path)
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try Data("x\n".utf8).write(to: url)
    }
    let archive = try VaultExporter.export(store: source, generatedAt: "2026-08-28T09:00:00.000Z")
    let exported = try Zip32Reader.parse(archive).map { $0.path }
    XCTAssertTrue(exported.contains("Ideas.js/plan.md"))
    XCTAssertFalse(exported.contains { $0.contains(".app/") })

    let (destDir, dest) = try makeVault()
    defer { try? FileManager.default.removeItem(at: destDir) }
    let plan = try VaultImporter.prepare(archive: archive, store: dest)
    XCTAssertTrue(plan.items.map { $0.path }.contains("Ideas.js/plan.md"))
  }

  // MARK: - Size limits (#38)

  func testReaderRefusesAnArchiveOverTheLimit() throws {
    let zip = try Zip32.create([(path: "a.md", bytes: Data("x\n".utf8))])
    let limits = Zip32Reader.Limits(
      maxArchiveBytes: zip.count - 1, maxEntryBytes: 1_024, maxTotalBytes: 1_024)
    XCTAssertThrowsError(try Zip32Reader.parse(zip, limits: limits)) { error in
      XCTAssertEqual(error as? Zip32Reader.ReaderError, .tooLarge)
    }
  }

  func testReaderRefusesAnEntryOverTheLimit() throws {
    let zip = try Zip32.create([(path: "a.md", bytes: Data("four".utf8))])
    let limits = Zip32Reader.Limits(maxArchiveBytes: 1_024, maxEntryBytes: 3, maxTotalBytes: 1_024)
    XCTAssertThrowsError(try Zip32Reader.parse(zip, limits: limits)) { error in
      XCTAssertEqual(error as? Zip32Reader.ReaderError, .tooLarge)
    }
  }

  func testReaderRefusesEntriesOverTheTotalLimit() throws {
    let zip = try Zip32.create([
      (path: "a.md", bytes: Data("four".utf8)), (path: "b.md", bytes: Data("four".utf8)),
    ])
    let limits = Zip32Reader.Limits(maxArchiveBytes: 1_024, maxEntryBytes: 4, maxTotalBytes: 7)
    XCTAssertThrowsError(try Zip32Reader.parse(zip, limits: limits)) { error in
      XCTAssertEqual(error as? Zip32Reader.ReaderError, .tooLarge)
    }
  }

  func testReaderReadsASliceThatDoesNotStartAtZero() throws {
    let zip = try Zip32.create([(path: "a.md", bytes: Data("one\n".utf8))])
    let padded = Data([0xAA, 0xBB]) + zip
    let parsed = try Zip32Reader.parse(padded[2...])
    XCTAssertEqual(parsed.map { $0.path }, ["a.md"])
    XCTAssertEqual(parsed.first?.bytes, Data("one\n".utf8))
  }

  func testArchiveOverTheLimitIsRefusedBeforeItIsRead() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("big-\(UUID().uuidString).zip")
    try Data(count: 64).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    XCTAssertThrowsError(try VaultImporter.readArchive(at: url, maxBytes: 63)) { error in
      XCTAssertEqual(error as? ImportError, .tooLarge)
    }
    XCTAssertEqual(try VaultImporter.readArchive(at: url, maxBytes: 64).count, 64)
  }
}
