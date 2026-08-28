import XCTest

@testable import Ateliera

// The minimal list parser must read a note's `rooms` so rooms can filter the vault.
final class RoomsTests: XCTestCase {
  func testParsesABlockRoomsList() {
    let md = """
      ---
      title: A note
      card_type: capture
      rooms:
        - inbox
        - reflection-garden
      created: 2026-08-28T00:00:00Z
      ---
      body text
      """
    let summary = VaultStore.parse(path: "Inbox/a.md", text: md)
    XCTAssertEqual(summary.rooms, ["inbox", "reflection-garden"])
    XCTAssertEqual(summary.title, "A note")
  }

  func testParsesEmptyRooms() {
    let md = "---\ntitle: X\ncard_type: capture\nrooms: []\n---\nbody"
    XCTAssertEqual(VaultStore.parse(path: "a.md", text: md).rooms, [])
  }

  func testParsesNoRoomsKey() {
    let md = "---\ntitle: X\ncard_type: reflection\n---\nbody"
    XCTAssertEqual(VaultStore.parse(path: "a.md", text: md).rooms, [])
  }

  func testFilteringByRoomMembership() {
    let notes = [
      NoteSummary(id: "1", title: "In inbox", snippet: "", meaning: "reflection", timestamp: "", rooms: ["inbox"]),
      NoteSummary(id: "2", title: "In garden", snippet: "", meaning: "reflection", timestamp: "", rooms: ["reflection-garden"]),
      NoteSummary(id: "3", title: "Both", snippet: "", meaning: "reflection", timestamp: "", rooms: ["inbox", "reflection-garden"]),
    ]
    XCTAssertEqual(notes.filter { $0.rooms.contains("inbox") }.map(\.id), ["1", "3"])
    XCTAssertEqual(notes.filter { $0.rooms.contains("reflection-garden") }.map(\.id), ["2", "3"])
  }
}
