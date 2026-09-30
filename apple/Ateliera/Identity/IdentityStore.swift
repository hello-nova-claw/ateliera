import Foundation
import Observation

// Owns the Identity Studio room's state: the projected board (7 sections + the
// "currently becoming" hero) over the loaded vault notes, with per-section manual
// order and the promoted note read from .studio/views. Adding a card captures a
// note into the identity-studio room; promote/reorder write view-state files.
@Observable final class IdentityStore {
  var model: IdentityBoardModel = .empty
  var error: String?
  // Life-area id → title, so a becoming can show which area it belongs to.
  private(set) var areaTitles: [String: String] = [:]

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
    areaTitles = loadAreaTitles()
    model = IdentityProjector.project(
      notes: store.parsedNotesByPath, sectionOrders: sectionOrders,
      currentlyBecomingOrder: loadOrder("identity:currently-becoming"))
  }

  /// A becoming's life-area title (for display), or nil if it isn't tagged / is unknown.
  func areaTitle(_ id: String?) -> String? {
    guard let id else { return nil }
    return areaTitles[id]
  }

  /// Retire a becoming: archive it (reversibly) and record why, so the history reads
  /// clearly. `reason` may be a `BecomingRetireReason` raw value, free text, or nil
  /// (archived with no reason). Writes through the one save rail; unknown keys survive.
  @discardableResult
  func retireBecoming(path: String, reason: String?) -> Bool {
    guard store.retireBecoming(path: path, reason: reason) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Bring a retired becoming back into play: active again, reason cleared.
  @discardableResult
  func restoreBecoming(path: String) -> Bool {
    guard store.restoreBecoming(path: path) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  private func loadAreaTitles() -> [String: String] {
    let prefs: [LifeAreaPreference]
    if let raw = store.readRawFile(path: LifeAreaConfig.path), case .ok(let areas) = LifeAreaConfig.parse(raw.text) {
      prefs = areas
    } else {
      prefs = LifeAreaConfig.defaults()
    }
    return Dictionary(prefs.map { ($0.id, $0.title) }, uniquingKeysWith: { first, _ in first })
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
