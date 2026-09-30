import XCTest

@testable import Ateliera

// Golden values captured from `@studio/rhythm`'s resurfacing.ts + resurfacing.test.ts
// (via a throwaway vitest, run 2026-08-28, then deleted). If these pass, the native
// Gift engine grades intervals, advances due dates, and selects the day's card
// identically to the web app — one SM-2 loop, two apps.
final class ResurfacingTests: XCTestCase {

  // MARK: isDue (lexical ISO date compare)

  func testIsDue() {
    func c(_ due: String) -> ResurfaceCard {
      ResurfaceCard(sourcePath: "daily/2026-05-01", kind: .evidence, dueDate: due, intervalDays: 1)
    }
    XCTAssertTrue(Resurfacing.isDue(c("2026-06-21"), today: "2026-06-21"))  // equal → due
    XCTAssertTrue(Resurfacing.isDue(c("2026-06-10"), today: "2026-06-21"))  // earlier → due
    XCTAssertFalse(Resurfacing.isDue(c("2026-07-01"), today: "2026-06-21"))  // later → not due
  }

  // MARK: ease(forQuality:) golden — EASE=[[2,1.6],[3,1.6],[4,2.5],[5,3]]

  func testEaseForQuality() {
    let golden: [(Int, Double)] = [(2, 1.6), (3, 1.6), (4, 2.5), (5, 3)]
    for (q, expected) in golden {
      XCTAssertEqual(Resurfacing.ease(forQuality: q), expected, accuracy: 1e-12, "q=\(q)")
    }
  }

  // MARK: sm2Interval golden table
  // SM2=[[1,4,6],[1,5,6],[1,3,6],[1,2,1],[2,4,5],[6,3,10],[6,4,15],[6,5,18],
  //      [6,2,1],[10,3,16],[15,4,38],[15,5,45],[18,5,54],[40,0,1]]

  func testSm2IntervalGoldenTable() {
    let rows: [(prev: Int, q: Int, expected: Int)] = [
      (1, 4, 6),  // first pass → fixed 6-day step
      (1, 5, 6),  // first pass, deep still fixed 6
      (1, 3, 6),  // first pass, grudging still 6
      (1, 2, 1),  // fail resets
      (2, 4, 5),  // 2*2.5=5.0 (boundary)
      (6, 3, 10),  // 6*1.6=9.6→10
      (6, 4, 15),  // 6*2.5=15
      (6, 5, 18),  // 6*3=18
      (6, 2, 1),  // fail resets
      (10, 3, 16),  // 10*1.6=16
      (15, 4, 38),  // 15*2.5=37.5→38 (half-up boundary)
      (15, 5, 45),  // 15*3
      (18, 5, 54),  // 18*3
      (40, 0, 1),  // fail resets
    ]
    for row in rows {
      XCTAssertEqual(
        Resurfacing.sm2Interval(prevIntervalDays: row.prev, quality: row.q), row.expected,
        "sm2Interval(prev: \(row.prev), q: \(row.q))")
    }
  }

  // MARK: addDaysISO golden
  // ADD=[["2026-06-21",18,"2026-07-09"],["2026-02-28",1,"2026-03-01"],
  //      ["2026-12-31",6,"2027-01-06"],["2026-01-15",6,"2026-01-21"],
  //      ["2026-07-09",10,"2026-07-19"]]

  func testAddDaysISOGolden() {
    let rows: [(iso: String, days: Int, expected: String)] = [
      ("2026-06-21", 18, "2026-07-09"),  // due-date advance for an 18-day interval
      ("2026-02-28", 1, "2026-03-01"),  // 2026 non-leap month rollover
      ("2026-12-31", 6, "2027-01-06"),  // year rollover
      ("2026-01-15", 6, "2026-01-21"),  // ordinary in-month advance
      ("2026-07-09", 10, "2026-07-19"),  // ordinary in-month advance
    ]
    for row in rows {
      XCTAssertEqual(
        Resurfacing.addDaysISO(row.iso, row.days), row.expected,
        "addDaysISO(\(row.iso), \(row.days))")
    }
  }

  // MARK: select — due filtering (from resurfacing.test.ts)

  private func ctx(
    season: Season = .winter,
    moon: MoonState = MoonState(phase: .firstQuarter, illumination: 0.5),
    cycle: CycleState? = CycleState(day: 8, phase: .follicular)
  ) -> RhythmContext {
    RhythmContext(
      date: "2026-06-21", season: season,
      microSeason: MicroSeason(term: "The Long Light", gloss: "the longest day"),
      moon: moon, lunarSeason: .waxing, lunarProgress: 0.25, cycle: cycle, placements: [:])
  }

  private func card(_ path: String, _ kind: ResurfaceKind, _ due: String) -> ResurfaceCard {
    ResurfaceCard(sourcePath: path, kind: kind, dueDate: due, intervalDays: 6)
  }

  func testSelectDueTodayReturned() {
    let due = card("daily/2026-05-01", .evidence, "2026-06-21")
    XCTAssertEqual(Resurfacing.select([due], ctx: ctx(), today: "2026-06-21"), due)
  }

  func testSelectNoneDueReturnsNil() {
    let future = [
      card("a", .evidence, "2026-07-01"),
      card("b", .wish, "2026-07-01"),
    ]
    XCTAssertNil(Resurfacing.select(future, ctx: ctx(), today: "2026-06-21"))
  }

