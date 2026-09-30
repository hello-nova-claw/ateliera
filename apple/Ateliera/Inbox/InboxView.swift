import SwiftUI

// The Inbox: a calm triage surface for quick captures that haven't found a place yet
// (the `inbox` room's drafts). It reuses the Journal's entry row and the shared room
// chrome. Each entry offers three gentle moves — Keep in Journal (promote in place),
// File… (send to another room), or Delete — and nothing here nags with a count.
struct InboxView: View {
  @Environment(\.studioTheme) private var theme
  let room: Room
  let store: VaultStore
  let onOpen: (String) -> Void  // note path
  let onCapture: () -> Void
  @State private var filing: NoteSummary?

  // Newest first (liveNotes is already ordered newest-first — Anna's preference).
  private var entries: [NoteSummary] {
    store.liveNotes.filter { room.matches(rooms: $0.rooms, status: $0.status) }
  }

  var body: some View {
    List {
      Section {
        RoomHeading(eyebrow: room.eyebrow, title: room.title, intro: room.intro)
        Button(action: onCapture) {
          Label("Capture", systemImage: "plus.circle.fill")
            .font(StudioFont.control)
            .foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("room-capture-button")
      }
      .studioRoomRow(EdgeInsets(top: 12, leading: 28, bottom: 6, trailing: 28))

      if entries.isEmpty {
        Text("Inbox zero — nothing to sort.")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          .studioRoomRow(EdgeInsets(top: 6, leading: 28, bottom: 6, trailing: 28))
      } else {
        ForEach(entries) { note in
          Button { onOpen(note.id) } label: { JournalEntryRow(note: note, store: store) }
            .buttonStyle(.plain)
            .studioRoomRow(EdgeInsets(top: 2, leading: 28, bottom: 2, trailing: 28))
            .accessibilityIdentifier("note-row-\(note.id)")
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
              Button { _ = store.keepInJournal(path: note.id) } label: {
                Label("Keep", systemImage: "checkmark.circle")
              }
              .tint(theme.link)
              .accessibilityIdentifier("inbox-keep-\(note.id)")
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              Button(role: .destructive) {
                _ = store.setNoteStatus(path: note.id, status: "trashed")
              } label: { Label("Delete", systemImage: "trash") }
              Button { filing = note } label: { Label("File…", systemImage: "tray.and.arrow.down") }
                .tint(theme.link)
            }
        }
      }
    }
    .studioRoomList(theme.canvas)
    .navigationTitle(room.title)
    .confirmationDialog(
      "File to…",
      isPresented: Binding(get: { filing != nil }, set: { if !$0 { filing = nil } }),
      presenting: filing
    ) { note in
      Button("Journal") { _ = store.keepInJournal(path: note.id) }
      // The other philosophical rooms; skip the Inbox/Journal (same `inbox` vault key).
      ForEach(Room.all.filter { $0.vaultKey != "inbox" }) { target in
        Button(target.title) { _ = store.fileNote(path: note.id, toRoom: target.vaultKey) }
      }
      Button("Cancel", role: .cancel) {}
    }
  }
}
