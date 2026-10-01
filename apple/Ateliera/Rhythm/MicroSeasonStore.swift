import Foundation
import Observation

// Owns the micro-season actually shown: the deterministic base by default, replaced by an
// on-device personalised retelling when one is available for the current window + place.
// The personalised result is cached as a disposable `.studio/` vault projection keyed by
// (place · term · year · hemisphere) and regenerated only when that key changes — so the
// model runs at most once per ~15-day window. Always safe offline: no personalizer, no
// place, toggle off, or a nil result all leave the deterministic base in place.
@Observable
@MainActor
final class MicroSeasonStore {
  // The on-device personalised micro-season for today, or nil to use the deterministic base.
  private(set) var personalized: MicroSeason?
  private(set) var personalizedPlace: String?

  @ObservationIgnored private let store: VaultStore
  @ObservationIgnored private let personalizer: MicroSeasonPersonalizer?

  static let cachePath = ".studio/cache/micro-seasons.json"

  init(store: VaultStore, personalizer: MicroSeasonPersonalizer?) {
    self.store = store
    self.personalizer = personalizer
  }

  // Resolve the personalised micro-season for today: nil (deterministic) unless enabled, a
  // place is known, and the model yields one — served from the vault cache when the window
  // and place are unchanged, else generated once and cached.
  func refresh(context: RhythmContext, home: HomePlace?, enabled: Bool) async {
    personalized = nil
    personalizedPlace = nil
    let base = context.microSeason
    guard enabled, let home, let personalizer else { return }

    let key = Self.cacheKey(term: base.term, date: context.date, home: home)
    if let cached = readCache(), cached.key == key {
      personalized = MicroSeason(term: cached.term, gloss: cached.gloss)
      personalizedPlace = home.name
      return
    }

    let request = MicroSeasonRequest(
      placeName: home.name, climate: home.climate, hemisphere: home.hemisphere,
      season: context.season, date: context.date, baseTerm: base.term, baseGloss: base.gloss,
      lunarSeason: context.lunarSeason)
    guard let result = await personalizer.personalize(request) else { return }
    writeCache(CachedMicroSeason(key: key, term: result.term, gloss: result.gloss))
    personalized = result
    personalizedPlace = home.name
  }

  static func cacheKey(term: String, date: String, home: HomePlace) -> String {
    "\(home.name)|\(term)|\(date.prefix(4))|\(home.hemisphere.rawValue)"
  }

  // MARK: - Cache (disposable projection; plain JSON, not a golden-matched vault note)

  private struct CachedMicroSeason: Codable {
    let key: String
    let term: String
    let gloss: String
  }

  private func readCache() -> CachedMicroSeason? {
    guard let raw = store.readRawFile(path: Self.cachePath),
      let data = raw.text.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(CachedMicroSeason.self, from: data)
  }

  private func writeCache(_ cached: CachedMicroSeason) {
    guard let data = try? JSONEncoder().encode(cached), let text = String(data: data, encoding: .utf8)
    else { return }
    let existing = store.readRawFile(path: Self.cachePath)
    _ = store.writeRawFile(
      path: Self.cachePath, text: text, expectedHash: existing?.hash, createNew: existing == nil)
  }
}
