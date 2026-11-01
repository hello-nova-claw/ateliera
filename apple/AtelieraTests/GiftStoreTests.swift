import XCTest

@testable import Ateliera

// P3 integration: the Gift over a real on-disk vault through VaultStore. The pure
// SM-2 engine + selection + addDaysISO are golden-tested in ResurfacingTests; here
// we exercise the wiring — resurfacePool() over parsed notes, refresh building a
// card from the source, and grade filing a keepsake copy + advancing the source's
// schedule through the atomic write rail (unknown frontmatter surviving the write).
final class GiftStoreTests: XCTestCase {
  private let today = "2026-08-28"

  private func ctx() -> RhythmContext {
    Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: .north, cycle: nil), date: today)
  }

  // A due Reflection Garden wish note, optionally carrying an unknown frontmatter
  // key so we can assert it survives the grade write-back.
  private func wishNote(id: String, extra: [(String, YamlNode)] = []) -> StudioNote {
    var note = StudioNote.capture(
      title: "A wish worth keeping", body: "\nRemember the shape of this wish.\n",
      id: id, created: "2026-01-01T00:00:00.000Z", room: "reflection-garden")
    note.resurfaceKind = "wish"
    note.resurfaceDue = "2020-01-01"  // far past → always due
    note.resurfaceIntervalDays = 6
    note.extraFrontmatter = extra
    return note
  }

  private func makeStore(_ seed: [(rel: String, note: StudioNote)]) throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("gift-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (rel, note) in seed {
      let fileURL = dir.appendingPathComponent(rel)
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try note.serialize().data(using: .utf8)!.write(to: fileURL)
    }
    let store = VaultStore()
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  func testRefreshEmptyVaultShowsCalmLine() throws {
    let (dir, store) = try makeStore([])
    defer { try? FileManager.default.removeItem(at: dir) }
    let gift = GiftStore(store: store)
    gift.refresh(ctx: ctx(), today: today)
    guard case .line = gift.gift else {
      return XCTFail("expected the calm line for an empty vault, got \(gift.gift)")
    }
  }

  func testRefreshWithDueCardShowsThatSourcesBody() throws {
    let (dir, store) = try makeStore([
      ("Reflection Garden/wish.md", wishNote(id: "WISH00000000000000000000AA"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let gift = GiftStore(store: store)
    gift.refresh(ctx: ctx(), today: today)
    guard case .card(let title, _, let body, let sourcePath, let kind, let interval) = gift.gift
    else {
      return XCTFail("expected a card, got \(gift.gift)")
    }
    XCTAssertEqual(title, "A wish worth keeping")
    XCTAssertTrue(body.contains("Remember the shape of this wish."))
    XCTAssertEqual(sourcePath, "Reflection Garden/wish.md")
    XCTAssertEqual(kind, .wish)
    XCTAssertEqual(interval, 6)
  }

  func testTheGiftExcerptReadsLikeTheRestOfTheApp() throws {
    // The Gift used its own Markdown reducer, which left wikilink brackets in the excerpt.
    var note = wishNote(id: "WISH00000000000000000000AB")
    note.title = nil
    note.body = "\nA **test** wish that links [[Invented fixture note]].\n"
    let (dir, store) = try makeStore([("Reflection Garden/wish.md", note)])
    defer { try? FileManager.default.removeItem(at: dir) }
    let gift = GiftStore(store: store)
    gift.refresh(ctx: ctx(), today: today)
    guard case .card(let title, let excerpt, _, _, _, _) = gift.gift else {
      return XCTFail("expected a card, got \(gift.gift)")
    }
    XCTAssertEqual(excerpt, "A test wish that links Invented fixture note.")
    XCTAssertEqual(excerpt, Projection.excerpt(note))
    XCTAssertEqual(title, Projection.title(note))
  }

  func testGradeKeepFilesCopyAndAdvancesSchedule() throws {
    let (dir, store) = try makeStore([
      (
        "Reflection Garden/wish.md",
        wishNote(id: "WISH00000000000000000000AA", extra: [("keepsake", .scalar("treasured"))])
      )
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    XCTAssertEqual(store.notes.count, 1)
    let gift = GiftStore(store: store)
    gift.refresh(ctx: ctx(), today: today)

    gift.grade(4, today: today)  // Keep

    guard case .success = gift.keepState else {
      return XCTFail("expected success, got \(gift.keepState)")
    }
    // A keepsake copy was filed → notes grew by one.
    XCTAssertEqual(store.notes.count, 2)
    XCTAssertTrue(
      store.notes.contains {
        $0.title == "A wish worth keeping" && $0.rooms.contains("reflection-garden")
      })

    // The SOURCE advanced by sm2Interval(6, 4) = 15 days from today, kept its kind,
    // and preserved the unknown frontmatter key across the re-serialize.
    let expectedDue = Resurfacing.addDaysISO(today, 15)
    let reread = try XCTUnwrap(store.beginEdit(path: "Reflection Garden/wish.md"))
    XCTAssertEqual(reread.note.resurfaceIntervalDays, 15)
    XCTAssertEqual(reread.note.resurfaceDue, expectedDue)
    XCTAssertEqual(reread.note.resurfaceKind, "wish")
    XCTAssertTrue(reread.note.extraFrontmatter.contains { $0.0 == "keepsake" })
  }

  func testGradeNotNowReschedulesWithoutFilingCopy() throws {
    let (dir, store) = try makeStore([
      ("Reflection Garden/wish.md", wishNote(id: "WISH00000000000000000000AA"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let gift = GiftStore(store: store)
    gift.refresh(ctx: ctx(), today: today)

    gift.grade(2, today: today)  // Not now

    guard case .success = gift.keepState else {
      return XCTFail("expected success, got \(gift.keepState)")
    }
    XCTAssertEqual(store.notes.count, 1)  // no copy filed
    let reread = try XCTUnwrap(store.beginEdit(path: "Reflection Garden/wish.md"))
    XCTAssertEqual(reread.note.resurfaceIntervalDays, 1)  // fail resets to 1
    XCTAssertEqual(reread.note.resurfaceDue, Resurfacing.addDaysISO(today, 1))
    XCTAssertEqual(reread.note.resurfaceKind, "wish")  // kind untouched
  }

  func testSaveResurfaceScheduleSurfacesStaleHashConflict() throws {
    let (dir, store) = try makeStore([
      ("Reflection Garden/wish.md", wishNote(id: "WISH00000000000000000000AA"))
    ])
    defer { try? FileManager.default.removeItem(at: dir) }
    let first = try XCTUnwrap(store.beginEdit(path: "Reflection Garden/wish.md"))
    let stale = try XCTUnwrap(store.beginEdit(path: "Reflection Garden/wish.md"))
    // Write once through `first` so the file's hash moves on.
    XCTAssertTrue(store.saveResurfaceSchedule(first, due: "2027-01-01", intervalDays: 15))
    // The second write, still holding the old hash, must be refused (no data loss).
    XCTAssertFalse(store.saveResurfaceSchedule(stale, due: "2099-01-01", intervalDays: 99))
    XCTAssertNotNil(store.error)
    // The first write stands.
    let reread = try XCTUnwrap(store.beginEdit(path: "Reflection Garden/wish.md"))
    XCTAssertEqual(reread.note.resurfaceDue, "2027-01-01")
  }
}
