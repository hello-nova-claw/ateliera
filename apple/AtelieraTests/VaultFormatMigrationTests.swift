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

  func testCurrentFormatRoundTripsWithoutLoss() throws {
    let files = try notes(in: repo.appendingPathComponent("fixtures/vaults/sample"))
    XCTAssertFalse(files.isEmpty, "The sample fixture vault has no notes.")
    for file in files {
      let text = try String(contentsOf: file, encoding: .utf8)
      let note = try XCTUnwrap(NoteParser.parse(text), "\(file.lastPathComponent) did not parse")
      XCTAssertEqual(note.serialize(), text, "\(file.lastPathComponent) changed on a round trip")
      let reopened = try XCTUnwrap(NoteParser.parse(note.serialize()))
      XCTAssertEqual(reopened.serialize(), note.serialize())
    }
  }

  func testEveryReleasedFormatOpensWithoutLoss() throws {
    let released = repo.appendingPathComponent("fixtures/vaults/released")
    let versions = try FileManager.default.contentsOfDirectory(
      at: released, includingPropertiesForKeys: [.isDirectoryKey]
    ).filter { $0.hasDirectoryPath }
    for version in versions {
      let expected = try JSONSerialization.jsonObject(
        with: Data(contentsOf: version.appendingPathComponent("expected.json"))) as? [String: [String: String]]
      let byFile = try XCTUnwrap(expected, "\(version.lastPathComponent)/expected.json is unreadable")
      let files = try notes(in: version)
      XCTAssertEqual(files.count, byFile.count, "\(version.lastPathComponent): note count changed")
      for file in files {
        let text = try String(contentsOf: file, encoding: .utf8)
        let note = try XCTUnwrap(
          NoteParser.parse(text), "\(version.lastPathComponent)/\(file.lastPathComponent) did not open")
        let want = try XCTUnwrap(byFile[file.lastPathComponent])
        XCTAssertEqual(note.id, want["id"], "\(file.lastPathComponent): id lost")
        XCTAssertEqual(note.body, want["body"], "\(file.lastPathComponent): body lost")
      }
    }
  }
}
