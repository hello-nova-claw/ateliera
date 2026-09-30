import XCTest

@testable import Ateliera

// The guided "Become" thread: a becoming statement is captured (surfacing as the
// Foyer's currently-becoming), then each answered dimension writes a Landscape card
// that links back to the seed via `source_notes`. Also covers the seed-aware prompt
// prefill and the celebration/dream capture destinations behind the one capture hub.
final class BecomeThreadTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("become-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // MARK: - Seed-aware prompt prefill

  func testSeedAwarePromptsCarryTheStatementForwardForEveryAnchor() {
    let seed = "someone wealthy"
    for anchor in LandscapeAnchor.ordered {
      let prompt = anchor.prompt(seed: seed)
      XCTAssertTrue(
        prompt.contains(seed), "\(anchor.rawValue) prompt should weave in the statement: \(prompt)")
      XCTAssertNotEqual(prompt, anchor.prompt, "\(anchor.rawValue) should differ from the plain prompt")
    }
  }

  func testEmptySeedFallsBackToThePlainGoldenPrompt() {
    for anchor in LandscapeAnchor.ordered {
      XCTAssertEqual(anchor.prompt(seed: "   "), anchor.prompt)
    }
  }

  // MARK: - Becoming capture

  func testBecomingCaptureSurfacesAsIdentityAndRecordsItsPath() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    XCTAssertTrue(
      store.capture(title: nil, body: "I'm becoming someone wealthy", destination: .foyer(.becoming)))
    let path = try XCTUnwrap(store.lastCapturedPath, "classified capture should record its path")
    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertEqual(note.cardType, "identity")
    XCTAssertEqual(note.semanticType, "foundations")
    XCTAssertTrue(note.rooms.contains("foyer"))
    XCTAssertTrue(note.rooms.contains("identity-studio"))
    XCTAssertTrue(note.display.featured)
  }

  // MARK: - Thread linkage

  func testThreadCardLinksBackToTheSeedStatement() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    // Capture the becoming statement, resolve its id.
    XCTAssertTrue(store.capture(title: nil, body: "someone wealthy", destination: .foyer(.becoming)))
    let seedPath = try XCTUnwrap(store.lastCapturedPath)
    let seedId = try XCTUnwrap(store.beginEdit(path: seedPath)?.note.id)

    // Walk one dimension: write a Vision card linked to the seed.
    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first).id
    XCTAssertTrue(
      landscape.addCard(
        lifeArea: area, anchor: .vision, horizon: nil, title: "An unhurried morning",
        body: "An unhurried morning", sourceNoteId: seedId))

    let card = try XCTUnwrap(
      landscape.board.cell(area: area, anchor: .vision)?.cards.first {
        $0.title == "An unhurried morning"
      })
    let written = try XCTUnwrap(store.beginEdit(path: card.path)?.note)
    XCTAssertEqual(written.sourceNoteIds, [seedId], "the card should point back to the seed statement")
    XCTAssertEqual(written.landscapeAnchor, "vision")
    XCTAssertTrue(written.lifeAreas.contains(area))
  }

  func testAddCardWithoutSourceLeavesNoLink() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first).id
    XCTAssertTrue(
      landscape.addCard(lifeArea: area, anchor: .vision, horizon: nil, title: "Solo", body: "Solo"))
    let card = try XCTUnwrap(landscape.board.cell(area: area, anchor: .vision)?.featured)
    let written = try XCTUnwrap(store.beginEdit(path: card.path)?.note)
    XCTAssertNil(written.sourceNoteIds)
  }

  // MARK: - The other two hub intentions

  func testGratitudeCaptureLandsInReflectionGardenAsCelebration() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: nil, body: "Finished the hard email", destination: .celebration))
    let note = try XCTUnwrap(store.beginEdit(path: try XCTUnwrap(store.lastCapturedPath))?.note)
    XCTAssertEqual(note.cardType, "celebration")
    XCTAssertEqual(note.semanticType, "celebration")
    XCTAssertTrue(note.rooms.contains("reflection-garden"))
  }

  func testGuidedAnswerAppendsToTheEntryBodyAndSkipIsANoOp() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(store.capture(title: nil, body: "Finished the hard email", destination: .celebration))
    let path = try XCTUnwrap(store.lastCapturedPath)

    XCTAssertTrue(store.appendGuidedAnswer(path: path, heading: "Who helped?", answer: "My mentor"))
    XCTAssertTrue(store.appendGuidedAnswer(path: path, heading: "Skipped step", answer: "   "))

    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertTrue(note.body.contains("Finished the hard email"))
    XCTAssertTrue(note.body.contains("**Who helped?**"))
    XCTAssertTrue(note.body.contains("My mentor"))
    XCTAssertFalse(note.body.contains("Skipped step"), "an empty answer must not append")
  }

  func testDreamCaptureLandsInUncharted() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(
      store.capture(title: nil, body: "What if we wintered somewhere warm?",
        destination: .uncharted(beyond: false)))
    let note = try XCTUnwrap(store.beginEdit(path: try XCTUnwrap(store.lastCapturedPath))?.note)
    XCTAssertEqual(note.cardType, "possibility")
    XCTAssertTrue(note.rooms.contains("uncharted"))
  }

  // MARK: - Multiple becomings, per area, with a retire archive

  // Capture a becoming and tag it to a life area, returning its path (mirrors the
  // thread's anchor step, which sets the seed's life_areas).
  private func captureBecoming(_ store: VaultStore, _ text: String, area: String?) throws -> String {
    XCTAssertTrue(store.capture(title: nil, body: text, destination: .foyer(.becoming)))
    let path = try XCTUnwrap(store.lastCapturedPath)
    if let area {
      let editable = try XCTUnwrap(store.beginEdit(path: path))
      var note = editable.note
      note.lifeAreas = [area]
      XCTAssertTrue(store.saveEdit(editable, updatedNote: note))
    }
    return path
  }

  func testMultipleBecomingsCoexistOnePerArea() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    _ = try captureBecoming(store, "someone wealthy", area: "money")
    _ = try captureBecoming(store, "someone who moves daily", area: "health-wellbeing")

    let identity = IdentityStore(store: store)
    let active = identity.model.activeBecomings
    XCTAssertEqual(active.count, 2)
    XCTAssertTrue(active.contains { $0.title == "someone wealthy" && $0.lifeAreaId == "money" })
    XCTAssertTrue(active.contains { $0.lifeAreaId == "health-wellbeing" })
  }

  func testRetireBecomingArchivesWithReasonAndLeavesActive() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let path = try captureBecoming(store, "someone wealthy", area: "money")

    let identity = IdentityStore(store: store)
    XCTAssertTrue(
      identity.retireBecoming(path: path, reason: BecomingRetireReason.noLongerDesired.rawValue))

    XCTAssertFalse(identity.model.activeBecomings.contains { $0.path == path })
    let retired = try XCTUnwrap(identity.model.retiredBecomings.first { $0.path == path })
    XCTAssertEqual(retired.reason, "no-longer-desired")
    XCTAssertEqual(BecomingRetireReason.label(forRaw: retired.reason), "No longer desired")
    // A retired becoming also drops out of the active Practicing-now section.
    XCTAssertFalse(
      (identity.model.sections[.practicingNow] ?? []).contains { $0.path == path })
    // The note is archived on disk with its reason preserved.
    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertEqual(note.status, "archived")
    XCTAssertEqual(note.frontmatterScalar("archived_reason"), "no-longer-desired")
  }

  func testRetireWithoutReasonArchivesQuietly() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let path = try captureBecoming(store, "someone unhurried", area: nil)
    let identity = IdentityStore(store: store)
    XCTAssertTrue(identity.retireBecoming(path: path, reason: nil))
    let retired = try XCTUnwrap(identity.model.retiredBecomings.first { $0.path == path })
    XCTAssertNil(retired.reason)
    XCTAssertEqual(BecomingRetireReason.label(forRaw: retired.reason), "Archived")
  }

  func testActiveBecomingsInAreaLookupExcludesSelfAndRetired() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let pathA = try captureBecoming(store, "someone calm", area: "money")
    let pathB = try captureBecoming(store, "someone wealthy", area: "money")
    let idB = try XCTUnwrap(store.beginEdit(path: pathB)?.note.id)

    // Starting B in Money finds A as the area's existing becoming (self excluded).
    let others = store.activeBecomings(inArea: "money", excludingId: idB)
    XCTAssertEqual(others.map { $0.path }, [pathA])
    XCTAssertEqual(others.first?.title, "someone calm")

    // Retiring A (superseded) leaves the area with only B.
    XCTAssertTrue(
      store.retireBecoming(path: pathA, reason: BecomingRetireReason.changedDirection.rawValue))
    XCTAssertTrue(store.activeBecomings(inArea: "money", excludingId: idB).isEmpty)
    // A different area is unaffected.
    XCTAssertTrue(store.activeBecomings(inArea: "family").isEmpty)
  }

  func testRestoreBecomingBringsItBackAndClearsReason() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let path = try captureBecoming(store, "someone wealthy", area: "money")
    let identity = IdentityStore(store: store)
    XCTAssertTrue(identity.retireBecoming(path: path, reason: BecomingRetireReason.becameTrue.rawValue))
    XCTAssertTrue(identity.restoreBecoming(path: path))

    XCTAssertTrue(identity.model.activeBecomings.contains { $0.path == path })
    XCTAssertFalse(identity.model.retiredBecomings.contains { $0.path == path })
    let note = try XCTUnwrap(store.beginEdit(path: path)?.note)
    XCTAssertEqual(note.status, "active")
    XCTAssertNil(note.frontmatterScalar("archived_reason"))
  }
}
