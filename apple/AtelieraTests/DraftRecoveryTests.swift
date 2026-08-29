import XCTest

@testable import Ateliera

// P8 (draft recovery): autosaved drafts, recoverable when the stored note is
// unchanged and stale once it has moved on.
final class DraftRecoveryTests: XCTestCase {
  private func isolatedDefaults() -> UserDefaults {
    UserDefaults(suiteName: "draft-\(UUID().uuidString)")!
  }

  private func record(hash: String, body: String = "draft body") -> DraftRecord {
    DraftRecord(
      studioId: "vault-1", path: "Inbox/note.md", title: "A title", body: body,
      expectedHash: hash, updatedAt: "2026-01-01T00:00:00.000Z")
  }

  func testMissingDraftIsNone() {
    let recovery = DraftRecovery(defaults: isolatedDefaults())
    XCTAssertEqual(
      recovery.readForDurable(studioId: "vault-1", path: "Inbox/note.md", durableHash: "abc"),
      .none)
  }

  func testRecoverableWhenHashMatches() {
    let recovery = DraftRecovery(defaults: isolatedDefaults())
    recovery.write(record(hash: "abc"))
    guard
      case .recoverable(let draft) = recovery.readForDurable(
        studioId: "vault-1", path: "Inbox/note.md", durableHash: "abc")
    else { return XCTFail("expected recoverable") }
    XCTAssertEqual(draft.body, "draft body")
  }

  func testStaleWhenHashDiffers() {
    let recovery = DraftRecovery(defaults: isolatedDefaults())
    recovery.write(record(hash: "abc"))
    guard
      case .stale = recovery.readForDurable(
        studioId: "vault-1", path: "Inbox/note.md", durableHash: "different")
    else { return XCTFail("expected stale") }
  }

  func testRemoveClearsDraft() {
    let recovery = DraftRecovery(defaults: isolatedDefaults())
    recovery.write(record(hash: "abc"))
    recovery.remove(studioId: "vault-1", path: "Inbox/note.md")
    XCTAssertEqual(
      recovery.readForDurable(studioId: "vault-1", path: "Inbox/note.md", durableHash: "abc"),
      .none)
  }

  func testKeysAreScopedPerVaultAndPath() {
    let recovery = DraftRecovery(defaults: isolatedDefaults())
    recovery.write(record(hash: "abc", body: "one"))
    // A different vault id doesn't see it.
    XCTAssertEqual(
      recovery.readForDurable(studioId: "vault-2", path: "Inbox/note.md", durableHash: "abc"),
      .none)
  }
}
