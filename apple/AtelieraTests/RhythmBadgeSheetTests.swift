import XCTest

@testable import Ateliera

// The sheets behind the Today card's badges: what each says for one sample date in both
// hemispheres, with and without a cycle. The lunation and turning-point dates are the
// published ones (USNO) for April 2026: new moon 17 April 11:52 UTC, full moon 1 May
// 17:23 UTC, June solstice 21 June 08:25 UTC.
final class RhythmBadgeSheetTests: XCTestCase {
  private let english = Locale(identifier: "en_US")
  private let utc = TimeZone(identifier: "UTC")!
  private let auckland = TimeZone(identifier: "Pacific/Auckland")!

  private func rhythm(cycle: CycleState? = nil) -> RhythmContext {
    RhythmContext(
      date: "2026-04-10", season: .spring,
      microSeason: MicroSeason(term: "The First Green", gloss: "buds unfold"),
      moon: MoonState(phase: .waningGibbous, illumination: 0.62), lunarSeason: .waning,
      lunarProgress: 0.6, cycle: cycle, placements: [:])
  }

  private func context(
    hemisphere: Hemisphere, cycle: CycleState? = nil, cycleLength: Int? = nil,
    timeZone: TimeZone? = nil
  ) -> RhythmBadgeSheet.Context {
    RhythmBadgeSheet.Context(
      rhythm: rhythm(cycle: cycle), hemisphere: hemisphere, seasonStyle: .astronomical,
      microSeason: MicroSeason(term: "The First Green", gloss: "buds unfold"),
      cycleLength: cycleLength, locale: english, calendar: Calendar(identifier: .gregorian),
      timeZone: timeZone ?? utc)
  }

  private func sheets(_ context: RhythmBadgeSheet.Context) -> [RhythmBadgeSheet] {
    let felt = Rhythm.season(
      date: context.rhythm.date, hemisphere: context.hemisphere, style: context.seasonStyle)
    return RhythmBadge.badges(for: context.rhythm, feltSeason: felt, hemisphere: context.hemisphere)
      .map { RhythmBadgeSheet.sheet(for: $0, in: context) }
  }

  // MARK: Which sheets

  func testOneSheetPerBadgeAndNoCycleSheetWithoutACycle() {
    XCTAssertEqual(
      sheets(context(hemisphere: .north)).map(\.identifier),
      ["rhythm-sheet-season", "rhythm-sheet-moon"])
    XCTAssertEqual(
      sheets(context(hemisphere: .south, cycle: CycleState(day: 12, phase: .follicular)))
        .map(\.identifier),
      ["rhythm-sheet-season", "rhythm-sheet-moon", "rhythm-sheet-cycle"])
  }

  // MARK: Season

  func testSeasonSheetInTheNorth() {
    let sheet = sheets(context(hemisphere: .north))[0]
    XCTAssertEqual(sheet.title, "Season")
    XCTAssertEqual(sheet.headline, "Spring · 22% through")
    XCTAssertEqual(
      sheet.lines.map(\.text),
      [
        "By the meteorological calendar, Spring · 43% through",
        "The First Green",
        "Next turning point: June solstice in 72 days",
      ])
    XCTAssertEqual(sheet.lines.map(\.detail), [nil, "buds unfold", "June 21, 2026"])
    XCTAssertNil(sheet.note)
  }

  func testSeasonSheetInTheSouthFlipsTheNamesNotTheProgress() {
    let sheet = sheets(context(hemisphere: .south))[0]
    XCTAssertEqual(sheet.headline, "Autumn · 22% through")
    XCTAssertEqual(sheet.lines[0].text, "By the meteorological calendar, Autumn · 43% through")
    XCTAssertEqual(sheet.lines[2].text, "Next turning point: June solstice in 72 days")
  }

  func testSeasonSheetAgreesWithTheDetailPanel() {
    // The sheet and the panel read the same helpers, so the strings are the same.
    let sheet = sheets(context(hemisphere: .north))[0]
    XCTAssertEqual(
      sheet.headline,
      AlmanacText.seasonText(
        date: "2026-04-10", hemisphere: .north, style: .astronomical, locale: english))
    XCTAssertEqual(
      sheet.lines[2].text, AlmanacText.turningCallout(date: "2026-04-10", locale: english))
  }

  // MARK: Moon

  func testMoonSheetInTheNorth() {
    let sheet = sheets(context(hemisphere: .north))[1]
    XCTAssertEqual(sheet.title, "Moon")
    XCTAssertEqual(sheet.headline, "Waning gibbous moon · 62% lit")
    XCTAssertEqual(
      sheet.lines.map(\.text),
      [
        "Waning · 60% through the lunar month",
        "New moon in 7 days",
        "Full moon in 21 days",
      ])
    XCTAssertEqual(sheet.lines.map(\.detail), [nil, "April 17, 2026", "May 1, 2026"])
    XCTAssertEqual(
      sheet.lines.map(\.id).dropFirst(), ["rhythm-sheet-new-moon", "rhythm-sheet-full-moon"])
    XCTAssertEqual(
      sheet.note,
      "The disc is drawn as you see it from the northern hemisphere: the moon waxes from the right."
    )
  }

