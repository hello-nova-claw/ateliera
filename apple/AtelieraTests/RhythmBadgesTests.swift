import SwiftUI
import XCTest

@testable import Ateliera

// The Today card's badge row: which circles show (season always, moon always, cycle only
// when a cycle is known), which glyph each carries, which limb of the moon is lit, and
// what VoiceOver reads for each. Pure, so the view is a thin render over it.
final class RhythmBadgesTests: XCTestCase {
  private let en = Locale(identifier: "en_US")

  private func context(
    moon: MoonState = MoonState(phase: .waningGibbous, illumination: 0.62),
    cycle: CycleState? = nil
  ) -> RhythmContext {
    RhythmContext(
      date: "2026-04-10", season: .spring,
      microSeason: MicroSeason(term: "The First Green", gloss: "buds unfold"),
      moon: moon, lunarSeason: .waning, lunarProgress: 0.6, cycle: cycle, placements: [:])
  }

  // MARK: Which badges

  func testSeasonAndMoonOnlyWithoutACycle() {
    let badges = RhythmBadge.badges(for: context(), feltSeason: .spring, hemisphere: .north)
    XCTAssertEqual(
      badges,
      [
        .season(.spring),
        .moon(phase: .waningGibbous, illumination: 0.62, litRight: false),
      ])
  }

  func testCycleBadgeFollowsWhenACycleIsKnown() {
    let badges = RhythmBadge.badges(
      for: context(cycle: CycleState(day: 12, phase: .follicular)), feltSeason: .spring,
      hemisphere: .north)
    XCTAssertEqual(badges.count, 3)
    XCTAssertEqual(badges.last, .cycle(day: 12, phase: .follicular))
  }

  func testFeltSeasonIsTheOneShown() {
    // The felt season comes from the person's season style, not the context's
    // meteorological one, so the badge takes it as given.
    let badges = RhythmBadge.badges(for: context(), feltSeason: .autumn, hemisphere: .south)
    XCTAssertEqual(badges.first, .season(.autumn))
  }

  // MARK: Glyphs

  func testEverySeasonHasItsOwnSymbol() {
    let symbols = [Season.winter, .spring, .summer, .autumn].map {
      RhythmBadge.season($0).symbol
    }
    XCTAssertEqual(symbols, ["snowflake", "leaf", "sun.max", "wind"])
  }

  func testEveryCyclePhaseHasADistinctSymbol() {
    let phases: [CyclePhase] = [.menstrual, .follicular, .ovulation, .luteal]
    let symbols = phases.map { RhythmBadge.cycle(day: 1, phase: $0).symbol }
    XCTAssertEqual(symbols[0], "drop")
    XCTAssertEqual(Set(symbols).count, phases.count, "each phase needs its own shape")
    XCTAssertFalse(symbols.contains("leaf"), "the cycle must not borrow the spring glyph")
  }

  func testTheMoonIsDrawnNotSymbolised() {
    XCTAssertNil(RhythmBadge.moon(phase: .full, illumination: 1, litRight: true).symbol)
  }

  // MARK: Lit limb

  func testWaxingMoonIsLitOnTheRightInTheNorth() {
    for phase in [MoonPhase.waxingCrescent, .firstQuarter, .waxingGibbous] {
      let badges = RhythmBadge.badges(
        for: context(moon: MoonState(phase: phase, illumination: 0.4)), feltSeason: .spring,
        hemisphere: .north)
      XCTAssertEqual(badges[1], .moon(phase: phase, illumination: 0.4, litRight: true), "\(phase)")
    }
  }

  func testWaningMoonIsLitOnTheLeftInTheNorth() {
    for phase in [MoonPhase.waningGibbous, .lastQuarter, .waningCrescent] {
      let badges = RhythmBadge.badges(
        for: context(moon: MoonState(phase: phase, illumination: 0.4)), feltSeason: .spring,
        hemisphere: .north)
      XCTAssertEqual(badges[1], .moon(phase: phase, illumination: 0.4, litRight: false), "\(phase)")
    }
  }

