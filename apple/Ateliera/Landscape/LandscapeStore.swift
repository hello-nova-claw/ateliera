import Foundation
import Observation

// Owns the Life Landscape room's state: the life-area configuration (from
// .studio/config/landscape-areas.json) and the projected board over the loaded
// vault notes, with the per-cell manual order read from .studio/views. Mutations
// (move a card, reorder a cell, manage areas) write through the atomic vault path
// and re-project. Reads/writes go through the shared VaultStore.
@Observable final class LandscapeStore {
  var preferences: [LifeAreaPreference] = LifeAreaPreference.defaults
  var board: LandscapeBoardModel = .empty
  var error: String?
  var repairRequired = false
  var configUnsupported = false

  @ObservationIgnored private let store: VaultStore
  @ObservationIgnored private var configRevision: String?

  init(store: VaultStore) {
    self.store = store
    loadConfig()
    refresh()
  }

  /// The active (non-hidden) areas, in configured order.
  var areas: [LifeArea] {
    preferences.filter { !$0.hidden }.sorted { $0.order < $1.order }.map { $0.asLifeArea }
  }

  // MARK: - Load

  func loadConfig() {
    guard let raw = store.readRawFile(path: LifeAreaConfig.path) else {
      preferences = LifeAreaConfig.defaults()
      configRevision = nil
      repairRequired = false
      configUnsupported = false
      return
    }
    configRevision = raw.hash
    switch LifeAreaConfig.parse(raw.text) {
    case .ok(let areas):
      preferences = areas
      repairRequired = false
      configUnsupported = false
    case .unsupported:
      preferences = LifeAreaConfig.defaults()
      configUnsupported = true
    case .repair:
      preferences = LifeAreaConfig.defaults()
      repairRequired = true
    }
  }

  func refresh() {
    board = LandscapeProjector.project(
      notes: store.parsedNotesByPath, areas: areas.map { $0.id }, orders: loadOrders())
  }

  private func loadOrders() -> [String: [String]] {
    var orders: [String: [String]] = [:]
    for area in areas {
      for anchor in LandscapeAnchor.ordered {
        let key = "landscape:\(area.id):\(anchor.rawValue)"
        guard let path = ViewState.path(key), let raw = store.readRawFile(path: path) else { continue }
        let ids = ViewState.parse(raw.text)
        if !ids.isEmpty { orders[key] = ids }
      }
    }
    return orders
  }

  // MARK: - Card mutations

  /// Re-file a card under a different anchor (the keyboard-accessible "Move to…").
  /// Sets the note's `landscape_anchor` + `card_type` + `semantic_type` through the
  /// one write rail (optimistic concurrency, unknown keys preserved), then re-projects.
  @discardableResult
  func move(card: LandscapeCardModel, toAnchor anchor: LandscapeAnchor) -> Bool {
    guard let editable = store.beginEdit(path: card.path) else {
      error = store.error
      return false
    }
    var note = editable.note
    note.landscapeAnchor = anchor.rawValue
    note.cardType = anchor.cardType
    note.semanticType = anchor.semanticType
    guard store.saveEdit(editable, updatedNote: note) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Persist a manual card order for one cell and re-project.
  @discardableResult
  func reorder(area: String, anchor: LandscapeAnchor, noteIds: [String]) -> Bool {
    guard writeViewState(key: "landscape:\(area):\(anchor.rawValue)", noteIds: noteIds) else {
      return false
    }
    refresh()
    return true
  }

  // MARK: - Card content

  /// Capture a new card straight into a life area under a chosen anchor (the decisions
  /// anchor may carry a 30/60/90 horizon). Writes through the classified capture path,
  /// then re-projects the board.
  @discardableResult
  func addCard(
    lifeArea: String, anchor: LandscapeAnchor, horizon: DecisionHorizon?, title: String?,
    body: String, sourceNoteId: String? = nil
  ) -> Bool {
    guard
      store.capture(
        title: title, body: body,
        destination: .landscape(lifeArea: lifeArea, anchor: anchor, horizon: horizon),
        sourceNoteIds: sourceNoteId.map { [$0] })
    else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Remove a card from the board by trashing its note (status → "trashed"). The file
  /// survives, so it's reversible; the projection drops trashed notes.
  @discardableResult
  func deleteCard(_ card: LandscapeCardModel) -> Bool {
    guard let editable = store.beginEdit(path: card.path) else {
      error = store.error
      return false
    }
    var note = editable.note
    note.status = "trashed"
    guard store.saveEdit(editable, updatedNote: note) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  // MARK: - Area management

  @discardableResult
  func addArea(title: String) -> Bool {
    let id = LifeAreaConfig.safeAreaId(title: title, existing: preferences)
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
    let order = (preferences.map { $0.order }.max() ?? -1) + 1
    var next = preferences
    next.append(LifeAreaPreference(id: id, title: trimmed, hidden: false, order: order))
    return saveConfig(next)
  }

  @discardableResult
  func renameArea(id: String, title: String) -> Bool {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
    var next = preferences
    guard let index = next.firstIndex(where: { $0.id == id }) else { return false }
    next[index].title = trimmed
    return saveConfig(next)
  }

  @discardableResult
  func setHidden(id: String, hidden: Bool) -> Bool {
    var next = preferences
    guard let index = next.firstIndex(where: { $0.id == id }) else { return false }
    next[index].hidden = hidden
    return saveConfig(next)
  }

  /// Remove a life area from the configuration entirely. Notes keep their `life_areas`
  /// tag (they simply stop showing on the board), so re-adding the same area restores
  /// them — reversible, no content lost.
  @discardableResult
  func removeArea(id: String) -> Bool {
    let next = preferences.filter { $0.id != id }
    guard next.count != preferences.count else { return false }
    return saveConfig(next)
  }

  // MARK: - Persistence

  private func saveConfig(_ areas: [LifeAreaPreference]) -> Bool {
    // Re-number orders to a compact, unique 0..<n so the write always validates.
    let renumbered = areas.enumerated().map { index, area -> LifeAreaPreference in
      var copy = area
      copy.order = index
      return copy
    }
    let text = LifeAreaConfig.serialize(renumbered)
    guard
      let hash = store.writeRawFile(
        path: LifeAreaConfig.path, text: text, expectedHash: configRevision,
        createNew: configRevision == nil)
    else {
      error = store.error
      return false
    }
    configRevision = hash
    preferences = renumbered
    refresh()
    return true
  }

  private func writeViewState(key: String, noteIds: [String]) -> Bool {
    guard let path = ViewState.path(key) else { return false }
    let text = ViewState.serialize(noteIds)
    let existing = store.readRawFile(path: path)
    let hash = store.writeRawFile(
      path: path, text: text, expectedHash: existing?.hash, createNew: existing == nil)
    if hash == nil { error = store.error }
    return hash != nil
  }
}
