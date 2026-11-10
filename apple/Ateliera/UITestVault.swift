import Foundation

// The vault UI tests open instead of the person's own (ATELIERA_UITEST): a fresh folder
// in the app's temporary directory, seeded with invented notes when a test asks for them.
enum UITestVault {
  private static var seededNotes = 0

  // The UI tests pin the clock, so seeded notes would all share one time and lists would
  // order them by their random ids. Each gets its own minute, going back from now.
  private static func seedTimestamp() -> String {
    seededNotes += 1
    return NoteFactory.isoTimestamp(AppClock.now().addingTimeInterval(Double(-60 * seededNotes)))
  }

  static func url() -> URL? {
    guard ProcessInfo.processInfo.environment["ATELIERA_UITEST"] == "1" else { return nil }
    // A fresh folder each launch, with the same name each time, since Settings shows it.
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("uitest-\(UUID().uuidString)", isDirectory: true)
      .appendingPathComponent("Invented vault", isDirectory: true)
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
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST_CONSTELLATION"] == "1" {
      seedConstellationFixture(at: url)
    }
    return url
  }

  // Two kept Journal entries where the second wiki-links the first, so the
  // Constellation spike has at least two dots and one real line to render.
  private static func seedConstellationFixture(at root: URL) {
    var first = StudioNote.capture(
      title: "A quiet morning", body: "\nThe one that started it.\n",
      id: NoteFactory.createNoteId(), created: seedTimestamp(), room: "inbox")
    first.status = "active"
    first.tags = ["calm"]

    var second = StudioNote.capture(
      title: "A later thought", body: "\nBack to [[A quiet morning]].\n",
      id: NoteFactory.createNoteId(), created: seedTimestamp(), room: "inbox")
    second.status = "active"
    second.tags = ["calm"]

    write(first, to: root, folder: "Journal", file: "a-quiet-morning.md")
    write(second, to: root, folder: "Journal", file: "a-later-thought.md")
  }

  // A promoted "becoming" + a desired feeling + a guiding principle, so the rich
  // Foyer sections have content to render.
  private static func seedFoyerFixture(at root: URL) {
    func identity(_ id: String, _ title: String, _ cardType: String, _ file: String) {
      var note = StudioNote.capture(
        title: title, body: "\(title).", id: id, created: seedTimestamp(),
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
      id: NoteFactory.createNoteId(), created: seedTimestamp(), room: "landscape")
    landscape.status = "active"
    landscape.lifeAreas = ["family"]
    landscape.landscapeAnchor = "vision"
    landscape.cardType = "vision"
    landscape.semanticType = "vision"

    var identity = StudioNote.capture(
      title: "Practicing patience", body: "\nThe quality I'm growing this season.\n",
      id: NoteFactory.createNoteId(), created: seedTimestamp(), room: "identity-studio")
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
      id: NoteFactory.createNoteId(), created: seedTimestamp(),
      room: "reflection-garden")
    note.resurfaceKind = "wish"
    note.resurfaceDue = "2020-01-01"
    note.resurfaceIntervalDays = 6
    let dir = root.appendingPathComponent("Reflection Garden", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? note.serialize().data(using: .utf8)?
      .write(to: dir.appendingPathComponent("a-wish.md"))
  }
}