  func testSelectEmptyPoolReturnsNil() {
    XCTAssertNil(Resurfacing.select([], ctx: ctx(), today: "2026-06-21"))
  }

  // MARK: select — rhythm ranking (POOL: one evidence + one wish, both due)

  private var pool: [ResurfaceCard] {
    [
      card("evidence/a", .evidence, "2026-06-01"),
      card("wishes/b", .wish, "2026-06-01"),
    ]
  }

  func testSelectDeepWinterLutealBringsEvidence() {
    let c = ctx(season: .winter, cycle: CycleState(day: 26, phase: .luteal))
    XCTAssertEqual(Resurfacing.select(pool, ctx: c, today: "2026-06-21")?.kind, .evidence)
  }

  func testSelectSpringFollicularSurfacesWish() {
    let c = ctx(season: .spring, cycle: CycleState(day: 8, phase: .follicular))
    XCTAssertEqual(Resurfacing.select(pool, ctx: c, today: "2026-06-21")?.kind, .wish)
  }

  func testSelectMoonKeyed() {
    let newMoon = ctx(moon: MoonState(phase: .new, illumination: 0))
    let fullMoon = ctx(moon: MoonState(phase: .full, illumination: 1))
    XCTAssertEqual(Resurfacing.select(pool, ctx: newMoon, today: "2026-06-21")?.kind, .wish)
    XCTAssertEqual(Resurfacing.select(pool, ctx: fullMoon, today: "2026-06-21")?.kind, .evidence)
  }

  func testSelectDeterminism() {
    let c = ctx(season: .winter, cycle: CycleState(day: 26, phase: .luteal))
    let first = Resurfacing.select(pool, ctx: c, today: "2026-06-21")
    let second = Resurfacing.select(pool, ctx: c, today: "2026-06-21")
    XCTAssertEqual(first, second)
  }

  func testSelectInputOrderIndependent() {
    let c = ctx(season: .winter, cycle: CycleState(day: 26, phase: .luteal))
    XCTAssertEqual(
      Resurfacing.select(pool.reversed(), ctx: c, today: "2026-06-21"),
      Resurfacing.select(pool, ctx: c, today: "2026-06-21"))
  }

  func testSelectSameKindTieBreaksOnLowestSourcePath() {
    let sameKind = [
      card("evidence/z", .evidence, "2026-06-01"),
      card("evidence/a", .evidence, "2026-06-01"),
    ]
    XCTAssertEqual(
      Resurfacing.select(sameKind, ctx: ctx(), today: "2026-06-21")?.sourcePath, "evidence/a")
  }

  // MARK: resurfacePool — pool inclusion over parsed notes

  private func note(rooms: [String], kind: String?, due: String?, interval: Int?) -> StudioNote {
    var lines = [
      "---", "id: 01JTEST", "title: A note", "card_type: reflection",
      "semantic_type: celebration", "status: active",
      "created: 2026-07-14T09:00:00+10:00", "updated: 2026-07-14T09:00:00+10:00",
    ]
    lines.append("rooms:")
    for r in rooms { lines.append("  - \(r)") }
    if let kind { lines.append("resurface_kind: \(kind)") }
    if let due { lines.append("resurface_due: \(due)") }
    if let interval { lines.append("resurface_interval_days: \(interval)") }
    lines.append(contentsOf: ["---", "Body.", ""])
    return NoteParser.parse(lines.joined(separator: "\n"))!
  }

  func testResurfacePoolIncludesOnlyResurfaceRoomsWithAllThreeFields() {
    let notes: [(path: String, note: StudioNote)] = [
      ("reflection/keep.md",
        note(rooms: ["reflection-garden"], kind: "evidence", due: "2026-06-01", interval: 6)),
      ("uncharted/wish.md",
        note(rooms: ["uncharted"], kind: "wish", due: "2026-06-10", interval: 3)),
      // excluded: missing interval
      ("reflection/no-interval.md",
        note(rooms: ["reflection-garden"], kind: "evidence", due: "2026-06-01", interval: nil)),
      // excluded: wrong room even though all three fields present
      ("inbox/has-fields.md",
        note(rooms: ["inbox"], kind: "evidence", due: "2026-06-01", interval: 6)),
    ]
    let pool = Resurfacing.resurfacePool(from: notes)
    XCTAssertEqual(pool.count, 2)
    XCTAssertEqual(
      pool.map(\.sourcePath).sorted(), ["reflection/keep.md", "uncharted/wish.md"])
    let keep = pool.first { $0.sourcePath == "reflection/keep.md" }
    XCTAssertEqual(keep?.kind, .evidence)
    XCTAssertEqual(keep?.dueDate, "2026-06-01")
    XCTAssertEqual(keep?.intervalDays, 6)
    let wish = pool.first { $0.sourcePath == "uncharted/wish.md" }
    XCTAssertEqual(wish?.kind, .wish)
    XCTAssertEqual(wish?.intervalDays, 3)
  }

  // MARK: Grade → quality mapping (mirror web GIFT_GRADES = {notNow:2, keep:4, deeply:5})

  func testGradeRawValues() {
    XCTAssertEqual(Resurfacing.Grade.notNow.rawValue, 2)
    XCTAssertEqual(Resurfacing.Grade.keep.rawValue, 4)
    XCTAssertEqual(Resurfacing.Grade.deeply.rawValue, 5)
  }
}
