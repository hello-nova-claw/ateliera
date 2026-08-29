import XCTest

@testable import Ateliera

// P6 (Wisdom): domain golden values, projection, and the store's add/synthesize.
final class WisdomTests: XCTestCase {
  func testKindSemanticTypes() {
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "principle"), "foundations")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "synthesis"), "foundations")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "practice"), "growth")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "question"), "uncharted")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "insight"), "reflection")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "quote"), "reflection")
    XCTAssertEqual(WisdomDomain.semanticType(forKind: "resource"), "reflection")
  }

  func testDefaultThemesGolden() {
    XCTAssertEqual(WisdomDomain.defaultThemes.count, 13)
    XCTAssertEqual(WisdomDomain.defaultThemes.first, WisdomTheme(id: "alignment", title: "Alignment"))
    XCTAssertEqual(
      WisdomDomain.defaultThemes.last,
      WisdomTheme(id: "nervous-system-care", title: "Nervous-system care"))
  }

  func testTitleForTheme() {
    XCTAssertEqual(WisdomDomain.titleForTheme("decision-making"), "Decision Making")
  }

  private func note(id: String, kind: String, tags: [String]) -> Projection.Loaded {
    var n = StudioNote.capture(
      title: "Idea \(id)", body: "wisdom body", id: id, created: "2026-01-01T00:00:00.000Z",
      room: "wisdom-garden")
    n.status = "active"
    n.cardType = kind
    n.semanticType = WisdomDomain.semanticType(forKind: kind)
    n.tags = tags
    return (path: "\(id).md", note: n)
  }

  func testProjectionCountsThemes() {
    let notes = [
      note(id: "A", kind: "quote", tags: ["identity"]),
      note(id: "B", kind: "insight", tags: ["identity", "rest"]),
    ]
    let projection = WisdomProjection.project(notes: notes)
    XCTAssertEqual(projection.cards.count, 2)
    let identity = projection.themes.first { $0.id == "identity" }
    XCTAssertEqual(identity?.count, 2)
    let rest = projection.themes.first { $0.id == "rest" }
    XCTAssertEqual(rest?.count, 1)
  }

  func testProjectionExcludesNonWisdomNotes() {
    var other = note(id: "X", kind: "quote", tags: [])
    other.note.rooms = ["inbox"]
    XCTAssertTrue(WisdomProjection.project(notes: [other]).cards.isEmpty)
  }

  // Store integration over a real vault.
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("wisdom-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testAddIdeaWritesThemedKindedNote() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    XCTAssertTrue(
      wisdom.addIdea(
        kind: "quote", title: "Keep going", body: "The obstacle is the way.",
        themes: ["rest"], source: NoteSource(title: nil, creator: "Marcus", url: nil)))
    let card = wisdom.projection.cards.first
    XCTAssertEqual(card?.kind, "quote")
    XCTAssertEqual(card?.themes, ["rest"])
    XCTAssertEqual(card?.source?.creator, "Marcus")
    XCTAssertEqual(wisdom.projection.themes.first { $0.id == "rest" }?.count, 1)
  }

  // MARK: - Theme config codec

  func testThemeConfigSerializeIsByteIdenticalToWeb() {
    let themes = [
      WisdomThemePreference(id: "alignment", title: "Alignment", hidden: false, order: 0),
      WisdomThemePreference(id: "my-theme", title: "Möney & Rest", hidden: true, order: 1),
    ]
    let expected =
      "{\n  \"version\": 1,\n  \"themes\": [\n    {\n      \"id\": \"alignment\",\n      \"title\": \"Alignment\",\n      \"hidden\": false,\n      \"order\": 0\n    },\n    {\n      \"id\": \"my-theme\",\n      \"title\": \"Möney & Rest\",\n      \"hidden\": true,\n      \"order\": 1\n    }\n  ]\n}\n"
    XCTAssertEqual(WisdomThemeConfig.serialize(themes), expected)
  }

  func testThemeConfigRoundTrips() {
    let themes = WisdomThemeConfig.defaults()
    guard case .ok(let parsed) = WisdomThemeConfig.parse(WisdomThemeConfig.serialize(themes)) else {
      return XCTFail("expected .ok")
    }
    XCTAssertEqual(parsed, themes)
  }

  func testThemeConfigRejectsUnknownVersionAndGarbage() {
    XCTAssertEqual(WisdomThemeConfig.parse("{\"version\":2,\"themes\":[]}"), .unsupported(2))
    XCTAssertEqual(WisdomThemeConfig.parse("not json"), .repair)
    // Extra key → repair.
    XCTAssertEqual(WisdomThemeConfig.parse("{\"version\":1,\"themes\":[],\"x\":1}"), .repair)
  }

  func testSafeThemeIdSlugifiesAndDedupes() {
    let existing = [WisdomThemePreference(id: "rest", title: "Rest", hidden: false, order: 0)]
    XCTAssertEqual(WisdomThemeConfig.safeThemeId(title: "Möney & Rest", existing: []), "money-rest")
    XCTAssertEqual(WisdomThemeConfig.safeThemeId(title: "Rest", existing: existing), "rest-2")
    XCTAssertEqual(WisdomThemeConfig.safeThemeId(title: "!!!", existing: []), "")
  }

  // MARK: - Store theme management

  func testAddThemePersistsAndSurfacesInVisibleThemes() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    XCTAssertTrue(wisdom.addTheme(title: "Sabbaticals"))
    XCTAssertTrue(wisdom.visibleThemes.contains { $0.id == "sabbaticals" })
    // Persisted: a fresh store reloads it from the config file.
    let reloaded = WisdomStore(store: store)
    XCTAssertTrue(reloaded.themePreferences.contains { $0.id == "sabbaticals" && $0.title == "Sabbaticals" })
  }

  func testHideThemeRemovesItFromVisibleThemes() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    XCTAssertTrue(wisdom.setThemeHidden(id: "rest", hidden: true))
    XCTAssertFalse(wisdom.visibleThemes.contains { $0.id == "rest" })
  }

  func testMakeItMineWritesAThemedInsight() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    XCTAssertTrue(wisdom.makeItMine(themeId: "rest", body: "Rest is a right, not a reward."))
    let card = try XCTUnwrap(wisdom.projection.cards.first)
    XCTAssertEqual(card.kind, "insight")
    XCTAssertEqual(card.title, "What I believe about Rest")
    XCTAssertEqual(card.themes, ["rest"])
  }

  func testSynthesizeCreatesSynthesisCardWithSources() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let wisdom = WisdomStore(store: store)
    _ = wisdom.addIdea(kind: "insight", title: "One", body: "first", themes: [], source: nil)
    _ = wisdom.addIdea(kind: "insight", title: "Two", body: "second", themes: [], source: nil)
    let ids = wisdom.projection.cards.map { $0.id }
    XCTAssertEqual(ids.count, 2)
    XCTAssertTrue(wisdom.synthesize(sourceIds: ids, title: "Woven", body: "a bigger picture"))
    let synth = wisdom.projection.cards.first { $0.kind == "synthesis" }
    XCTAssertNotNil(synth)
    // Re-read the synthesis note: it records the source ids.
    let reread = try XCTUnwrap(store.beginEdit(path: synth!.path))
    XCTAssertEqual(reread.note.sourceNoteIds?.sorted(), ids.sorted())
  }
}
