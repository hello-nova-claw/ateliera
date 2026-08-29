import Foundation
import Observation

// Owns the Reflection Garden: the projected chronology (with evidence connections
// resolved against the configured life areas), and capturing a reflection or
// celebration entry.
@Observable final class ReflectionStore {
  var garden: ReflectionGarden = .empty
  var error: String?

  @ObservationIgnored private let store: VaultStore
  @ObservationIgnored private(set) var lifeAreas: [ReflectionLifeAreaTarget] = []

  /// Visible life areas offered by the connect-evidence form.
  var visibleLifeAreas: [ReflectionLifeAreaTarget] { lifeAreas.filter { !$0.hidden } }

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

  /// A note the given card could pair with as a "then" (any other visible entry).
  func thenCandidates(for card: ReflectionCard) -> [ReflectionCard] {
    garden.cards.filter { $0.id != card.id }
  }

  /// Connect evidence to a reflection/celebration entry — union-merge note ids, life
  /// areas, and seasons into the note's frontmatter. Mirrors `linkReflectionEvidence`.
  @discardableResult
  func connectEvidence(
    card: ReflectionCard, noteIds: [String] = [], lifeAreas: [String] = [], seasons: [String] = []
  ) -> Bool {
    guard let editable = store.beginEdit(path: card.path) else {
      error = store.error
      return false
    }
    var note = editable.note
    guard note.semanticType == "reflection" || note.semanticType == "celebration" else {
      error = "Evidence links belong to a reflection or celebration."
      return false
    }
    note.lifeAreas = union(note.lifeAreas, lifeAreas)
    note.seasons = union(note.seasons, seasons)
    note.setRelatedNotes(union(note.frontmatterList("related_notes"), noteIds))
    guard store.saveEdit(editable, updatedNote: note) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Pair an entry with an earlier "then" note (or clear the pairing with nil).
  @discardableResult
  func linkThen(card: ReflectionCard, thenNoteId: String?) -> Bool {
    guard let editable = store.beginEdit(path: card.path) else {
      error = store.error
      return false
    }
    var note = editable.note
    note.setThenNoteId(thenNoteId)
    guard store.saveEdit(editable, updatedNote: note) else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Trimmed, non-empty, de-duped union preserving first-seen order.
  private func union(_ base: [String], _ additions: [String]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for value in base + additions {
      let trimmed = value.trimmingCharacters(in: .whitespaces)
      if !trimmed.isEmpty && seen.insert(trimmed).inserted { out.append(trimmed) }
    }
    return out
  }
}
