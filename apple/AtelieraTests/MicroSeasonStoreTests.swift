import XCTest

@testable import Ateliera

// The micro-season store: deterministic by default, personalised (cached per window + place)
// when enabled and the on-device model yields a result. Uses injected fakes — never the real
// model — so the fallback + cache behaviour is deterministic.
@MainActor
final class MicroSeasonStoreTests: XCTestCase {
  private struct Fixed: MicroSeasonPersonalizer {
    let term: String
    let gloss: String
    func personalize(_ request: MicroSeasonRequest) async -> MicroSeason? {
      MicroSeason(term: term, gloss: gloss)
    }
  }
  private struct NilResult: MicroSeasonPersonalizer {
    func personalize(_ request: MicroSeasonRequest) async -> MicroSeason? { nil }
  }

  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("micro-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  private let home = HomePlace(name: "Melbourne", latitude: -37.8, longitude: 144.9)
  private func context(_ date: String) -> RhythmContext {
    Rhythm.computeContext(profile: RhythmProfile(hemisphere: .south, cycle: nil), date: date)
  }

  func testPersonalisesWhenEnabledWithPlaceAndModel() async throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let micro = MicroSeasonStore(store: store, personalizer: Fixed(term: "Dry heat easing", gloss: "x"))
    await micro.refresh(context: context("2026-01-10"), home: home, enabled: true)
    XCTAssertEqual(micro.personalized?.term, "Dry heat easing")
    XCTAssertEqual(micro.personalizedPlace, "Melbourne")
  }

  func testFallsBackWhenDisabledOrNoPlaceOrNoModelOrNilResult() async throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let ctx = context("2026-01-10")

    let disabled = MicroSeasonStore(store: store, personalizer: Fixed(term: "T", gloss: "x"))
    await disabled.refresh(context: ctx, home: home, enabled: false)
    XCTAssertNil(disabled.personalized)

    let noPlace = MicroSeasonStore(store: store, personalizer: Fixed(term: "T", gloss: "x"))
    await noPlace.refresh(context: ctx, home: nil, enabled: true)
    XCTAssertNil(noPlace.personalized)

    let noModel = MicroSeasonStore(store: store, personalizer: nil)
    await noModel.refresh(context: ctx, home: home, enabled: true)
    XCTAssertNil(noModel.personalized)

    let nilResult = MicroSeasonStore(store: store, personalizer: NilResult())
    await nilResult.refresh(context: ctx, home: home, enabled: true)
    XCTAssertNil(nilResult.personalized)
  }

  func testCacheHitAvoidsTheModelForTheSameWindowAndPlace() async throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let ctx = context("2026-01-10")

    // First store generates + caches via the fake.
    let first = MicroSeasonStore(store: store, personalizer: Fixed(term: "Cached turn", gloss: "x"))
    await first.refresh(context: ctx, home: home, enabled: true)
    XCTAssertEqual(first.personalized?.term, "Cached turn")

    // A second store whose model always returns nil still serves the cached value — proving
    // the cache hit short-circuits the model.
    let second = MicroSeasonStore(store: store, personalizer: NilResult())
    await second.refresh(context: ctx, home: home, enabled: true)
    XCTAssertEqual(second.personalized?.term, "Cached turn")
  }

  func testCacheMissesWhenTheWindowChanges() async throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    // Jan and June are different micro-season windows, so the key rotates and the model reruns.
    let micro = MicroSeasonStore(store: store, personalizer: Fixed(term: "Window A", gloss: "x"))
    await micro.refresh(context: context("2026-01-10"), home: home, enabled: true)
    XCTAssertEqual(micro.personalized?.term, "Window A")

    let later = MicroSeasonStore(store: store, personalizer: NilResult())
    await later.refresh(context: context("2026-06-21"), home: home, enabled: true)
    XCTAssertNil(later.personalized, "a new window is a cache miss, so the nil model falls back")
  }
}
