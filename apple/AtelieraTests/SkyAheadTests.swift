import XCTest

@testable import Ateliera

// The "Sky ahead" timeline engine: upcoming computed sky events, nearest-first, with
// per-layer filtering and the astrology layer gated behind a natal birth date. All the
// astronomy is composed from Sky.swift primitives already golden-matched to astronomia —
// these tests pin the ordering, horizon, de-duplication, toggle, and gating behaviour.
final class SkyAheadTests: XCTestCase {
  // A fixed "now" so the timeline is deterministic. 2026-10-02 (northern autumn).
  private let nowMs = Rhythm.utcMillis(year: 2026, month: 10, day: 2)

  private func events(
    layers: SkyLayers = .all, hemisphere: Hemisphere = .north, birthDate: String? = nil,
    horizonDays: Int = 120
  ) -> [SkyEvent] {
    SkyAhead.events(
      nowMs: nowMs, today: "2026-10-02", timeZone: .gmt, hemisphere: hemisphere, layers: layers,
      birthDate: birthDate, horizonDays: horizonDays)
  }

  // MARK: - The writer's own day

  func testTodaysEventIsListedAndDatedInTheLocalZone() throws {
    // An hour before a full moon, in UTC+11 and UTC−8: the moon is still ahead, and it's
    // dated on the local day it rises, not the UTC one.
    let full = Sky.nextMoonPhase(afterMs: nowMs, phase: .full)
    for hours in [11, -8] {
      let zone = try XCTUnwrap(TimeZone(secondsFromGMT: hours * 3600))
      let now = full - 3_600_000
      let today = Sky.isoDate(ms: now + Int64(hours) * 3_600_000)
      let list = SkyAhead.events(
        nowMs: now, today: today, timeZone: zone, hemisphere: .north, layers: .moonPhases,
        birthDate: nil)
      let moon = try XCTUnwrap(list.first { $0.ms == full }, "UTC\(hours): full moon missing")
      XCTAssertEqual(
        SkyAhead.localDay(of: moon, timeZone: zone),
        Sky.isoDate(ms: full + Int64(hours) * 3_600_000), "UTC\(hours)")
      XCTAssertEqual(SkyAhead.daysAway(moon, today: today, timeZone: zone), 0, "UTC\(hours)")
    }
  }

  func testAPassedEventTodayIsNotListed() throws {
    let full = Sky.nextMoonPhase(afterMs: nowMs, phase: .full)
    let zone = try XCTUnwrap(TimeZone(secondsFromGMT: -8 * 3600))
    let now = full + 3_600_000
    let list = SkyAhead.events(
      nowMs: now, today: Sky.isoDate(ms: now - 8 * 3_600_000), timeZone: zone,
      hemisphere: .north, layers: .moonPhases, birthDate: nil)
    XCTAssertNil(list.first { $0.ms == full })
  }

  func testLocalMidnightIsTheDaysFirstInstantWhereClocksSkipIt() throws {
    // Santiago moved its clocks from 00:00 to 01:00 on 7 September 2025, so that day
    // starts at 01:00 local (04:00 UTC).
    let santiago = try XCTUnwrap(TimeZone(identifier: "America/Santiago"))
    let start = Sky.instant(localDate: "2025-09-07", hour: 0, timeZone: santiago)
    XCTAssertEqual(Sky.localDate(ms: start, timeZone: santiago), "2025-09-07")
    XCTAssertEqual(Sky.localDate(ms: start - 1, timeZone: santiago), "2025-09-06")
    XCTAssertEqual(
      Sky.instant(
        localDate: "2026-11-02", hour: 12,
        timeZone: try XCTUnwrap(TimeZone(identifier: "Australia/Melbourne"))),
      Rhythm.utcMillis(year: 2026, month: 11, day: 2) + 3_600_000)
  }

  func testDateEventsKeepTheirCalendarDayInAnyZone() throws {
    // A solar return is a calendar day, so it reads the same date east and west of UTC.
    for hours in [11, -8] {
      let zone = try XCTUnwrap(TimeZone(secondsFromGMT: hours * 3600))
      let list = SkyAhead.events(
        nowMs: nowMs, today: "2026-10-02", timeZone: zone, hemisphere: .north,
        layers: .astrology, birthDate: "1990-10-20")
      let solar = try XCTUnwrap(list.first, "UTC\(hours)")
      XCTAssertEqual(SkyAhead.localDay(of: solar, timeZone: zone), "2026-10-20", "UTC\(hours)")
      XCTAssertEqual(SkyAhead.daysAway(solar, today: "2026-10-02", timeZone: zone), 18)
    }
  }

  // MARK: - Ordering & horizon

  func testEventsAreSortedNearestFirstAndInTheFuture() {
    let list = events()
    XCTAssertFalse(list.isEmpty)
    for event in list {
      XCTAssertGreaterThan(event.ms, nowMs, "\(event.title) is not in the future")
    }
    XCTAssertEqual(list, list.sorted { $0.ms < $1.ms }, "events are not nearest-first")
  }

  func testHorizonBoundsHowFarAhead() {
    let near = events(horizonDays: 14)
    let far = events(horizonDays: 120)
    XCTAssertLessThan(near.count, far.count)
    let cutoff = nowMs + 14 * 86_400_000
    for event in near { XCTAssertLessThanOrEqual(event.ms, cutoff) }
  }

