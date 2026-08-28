import Foundation
import Observation

// ThemeStore persists the user's selected theme id in UserDefaults and exposes
// the resolved StudioTheme for the current selection. Inject as an @Observable
// in the app root and pass down via .environment(\.studioTheme, store.current).

@Observable
final class ThemeStore {
  private static let defaultsKey = "ateliera.theme"
  @ObservationIgnored private let defaults: UserDefaults

  // selectedId is the raw String id (e.g. "deep-ocean") for persistence.
  // Setting it immediately writes to the store's UserDefaults and recomputes
  // `current`.
  var selectedId: String {
    didSet {
      defaults.set(selectedId, forKey: Self.defaultsKey)
    }
  }

  // current is the resolved StudioTheme; always in sync with selectedId.
  var current: StudioTheme {
    StudioTheme.byId(selectedId)
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let saved = defaults.string(forKey: Self.defaultsKey) ?? ""
    // Validate: if the saved id is not in the known set, fall back to chamomile.
    let known = StudioTheme.all.map { $0.id }
    self.selectedId = known.contains(saved) ? saved : StudioTheme.chamomile.id
  }
}
