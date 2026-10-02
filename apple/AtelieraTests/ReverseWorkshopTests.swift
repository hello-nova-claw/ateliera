import XCTest

@testable import Ateliera

// The reverse Possibility workshop: after capturing a Possibility, you may walk it
// backwards in time — 90 → 60 → 30 days → this week → today — breaking it into
// progressively smaller decisions, plus practices and strategy. Each answered step
// writes a real Landscape card linked back to the Possibility via `source_notes`.
// Reuses the Become/landscape machinery (WorkshopView.Mode.possibility + addCard).
final class ReverseWorkshopTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("reverse-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // MARK: - The horizon ladder

  func testDecisionHorizonGainsTheNearTermRungs() {
    // The far three stay golden-matched to the web's decisionHorizons; the near two are
    // new Apple rungs so the reverse walk can land on this week and today.
    XCTAssertEqual(DecisionHorizon.d90.rawValue, "90d")
    XCTAssertEqual(DecisionHorizon.d60.rawValue, "60d")
    XCTAssertEqual(DecisionHorizon.d30.rawValue, "30d")
    XCTAssertEqual(DecisionHorizon.thisWeek.rawValue, "this-week")
    XCTAssertEqual(DecisionHorizon.today.rawValue, "today")
    XCTAssertEqual(DecisionHorizon.thisWeek.label, "This week")
    XCTAssertEqual(DecisionHorizon.today.label, "Today")
  }

  func testReverseHorizonLadderWalksFarToNear() {
    // The decision rungs the reverse thread climbs down, far horizon first.
    XCTAssertEqual(
      DecisionHorizon.reverseLadder, [.d90, .d60, .d30, .thisWeek, .today])
  }

  // MARK: - The reverse thread's step plan

  func testReverseStepsAreDecisionsFarToNearThenPracticesThenStrategy() {
    let steps = ReverseWorkshopPlan.steps
    // Five decision rungs, then practices, then structure & strategy.
    XCTAssertEqual(steps.count, 7)
    XCTAssertEqual(
      steps.prefix(5).map { $0.horizon },
      [.d90, .d60, .d30, .thisWeek, .today])
    for decision in steps.prefix(5) {
      XCTAssertEqual(decision.anchor, .decisions)
    }
    XCTAssertEqual(steps[5].anchor, .practices)
    XCTAssertNil(steps[5].horizon)
    XCTAssertEqual(steps[6].anchor, .structureStrategy)
    XCTAssertNil(steps[6].horizon)
  }

  func testReversePromptsWeaveThePossibilityForward() {
    let seed = "run a sabbatical year"
    for step in ReverseWorkshopPlan.steps {
      let prompt = step.prompt(seed: seed)
      XCTAssertTrue(prompt.contains(seed), "step \(step.id) should carry the possibility: \(prompt)")
    }
    // An empty seed must still yield a non-empty prompt (graceful fallback).
    for step in ReverseWorkshopPlan.steps {
      XCTAssertFalse(step.prompt(seed: "   ").isEmpty)
    }
  }

  // MARK: - Writing cards linked to the Possibility

  func testReverseDecisionCardCarriesHorizonAndLinksToThePossibility() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }

    // Capture a Possibility, resolve its id (exactly as the hub does today).
    XCTAssertTrue(
      store.capture(title: nil, body: "run a sabbatical year", destination: .uncharted(beyond: false)))
    let seedPath = try XCTUnwrap(store.lastCapturedPath)
    let seedId = try XCTUnwrap(store.beginEdit(path: seedPath)?.note.id)

    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first).id

    // A 90-day decision card, linked back to the Possibility.
    XCTAssertTrue(
      landscape.addCard(
        lifeArea: area, anchor: .decisions, horizon: .d90, title: "Book the time off",
        body: "Book the time off", sourceNoteId: seedId))

    let card = try XCTUnwrap(
      landscape.board.cell(area: area, anchor: .decisions)?.cards.first {
        $0.title == "Book the time off"
      })
    XCTAssertEqual(card.decisionHorizon, .d90)
    let written = try XCTUnwrap(store.beginEdit(path: card.path)?.note)
    XCTAssertEqual(written.sourceNoteIds, [seedId], "the card should point back to the Possibility")
    XCTAssertEqual(written.landscapeAnchor, "decisions")
  }

  func testNearTermHorizonsRoundTripAndProjectABadge() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first).id

    for horizon in [DecisionHorizon.thisWeek, .today] {
      XCTAssertTrue(
        landscape.addCard(
          lifeArea: area, anchor: .decisions, horizon: horizon,
          title: "\(horizon.rawValue) step", body: "a step"))
      let card = try XCTUnwrap(
        landscape.board.cell(area: area, anchor: .decisions)?.cards.first {
          $0.title == "\(horizon.rawValue) step"
        })
      // The scalar survives on disk and the projector reads it back as the same rung.
      XCTAssertEqual(card.decisionHorizon, horizon)
      let note = try XCTUnwrap(store.beginEdit(path: card.path)?.note)
      XCTAssertEqual(note.frontmatterScalar("decision_horizon"), horizon.rawValue)
    }
  }

  // The reverse thread writes decisions (with horizons) plus a practice and a strategy
  // card, all anchored to the chosen area and linked to the Possibility — mirroring what
  // WorkshopView does when walking the plan end-to-end.
  func testWalkingThePlanWritesDecisionsPracticesAndStrategyLinkedToThePossibility() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertTrue(
      store.capture(title: nil, body: "run a sabbatical year", destination: .uncharted(beyond: false)))
    let seedPath = try XCTUnwrap(store.lastCapturedPath)
    let seedId = try XCTUnwrap(store.beginEdit(path: seedPath)?.note.id)

    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first).id

    for (index, step) in ReverseWorkshopPlan.steps.enumerated() {
      XCTAssertTrue(
        landscape.addCard(
          lifeArea: area, anchor: step.anchor, horizon: step.horizon,
          title: "answer \(index)", body: "answer \(index)", sourceNoteId: seedId))
    }

    let decisions = try XCTUnwrap(landscape.board.cell(area: area, anchor: .decisions)).cards
    XCTAssertEqual(decisions.count, 5)
    XCTAssertEqual(
      Set(decisions.compactMap { $0.decisionHorizon }),
      [.d90, .d60, .d30, .thisWeek, .today])
    XCTAssertEqual(landscape.board.cell(area: area, anchor: .practices)?.cards.count, 1)
    XCTAssertEqual(landscape.board.cell(area: area, anchor: .structureStrategy)?.cards.count, 1)

    // Every written card links back to the Possibility seed.
    for anchor in [LandscapeAnchor.decisions, .practices, .structureStrategy] {
      for card in landscape.board.cell(area: area, anchor: anchor)?.cards ?? [] {
        let note = try XCTUnwrap(store.beginEdit(path: card.path)?.note)
        XCTAssertEqual(note.sourceNoteIds, [seedId])
      }
    }
  }
}
