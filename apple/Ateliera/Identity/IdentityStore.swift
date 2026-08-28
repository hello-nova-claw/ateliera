import Foundation
import Observation

// Owns the Identity Studio room's state: the projected board (7 sections + the
// "currently becoming" hero) over the loaded vault notes, with per-section manual
// order and the promoted note read from .studio/views. Adding a card captures a
// note into the identity-studio room; promote/reorder write view-state files.
@Observable final class IdentityStore {
  var model: IdentityBoardModel = .empty
  var error: String?

  @ObservationIgnored private let store: VaultStore

  init(store: VaultStore) {
    self.store = store
    refresh()
  }

  func refresh() {
    var sectionOrders: [IdentitySection: [String]] = [:]
    for section in IdentitySection.allCases {
      let ids = loadOrder("identity:\(section.rawValue)")
      if !ids.isEmpty { sectionOrders[section] = ids }
    }
    model = IdentityProjector.project(
      notes: store.parsedNotesByPath, sectionOrders: sectionOrders,
      currentlyBecomingOrder: loadOrder("identity:currently-becoming"))
  }

  /// Capture a new card into a section (writes a note tagged identity-studio with the
  /// section's card + semantic type), then re-project.
  @discardableResult
  func add(section: IdentitySection, title: String?, body: String) -> Bool {
    guard
      store.capture(
        title: title, body: body, room: "identity-studio", cardType: section.cardType,
        semanticType: section.semanticType)
    else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Promote a practicing-now card to "currently becoming".
  @discardableResult
  func promote(noteId: String) -> Bool {
    guard writeViewState(key: "identity:currently-becoming", noteIds: [noteId]) else { return false }
    refresh()
    return true
  }

  /// Persist a manual card order for one section.
  @discardableResult
  func reorder(section: IdentitySection, noteIds: [String]) -> Bool {
    guard writeViewState(key: "identity:\(section.rawValue)", noteIds: noteIds) else { return false }
    refresh()
    return true
  }

  // MARK: - View state

  private func loadOrder(_ key: String) -> [String] {
    guard let path = ViewState.path(key), let raw = store.readRawFile(path: path) else { return [] }
    return ViewState.parse(raw.text)
  }

  private func writeViewState(key: String, noteIds: [String]) -> Bool {
    guard let path = ViewState.path(key) else { return false }
    let existing = store.readRawFile(path: path)
    let hash = store.writeRawFile(
      path: path, text: ViewState.serialize(noteIds), expectedHash: existing?.hash,
      createNew: existing == nil)
    if hash == nil { error = store.error }
    return hash != nil
  }
}
