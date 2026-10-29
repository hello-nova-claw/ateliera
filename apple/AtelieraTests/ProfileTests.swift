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
    XCTAssertTrue(store.setProfileName("Juniper"))
    XCTAssertEqual(store.profileName, "Juniper")

    let profiles = store.parsedNotesByPath.filter { $0.note.cardType == "profile" }
    XCTAssertEqual(profiles.count, 1)
    XCTAssertEqual(profiles.first?.note.frontmatterScalar("name"), "Juniper")
    XCTAssertTrue(profiles.first?.note.frontmatterBool("excluded_from_views") ?? false)
    XCTAssertEqual(profiles.first?.note.rooms, [])
    // The profile note is never surfaced as user content.
    XCTAssertFalse(store.liveNotes.contains { $0.meaning == "profile" })

    // Editing reuses the same note (still exactly one profile note).
    XCTAssertTrue(store.setProfileName("Juniper Vale"))
    XCTAssertEqual(store.profileName, "Juniper Vale")
    XCTAssertEqual(store.parsedNotesByPath.filter { $0.note.cardType == "profile" }.count, 1)
  }

  func testProfileNameRoundTripsFromDisk() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.setProfileName("Juniper"))

    // A fresh store over the same folder reads the name back from the Markdown.
    let reopened = VaultStore()
    try reopened.openForTesting(at: dir)
    XCTAssertEqual(reopened.profileName, "Juniper")
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

  func testRemoveProfileAvatarClearsThePictureAndKeepsTheName() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.setProfileName("Juniper"))
    XCTAssertTrue(store.setProfileAvatar(data: pngData))
    XCTAssertTrue(
      store.listAllPaths().contains { $0.hasPrefix("Profile/") && $0.contains("Media/") })

    XCTAssertTrue(store.removeProfileAvatar())
    XCTAssertNil(store.profileAvatar())
    XCTAssertEqual(store.profileName, "Juniper")
    // The picture file is gone from the vault, and the note no longer points at it.
    XCTAssertFalse(
      store.listAllPaths().contains { $0.hasPrefix("Profile/") && $0.contains("Media/") })
    let profiles = store.parsedNotesByPath.filter { $0.note.cardType == "profile" }
    XCTAssertEqual(profiles.count, 1)
    XCTAssertNil(profiles.first?.note.display.cover)
    // A fresh store over the same folder agrees.
    let reopened = VaultStore()
    try reopened.openForTesting(at: dir)
    XCTAssertNil(reopened.profileAvatar())
    XCTAssertEqual(reopened.profileName, "Juniper")
  }

  func testRemovePhotoStillOffersWhenTheImageFileIsUnreadable() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.setProfileAvatar(data: pngData))
    // The reference survives but the bytes are gone, as after a sync that dropped the file.
    let media = store.listAllPaths().first { $0.hasPrefix("Profile/") && $0.contains("Media/") }
    let mediaPath = try XCTUnwrap(media)
    try FileManager.default.removeItem(at: dir.appendingPathComponent(mediaPath))
    try store.openForTesting(at: dir)
    XCTAssertNil(store.profileAvatar(), "nothing to decode")
    XCTAssertTrue(store.hasProfileAvatar, "the reference is still there to clear")
    XCTAssertTrue(store.removeProfileAvatar())
    XCTAssertFalse(store.hasProfileAvatar)
    XCTAssertNil(store.error)
  }

  func testRemoveProfileAvatarRefusesToDeleteOutsideTheProfileFolder() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    // Another note with its own cover, which a crafted profile reference points at.
    XCTAssertTrue(store.capture(title: nil, body: "A morning.", room: "reflection-garden"))
    let other = try XCTUnwrap(store.parsedNotesByPath.first { $0.note.cardType != "profile" })
    XCTAssertNotNil(store.setCover(data: pngData, forNotePath: other.path))
    XCTAssertTrue(store.setProfileName("Juniper"))
    let profile = try XCTUnwrap(store.parsedNotesByPath.first { $0.note.cardType == "profile" })
    let editable = try XCTUnwrap(store.beginEdit(path: profile.path))
    var note = editable.note
    let otherFolder = (other.path as NSString).deletingLastPathComponent
    note.display = NoteDisplay(cover: "../\(otherFolder)/Media/cover.png", featured: false)
    XCTAssertTrue(store.saveEdit(editable, updatedNote: note))

    XCTAssertFalse(store.removeProfileAvatar(), "must not delete another note's image")
    XCTAssertNotNil(store.error)
    XCTAssertTrue(
      store.listAllPaths().contains { $0.hasPrefix(otherFolder) && $0.contains("Media/") },
      "the other note's image is untouched")
  }

  func testRemoveProfileAvatarWithoutOneIsANoOp() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.removeProfileAvatar())
    XCTAssertNil(store.profileAvatar())
    XCTAssertNil(store.error)
  }
}
