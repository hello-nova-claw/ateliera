import Foundation

// Progressive-disclosure preferences (ported from `room-visibility.ts` /
// `use-studio-preferences.ts`): which rooms and Foyer sections show, and which
// rhythm layers are on. A new Studio starts small (optional rooms + most Foyer
// sections hidden); an existing Studio with no stored prefs shows everything.
struct StoredStudioPreferences: Codable, Equatable {
  var rooms: [String: String] = [:]  // roomId → "off"; absent = on
  var foyerSections: [String: String] = [:]  // sectionId → "off"; absent = on
  var rhythm: RhythmPreferences = RhythmPreferences()

  struct RhythmPreferences: Codable, Equatable {
    var moon = true
    var microSeason = true
    var cycle = true
    // Optional so preferences saved before this existed still decode. Unset resolves to
    // astronomical — the season grounded in the sky (equinoxes/solstices).
    var seasonStyle: SeasonStyle?
    // Personalise the micro-season with the on-device model when available. Optional so
    // older preferences decode; unset resolves to on (it's private and on-device).
    var personalizeMicroSeasons: Bool?

    var resolvedSeasonStyle: SeasonStyle { seasonStyle ?? .astronomical }
    var resolvedPersonalizeMicroSeasons: Bool { personalizeMicroSeasons ?? true }
  }

  // Seeded for a brand-new Studio: hide the optional rooms, and every Foyer section
  // but becoming + gift + almanac.
  static let newStudio = StoredStudioPreferences(
    rooms: [
      "reflection-garden": "off", "inbox": "off", "journal": "off", "wisdom-garden": "off",
      "identity-studio": "off", "uncharted": "off", "current-season": "off",
    ],
    foyerSections: [
      "feelings": "off", "principles": "off", "seasonPreview": "off",
    ],
    rhythm: RhythmPreferences())
}

enum Preferences {
  // Rooms that are always visible (core to the experience).
  static let coreRooms: Set<String> = ["landscape"]

  static func isRoomVisible(_ id: String, _ prefs: StoredStudioPreferences) -> Bool {
    if coreRooms.contains(id) { return true }
    return prefs.rooms[id] != "off"
  }

  // A Foyer section shows unless toggled off; the almanac additionally hides when
  // every rhythm layer is off.
  static func isFoyerSectionVisible(_ id: String, _ prefs: StoredStudioPreferences) -> Bool {
    if id == "almanac" {
      let anyLayer = prefs.rhythm.moon || prefs.rhythm.microSeason || prefs.rhythm.cycle
      if !anyLayer { return false }
    }
    return prefs.foyerSections[id] != "off"
  }
}

// UserDefaults-backed persistence, keyed per vault (studioId).
struct PreferencesStore {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  private func key(_ studioId: String) -> String {
    "studio:preferences:\(studioId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? studioId)"
  }

  func load(studioId: String) -> StoredStudioPreferences? {
    guard let data = defaults.data(forKey: key(studioId)) else { return nil }
    return try? JSONDecoder().decode(StoredStudioPreferences.self, from: data)
  }

  func save(_ preferences: StoredStudioPreferences, studioId: String) {
    guard let data = try? JSONEncoder().encode(preferences) else { return }
    defaults.set(data, forKey: key(studioId))
  }
}

// Which Foyer invitations you've waved away, keyed per vault. Ephemeral UI state (not
// vault content): a dismissed occurrence stays hidden, but a future new moon / equinox
// has its own key and returns.
struct InvitationDismissalStore {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) { self.defaults = defaults }

  private func key(_ studioId: String) -> String {
    "studio:invitations-dismissed:\(studioId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? studioId)"
  }

  func load(studioId: String) -> Set<String> {
    Set(defaults.stringArray(forKey: key(studioId)) ?? [])
  }

  func save(_ dismissed: Set<String>, studioId: String) {
    defaults.set(Array(dismissed), forKey: key(studioId))
  }
}

// Which Sky-ahead event families are shown, keyed per vault. Ephemeral UI state like the
// dismissal store: a raw bitmask of SkyLayers. Unset falls back to the sensible defaults
// (turning points, moon phases, micro-seasons on); a saved empty set is honoured as empty.
struct SkyLayerStore {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) { self.defaults = defaults }

  private func key(_ studioId: String) -> String {
    "studio:sky-layers:\(studioId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? studioId)"
  }

  func load(studioId: String) -> SkyLayers {
    guard let raw = defaults.object(forKey: key(studioId)) as? Int else { return .defaults }
    return SkyLayers(rawValue: raw)
  }

  func save(_ layers: SkyLayers, studioId: String) {
    defaults.set(layers.rawValue, forKey: key(studioId))
  }
}
