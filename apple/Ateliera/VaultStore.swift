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
// A save that lost a race: the user's draft and the note as it's currently stored,
// so the editor can offer a merge choice.
struct ConflictState: Identifiable {
  let id = UUID()
  let path: String
  let draft: StudioNote
  let storedText: String
}

@Observable
final class VaultStore {
  var notes: [NoteSummary] = []
  var vaultName: String = ""
  var error: String?
  var conflict: ConflictState?
  // Progressive-disclosure preferences (which rooms/sections/rhythm layers show).
  var preferences = StoredStudioPreferences()
  // A stable identifier for the open vault, used to scope per-note draft recovery.
  @ObservationIgnored private(set) var studioId: String = ""
  @ObservationIgnored private let preferencesStore = PreferencesStore()

  @ObservationIgnored private var vault: Vault?
  @ObservationIgnored private let bookmarkKey = "ateliera.vault.bookmark"
  // The disposable, in-memory search + link index (P4), rebuilt wholesale on every
  // reload. Kept out of observation since callers query it on demand.
  @ObservationIgnored private let index = SearchIndex()
  @ObservationIgnored private var summariesByPath: [String: NoteSummary] = [:]
  // Paths of `.md` files the full parser rejected — surfaced as parse-error repair
  // items. Rebuilt on each reload.
  @ObservationIgnored private(set) var unparsedPaths: [String] = []
  // A recorder of recent vault operations, for the diagnostics view.
  @ObservationIgnored let diagnostics = DiagnosticsRecorder()
  // The full parsed model for every note the schema accepts — the shared source
  // for room projections (P5/P6) and the Foyer (P9). Rebuilt on each reload.
  @ObservationIgnored private(set) var parsedNotes: [StudioNote] = []
  // The same parsed notes keyed by their vault path, so the resurface pool (P3)
  // can map each note back to its `sourcePath`. Rebuilt on each reload.
  @ObservationIgnored private(set) var parsedNotesByPath: [(path: String, note: StudioNote)] = []

  /// Search hits for `query` under optional `filters`, ranked (P4 index): title/body
  /// prefix match, snippet with highlight ranges, match reason. Empty for a blank
  /// query.
  func searchHits(_ query: String, filters: SearchFilters = SearchFilters()) -> [SearchHit] {
    index.search(query, filters: filters)
  }

  /// Facet counts (rooms / meaning / life areas / seasons / status / tags / card
  /// type) for `query` + `filters`, for the search facet rail.
  func facets(_ query: String, filters: SearchFilters = SearchFilters()) -> SearchFacets {
    index.facets(query, filters: filters)
  }

  /// Canonical notes that link to the note at `path` (backlinks), and this note's
  /// outbound links tagged resolved/broken/ambiguous (forward links). Empty when the
  /// path isn't a parsed note.
  func backlinks(path: String) -> [Backlink] {
    guard let id = noteId(forPath: path) else { return [] }
    return index.backlinks(id)
  }

  func forwardLinks(path: String) -> [ForwardLink] {
    guard let id = noteId(forPath: path) else { return [] }
    return index.forwardLinks(id)
  }

  /// The Identity board projected for the Foyer's becoming / feelings / principles
  /// sections (loads the same manual orders the Identity Studio room uses).
  func foyerIdentity() -> IdentityBoardModel {
    var sectionOrders: [IdentitySection: [String]] = [:]
    for section in IdentitySection.allCases {
      let ids = loadViewOrder("identity:\(section.rawValue)")
      if !ids.isEmpty { sectionOrders[section] = ids }
    }
    return IdentityProjector.project(
      notes: parsedNotesByPath, sectionOrders: sectionOrders,
      currentlyBecomingOrder: loadViewOrder("identity:currently-becoming"))
  }

  private func loadViewOrder(_ key: String) -> [String] {
    guard let path = ViewState.path(key), let raw = readRawFile(path: path) else { return [] }
    return ViewState.parse(raw.text)
  }

  /// The repair queue over the loaded notes (parse errors + duplicate ids +
  /// broken/ambiguous links).
  func repairQueue() -> [RepairItem] {
    RepairQueue.build(notes: parsedNotesByPath, unparsedPaths: unparsedPaths)
  }