  // MARK: - Families present (golden dates from astronomia, see SkyAhead epic)

  func testIncludesTheNextTurningPoint() {
    // After 2026-10-02 the next turning point is the December solstice (2026-12-21).
    let turning = events().first { $0.family == .turningPoints }
    XCTAssertEqual(turning?.title, "December solstice")
    XCTAssertEqual(Sky.isoDate(ms: turning!.ms), "2026-12-21")
  }

  func testIncludesUpcomingMoonPhases() {
    let moons = events().filter { $0.family == .moonPhases }
    // Next full moon is 2026-10-26, next new moon 2026-10-10 — both within the horizon.
    let dates = Set(moons.map { Sky.isoDate(ms: $0.ms) })
    XCTAssertTrue(dates.contains("2026-10-10"), "missing next new moon; got \(dates)")
    XCTAssertTrue(dates.contains("2026-10-26"), "missing next full moon; got \(dates)")
  }

  func testIncludesANextLunationMarker() {
    // The nearest of new/full is flagged so the view can lead with it.
    let lunation = events().first { $0.family == .moonPhases && $0.isNextLunation }
    XCTAssertNotNil(lunation)
    // 2026-10-10 new moon is the next lunation after 2026-10-02.
    XCTAssertEqual(Sky.isoDate(ms: lunation!.ms), "2026-10-10")
  }

  func testIncludesAMicroSeasonShift() {
    let shift = events().first { $0.family == .microSeasons }
    XCTAssertNotNil(shift, "expected an upcoming micro-season shift")
    XCTAssertGreaterThan(shift!.ms, nowMs)
  }

  // MARK: - Per-layer toggles

  func testTurningPointsLayerCanBeHidden() {
    let without = events(layers: SkyLayers.all.subtracting(.turningPoints))
    XCTAssertTrue(without.allSatisfy { $0.family != .turningPoints })
    XCTAssertFalse(without.isEmpty)
  }

  func testMoonPhasesLayerCanBeHidden() {
    let without = events(layers: SkyLayers.all.subtracting(.moonPhases))
    XCTAssertTrue(without.allSatisfy { $0.family != .moonPhases })
  }

  func testEmptyLayerSetYieldsNoEvents() {
    XCTAssertTrue(events(layers: []).isEmpty)
  }

  // MARK: - Astrology layer gating

  func testSolarReturnAbsentWithoutABirthDate() {
    let list = events(birthDate: nil)
    XCTAssertTrue(list.allSatisfy { $0.family != .astrology })
  }

  func testSolarReturnAppearsWithABirthDateWithinHorizon() {
    // Birthday MM-DD 11-15 falls ~44 days ahead, inside the 120-day horizon.
    let list = events(birthDate: "1988-11-15")
    let solar = list.first { $0.family == .astrology }
    XCTAssertNotNil(solar)
    XCTAssertEqual(Sky.isoDate(ms: solar!.ms), "2026-11-15")
  }

  func testAstrologyLayerGatedEvenWhenBirthDatePresent() {
    // The astrology layer still obeys the toggle: off → no solar return.
    let list = events(layers: SkyLayers.all.subtracting(.astrology), birthDate: "1988-11-15")
    XCTAssertTrue(list.allSatisfy { $0.family != .astrology })
  }

  // MARK: - Hemisphere-aware season naming

  func testTurningPointNamesTheLocalSeason() {
    let north = events().first { $0.family == .turningPoints }
    let south = events(hemisphere: .south).first { $0.family == .turningPoints }
    // December solstice: northern winter begins, southern summer begins.
    XCTAssertTrue(north!.detail.contains("winter"), "north: \(north!.detail)")
    XCTAssertTrue(south!.detail.contains("summer"), "south: \(south!.detail)")
  }
}

// The per-vault layer-visibility store persists like InvitationDismissalStore.
final class SkyLayerStoreTests: XCTestCase {
  private func freshDefaults() -> UserDefaults {
    let name = "sky-layer-test-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defaults.removePersistentDomain(forName: name)
    return defaults
  }

  func testDefaultsToTurningPointsMoonAndMicroSeasons() {
    let store = SkyLayerStore(defaults: freshDefaults())
    let layers = store.load(studioId: "vault-a")
    XCTAssertTrue(layers.contains(.turningPoints))
    XCTAssertTrue(layers.contains(.moonPhases))
    XCTAssertTrue(layers.contains(.microSeasons))
    // Astrology is off by default — it's gated behind a natal profile anyway.
    XCTAssertFalse(layers.contains(.astrology))
  }

  func testRoundTripsPerVault() {
    let defaults = freshDefaults()
    let store = SkyLayerStore(defaults: defaults)
    store.save([.turningPoints, .astrology], studioId: "vault-a")
    store.save(SkyLayers.all, studioId: "vault-b")
    XCTAssertEqual(store.load(studioId: "vault-a"), [.turningPoints, .astrology])
    XCTAssertEqual(store.load(studioId: "vault-b"), SkyLayers.all)
  }

  func testSavingAnEmptySetIsDistinctFromUnset() {
    let defaults = freshDefaults()
    let store = SkyLayerStore(defaults: defaults)
    store.save([], studioId: "vault-a")
    XCTAssertEqual(store.load(studioId: "vault-a"), [])
    // A vault that was never saved falls back to the sensible defaults, not empty.
    XCTAssertFalse(store.load(studioId: "vault-untouched").isEmpty)
  }
}