  func testMoonSheetInTheSouthSaysTheDiscIsMirrored() {
    let sheet = sheets(context(hemisphere: .south))[1]
    XCTAssertEqual(sheet.headline, "Waning gibbous moon · 62% lit")
    XCTAssertEqual(sheet.lines[1].text, "New moon in 7 days")
    XCTAssertEqual(
      sheet.note,
      "The disc is drawn as you see it from the southern hemisphere: the moon waxes from the left."
    )
  }

  func testMoonSheetLeadsWithThePanelsLunationCallout() {
    let sheet = sheets(context(hemisphere: .north))[1]
    XCTAssertEqual(
      sheet.lines[1].text, AlmanacText.lunationCallout(date: "2026-04-10", locale: english))
  }

  func testLunationDatesFallOnThePersonsCalendarDay() {
    // 1 May 17:23 UTC is already 2 May in Auckland.
    let sheet = sheets(context(hemisphere: .south, timeZone: auckland))[1]
    XCTAssertEqual(sheet.lines.map(\.detail), [nil, "April 17, 2026", "May 2, 2026"])
  }

  // MARK: Cycle

  func testCycleSheetSaysEstimatedAndWhereTheEstimateComesFrom() {
    let sheet = sheets(
      context(hemisphere: .north, cycle: CycleState(day: 12, phase: .follicular), cycleLength: 28)
    )[2]
    XCTAssertEqual(sheet.title, "Cycle")
    XCTAssertEqual(sheet.headline, "Day 12 · estimated follicular phase")
    XCTAssertEqual(
      sheet.lines.map(\.text),
      ["The follicular phase is estimated to run from day 6 to day 13 of a 28-day cycle."])
    let note = sheet.note ?? ""
    XCTAssertTrue(note.contains("estimate"), note)
    XCTAssertTrue(note.contains("Health"), note)
    XCTAssertTrue(note.contains("only reads"), note)
    XCTAssertTrue(note.contains("Nothing from Health is stored"), note)
    XCTAssertTrue(note.contains("not medical advice"), note)
  }

  func testCycleSheetUsesTheCyclesOwnLength() {
    let sheet = sheets(
      context(hemisphere: .south, cycle: CycleState(day: 20, phase: .luteal), cycleLength: 31)
    )[2]
    XCTAssertEqual(sheet.headline, "Day 20 · estimated luteal phase")
    XCTAssertEqual(
      sheet.lines[0].text,
      "The luteal phase is estimated to run from day 20 to day 31 of a 31-day cycle.")
  }

  func testCycleSheetAssumesATypicalLengthWhenNoneIsKnown() {
    let sheet = sheets(context(hemisphere: .north, cycle: CycleState(day: 2, phase: .menstrual)))[2]
    XCTAssertEqual(
      sheet.lines[0].text,
      "The menstrual phase is estimated to run from day 1 to day 5 of a 28-day cycle.")
  }

  func testCycleSheetAttachesNothingToAPhase() {
    // Every phase gets its day, its span and the note, and nothing else: no feelings,
    // predictions or advice.
    let advice = ["should", "feel", "energy", "fertile", "likely", "best time"]
    for phase in [CyclePhase.menstrual, .follicular, .ovulation, .luteal] {
      let sheet = sheets(context(hemisphere: .north, cycle: CycleState(day: 3, phase: phase)))[2]
      XCTAssertTrue(sheet.headline.contains("estimated"), sheet.headline)
      XCTAssertEqual(sheet.lines.count, 1, "\(phase)")
      let text = ([sheet.headline, sheet.note ?? ""] + sheet.lines.map(\.text))
        .joined(separator: " ")
      for word in advice {
        XCTAssertFalse(text.lowercased().contains(word), "\(phase) sheet says \(word)")
      }
    }
  }

  // MARK: The shared sentences

  func testEventLineCountsWholeDaysFromTheStartOfTheDay() {
    let day: Int64 = 86_400_000
    let from = Rhythm.dayMillis(date: "2026-04-10")
    XCTAssertEqual(
      AlmanacText.eventLine(
        title: "Full moon", eventMs: from + 3_600_000, fromMs: from, locale: english),
      "Full moon today")
    XCTAssertEqual(
      AlmanacText.eventLine(title: "Full moon", eventMs: from + day, fromMs: from, locale: english),
      "Full moon tomorrow")
    XCTAssertEqual(
      AlmanacText.eventLine(
        title: "Full moon", eventMs: from + 3 * day + 1, fromMs: from, locale: english),
      "Full moon in 3 days")
  }

  func testOtherSeasonNamesTheCalendarThePersonDidNotChoose() {
    XCTAssertEqual(
      AlmanacText.otherSeasonText(
        date: "2026-04-10", hemisphere: .north, style: .meteorological, locale: english),
      "By the astronomical calendar, Spring · 22% through")
  }
}