  func testTheSouthernHemisphereMirrorsTheMoon() {
    let waxing = RhythmBadge.badges(
      for: context(moon: MoonState(phase: .waxingCrescent, illumination: 0.2)),
      feltSeason: .autumn, hemisphere: .south)
    XCTAssertEqual(waxing[1], .moon(phase: .waxingCrescent, illumination: 0.2, litRight: false))
    let waning = RhythmBadge.badges(
      for: context(moon: MoonState(phase: .lastQuarter, illumination: 0.5)),
      feltSeason: .autumn, hemisphere: .south)
    XCTAssertEqual(waning[1], .moon(phase: .lastQuarter, illumination: 0.5, litRight: true))
  }

  // MARK: Labels

  func testLabelsReadNaturallyAndTheCycleSaysEstimated() {
    XCTAssertEqual(RhythmBadge.season(.spring).label(locale: en), "Spring")
    XCTAssertEqual(
      RhythmBadge.moon(phase: .waningGibbous, illumination: 0.62, litRight: false)
        .label(locale: en),
      "Waning gibbous moon, 62% lit")
    XCTAssertEqual(
      RhythmBadge.cycle(day: 12, phase: .follicular).label(locale: en),
      "Cycle day 12, estimated follicular phase")
  }

  func testIdentifiersNameTheBadgeKind() {
    XCTAssertEqual(RhythmBadge.season(.winter).identifier, "rhythm-badge-season")
    XCTAssertEqual(
      RhythmBadge.moon(phase: .new, illumination: 0, litRight: true).identifier,
      "rhythm-badge-moon")
    XCTAssertEqual(
      RhythmBadge.cycle(day: 1, phase: .menstrual).identifier, "rhythm-badge-cycle")
  }

  // MARK: The drawn moon

  private let frame = CGRect(x: 0, y: 0, width: 20, height: 20)

  func testNewMoonDrawsNothingLit() {
    XCTAssertTrue(MoonLitShape(illumination: 0, litRight: true).path(in: frame).isEmpty)
  }

  func testFullMoonLightsTheWholeDisc() {
    let bounds = MoonLitShape(illumination: 1, litRight: true).path(in: frame).boundingRect
    XCTAssertEqual(bounds.minX, 0, accuracy: 0.5)
    XCTAssertEqual(bounds.maxX, 20, accuracy: 0.5)
  }

  func testCrescentStaysOnTheLitLimb() {
    let right = MoonLitShape(illumination: 0.25, litRight: true).path(in: frame).boundingRect
    XCTAssertGreaterThanOrEqual(right.minX, 10 - 0.5)
    XCTAssertEqual(right.maxX, 20, accuracy: 0.5)
    let left = MoonLitShape(illumination: 0.25, litRight: false).path(in: frame).boundingRect
    XCTAssertLessThanOrEqual(left.maxX, 10 + 0.5)
    XCTAssertEqual(left.minX, 0, accuracy: 0.5)
  }

  func testGibbousCrossesTheCentreLine() {
    let right = MoonLitShape(illumination: 0.75, litRight: true).path(in: frame).boundingRect
    XCTAssertEqual(right.minX, 5, accuracy: 0.5)
    XCTAssertEqual(right.maxX, 20, accuracy: 0.5)
    let left = MoonLitShape(illumination: 0.75, litRight: false).path(in: frame).boundingRect
    XCTAssertEqual(left.minX, 0, accuracy: 0.5)
    XCTAssertEqual(left.maxX, 15, accuracy: 0.5)
  }

  func testQuarterLightsExactlyHalf() {
    let bounds = MoonLitShape(illumination: 0.5, litRight: true).path(in: frame).boundingRect
    XCTAssertEqual(bounds.minX, 10, accuracy: 0.5)
    XCTAssertEqual(bounds.maxX, 20, accuracy: 0.5)
  }
}
