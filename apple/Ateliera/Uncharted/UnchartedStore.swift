import Foundation
import Observation

// Owns the Uncharted room: the near/beyond possibility grids over the loaded vault,
// and capturing a new possibility (optionally "beyond the gate"). Inviting a
// possibility into the active season arrives with the Season room.
@Observable final class UnchartedStore {
  var near: [UnchartedCard] = []
  var beyond: [UnchartedCard] = []
  var error: String?

  @ObservationIgnored private let store: VaultStore

  init(store: VaultStore) {
    self.store = store
    refresh()
  }

  func refresh() {
    let cards = UnchartedProjection.project(notes: store.parsedNotesByPath)
    near = cards.filter { $0.horizon == .near }
    beyond = cards.filter { $0.horizon == .beyond }
  }

  /// Keep a possibility — a `possibility` card in the uncharted room, flagged
  /// `beyond_gate` when it's one to leave past the threshold for now.
  @discardableResult
  func keep(body: String, beyond: Bool) -> Bool {
    let extra: [(String, YamlNode)] = beyond ? [("beyond_gate", .bool(true))] : []
    guard
      store.capture(
        title: nil, body: body, room: "uncharted", cardType: "possibility",
        semanticType: "uncharted", extraFrontmatter: extra)
    else {
      error = store.error
      return false
    }
    refresh()
    return true
  }
}
