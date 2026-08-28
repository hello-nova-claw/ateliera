import Foundation
import Observation

// The note summaries a room shows, read from the vault through the Rust core.
// The lightweight projection the lists/filters query; the full model lives in
// `VaultStore.parsedNotes` and is loaded fresh for editing via `beginEdit`.
struct NoteSummary: Identifiable {
  let id: String  // the vault file PATH (stable list identity)
  var noteId: String = ""  // the StudioNote.id, for studio://note/<id> resolution
  let title: String
  let snippet: String
  let meaning: String  // cardType, drives the meaning colour
  // `updated` (falling back to `created`) as an ISO string, used to order the
  // room newest-first. Empty when the note carries no timestamp.
  let timestamp: String
  // Frontmatter projections used by room/status filters and (P4) search facets.
  let rooms: [String]
  var status: String = ""
  var semanticType: String = ""
  var tags: [String] = []
  var lifeAreas: [String] = []
  var landscapeAnchor: String? = nil
  var featured: Bool = false
}

// A note opened for editing: its path, the content hash it was read at (for
// optimistic-concurrency writes), and the parsed model. `id` = path so it can
// drive a SwiftUI sheet.
struct EditableNote: Identifiable {
  var id: String { path }
  let path: String
  let baseHash: String
  let note: StudioNote
}

// Opens a Studio vault (a user-picked, security-scoped iCloud folder — or a seeded
// fixture for the demo) via the reused Rust core, and lists its notes. Persists an
// iOS security-scoped bookmark so relaunch re-opens without re-picking.
@Observable
final class VaultStore {
  var notes: [NoteSummary] = []
  var vaultName: String = ""
  var error: String?

  @ObservationIgnored private var vault: Vault?
  @ObservationIgnored private let bookmarkKey = "ateliera.vault.bookmark"
  // Full-text search docs (id = path), rebuilt on every reload. Kept out of
  // observation since search reads them on demand rather than rendering them.
  @ObservationIgnored private var searchDocs: [SearchDoc] = []
  @ObservationIgnored private var summariesByPath: [String: NoteSummary] = [:]
  // The full parsed model for every note the schema accepts — the shared source
  // for room projections (P5/P6) and the Foyer (P9). Rebuilt on each reload.
  @ObservationIgnored private(set) var parsedNotes: [StudioNote] = []
  // The same parsed notes keyed by their vault path, so the resurface pool (P3)
  // can map each note back to its `sourcePath`. Rebuilt on each reload.
  @ObservationIgnored private(set) var parsedNotesByPath: [(path: String, note: StudioNote)] = []

  /// Notes matching `query`, best first (see NoteSearch). Empty for a blank query.
  func search(_ query: String) -> [NoteSummary] {
    NoteSearch.rank(searchDocs, query: query).compactMap { summariesByPath[$0.id] }
  }

  init() {
    // UI tests drive the real capture/edit flow against a fresh, empty vault in
    // the app's own sandbox, so the room starts known-empty and deterministic.
    if let url = Self.uitestVaultURL() {
      try? openVault(at: url)
      return
    }
    if !openFromPersistedBookmark() {
      openFixture()
    }
  }

  private static func uitestVaultURL() -> URL? {
    guard ProcessInfo.processInfo.environment["ATELIERA_UITEST"] == "1" else { return nil }
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("uitest-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    // For the Gift flow test, seed one due wish card so the Foyer shows a real
    // resurfaced card to grade rather than the calm fallback line.
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST_GIFT"] == "1" {
      seedGiftFixture(at: url)
    }
    return url
  }