  /// Repair one link occurrence in a note — relink or remove — through the one write
  /// rail (re-reads for a fresh hash, rewrites the body, writes atomically, reloads).
  @discardableResult
  func repairLink(path: String, occurrence: Int, edit: LinkEdit) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    do {
      var note = editable.note
      note.body = try LinkEditor.rewrite(note.body, occurrence: occurrence, edit)
      return saveEdit(editable, updatedNote: note)
    } catch {
      self.error = "\(error)"
      return false
    }
  }

  private func noteId(forPath path: String) -> String? {
    let id = summariesByPath[path]?.noteId ?? ""
    return id.isEmpty ? nil : id
  }

  /// The vault path of the note with `noteId`, if one is loaded — used to open a
  /// resolved forward link. First match wins (duplicate ids are a repair concern).
  func path(forNoteId noteId: String) -> String? {
    parsedNotesByPath.first { $0.note.id == noteId }?.path
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
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST_P5"] == "1" {
      seedP5Fixture(at: url)
    }
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST_FOYER"] == "1" {
      seedFoyerFixture(at: url)
    }
    return url
  }

  // A promoted "becoming" + a desired feeling + a guiding principle, so the rich
  // Foyer sections have content to render.
  private static func seedFoyerFixture(at root: URL) {
    func identity(_ id: String, _ title: String, _ cardType: String, _ file: String) {
      var note = StudioNote.capture(
        title: title, body: "\(title).", id: id, created: NoteFactory.isoTimestamp(),
        room: "identity-studio")
      note.status = "active"
      note.cardType = cardType
      note.semanticType = "growth"
      write(note, to: root, folder: "Identity Studio", file: file)
    }
    identity("BECOMING0000000000000000AA", "Someone who rests", "identity-emerging", "becoming.md")
    identity("FEELING00000000000000000BB", "Unhurried", "feeling", "feeling.md")
    identity("PRINCIPLE0000000000000000CC", "Depth over breadth", "principle", "principle.md")
    // Promote the becoming via the identity:currently-becoming view state.
    let viewsDir = root.appendingPathComponent(".studio/views", isDirectory: true)
    try? FileManager.default.createDirectory(at: viewsDir, withIntermediateDirectories: true)
    if let path = ViewState.path("identity:currently-becoming") {
      let file = root.appendingPathComponent(path)
      try? ViewState.serialize(["BECOMING0000000000000000AA"]).data(using: .utf8)?.write(to: file)
    }
  }

  // One Life Landscape card (family / vision) + one Identity Studio practicing-now
  // card, so the two projected rooms have real content to drive in UI tests.
  private static func seedP5Fixture(at root: URL) {
    var landscape = StudioNote.capture(
      title: "A calm morning", body: "\nAn ordinary Tuesday that already feels true.\n",
      id: NoteFactory.createNoteId(), created: NoteFactory.isoTimestamp(), room: "landscape")
    landscape.status = "active"
    landscape.lifeAreas = ["family"]
    landscape.landscapeAnchor = "vision"
    landscape.cardType = "vision"
    landscape.semanticType = "vision"

    var identity = StudioNote.capture(
      title: "Practicing patience", body: "\nThe quality I'm growing this season.\n",
      id: NoteFactory.createNoteId(), created: NoteFactory.isoTimestamp(), room: "identity-studio")
    identity.status = "active"
    identity.cardType = "identity-emerging"
    identity.semanticType = "growth"

    write(landscape, to: root, folder: "Life Landscape", file: "a-calm-morning.md")
    write(identity, to: root, folder: "Identity Studio", file: "practicing-patience.md")
  }

  private static func write(_ note: StudioNote, to root: URL, folder: String, file: String) {
    let dir = root.appendingPathComponent(folder, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? note.serialize().data(using: .utf8)?.write(to: dir.appendingPathComponent(file))
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
    self.studioId = url.path  // stable per-vault id, for draft-recovery keys
    try reload()
    loadPreferences()
  }

  // Load this vault's preferences; a fresh (empty) vault is seeded to start small,
  // while an existing vault with no stored prefs shows everything.
  private func loadPreferences() {
    let isUITest = ProcessInfo.processInfo.environment["ATELIERA_UITEST"] == "1"
    if let stored = preferencesStore.load(studioId: studioId) {
      preferences = stored
    } else if parsedNotesByPath.isEmpty && !isUITest {
      preferences = .newStudio
      preferencesStore.save(preferences, studioId: studioId)
    } else {
      preferences = StoredStudioPreferences()
    }
  }

  func setRoomVisible(_ id: String, _ visible: Bool) {
    preferences.rooms[id] = visible ? nil : "off"
    preferencesStore.save(preferences, studioId: studioId)
  }

  func setFoyerSectionVisible(_ id: String, _ visible: Bool) {
    preferences.foyerSections[id] = visible ? nil : "off"
    preferencesStore.save(preferences, studioId: studioId)
  }

  func setRhythmLayers(moon: Bool, microSeason: Bool, cycle: Bool) {
    preferences.rhythm = .init(moon: moon, microSeason: microSeason, cycle: cycle)
    preferencesStore.save(preferences, studioId: studioId)
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

  /// Classified capture: file a note to a structured destination (Foyer placement,
  /// Life Landscape anchor, Identity section, Wisdom kind, or Uncharted), with the
  /// exact frontmatter + folder the web writes. Validates before writing and retries
  /// on an id collision (up to 8 attempts, matching the web's CAPTURE_ATTEMPTS).
  @discardableResult
  func capture(title: String?, body: String, destination: CaptureDestination) -> Bool {
    guard let vault else {
      error = "Choose a Studio folder first."
      return false
    }
    do {
      try CaptureValidator.validate(body: body, destination: destination)
    } catch {
      self.error = captureErrorMessage(error)
      return false
    }
    let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
    let meta = destination.metadata
    var lastError: Error?
    for _ in 0..<8 {
      let id = NoteFactory.createNoteId()
      let created = NoteFactory.isoTimestamp()
      var note = StudioNote.capture(
        title: title, body: trimmedBody, id: id, created: created, room: meta.rooms.first ?? "inbox")
      note.cardType = meta.cardType
      note.semanticType = meta.semanticType
      note.status = meta.status
      note.rooms = meta.rooms
      note.lifeAreas = meta.lifeAreas
      note.landscapeAnchor = meta.landscapeAnchor
      note.tags = meta.tags
      note.source = meta.source
      note.sourceNoteIds = meta.sourceNoteIds
      note.extraFrontmatter = meta.extraFrontmatter
      note.display = NoteDisplay(cover: nil, featured: meta.featured)
      let filename = NoteFactory.suggestFilename(
        created: created, title: note.title, cardType: note.cardType, id: id)
      let path = "\(meta.folder)/\(filename)"
      do {
        _ = try vault.writeText(path: path, text: note.serialize(), expectedHash: nil, createNew: true)
        try reload()
        error = nil
        return true
      } catch {
        lastError = error  // most likely a name collision — retry with a fresh id
      }
    }
    self.error = lastError.map { "\($0)" } ?? "Couldn't file this capture."
    return false
  }

  private func captureErrorMessage(_ error: Error) -> String {
    switch error as? CaptureValidationError {
    case .emptyBody: return "Write something to remember first."
    case .decisionHorizonOutsideDecisionsAnchor:
      return "A decision horizon only applies to a Decisions card."
    case .wisdomSourceURLScheme: return "A source link must start with http:// or https://."
    case .wisdomTooManyThemes: return "That's too many themes."
    case nil: return "\(error)"
    }
  }

  /// Write a fully-formed new note into `room`'s folder (atomic create) and reload.
  /// The caller builds the `StudioNote` (setting card/semantic type, tags, source,
  /// etc.); this handles the filename convention + write + refresh.
  @discardableResult
  func createNote(_ note: StudioNote, room: String) -> Bool {
    guard vault != nil else {
      error = "Choose a Studio folder first."
      return false
    }
    let filename = NoteFactory.suggestFilename(
      created: note.created, title: note.title, cardType: note.cardType, id: note.id)
    let path = "\(Room.folderName(for: room))/\(filename)"
    if writeRawFile(path: path, text: note.serialize(), expectedHash: nil, createNew: true) == nil {
      return false
    }
    try? reload()
    return true
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
      diagnostics.record(operation: "save", outcome: "success", fileId: updated.id)
      return true
    } catch let error as VaultError {
      if case .Conflict = error {
        diagnostics.record(operation: "save", outcome: "conflict", fileId: updated.id)
        // The note changed under us (a concurrent write). Set both: `error` so any
        // non-editor caller (the Gift, a Landscape move) still surfaces the failure,
        // and `conflict` so the note editor can offer a merge choice. The editor
        // clears any stale conflict on open so this never leaks across flows.
        let storedText = (try? vault.readText(path: editable.path))?.text ?? ""
        conflict = ConflictState(path: editable.path, draft: updatedNote, storedText: storedText)
        self.error = "This note changed on another device."
        return false
      }
      self.error = "\(error)"
      diagnostics.record(operation: "save", outcome: "failure", errorCode: "\(error)")
      return false
    } catch {
      self.error = "\(error)"
      diagnostics.record(operation: "save", outcome: "failure", errorCode: "\(error)")
      return false
    }
  }

  /// Resolve a save conflict by overwriting the stored note with the draft (re-reads
  /// the current hash first, so it writes cleanly on top of the concurrent change).
  @discardableResult
  func resolveConflictOverwrite() -> Bool {
    guard let conflict, let fresh = beginEdit(path: conflict.path) else { return false }
    // Snapshot the version we're about to overwrite so it stays recoverable.
    _ = RevisionStore(store: self).snapshot(
      reason: RevisionReason.conflictResolution, paths: [conflict.path],
      now: NoteFactory.isoTimestamp(), id: NoteFactory.createNoteId())
    let draft = conflict.draft
    if saveEdit(fresh, updatedNote: draft) {
      self.conflict = nil
      return true
    }
    return false
  }

  /// Resolve a save conflict by keeping the draft as a brand-new note (leaving the
  /// concurrently-changed note untouched).
  @discardableResult
  func resolveConflictSaveAsNew() -> Bool {
    guard let conflict else { return false }
    let draft = conflict.draft
    if capture(title: draft.title, body: draft.body, room: draft.rooms.first ?? "inbox") {
      self.conflict = nil
      return true
    }
    return false
  }

  /// Dismiss the conflict, keeping the stored version and discarding the draft.
  func dismissConflict() {
    conflict = nil
    error = nil
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

  /// Import a cover image for the note at `notePath`: validate format + size +
  /// magic bytes, write it under the note's folder as `Media/cover.<ext>` through
  /// the Rust core's binary write, and return the vault-relative reference to store
  /// in `display.cover`. Returns nil (with `error` set) on any failure.
  func setCover(data: Data, forNotePath notePath: String) -> String? {
    guard let vault else {
      error = "Choose a Studio folder first."
      return nil
    }
    guard data.count <= VaultMedia.maxBytes else {
      error = "That image is too large (max 16 MB)."
      return nil
    }
    guard let mime = VaultMedia.sniff(data), let ext = VaultMedia.extensionByMime[mime] else {
      error = "That image format isn't supported."
      return nil
    }
    let reference = "Media/cover.\(ext)"
    guard let fullPath = VaultMedia.normalizeCoverPath(notePath: notePath, reference: reference)
    else {
      error = "Couldn't place the image."
      return nil
    }
    do {
      _ = try vault.writeBinary(path: fullPath, bytes: data, createNew: false)
      try reload()
      error = nil
      return reference
    } catch {
      self.error = "\(error)"
      return nil
    }
  }

  /// Read a note's cover image bytes + MIME, validating the path + size + magic.
  func readCover(reference: String, forNotePath notePath: String) -> (data: Data, mime: String)? {
    guard let vault,
      let fullPath = VaultMedia.normalizeCoverPath(notePath: notePath, reference: reference),
      let declared = VaultMedia.mimeForExtension(fullPath),
      let data = try? vault.readBinary(path: fullPath)
    else { return nil }
    guard data.count <= VaultMedia.maxBytes, let sniffed = VaultMedia.sniff(data), sniffed == declared
    else { return nil }
    return (data, sniffed)
  }

  /// The current vault revision (for import's optimistic batch guard), or "0".
  func currentRevision() -> String {
    guard let vault else { return "0" }
    return (try? vault.getRevision()) ?? "0"
  }

  /// Apply a set of writes atomically, guarded by `expectedRevision`. Reloads on
  /// success. Returns false (with `error` set) on failure — e.g. the vault changed
  /// since the import was planned.
  @discardableResult
  func writeBatch(expectedRevision: String, writes: [BatchWrite]) -> Bool {
    guard let vault else {
      error = "Choose a Studio folder first."
      return false
    }
    do {
      _ = try vault.writeBatchAtomic(expectedRevision: expectedRevision, writes: writes)
      try reload()
      error = nil
      return true
    } catch {
      self.error = "\(error)"
      return false
    }
  }

  /// Every file path in the vault (not directories), for export/backup.
  func listAllPaths() -> [String] {
    guard let vault, let entries = try? vault.list(prefix: nil) else { return [] }
    return entries.filter { !$0.isDirectory }.map { $0.path }
  }

  /// Raw bytes for any vault file (for export), or nil if unreadable.
  func readFileBytes(path: String) -> Data? {
    guard let vault else { return nil }
    return try? vault.readBinary(path: path)
  }

  /// Read an arbitrary vault file (config / view-state JSON), or nil if it's absent
  /// or the vault is closed. Used by the Landscape/Identity stores for `.studio/`
  /// state that isn't a note.
  func readRawFile(path: String) -> (text: String, hash: String)? {
    guard let vault else { return nil }
    guard let read = try? vault.readText(path: path) else { return nil }
    return (read.text, read.hash)
  }

  /// Write an arbitrary vault file atomically (optimistic-concurrency when
  /// `expectedHash` is given). Returns the new content hash, or nil on failure
  /// (with `error` set). Does NOT reload the note list — callers refresh what they own.
  @discardableResult
  func writeRawFile(path: String, text: String, expectedHash: String?, createNew: Bool) -> String? {
    guard let vault else {
      error = "Choose a Studio folder first."
      return nil
    }
    do {
      let outcome = try vault.writeText(
        path: path, text: text, expectedHash: expectedHash, createNew: createNew)
      error = nil
      return outcome.hash
    } catch {
      self.error = "\(error)"
      return nil
    }
  }

  /// Capture a new note with an explicit card type + semantic type + room (e.g. an
  /// Identity Studio truth). Like `capture`, but not forced to the Inbox capture
  /// defaults. Writes to the room's folder and reloads.
  @discardableResult
  func capture(
    title: String?, body: String, room: String, cardType: String, semanticType: String,
    status: String = "active", extraFrontmatter: [(String, YamlNode)] = []
  ) -> Bool {
    guard vault != nil else {
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
    var note = StudioNote.capture(title: title, body: trimmedBody, id: id, created: created, room: room)
    note.cardType = cardType
    note.semanticType = semanticType
    note.status = status
    note.extraFrontmatter = extraFrontmatter
    let filename = NoteFactory.suggestFilename(
      created: created, title: note.title, cardType: note.cardType, id: id)
    let path = "\(Room.folderName(for: room))/\(filename)"
    if writeRawFile(path: path, text: note.serialize(), expectedHash: nil, createNew: true) == nil {
      return false
    }
    try? reload()
    return true
  }

  func reload() throws {
    guard let vault else { return }
    let entries = try vault.list(prefix: nil)
    var summaries: [NoteSummary] = []
    var byPath: [String: NoteSummary] = [:]
    var parsed: [StudioNote] = []
    var parsedPairs: [(path: String, note: StudioNote)] = []
    var indexed: [IndexedNote] = []
    var unparsed: [String] = []
    for entry in entries where !entry.isDirectory && entry.path.hasSuffix(".md") {
      let read = try vault.readText(path: entry.path)
      // Prefer the full model (all metadata fields); fall back to the lenient
      // line reader for notes the schema rejects (e.g. seeded demo notes).
      let summary: NoteSummary
      if let note = NoteParser.parse(read.text) {
        parsed.append(note)
        parsedPairs.append((entry.path, note))
        indexed.append(Self.indexedNote(from: note, path: entry.path))
        summary = Self.summary(from: note, path: entry.path)
      } else {
        unparsed.append(entry.path)
        summary = Self.parse(path: entry.path, text: read.text)
      }
      summaries.append(summary)
      byPath[entry.path] = summary
    }
    self.parsedNotes = parsed
    self.parsedNotesByPath = parsedPairs
    self.unparsedPaths = unparsed
    index.rebuild(indexed)
    // Newest first: by `updated`/`created` (ISO strings sort chronologically),
    // then title as a stable tiebreaker for notes without a timestamp.
    self.notes = summaries.sorted {
      $0.timestamp != $1.timestamp ? $0.timestamp > $1.timestamp : $0.title < $1.title
    }
    self.summariesByPath = byPath
  }

  // Project a parsed note into an index document: plain-text `body` for search +
  // snippets, `rawBody` (the Markdown) for link extraction, and the frontmatter
  // facets. `sourceText` joins the citation fields for match context.
  static func indexedNote(from note: StudioNote, path: String) -> IndexedNote {
    let fallbackTitle = (path as NSString).lastPathComponent.replacingOccurrences(
      of: ".md", with: "")
    let sourceText = [note.source?.title, note.source?.creator, note.source?.url]
      .compactMap { $0 }.joined(separator: " ")
    return IndexedNote(
      id: note.id, path: path, title: note.title ?? fallbackTitle,
      body: searchText(note.body), cardType: note.cardType, semanticType: note.semanticType,
      status: note.status, updated: note.updated.isEmpty ? note.created : note.updated,
      rooms: note.rooms, lifeAreas: note.lifeAreas, seasons: note.seasons, tags: note.tags,
      sourceText: sourceText, rawBody: note.body)
  }

  // A light Markdown-to-plain reduction for the search body/snippet (display-only,
  // not an interop contract). Wikilink targets are kept as words so `[[a note]]`
  // stays findable; markers and fences are dropped.
  static func searchText(_ body: String) -> String {
    let withoutFences = body.components(separatedBy: "\n")
      .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("```") }
      .joined(separator: " ")
    var stripped = withoutFences
    for token in ["[[", "]]", "**", "__", "`", "#", ">", "*", "_"] {
      stripped = stripped.replacingOccurrences(of: token, with: " ")
    }
    return stripped
      .split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" })
      .joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
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
