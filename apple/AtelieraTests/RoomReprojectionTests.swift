import XCTest

@testable import Ateliera

// A room's board follows the vault: a card deleted or archived from the shared editor,
// which writes through VaultStore rather than the room's own store, leaves the board
// without leaving the room.
final class RoomReprojectionTests: XCTestCase {
  private func makeStore() throws -> (URL, VaultStore) {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("rooms-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = VaultStore(discovering: false)
    try store.openForTesting(at: dir)
    return (dir, store)
  }

  // The room re-projects on the main queue after the vault reloads.
  private func eventually(_ condition: @escaping () -> Bool, _ message: String) {
    let deadline = Date().addingTimeInterval(2)
    while !condition() && Date() < deadline {
      RunLoop.main.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertTrue(condition(), message)
  }

  func testReflectionDropsACardTrashedFromTheEditor() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let reflection = ReflectionStore(store: store)
    XCTAssertTrue(
      reflection.keep(kind: "reflection", body: "Invented reflection: test fixture one."))
    let card = try XCTUnwrap(reflection.garden.cards.first)

    XCTAssertTrue(store.setNoteStatus(path: card.path, status: "trashed"))

    eventually({ reflection.garden.cards.isEmpty }, "the trashed card is still in the garden")
  }

  func testIdentityDropsACardArchivedFromTheEditor() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let identity = IdentityStore(store: store)
    XCTAssertTrue(
      identity.add(section: .alreadyTrue, title: "Invented card", body: "Test fixture two."))
    let card = try XCTUnwrap(identity.model.sections[.alreadyTrue]?.first)

    XCTAssertTrue(store.setNoteStatus(path: card.path, status: "archived"))

    eventually(
      { identity.model.sections[.alreadyTrue]?.isEmpty ?? true },
      "the archived card is still on the Identity board")
  }

  func testLandscapeDropsACardTrashedFromTheEditor() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    let landscape = LandscapeStore(store: store)
    let area = try XCTUnwrap(landscape.areas.first?.id)
    XCTAssertTrue(
      landscape.addCard(
        lifeArea: area, anchor: .vision, horizon: nil, title: "Invented vision card",
        body: "Test fixture three."))
    let card = try XCTUnwrap(landscape.board.cell(area: area, anchor: .vision)?.cards.first)

    XCTAssertTrue(store.setNoteStatus(path: card.path, status: "trashed"))

    eventually(
      { landscape.board.cell(area: area, anchor: .vision)?.cards.isEmpty ?? true },
      "the trashed card is still on the Landscape board")
  }

  func testARoomThatHasGoneStopsFollowingTheVault() throws {
    let (dir, store) = try makeStore()
    defer { try? FileManager.default.removeItem(at: dir) }
    weak var gone: ReflectionStore?
    do {
      let reflection = ReflectionStore(store: store)
      gone = reflection
    }
    XCTAssertTrue(store.capture(title: "Invented note", body: "Test fixture four.", room: "inbox"))
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    XCTAssertNil(gone, "the vault kept a room store alive")
  }
}
