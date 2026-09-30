import Foundation
import Observation

// Owns the Current Season: finds the draft/active season note, decodes its state,
// and drives the wizard (begin → save step → activate → close). Every write reads a
// fresh hash first and routes through the atomic rail; closing writes a reflection
// letter and archives the season.
@Observable final class SeasonStore {
  var record: Record?
  var conflictPaths: [String] = []
  var error: String?

  struct Record: Equatable {
    var path: String
    var state: SeasonState
  }

  @ObservationIgnored private let store: VaultStore

  init(store: VaultStore) {
    self.store = store
    load()
  }

  func load() {
    let seasons = store.parsedNotesByPath.filter { $0.note.cardType == "season" }
    let actives = seasons.filter { $0.note.status == "active" }
    conflictPaths = actives.count > 1 ? actives.dropFirst().map { $0.path } : []
    let current = actives.first ?? seasons.first { $0.note.status == "draft" }
    record = current.map { Record(path: $0.path, state: SeasonNoteMapper.stateFromNote($0.note)) }
  }

  @discardableResult
  func beginSeason(title: String, startsOn: String?, endsOn: String?) -> Bool {
    let id = NoteFactory.createNoteId()
    let now = NoteFactory.isoTimestamp()
    var state = SeasonEngine.createDraft(id: id, now: now)
    do {
      state = try SeasonEngine.updateDraft(
        state, .nameDates(title: title, startsOn: startsOn, endsOn: endsOn), now: now)
    } catch {
      self.error = message(for: error)
      return false
    }
    guard store.createNote(SeasonNoteMapper.createSeasonNote(state, id: id), room: "current-season")
    else {
      error = store.error
      return false
    }
    load()
    return true
  }

  /// Set a light "intention for this season" without the nine-step wizard: a statement
  /// (and optional feelings) tied to the computed season. Updates the current season note
  /// in place if one exists, else writes a fresh active one (title/dates from the sky).
  /// Bypasses the wizard's all-steps-complete activation guard — this is the simple path.
  @discardableResult
  func setSeasonalIntention(
    statement: String, feelings: [String], title: String, startsOn: String?, endsOn: String?
  ) -> Bool {
    let trimmed = statement.trimmingCharacters(in: .whitespacesAndNewlines)
    let now = NoteFactory.isoTimestamp()
    if let record, let editable = store.beginEdit(path: record.path) {
      var state = SeasonNoteMapper.stateFromNote(editable.note)
      state.statement = trimmed
      state.feelings = feelings
      state.status = .active
      state.updated = now
      guard store.saveEdit(editable, updatedNote: SeasonNoteMapper.noteWithState(editable.note, state))
      else {
        error = store.error
        return false
      }
      load()
      return true
    }
    let id = NoteFactory.createNoteId()
    var state = SeasonEngine.createDraft(id: id, now: now)
    state.title = title
    state.startsOn = startsOn
    state.endsOn = endsOn
    state.statement = trimmed
    state.feelings = feelings
    state.status = .active
    guard store.createNote(SeasonNoteMapper.createSeasonNote(state, id: id), room: "current-season")
    else {
      error = store.error
      return false
    }
    load()
    return true
  }

  @discardableResult
  func saveStep(_ answers: SeasonStepAnswers, priorityOverride: Bool = false) -> Bool {
    apply { current, now in
      try SeasonEngine.updateDraft(current, answers, now: now, priorityOverride: priorityOverride)
    }
  }

  @discardableResult
  func activate() -> Bool {
    apply { current, now in try SeasonEngine.activate(current, now: now) }
  }

  @discardableResult
  func close(_ reflection: SeasonCloseReflection) -> Bool {
    guard let record, let editable = store.beginEdit(path: record.path) else { return false }
    let now = NoteFactory.isoTimestamp()
    let state = SeasonNoteMapper.stateFromNote(editable.note)
    let closed: SeasonState
    do {
      closed = try SeasonEngine.close(state, now: now)
    } catch {
      self.error = message(for: error)
      return false
    }
    // File the closing letter as a reflection, then archive the season.
    var letter = StudioNote.capture(
      title: "A letter from \(state.title)",
      body: SeasonNoteMapper.seasonLetterBody(state, reflection),
      id: NoteFactory.createNoteId(), created: now, room: "reflection-garden")
    letter.status = "active"
    letter.cardType = "reflection"
    letter.semanticType = "reflection"
    guard store.createNote(letter, room: "reflection-garden") else {
      error = store.error
      return false
    }
    guard store.saveEdit(editable, updatedNote: SeasonNoteMapper.noteWithState(editable.note, closed))
    else {
      error = store.error
      return false
    }
    load()
    return true
  }

  /// Archive every active season except the one to keep (multiple-active repair).
  @discardableResult
  func repairActive(keepPath: String) -> Bool {
    let now = NoteFactory.isoTimestamp()
    for (path, note) in store.parsedNotesByPath
    where note.cardType == "season" && note.status == "active" && path != keepPath {
      guard let editable = store.beginEdit(path: path) else { continue }
      let archived = (try? SeasonEngine.close(SeasonNoteMapper.stateFromNote(editable.note), now: now))
      if let archived {
        _ = store.saveEdit(editable, updatedNote: SeasonNoteMapper.noteWithState(editable.note, archived))
      }
    }
    load()
    return true
  }

  // Re-read for a fresh hash, transform the current state, write, reload.
  private func apply(_ transform: (SeasonState, String) throws -> SeasonState) -> Bool {
    guard let record, let editable = store.beginEdit(path: record.path) else { return false }
    let now = NoteFactory.isoTimestamp()
    let current = SeasonNoteMapper.stateFromNote(editable.note)
    let next: SeasonState
    do {
      next = try transform(current, now)
    } catch {
      self.error = message(for: error)
      return false
    }
    guard store.saveEdit(editable, updatedNote: SeasonNoteMapper.noteWithState(editable.note, next))
    else {
      error = store.error
      return false
    }
    load()
    return true
  }

  private func message(for error: Error) -> String {
    switch error as? SeasonError {
    case .titleRequired: return "Give this season a name."
    case .priorityLimit: return "A season holds three priorities."
    case .reflectionRequired: return "Add a reflection, or choose to skip this step."
    case .endBeforeStart: return "End date must be on or after the start date."
    case .invalidDates: return "Dates must use YYYY-MM-DD."
    case .incompleteSteps: return "Complete every step before beginning."
    default: return "\(error)"
    }
  }
}
