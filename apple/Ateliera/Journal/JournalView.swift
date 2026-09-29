import SwiftUI

// The Journal: quick capture's home, shown as dated entries — newest first, each with
// its date, an optional cover, a snippet, and its tags. It reuses the shared room
// chrome (tap to open · swipe-left to File/Delete) and the same `room-capture-button`
// so capture behaves identically to every other room; only the row is richer.
struct JournalView: View {
  @Environment(\.studioTheme) private var theme
  let room: Room
  let store: VaultStore
  let onOpen: (String) -> Void  // note path
  let onCapture: () -> Void
  @State private var filing: NoteSummary?

  // Newest first (liveNotes is already ordered newest-first — Anna's preference).
  private var entries: [NoteSummary] { store.liveNotes.filter { $0.rooms.contains(room.id) } }

  var body: some View {
    List {
      Section {
        RoomHeading(eyebrow: room.eyebrow, title: room.title, intro: room.intro)
        Button(action: onCapture) {
          Label("Add to \(room.title)", systemImage: "plus.circle.fill")
            .font(StudioFont.control)
            .foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("room-capture-button")
      }
      .studioRoomRow(EdgeInsets(top: 12, leading: 28, bottom: 6, trailing: 28))

      if entries.isEmpty {
        Text("Nothing here yet.")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          .studioRoomRow(EdgeInsets(top: 6, leading: 28, bottom: 6, trailing: 28))
      } else {
        ForEach(entries) { note in
          Button { onOpen(note.id) } label: { JournalEntryRow(note: note, store: store) }
            .buttonStyle(.plain)
            .studioRoomRow(EdgeInsets(top: 2, leading: 28, bottom: 2, trailing: 28))
            .accessibilityIdentifier("note-row-\(note.id)")
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
      ForEach(Room.all.filter { $0.id != room.id }) { target in
        Button(target.title) { _ = store.fileNote(path: note.id, toRoom: target.id) }
      }
      Button("Cancel", role: .cancel) {}
    }
  }
}

// One dated entry: date · title · snippet · tags, with a cover thumbnail when present.
private struct JournalEntryRow: View {
  @Environment(\.studioTheme) private var theme
  let note: NoteSummary
  let store: VaultStore
  @State private var cover: UIImage?

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      if let cover {
        Image(uiImage: cover)
          .resizable().scaledToFill()
          .frame(width: 52, height: 52)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .accessibilityIdentifier("journal-cover-\(note.id)")
      } else {
        Image(systemName: "circle.fill")
          .font(.system(size: 8))
          .foregroundStyle(meaningColour(note.meaning, theme: theme))
          .frame(width: 8).padding(.top, 6)
      }
      VStack(alignment: .leading, spacing: 5) {
        Text(Self.dateLabel(note.timestamp))
          .font(StudioFont.eyebrow).tracking(0.8).foregroundStyle(theme.inkFaint)
        Text(note.title)
          .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        if !note.snippet.isEmpty {
          Text(note.snippet)
            .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
            .lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        if !note.tags.isEmpty {
          TagRow(tags: note.tags)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
    .task(id: note.cover) { loadCover() }
  }

  private func loadCover() {
    guard let reference = note.cover,
      let media = store.readCover(reference: reference, forNotePath: note.id)
    else {
      cover = nil
      return
    }
    cover = UIImage(data: media.data)
  }

  // ISO timestamp → "12 September 2026". Falls back to the date portion if unparseable.
  static func dateLabel(_ iso: String) -> String {
    guard let date = parse(iso) else { return String(iso.prefix(10)) }
    let out = DateFormatter()
    out.locale = Locale(identifier: "en_US_POSIX")
    out.dateFormat = "d MMMM yyyy"
    return out.string(from: date)
  }

  private static func parse(_ iso: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFraction.date(from: iso) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: iso)
  }
}

// Small, calm tag pills.
private struct TagRow: View {
  @Environment(\.studioTheme) private var theme
  let tags: [String]

  var body: some View {
    HStack(spacing: 6) {
      ForEach(tags.prefix(4), id: \.self) { tag in
        Text(tag)
          .font(StudioFont.eyebrow).tracking(0.4).foregroundStyle(theme.inkMuted)
          .padding(.horizontal, 8).padding(.vertical, 3)
          .background(Capsule().fill(theme.sunken))
      }
      if tags.count > 4 {
        Text("+\(tags.count - 4)").font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      }
    }
    .padding(.top, 2)
  }
}
