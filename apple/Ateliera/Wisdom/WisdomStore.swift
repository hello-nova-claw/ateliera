import Foundation
import Observation

// Owns the Wisdom Garden: the projected cards + theme counts over the loaded vault,
// plus capturing an idea (of one of the seven kinds, optionally themed + sourced) and
// synthesizing several notes into a new synthesis card.
@Observable final class WisdomStore {
  var projection: WisdomProjection = WisdomProjection(cards: [], themes: [])
  var error: String?

  @ObservationIgnored private let store: VaultStore

  init(store: VaultStore) {
    self.store = store
    refresh()
  }

  func refresh() {
    projection = WisdomProjection.project(notes: store.parsedNotesByPath)
  }

  /// Keep a new idea: a note whose card type is the wisdom kind, semantic type derived,
  /// tagged with the chosen themes and carrying optional source details.
  @discardableResult
  func addIdea(
    kind: String, title: String?, body: String, themes: [String], source: NoteSource?
  ) -> Bool {
    let id = NoteFactory.createNoteId()
    let created = NoteFactory.isoTimestamp()
    var note = StudioNote.capture(title: title, body: body, id: id, created: created, room: "wisdom-garden")
    note.status = "active"
    note.cardType = kind
    note.semanticType = WisdomDomain.semanticType(forKind: kind)
    note.tags = themes
    note.source = source
    guard store.createNote(note, room: "wisdom-garden") else {
      error = store.error
      return false
    }
    refresh()
    return true
  }

  /// Synthesize the selected notes into a new `synthesis` card that references them
  /// (their ids as `source_notes`, and studio://note links appended to the body).
  @discardableResult
  func synthesize(sourceIds: [String], title: String?, body: String) -> Bool {
    let id = NoteFactory.createNoteId()
    let created = NoteFactory.isoTimestamp()
    let links = sourceIds.map { "- [\($0)](studio://note/\($0))" }.joined(separator: "\n")
    let fullBody = links.isEmpty ? body : "\(body)\n\n\(links)"
    var note = StudioNote.capture(
      title: title, body: fullBody, id: id, created: created, room: "wisdom-garden")
    note.status = "active"
    note.cardType = "synthesis"
    note.semanticType = WisdomDomain.semanticType(forKind: "synthesis")
    note.sourceNoteIds = sourceIds
    guard store.createNote(note, room: "wisdom-garden") else {
      error = store.error
      return false
    }
    refresh()
    return true
  }
}
