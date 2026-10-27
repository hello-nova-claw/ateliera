import XCTest

@testable import Ateliera

// The vault format must never lose a user's writing across releases. Until 1.0
// ships there are no released formats, so this round-trips the current one. From
// 1.0 on, every folder under fixtures/vaults/released/ is opened with today's code.
final class VaultFormatMigrationTests: XCTestCase {
  private let repo = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

  private func notes(in folder: URL) throws -> [URL] {
    let walker = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: nil)
    return (walker?.allObjects as? [URL] ?? [])
      .filter { $0.pathExtension == "md" && $0.lastPathComponent != "README.md" }
      .sorted { $0.path < $1.path }
  }

  // The top-level frontmatter keys of a note: the lines between the opening and
  // closing `---` lines, which works for LF and CRLF notes alike.
  private func keys(_ text: String) -> Set<String> {
    let lines = text.components(separatedBy: .newlines).map {
      $0.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
    }
    guard lines.first == "---", let end = lines.dropFirst().firstIndex(of: "---") else { return [] }
    return Set(
      lines[1..<end].compactMap { line in
        guard let first = line.first, first.isLetter, let colon = line.firstIndex(of: ":") else {
          return nil
        }
        return String(line[..<colon])
      })
  }

  // Serialising may reorder keys, so this checks for loss rather than identical bytes:
  // every key survives, and a second round trip changes nothing.
  private func assertNoLoss(
    _ text: String, _ name: String, file: StaticString = #filePath, line: UInt = #line
  )
    throws
  {
    let note = try XCTUnwrap(
      NoteParser.parse(text), "\(name) did not parse", file: file, line: line)
    let saved = note.serialize()
    XCTAssertEqual(
      keys(saved), keys(text), "\(name) lost or gained frontmatter keys", file: file, line: line)
    XCTAssertEqual(
      note.body, try XCTUnwrap(NoteParser.parse(saved)).body, "\(name) body changed", file: file,
      line: line)
    XCTAssertEqual(
      try XCTUnwrap(NoteParser.parse(saved)).serialize(), saved, "\(name) is unstable", file: file,
      line: line)
  }

  private let canonical = """
    ---
    schema_version: 1
    id: 01JFORMAT000000000000000001
    title: An invented note
    card_type: reflection
    semantic_type: reflection
    status: active
    rooms:
      - reflection-garden
    life_areas: []
    seasons: []
    tags:
      - invented
    created: 2026-01-02T08:00:00+13:00
    updated: 2026-01-02T08:00:00+13:00
    attachments: []
    display:
      featured: false
    privacy:
      sensitivity: private
      ai_access: ask
    unknown_key: kept
    ---

    Nothing here is real.

    """

  func testCurrentFormatRoundTripsWithoutLoss() throws {
    XCTAssertEqual(keys(canonical).count, 16, "keys(_:) must read the canonical note")
    try assertNoLoss(canonical, "canonical note")
    let crlf = canonical.replacingOccurrences(of: "\n", with: "\r\n")
    XCTAssertEqual(keys(crlf), keys(canonical), "keys(_:) must read CRLF notes")
    try assertNoLoss(crlf, "canonical note with CRLF endings")
    let files = try notes(in: repo.appendingPathComponent("fixtures/vaults/sample"))
    XCTAssertFalse(files.isEmpty, "The sample fixture vault has no notes.")
    for file in files {
      try assertNoLoss(try String(contentsOf: file, encoding: .utf8), file.lastPathComponent)
    }
  }

  func testEveryReleasedFormatOpensWithoutLoss() throws {
    let released = repo.appendingPathComponent("fixtures/vaults/released")
    let versions = try FileManager.default.contentsOfDirectory(
      at: released, includingPropertiesForKeys: [.isDirectoryKey]
    ).filter { $0.hasDirectoryPath }
    for version in versions {
      let expected =
        try JSONSerialization.jsonObject(
          with: Data(contentsOf: version.appendingPathComponent("expected.json")))
        as? [String: [String: String]]
      let byFile = try XCTUnwrap(
        expected, "\(version.lastPathComponent)/expected.json is unreadable")
      let files = try notes(in: version)
      XCTAssertEqual(files.count, byFile.count, "\(version.lastPathComponent): note count changed")
      for file in files {
        let text = try String(contentsOf: file, encoding: .utf8)
        let note = try XCTUnwrap(
          NoteParser.parse(text),
          "\(version.lastPathComponent)/\(file.lastPathComponent) did not open")
        let want = try XCTUnwrap(byFile[file.lastPathComponent])
        XCTAssertEqual(note.id, want["id"], "\(file.lastPathComponent): id lost")
        XCTAssertEqual(note.title, want["title"], "\(file.lastPathComponent): title lost")
        XCTAssertEqual(note.body, want["body"], "\(file.lastPathComponent): body lost")
        try assertNoLoss(text, "\(version.lastPathComponent)/\(file.lastPathComponent)")
      }
    }
  }
}
