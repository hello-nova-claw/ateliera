import XCTest

@testable import Ateliera

// The profile (your name + picture) is a singleton vault note (card_type: profile),
// so it travels with the Markdown and never shows up as user content.
final class ProfileTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("profile-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // A tiny 1×1 transparent PNG, so `setProfileAvatar` sees valid image bytes.
  private let pngData = Data(
    base64Encoded:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  )!

  func testSetProfileNameCreatesASingletonProfileNote() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    XCTAssertNil(store.profileName)
    XCTAssertTrue(store.setProfileName("Anna"))
    XCTAssertEqual(store.profileName, "Anna")

    let profiles = store.parsedNotesByPath.filter { $0.note.cardType == "profile" }
    XCTAssertEqual(profiles.count, 1)
    XCTAssertEqual(profiles.first?.note.frontmatterScalar("name"), "Anna")
    XCTAssertTrue(profiles.first?.note.frontmatterBool("excluded_from_views") ?? false)
    XCTAssertEqual(profiles.first?.note.rooms, [])
    // The profile note is never surfaced as user content.
    XCTAssertFalse(store.liveNotes.contains { $0.meaning == "profile" })

    // Editing reuses the same note (still exactly one profile note).
    XCTAssertTrue(store.setProfileName("Anna McPhee"))
    XCTAssertEqual(store.profileName, "Anna McPhee")
    XCTAssertEqual(store.parsedNotesByPath.filter { $0.note.cardType == "profile" }.count, 1)
  }

  func testProfileNameRoundTripsFromDisk() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.setProfileName("Anna"))

    // A fresh store over the same folder reads the name back from the Markdown.
    let reopened = VaultStore()
    try reopened.openForTesting(at: dir)
    XCTAssertEqual(reopened.profileName, "Anna")
  }

  func testSetProfileAvatarStoresAndReadsBack() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    XCTAssertNil(store.profileAvatar())
    XCTAssertTrue(store.setProfileAvatar(data: pngData))
    XCTAssertEqual(store.profileAvatar(), pngData)
    // Avatar reuses the same singleton note as the name.
    XCTAssertEqual(store.parsedNotesByPath.filter { $0.note.cardType == "profile" }.count, 1)
  }
}
