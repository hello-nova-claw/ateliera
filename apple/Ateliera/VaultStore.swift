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
  var cover: String? = nil  // vault-relative cover reference, for list thumbnails
  // When false, `title` is derived from the note's text (not a separate title), so a
  // row shows that single text once and drops the snippet rather than repeating it.
  var hasExplicitTitle: Bool = false
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

  /// User-visible notes: everything except trashed/archived (which are set aside). The
  /// room lists and the Foyer read this so a swipe/editor "Delete" actually removes the
  /// note from view. The projection-based rooms filter equivalently via `Projection.visible`.
  var liveNotes: [NoteSummary] {
    notes.filter {
      $0.status != "trashed" && $0.status != "archived" && $0.meaning != "profile"
    }
  }

  var vaultName: String = ""
  var error: String?
  var conflict: ConflictState?
  // Progressive-disclosure preferences (which rooms/sections/rhythm layers show).
  var preferences = StoredStudioPreferences()
  // Foyer invitations the user has waved away (per vault, ephemeral).
  var dismissedInvitations: Set<String> = []
  // Which Sky-ahead event families are shown (per vault, ephemeral).
  var skyLayers: SkyLayers = .defaults
  // A stable identifier for the open vault, used to scope per-note draft recovery.
  @ObservationIgnored private(set) var studioId: String = ""
  @ObservationIgnored private let preferencesStore = PreferencesStore()
  @ObservationIgnored private let invitationDismissals = InvitationDismissalStore()
  @ObservationIgnored private let skyLayerStore = SkyLayerStore()
  // True on the open that first seeded a brand-new Studio — the cue to offer the tour.
  @ObservationIgnored private(set) var seededNewStudio = false

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

  convenience init() { self.init(discovering: true) }

  /// `discovering: false` opens nothing: a unit test then opens its own temporary vault
  /// with `openForTesting(at:)` instead of touching a bookmark or the simulator's demo.
  init(discovering: Bool) {
    guard discovering else { return }
    // UI tests drive the real capture/edit flow against a fresh, empty vault in
    // the app's own sandbox, so the room starts known-empty and deterministic.
    if let url = Self.uitestVaultURL() {
      try? openVault(at: url)
      return
    }
    if !openFromPersistedBookmark() {
      // Demo content is seeded ONLY in the simulator, so the rooms have something
      // to show during development. On a real device a first launch opens with no
      // vault and RootView guides the person to pick their folder — never a folder
      // of fake notes silently written into Documents.
      #if targetEnvironment(simulator)
        openFixture()
      #endif
    }
  }

  /// Whether a vault is currently open — false on a first launch before the person
  /// has chosen their folder, which RootView uses to present the picker.
  var hasVault: Bool { vault != nil }

  /// The vault path of the most recent successful quick capture — lets the capture
  /// flow open the workshop on the note it just wrote.
  private(set) var lastCapturedPath: String?

  private static func uitestVaultURL() -> URL? {
    guard UITestLaunch.isOn(.active) else { return nil }
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("uitest-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    // For the Gift flow test, seed one due wish card so the Foyer shows a real
    // resurfaced card to grade rather than the calm fallback line.
    if UITestLaunch.isOn(.gift) {
      seedGiftFixture(at: url)
    }
    if UITestLaunch.isOn(.roomFixtures) {
      seedP5Fixture(at: url)
    }
    if UITestLaunch.isOn(.foyer) {
      seedFoyerFixture(at: url)
    }
    if UITestLaunch.isOn(.constellation) {
      seedConstellationFixture(at: url)
    }
    return url
  }

  // Two kept Journal entries where the second wiki-links the first, so the
  // Constellation spike has at least two dots and one real line to render.
  static func seedConstellationFixture(at root: URL) {
    var first = StudioNote.capture(
      title: "A quiet morning", body: "\nThe one that started it.\n",
      id: NoteFactory.createNoteId(), created: NoteFactory.isoTimestamp(), room: "inbox")
    first.status = "active"
    first.tags = ["calm"]

    var second = StudioNote.capture(
      title: "A later thought", body: "\nBack to [[A quiet morning]].\n",
      id: NoteFactory.createNoteId(), created: NoteFactory.isoTimestamp(), room: "inbox")
    second.status = "active"
    second.tags = ["calm"]

    write(first, to: root, folder: "Journal", file: "a-quiet-morning.md")
    write(second, to: root, folder: "Journal", file: "a-later-thought.md")
  }

  // A promoted "becoming" + a desired feeling + a guiding principle, so the rich
  // Foyer sections have content to render.
  static func seedFoyerFixture(at root: URL) {
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
  static func seedP5Fixture(at root: URL) {
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
  static func seedGiftFixture(at root: URL) {
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

  // A sandboxed macOS app must create and resolve the bookmark with security scope
  // for the picked folder to stay reachable across launches; on iOS the fileImporter
  // grant needs no such option (and .withSecurityScope isn't available there).
  #if os(macOS)
    private static let bookmarkCreateOptions: URL.BookmarkCreationOptions = [.withSecurityScope]
    private static let bookmarkResolveOptions: URL.BookmarkResolutionOptions = [.withSecurityScope]
  #else
    private static let bookmarkCreateOptions: URL.BookmarkCreationOptions = []
    private static let bookmarkResolveOptions: URL.BookmarkResolutionOptions = []
  #endif

  /// Called from `.fileImporter` when the user picks a folder.
  func open(url: URL) {
    let accessing = url.startAccessingSecurityScopedResource()
    do {
      let data = try url.bookmarkData(
        options: Self.bookmarkCreateOptions, includingResourceValuesForKeys: nil, relativeTo: nil)
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
        resolvingBookmarkData: data, options: Self.bookmarkResolveOptions, relativeTo: nil,
        bookmarkDataIsStale: &stale)
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
    migrateInboxDraftsToJournalIfNeeded()
  }

  // A one-time migration for the Inbox/Journal split. Earlier versions wrote every
  // quick capture as an `inbox` draft and displayed them all as the "Journal". The
  // Inbox is now a triage surface for drafts, and the Journal shows kept (active)
  // entries. Flip the pre-existing drafts to active once, so a person's existing
  // journal stays in the Journal instead of flooding the new Inbox. Status-only and
  // reversible; before triage existed, everything here was effectively "kept".
  private func migrateInboxDraftsToJournalIfNeeded() {
    let encoded = studioId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? studioId
    let key = "ateliera.inbox-journal-migrated:\(encoded)"
    let defaults = UserDefaults.standard
    guard !defaults.bool(forKey: key) else { return }
    let draftPaths =
      parsedNotesByPath
      .filter { $0.note.rooms.contains("inbox") && $0.note.status == "draft" }
      .map(\.path)
    for path in draftPaths { _ = setNoteStatus(path: path, status: "active") }
    defaults.set(true, forKey: key)
  }

  // Load this vault's preferences; a fresh (empty) vault is seeded to start small,
  // while an existing vault with no stored prefs shows everything.
  private func loadPreferences() {
    let isUITest = UITestLaunch.isOn(.active)
    if let stored = preferencesStore.load(studioId: studioId) {
      preferences = stored
    } else if parsedNotesByPath.isEmpty && !isUITest {
      preferences = .newStudio
      preferencesStore.save(preferences, studioId: studioId)
      seededNewStudio = true
    } else {
      preferences = StoredStudioPreferences()
    }
    dismissedInvitations = invitationDismissals.load(studioId: studioId)
    skyLayers = skyLayerStore.load(studioId: studioId)
  }

  /// Wave away a Foyer invitation (this occurrence only).
  func dismissInvitation(_ id: String) {
    dismissedInvitations.insert(id)
    invitationDismissals.save(dismissedInvitations, studioId: studioId)
  }

  /// Persist which Sky-ahead event families are shown (per vault).
  func setSkyLayers(_ layers: SkyLayers) {
    skyLayers = layers
    skyLayerStore.save(layers, studioId: studioId)
  }

  /// Capture a moon-intention note stamped with its lunation, so the cycle flow can find
  /// it later. Filed in the Reflection Garden.
  @discardableResult
  func captureMoonIntention(body: String, lunationDate: String) -> Bool {
    capture(
      title: nil, body: body, room: "reflection-garden", cardType: "moon-intention",
      semanticType: "vision",
      extraFrontmatter: [("moon_lunation", .scalar(lunationDate)), ("moon_phase", .scalar("new"))])
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
    preferences.rhythm.moon = moon
    preferences.rhythm.microSeason = microSeason
    preferences.rhythm.cycle = cycle
    preferencesStore.save(preferences, studioId: studioId)
  }

  func setSeasonStyle(_ style: SeasonStyle) {
    preferences.rhythm.seasonStyle = style
    preferencesStore.save(preferences, studioId: studioId)
  }

  func setPersonalizeMicroSeasons(_ on: Bool) {
    preferences.rhythm.personalizeMicroSeasons = on
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
  func capture(
    title: String?, body: String, room: String = "inbox", tags: [String] = [],
    coverData: Data? = nil, keep: Bool = false
  ) -> Bool {
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
    var note = StudioNote.capture(
      title: title, body: trimmedBody, id: id, created: created, room: room)
    // A kept entry (e.g. "Add to Journal") is active from the start; a plain quick
    // capture stays a draft so it surfaces in the Inbox for triage.
    if keep { note.status = "active" }
    note.tags = tags
    let filename = NoteFactory.suggestFilename(
      created: created, title: note.title, cardType: note.cardType, id: id)
    let path = "\(Room.folderName(for: room))/\(filename)"
    do {
      let outcome = try vault.writeText(
        path: path, text: note.serialize(), expectedHash: nil, createNew: true)
      // A picked cover is written into the note's Media folder, then the note is
      // rewritten once with the reference — the note must exist on disk first.
      if let coverData, let reference = setCover(data: coverData, forNotePath: path) {
        note.display = NoteDisplay(cover: reference, featured: note.display.featured)
        _ = try vault.writeText(
          path: path, text: note.serialize(), expectedHash: outcome.hash, createNew: false)
      }
      try reload()
      error = nil
      lastCapturedPath = path
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
  ///
  /// `sourceNoteIds`, when given, overrides the destination's own source links — this
  /// is how a guided thread ties every card it writes back to the seed note it grew
  /// from (written as `source_notes`).
  @discardableResult
  func capture(
    title: String?, body: String, destination: CaptureDestination, sourceNoteIds: [String]? = nil
  ) -> Bool {
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
        title: title, body: trimmedBody, id: id, created: created, room: meta.rooms.first ?? "inbox"
      )
      note.cardType = meta.cardType
      note.semanticType = meta.semanticType
      note.status = meta.status
      note.rooms = meta.rooms
      note.lifeAreas = meta.lifeAreas
      note.landscapeAnchor = meta.landscapeAnchor
      note.tags = meta.tags
      note.source = meta.source
      note.sourceNoteIds = sourceNoteIds ?? meta.sourceNoteIds
      note.extraFrontmatter = meta.extraFrontmatter
      note.display = NoteDisplay(cover: nil, featured: meta.featured)
      let filename = NoteFactory.suggestFilename(
        created: created, title: note.title, cardType: note.cardType, id: id)
      let path = "\(meta.folder)/\(filename)"
      do {
        _ = try vault.writeText(
          path: path, text: note.serialize(), expectedHash: nil, createNew: true)
        try reload()
        error = nil
        lastCapturedPath = path
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

  /// Set a note's status (e.g. "trashed" / "archived" / "active"). Reversible — the
  /// file survives; the projections hide trashed/archived. Backs the rooms' swipe
  /// "Delete" and "Archive" actions.
  @discardableResult
  func setNoteStatus(path: String, status: String) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.status = status
    return saveEdit(editable, updatedNote: note)
  }

  /// Retire a becoming: archive it (reversibly) and record why via `archived_reason`
  /// (an unknown-key-safe field). `reason` may be a `BecomingRetireReason` raw value,
  /// free text, or nil (archived with no reason). One write rail; unknown keys survive.
  @discardableResult
  func retireBecoming(path: String, reason: String?) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.status = "archived"
    note.extraFrontmatter.removeAll { $0.0 == "archived_reason" }
    if let reason, !reason.trimmingCharacters(in: .whitespaces).isEmpty {
      note.extraFrontmatter.append(("archived_reason", .scalar(reason)))
    }
    return saveEdit(editable, updatedNote: note)
  }

  /// Bring a retired becoming back into play: active again, reason cleared.
  @discardableResult
  func restoreBecoming(path: String) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.status = "active"
    note.extraFrontmatter.removeAll { $0.0 == "archived_reason" }
    return saveEdit(editable, updatedNote: note)
  }

  /// Capture the opening answer of a room's guided thread as a real note at that kind's
  /// destination, returning its vault path (nil if the body is empty or the write fails).
  /// Backs the one inviting entry point the Reflection and celebration rooms lead with —
  /// the follow-up prompts then `appendGuidedAnswer` onto this same note.
  func captureGuidedOpening(kind: GuidedThreadKind, title: String?, body: String) -> String? {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      error = "Write a little first."
      return nil
    }
    let named = (title?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap {
      $0.isEmpty ? nil : $0
    }
    guard capture(title: named, body: trimmed, destination: kind.destination) else { return nil }
    return lastCapturedPath
  }

  /// Deepen an entry with a guided follow-up: append a `**heading**` + answer block to
  /// the note's body through the one save rail. An empty answer is a no-op (a skipped
  /// step leaves the note untouched). Backs the gratitude / dream guided threads.
  @discardableResult
  func appendGuidedAnswer(path: String, heading: String, answer: String) -> Bool {
    let trimmed = answer.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return true }
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.body += "\n\n**\(heading)**\n\(trimmed)"
    return saveEdit(editable, updatedNote: note)
  }

  /// The active becomings tagged to a life area (optionally excluding one note id) —
  /// used to offer retiring the area's current becoming when a new one is started, so
  /// each area keeps one becoming in play at a time.
  func activeBecomings(inArea area: String, excludingId: String? = nil) -> [(
    path: String, title: String
  )] {
    parsedNotesByPath
      .filter {
        Becoming.matches($0.note) && $0.note.status != "archived" && $0.note.status != "trashed"
          && $0.note.lifeAreas.contains(area) && $0.note.id != excludingId
      }
      .map { ($0.path, Projection.title($0.note)) }
  }

  /// Keep an Inbox draft as a Journal entry: promote it to active without changing its
  /// room (it stays in the `inbox` vault room, so it moves from the Inbox to the
  /// Journal view). Backs the Inbox's "Keep in Journal" action.
  @discardableResult
  func keepInJournal(path: String) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.status = "active"
    return saveEdit(editable, updatedNote: note)
  }

  // MARK: - Profile (your name + picture, stored as a singleton vault note)

  // The profile lives in the vault (not app storage) so it travels with the Markdown
  // and could be adopted by the web app later: a `profile` card carrying `name` in
  // frontmatter and the picture via the note's cover. It's `excluded_from_views` and
  // in no room, and filtered out of `liveNotes`, so it never shows as content.

  private var profilePair: (path: String, note: StudioNote)? {
    parsedNotesByPath
      .filter { $0.note.cardType == "profile" }
      .max { $0.note.created < $1.note.created }  // newest wins if ever duplicated
  }

  var profileName: String? {
    guard
      let raw = profilePair?.note.frontmatterScalar("name")?
        .trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
    else { return nil }
    return raw
  }

  func profileAvatar() -> Data? {
    guard let pair = profilePair, let reference = pair.note.display.cover else { return nil }
    return readCover(reference: reference, forNotePath: pair.path)?.data
  }

  /// Changes whenever the profile is edited (name or picture) — a stable key for
  /// `.task(id:)` so avatar views reload after an edit.
  var profileChangeStamp: String? { profilePair?.note.updated }

  @discardableResult
  func setProfileName(_ name: String) -> Bool {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let path = ensureProfileNote(), let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.extraFrontmatter.removeAll { $0.0 == "name" }
    if !trimmed.isEmpty { note.extraFrontmatter.append(("name", .scalar(trimmed))) }
    return saveEdit(editable, updatedNote: note)
  }

  @discardableResult
  func setProfileAvatar(data: Data) -> Bool {
    guard let path = ensureProfileNote() else { return false }
    // setCover writes the image and reloads; re-read to stamp the reference on the
    // fresh hash (mirrors the cover write in `capture`).
    guard let reference = setCover(data: data, forNotePath: path),
      let editable = beginEdit(path: path)
    else { return false }
    var note = editable.note
    note.display = NoteDisplay(cover: reference, featured: note.display.featured)
    guard saveEdit(editable, updatedNote: note) else { return false }
    // A new format writes a new file name, so the superseded picture goes too.
    let keep = VaultMedia.normalizeCoverPath(notePath: path, reference: reference)
    return removeProfileMedia(ofNoteAt: path, except: keep)
  }

  /// The profile's own pictures: `Media/cover.<ext>` beside the note, in a format
  /// `setCover` writes. Anything else in that folder belongs to someone else and stays.
  /// Nil when the vault can't be listed, which is not the same as having no pictures.
  private func profileMediaPaths(ofNoteAt notePath: String) -> [String]? {
    guard let vault else { return nil }
    let folder = (notePath as NSString).deletingLastPathComponent
    let base = folder.isEmpty ? "Media/cover" : "\(folder)/Media/cover"
    let own = Set(VaultMedia.mimeByExtension.keys.map { base + $0 })
    do {
      return try vault.list(prefix: nil).map(\.path).filter(own.contains)
    } catch {
      self.error = "\(error)"
      return nil
    }
  }

  /// Delete the profile's pictures, keeping at most one. Missing files are no-ops. A
  /// vault that can't be listed is a failure, so the reference stays until it can be.
  private func removeProfileMedia(ofNoteAt notePath: String, except keep: String?) -> Bool {
    guard let paths = profileMediaPaths(ofNoteAt: notePath) else { return false }
    var allRemoved = true
    for path in paths where path != keep {
      if !removeFile(path: path) { allRemoved = false }
    }
    return allRemoved
  }

  /// Whether the profile note points at a picture, readable or not. The editor offers
  /// "Remove photo" on this, so a reference whose file is missing or unreadable can
  /// still be cleared.
  var hasProfileAvatar: Bool { profilePair?.note.display.cover != nil }

  /// Remove the profile picture. The files go first and the reference second, so a
  /// failure part-way leaves a reference the person can still clear: a missing file is a
  /// no-op on the next try. Only the profile's own pictures go (`Media/cover.*` beside
  /// the note, including one a format change superseded); anything else in that folder
  /// is left where it is.
  @discardableResult
  func removeProfileAvatar() -> Bool {
    guard let pair = profilePair, let reference = pair.note.display.cover else { return true }
    if let fullPath = VaultMedia.normalizeCoverPath(notePath: pair.path, reference: reference) {
      let folder = (pair.path as NSString).deletingLastPathComponent
      let mediaPrefix = folder.isEmpty ? "Media/" : "\(folder)/Media/"
      guard fullPath.hasPrefix(mediaPrefix) else {
        error = "The profile picture isn't in the profile's own folder, so it was left alone."
        return false
      }
    }
    guard removeProfileMedia(ofNoteAt: pair.path, except: nil) else { return false }
    guard let editable = beginEdit(path: pair.path) else { return false }
    var note = editable.note
    note.display = NoteDisplay(cover: nil, featured: note.display.featured)
    return saveEdit(editable, updatedNote: note)
  }

  /// The profile note's path, creating an empty one if it doesn't exist yet.
  private func ensureProfileNote() -> String? {
    if let pair = profilePair { return pair.path }
    guard let vault else {
      error = "Choose a Studio folder first."
      return nil
    }
    let id = NoteFactory.createNoteId()
    let created = NoteFactory.isoTimestamp()
    var note = StudioNote.capture(title: nil, body: "", id: id, created: created, room: "inbox")
    note.cardType = "profile"
    note.semanticType = "foundations"
    note.status = "active"
    note.rooms = []
    note.body = ""
    note.extraFrontmatter = [("excluded_from_views", .bool(true))]
    let filename = NoteFactory.suggestFilename(
      created: created, title: nil, cardType: "profile", id: id)
    let path = "Profile/\(filename)"
    do {
      _ = try vault.writeText(
        path: path, text: note.serialize(), expectedHash: nil, createNew: true)
      try reload()
      error = nil
      return path
    } catch {
      self.error = "\(error)"
      return nil
    }
  }

  /// Re-file a captured note into a room (its primary room), promoting a still-draft
  /// capture to active. Backs the Inbox's swipe "File…" action.
  @discardableResult
  func fileNote(path: String, toRoom room: String) -> Bool {
    guard let editable = beginEdit(path: path) else { return false }
    var note = editable.note
    note.rooms = [room]
    if note.status == "draft" { note.status = "active" }
    return saveEdit(editable, updatedNote: note)
  }

  /// Resolve a save conflict by overwriting the stored note with the draft (re-reads
  /// the current hash first, so it writes cleanly on top of the concurrent change).
  @discardableResult
  func resolveConflictOverwrite() -> Bool {
    guard let conflict, let fresh = beginEdit(path: conflict.path) else { return false }
    // Snapshot the version we're about to overwrite so it stays recoverable, and leave
    // it in place if that can't be done.
    guard
      RevisionStore(store: self).snapshot(
        reason: RevisionReason.conflictResolution, paths: [conflict.path],
        now: NoteFactory.isoTimestamp(), id: NoteFactory.createNoteId()) != nil
    else {
      error = String(
        localized: "Couldn't keep a copy of the stored version, so it wasn't replaced.",
        comment: "Shown when overwriting a conflicting note is stopped because no backup was made")
      return false
    }
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
    guard data.count <= VaultMedia.maxBytes, let sniffed = VaultMedia.sniff(data),
      sniffed == declared
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

  /// Remove a vault file (e.g. pruning an old revision snapshot). Missing is a no-op,
  /// unless `expectedHash` is given: then the file goes only if it has exactly those bytes.
  @discardableResult
  func removeFile(path: String, expectedHash: String? = nil) -> Bool {
    guard let vault else { return false }
    do {
      try vault.remove(path: path, expectedHash: expectedHash)
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

  /// Every file under `prefix` with its size, or nil if that folder can't be listed.
  func listFiles(under prefix: String) -> [(path: String, size: UInt64?)]? {
    guard let vault, let entries = try? vault.list(prefix: prefix) else { return nil }
    return entries.filter { !$0.isDirectory }.map { ($0.path, $0.size) }
  }

  /// Whether a vault path exists: nil if that can't be told.
  func fileExists(path: String) -> Bool? {
    guard let vault else { return nil }
    return try? vault.exists(path: path)
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
    var note = StudioNote.capture(
      title: title, body: trimmedBody, id: id, created: created, room: room)
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
    // A note with no explicit title resolves/links/searches under its first line.
    let effective = Projection.effectiveTitle(note)
    return IndexedNote(
      id: note.id, path: path, title: effective.isEmpty ? fallbackTitle : effective,
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
    return
      stripped
      .split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" })
      .joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // Rich summary projection from a fully-parsed note.
  static func summary(from note: StudioNote, path: String) -> NoteSummary {
    let firstLine =
      note.body.components(separatedBy: "\n").first {
        !$0.trimmingCharacters(in: .whitespaces).isEmpty
      }?.trimmingCharacters(in: .whitespaces) ?? ""
    let explicit = Projection.hasExplicitTitle(note)
    // A note is one piece of text: with no explicit title the row's title is the body's
    // first line and the snippet is dropped, so the text shows once. With an explicit
    // title, keep both. Fall back to the file name only when there is no text at all.
    let fallbackTitle = (path as NSString).lastPathComponent.replacingOccurrences(
      of: ".md", with: "")
    let title =
      explicit
      ? (note.title ?? fallbackTitle)
      : (firstLine.isEmpty ? fallbackTitle : firstLine)
    return NoteSummary(
      id: path, noteId: note.id, title: title, snippet: explicit ? firstLine : "",
      meaning: note.cardType, timestamp: note.updated.isEmpty ? note.created : note.updated,
      rooms: note.rooms, status: note.status, semanticType: note.semanticType, tags: note.tags,
      lifeAreas: note.lifeAreas, landscapeAnchor: note.landscapeAnchor,
      featured: note.display.featured, cover: note.display.cover, hasExplicitTitle: explicit)
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

  #if targetEnvironment(simulator)
    // Seed a small Reflection Garden so the room has content in the simulator.
    private struct DemoNote {
      let slug: String
      let title: String
      let meaning: String
    }

    private func openFixture() {
      let fileManager = FileManager.default
      let notes = [
        DemoNote(
          slug: "a-quiet-morning", title: "A quiet morning that worked", meaning: "celebration"),
        DemoNote(
          slug: "returned-without-failure", title: "I returned without making it a failure",
          meaning: "reflection"),
        DemoNote(
          slug: "the-slower-answer", title: "I chose the slower answer", meaning: "reflection"),
      ]
      do {
        let docs = try fileManager.url(
          for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let vault = docs.appendingPathComponent("DemoStudio", isDirectory: true)
        let room = vault.appendingPathComponent("Reflection Garden", isDirectory: true)
        try fileManager.createDirectory(at: room, withIntermediateDirectories: true)
        for note in notes {
          let body = "\n\(note.title). Fifteen minutes still counted.\n"
          let markdown =
            "---\ntitle: \(note.title)\ncard_type: \(note.meaning)\nrooms:\n  - reflection-garden\n---\n\(body)"
          try Data(markdown.utf8).write(to: room.appendingPathComponent("\(note.slug).md"))
        }
        try Data("1".utf8).write(to: vault.appendingPathComponent(".studio-revision"))
        try openVault(at: vault)
      } catch {
        self.error = "\(error)"
      }
    }
  #endif
}
