import Foundation
import Observation

// Owns the Reflection Garden: the projected chronology (with evidence connections
// resolved against the configured life areas), and capturing a reflection or
// celebration entry.
@Observable final class ReflectionStore {
  var garden: ReflectionGarden = .empty
  var error: String?

  @ObservationIgnored private let store: VaultStore
  @ObservationIgnored private var lifeAreas: [ReflectionLifeAreaTarget] = []

  init(store: VaultStore) {
    self.store = store
    loadLifeAreas()
    refresh()
  }

  private func loadLifeAreas() {
    let prefs: [LifeAreaPreference]
    if let raw = store.readRawFile(path: LifeAreaConfig.path),
      case .ok(let parsed) = LifeAreaConfig.parse(raw.text)
    {
      prefs = parsed
    } else {
      prefs = LifeAreaConfig.defaults()
    }
    lifeAreas = prefs.map { ReflectionLifeAreaTarget(id: $0.id, title: $0.title, hidden: $0.hidden) }
  }

  func refresh() {
    garden = ReflectionProjection.project(notes: store.parsedNotesByPath, lifeAreas: lifeAreas)
  }

  /// Keep a reflection or celebration entry (kind is the semantic + card type).
  @discardableResult
  func keep(kind: String, body: String) -> Bool {
    guard
      store.capture(
        title: nil, body: body, room: "reflection-garden", cardType: kind, semanticType: kind)
    else {
      error = store.error
      return false
    }
    refresh()
    return true
  }
}
