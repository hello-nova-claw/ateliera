import XCTest

@testable import Ateliera

// The guided-thread entry points for the Reflection and Garden/celebration rooms: each
// room offers ONE opening prompt that captures a real note at the right destination, then
// unspools gentle, skippable follow-up prompts that append to that same entry. Mirrors the
// shipped Become/gratitude thread machinery, factored so both rooms share it.
final class GuidedRoomEntryTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("guided-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // MARK: - Every room kind describes an opening prompt + a destination

  func testReflectionAndGratitudeKindsEachHaveAnOpeningPromptAndDestination() {
    for kind in [GuidedThreadKind.reflection, .gratitude] {
      XCTAssertFalse(
        kind.opening.prompt.trimmingCharacters(in: .whitespaces).isEmpty,
        "\(kind) needs an inviting opening prompt")
      XCTAssertFalse(kind.opening.placeholder.isEmpty, "\(kind) opening needs an example")
      XCTAssertFalse(kind.steps.isEmpty, "\(kind) needs follow-up prompts to unspool")
    }
  }

  func testReflectionOpensInTheReflectionGardenAsAReflection() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    let path = try XCTUnwrap(
      store.captureGuidedOpening(kind: .reflection, title: nil, body: "I noticed I rushed today"))
    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertEqual(note.cardType, "reflection")
    XCTAssertEqual(note.semanticType, "reflection")
    XCTAssertTrue(note.rooms.contains("reflection-garden"))
  }

  func testCelebrationOpensInTheReflectionGardenAsACelebration() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    let path = try XCTUnwrap(
      store.captureGuidedOpening(kind: .gratitude, title: "A win", body: "Finished the hard email"))
    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertEqual(note.cardType, "celebration")
    XCTAssertEqual(note.semanticType, "celebration")
    XCTAssertTrue(note.rooms.contains("reflection-garden"))
    XCTAssertEqual(note.title, "A win")
  }

  func testGuidedOpeningRefusesAnEmptyBody() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertNil(store.captureGuidedOpening(kind: .reflection, title: nil, body: "   "))
  }

  // MARK: - Follow-ups unspool onto the same entry; skips leave it untouched

  func testFollowUpsDeepenTheSameReflectionEntry() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    let path = try XCTUnwrap(
      store.captureGuidedOpening(kind: .reflection, title: nil, body: "I noticed I rushed today"))
    let steps = GuidedThreadKind.reflection.steps
    XCTAssertTrue(store.appendGuidedAnswer(path: path, heading: steps[0].prompt, answer: "I was anxious"))
    XCTAssertTrue(store.appendGuidedAnswer(path: path, heading: steps[1].prompt, answer: "  "))

    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertTrue(note.body.contains("I noticed I rushed today"), "opener stays")
    XCTAssertTrue(note.body.contains("**\(steps[0].prompt)**"))
    XCTAssertTrue(note.body.contains("I was anxious"))
    XCTAssertFalse(note.body.contains("**\(steps[1].prompt)**"), "a skipped step must not append")
  }

  func testReflectionAndCelebrationThreadsHaveDistinctClosingCopy() {
    XCTAssertNotEqual(
      GuidedThreadKind.reflection.closingTitle, GuidedThreadKind.gratitude.closingTitle)
    XCTAssertTrue(GuidedThreadKind.gratitude.closingBody.contains("Reflection Garden"))
    XCTAssertTrue(GuidedThreadKind.reflection.closingBody.contains("Reflection Garden"))
  }
}
