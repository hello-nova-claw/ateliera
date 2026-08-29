import Foundation
import Observation

// Owns the Wisdom Garden: the projected cards + theme counts over the loaded vault,
// plus capturing an idea (of one of the seven kinds, optionally themed + sourced) and
// synthesizing several notes into a new synthesis card.
@Observable final class WisdomStore {
  var projection: WisdomProjection = WisdomProjection(cards: [], themes: [])
  var themePreferences: [WisdomThemePreference] = WisdomThemeConfig.defaults()
  var error: String?
  var themesRepairRequired = false
  var themesUnsupported = false

  @ObservationIgnored private let store: VaultStore
  @ObservationIgnored private var themeConfigRevision: String?

  init(store: VaultStore) {
    self.store = store
    loadThemes()
    refresh()
  }

  /// Configured, visible themes in order — what the filter and the add-idea sheet offer.
  var visibleThemes: [WisdomTheme] {
    themePreferences.filter { !$0.hidden }.sorted { $0.order < $1.order }.map { $0.asTheme }
  }

  func loadThemes() {
    guard let raw = store.readRawFile(path: WisdomThemeConfig.path) else {
      themePreferences = WisdomThemeConfig.defaults()
      themeConfigRevision = nil
      themesRepairRequired = false
      themesUnsupported = false
      return
    }
    themeConfigRevision = raw.hash
    switch WisdomThemeConfig.parse(raw.text) {
    case .ok(let themes):
      themePreferences = themes
      themesRepairRequired = false
      themesUnsupported = false
    case .unsupported:
      themePreferences = WisdomThemeConfig.defaults()
      themesUnsupported = true
    case .repair:
      themePreferences = WisdomThemeConfig.defaults()
      themesRepairRequired = true
    }
  }

  func refresh() {
    projection = WisdomProjection.project(notes: store.parsedNotesByPath, themes: visibleThemes)
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

  // MARK: - Make it mine

  /// Capture a personal belief about a theme — an `insight` titled "What I believe
  /// about <theme>", tagged with that theme. Mirrors the web "Make it mine" composer.
  @discardableResult
  func makeItMine(themeId: String, body: String) -> Bool {
    let title = "What I believe about \(themeTitle(themeId))"
    return addIdea(kind: "insight", title: title, body: body, themes: [themeId], source: nil)
  }

  private func themeTitle(_ id: String) -> String {
    themePreferences.first { $0.id == id }?.title ?? WisdomDomain.titleForTheme(id)
  }

  // MARK: - Theme management

  @discardableResult
  func addTheme(title: String) -> Bool {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
    let id = WisdomThemeConfig.safeThemeId(title: trimmed, existing: themePreferences)
    guard !trimmed.isEmpty, !id.isEmpty else { return false }
    let order = (themePreferences.map { $0.order }.max() ?? -1) + 1
    var next = themePreferences
    next.append(WisdomThemePreference(id: id, title: trimmed, hidden: false, order: order))
    return saveThemes(next)
  }

  @discardableResult
  func renameTheme(id: String, title: String) -> Bool {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
    guard !trimmed.isEmpty else { return false }
    var next = themePreferences
    guard let index = next.firstIndex(where: { $0.id == id }) else { return false }
    next[index].title = trimmed
    return saveThemes(next)
  }

  @discardableResult
  func setThemeHidden(id: String, hidden: Bool) -> Bool {
    var next = themePreferences
    guard let index = next.firstIndex(where: { $0.id == id }) else { return false }
    next[index].hidden = hidden
    return saveThemes(next)
  }

  private func saveThemes(_ themes: [WisdomThemePreference]) -> Bool {
    // Renumber orders to a compact, unique 0..<n so the write always validates.
    let renumbered = themes.enumerated().map { index, theme -> WisdomThemePreference in
      var copy = theme
      copy.order = index
      return copy
    }
    let text = WisdomThemeConfig.serialize(renumbered)
    guard
      let hash = store.writeRawFile(
        path: WisdomThemeConfig.path, text: text, expectedHash: themeConfigRevision,
        createNew: themeConfigRevision == nil)
    else {
      error = store.error
      return false
    }
    themeConfigRevision = hash
    themePreferences = renumbered
    themesRepairRequired = false
    themesUnsupported = false
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