  // A single due Reflection Garden wish note (due date far in the past → always
  // due), written through the real byte-identical serializer.
  private static func seedGiftFixture(at root: URL) {
    var note = StudioNote.capture(
      title: "A wish worth keeping", body: "\nRemember the shape of this wish.\n",
      id: NoteFactory.createNoteId(), created: NoteFactory.isoTimestamp(),
      room: "reflection-garden")
    note.resurfaceKind = "wish"
    note.resurfaceDue = "2020-01-01"
    note.resurfaceIntervalDays = 6
    let dir = root.appendingPathComponent("Reflection Garden", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? note.serialize().data(using: .utf8)?
      .write(to: dir.appendingPathComponent("a-wish.md"))
  }

  /// Called from `.fileImporter` when the user picks a folder.
  func open(url: URL) {
    let accessing = url.startAccessingSecurityScopedResource()
    do {
      let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
      UserDefaults.standard.set(data, forKey: bookmarkKey)
      try openVault(at: url)
    } catch {
      if accessing { url.stopAccessingSecurityScopedResource() }
      self.error = "\(error)"
    }
  }

  private func openFromPersistedBookmark() -> Bool {
    guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return false }
    var stale = false
    guard
      let url = try? URL(
        resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
    else { return false }
    _ = url.startAccessingSecurityScopedResource()  // held for the session
    do {
      try openVault(at: url)
      return true
    } catch {
      return false
    }
  }

  private func openVault(at url: URL) throws {
    let handle = try Vault.open(path: url.path)
    self.vault = handle
    self.vaultName = url.lastPathComponent
    try reload()
  }

  #if DEBUG
    /// Test hook: open a vault directly at a path, skipping the security-scoped
    /// bookmark persistence used by the real `.fileImporter` flow.
    func openForTesting(at url: URL) throws { try openVault(at: url) }
  #endif

  /// Create a new note from a quick capture: build the note tagged to `room`
  /// (Inbox by default), serialize it byte-identically to the web app, and write
  /// it atomically through the Rust core into the room's folder. Returns false
  /// (with `error` set) if there's no vault or nothing was written.
  @discardableResult
  func capture(title: String?, body: String, room: String = "inbox") -> Bool {
    guard let vault else {
      error = "Choose a Studio folder first."
      return false
    }
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedBody.isEmpty else {
      error = "Write something to remember first."
      return false
    }
    let id = NoteFactory.createNoteId()
    let created = NoteFactory.isoTimestamp()
    let note = StudioNote.capture(
      title: title, body: trimmedBody, id: id, created: created, room: room)
    let filename = NoteFactory.suggestFilename(
      created: created, title: note.title, cardType: note.cardType, id: id)
    let path = "\(Room.folderName(for: room))/\(filename)"
    do {
      _ = try vault.writeText(
        path: path, text: note.serialize(), expectedHash: nil, createNew: true)
      try reload()
      error = nil
      return true
    } catch {
      self.error = "\(error)"
      return false
    }
  }

  /// Read a note fresh from the vault and parse it for editing, capturing the
  /// content hash so the save can detect a conflicting change. Returns nil (with
  /// `error` set) if there's no vault or the note can't be parsed.
  func beginEdit(path: String) -> EditableNote? {
    guard let vault else {
      error = "Choose a Studio folder first."
      return nil
    }
    do {
      let read = try vault.readText(path: path)
      guard let note = NoteParser.parse(read.text) else {
        error = "This note couldn't be read for editing."
        return nil
      }
      return EditableNote(path: path, baseHash: read.hash, note: note)
    } catch {
      self.error = "\(error)"
      return nil
    }
  }

  /// The canonical full-note save (the one write rail every metadata edit routes
  /// through). Bumps `updated`, re-serializes the whole model so unknown
  /// frontmatter survives, and writes atomically only if the file still matches
  /// the hash it was read at (optimistic concurrency). On a conflicting change the
  /// file is NOT overwritten — the error is surfaced for a merge choice.
  @discardableResult
  func saveEdit(_ editable: EditableNote, updatedNote: StudioNote) -> Bool {
    guard let vault else {
      error = "Choose a Studio folder first."
      return false
    }
    var updated = updatedNote
    updated.updated = NoteFactory.isoTimestamp()
    do {
      _ = try vault.writeText(
        path: editable.path, text: updated.serialize(), expectedHash: editable.baseHash,
        createNew: false)
      try reload()
      error = nil
      return true
    } catch {
      self.error = "\(error)"
      return false
    }
  }

  /// Convenience for the plain title+body editor: mutate those two fields on the
  /// note and route through `saveEdit(_:updatedNote:)`.
  @discardableResult
  func saveEdit(_ editable: EditableNote, title: String?, body: String) -> Bool {
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedBody.isEmpty else {
      error = "A note can't be empty."
      return false
    }
    var updated = editable.note
    let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
    updated.title = (trimmedTitle?.isEmpty ?? true) ? nil : trimmedTitle
    updated.body = trimmedBody
    return saveEdit(editable, updatedNote: updated)
  }

  /// The resurface pool over the currently-loaded notes: every Reflection Garden
  /// or Uncharted note carrying all three `resurface_*` fields, mapped to a card
  /// (P3, the Gift). Scans the already-parsed notes — no separate index (that's P4).
  func resurfacePool() -> [ResurfaceCard] {
    Resurfacing.resurfacePool(from: parsedNotesByPath)
  }

  /// Advance a resurface card's schedule after grading: write the new
  /// `resurface_due` / `resurface_interval_days` back through the one write rail
  /// (`saveEdit`), which bumps `updated`, preserves unknown frontmatter, and honours
  /// optimistic concurrency. `resurface_kind` is left untouched so the card stays in
  /// the pool and returns on its new schedule — matching the web `keep`.
  @discardableResult
  func saveResurfaceSchedule(_ editable: EditableNote, due: String, intervalDays: Int) -> Bool {
    var updated = editable.note
    updated.resurfaceDue = due
    updated.resurfaceIntervalDays = intervalDays
    return saveEdit(editable, updatedNote: updated)
  }

  func reload() throws {
    guard let vault else { return }
    let entries = try vault.list(prefix: nil)
    var summaries: [NoteSummary] = []
    var docs: [SearchDoc] = []
    var byPath: [String: NoteSummary] = [:]
    var parsed: [StudioNote] = []
    var parsedPairs: [(path: String, note: StudioNote)] = []
    for entry in entries where !entry.isDirectory && entry.path.hasSuffix(".md") {
      let read = try vault.readText(path: entry.path)
      // Prefer the full model (all metadata fields); fall back to the lenient
      // line reader for notes the schema rejects (e.g. seeded demo notes).
      let summary: NoteSummary
      if let note = NoteParser.parse(read.text) {
        parsed.append(note)
        parsedPairs.append((entry.path, note))
        summary = Self.summary(from: note, path: entry.path)
      } else {
        summary = Self.parse(path: entry.path, text: read.text)
      }
      summaries.append(summary)
      byPath[entry.path] = summary
      docs.append(
        SearchDoc(id: entry.path, title: summary.title, body: Self.plainBody(read.text)))
    }
    self.parsedNotes = parsed
    self.parsedNotesByPath = parsedPairs
    // Newest first: by `updated`/`created` (ISO strings sort chronologically),
    // then title as a stable tiebreaker for notes without a timestamp.
    self.notes = summaries.sorted {
      $0.timestamp != $1.timestamp ? $0.timestamp > $1.timestamp : $0.title < $1.title
    }
    self.searchDocs = docs
    self.summariesByPath = byPath
  }

  // Rich summary projection from a fully-parsed note.
  static func summary(from note: StudioNote, path: String) -> NoteSummary {
    let fallbackTitle = (path as NSString).lastPathComponent.replacingOccurrences(
      of: ".md", with: "")
    let snippet =
      note.body.components(separatedBy: "\n").first { !$0.trimmingCharacters(in: .whitespaces).isEmpty
      } ?? ""
    return NoteSummary(
      id: path, noteId: note.id, title: note.title ?? fallbackTitle, snippet: snippet,
      meaning: note.cardType, timestamp: note.updated.isEmpty ? note.created : note.updated,
      rooms: note.rooms, status: note.status, semanticType: note.semanticType, tags: note.tags,
      lifeAreas: note.lifeAreas, landscapeAnchor: note.landscapeAnchor,
      featured: note.display.featured)
  }

  // The note body (everything after the frontmatter), for full-text search.
  static func plainBody(_ text: String) -> String {
    let lines = text.components(separatedBy: "\n")
    guard lines.first == "---", let close = lines.dropFirst().firstIndex(of: "---") else {
      return text
    }
    return lines[(close + 1)...].joined(separator: "\n")
  }

  // Minimal frontmatter read for the list — Phase N2 does the real round-trip.
  static func parse(path: String, text: String) -> NoteSummary {
    var title = (path as NSString).lastPathComponent.replacingOccurrences(of: ".md", with: "")
    var meaning = "reflection"
    var created = ""
    var updated = ""
    var rooms: [String] = []
    var inRoomsBlock = false
    var body: [String] = []
    var section = 0  // 0 before frontmatter, 1 inside, 2 after
    for line in text.components(separatedBy: "\n") {
      if line == "---" {
        section = section == 0 ? 1 : (section == 1 ? 2 : section)
        continue
      }
      if section == 1 {
        // Collect a `rooms:` block-list (`  - key`) until the next key.
        if inRoomsBlock {
          if line.hasPrefix("  - ") {
            rooms.append(String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces))
            continue
          }
          inRoomsBlock = false
        }
        if line.hasPrefix("title:") {
          title = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("card_type:") {
          meaning = String(line.dropFirst(10)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("created:") {
          created = String(line.dropFirst(8)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("updated:") {
          updated = String(line.dropFirst(8)).trimmingCharacters(in: .whitespaces)
        } else if line == "rooms:" {
          inRoomsBlock = true
        } else if line.hasPrefix("rooms:") {
          // Inline form: `rooms: []` or `rooms: [a, b]`.
          let rest = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
          if rest.hasPrefix("[") && rest.hasSuffix("]") {
            let inner = String(rest.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
            rooms =
              inner.isEmpty
              ? []
              : inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
          }
        }
      } else if !line.trimmingCharacters(in: .whitespaces).isEmpty {
        body.append(line)
      }
    }
    return NoteSummary(
      id: path, title: title, snippet: body.first ?? "", meaning: meaning,
      timestamp: updated.isEmpty ? created : updated, rooms: rooms,
      status: "", semanticType: "", tags: [], lifeAreas: [], landscapeAnchor: nil,
      featured: false)
  }

  // Seed a small Reflection Garden so the room has content in the simulator.
  private func openFixture() {
    let fm = FileManager.default
    let notes: [(String, String, String)] = [
      ("a-quiet-morning", "A quiet morning that worked", "celebration"),
      ("returned-without-failure", "I returned without making it a failure", "reflection"),
      ("the-slower-answer", "I chose the slower answer", "reflection"),
    ]
    do {
      let docs = try fm.url(
        for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let vault = docs.appendingPathComponent("DemoStudio", isDirectory: true)
      let room = vault.appendingPathComponent("Reflection Garden", isDirectory: true)
      try fm.createDirectory(at: room, withIntermediateDirectories: true)
      for (slug, title, meaning) in notes {
        let body = "\n\(title). Fifteen minutes still counted.\n"
        let md =
          "---\ntitle: \(title)\ncard_type: \(meaning)\nrooms:\n  - reflection-garden\n---\n\(body)"
        try md.data(using: .utf8)!.write(to: room.appendingPathComponent("\(slug).md"))
      }
      try "1".data(using: .utf8)!
        .write(to: vault.appendingPathComponent(".studio-revision"))
      try openVault(at: vault)
    } catch {
      self.error = "\(error)"
    }
  }
}
