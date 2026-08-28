import SwiftUI
import UniformTypeIdentifiers

// The Reflection Garden as a real room: its notes are read from the vault through
// the Rust core (VaultStore). The Studio folder is a user-picked, security-scoped
// iCloud folder via the native `.fileImporter`, or a seeded fixture in the sim.
struct RootView: View {
  @State private var store = VaultStore()
  @State private var picking = false
  @State private var activeSheet: ActiveSheet?
  @State private var health = HealthCycleSource()
  @State private var cycle: CycleProfile?
  @State private var location = LocationHemisphere()
  @State private var hemisphere: Hemisphere = LocationHemisphere.persisted ?? .north
  @State private var profileStore = RhythmProfileStore()

  // One sheet at a time: a fresh capture, an edit, or the rhythm profile.
  private enum ActiveSheet: Identifiable {
    case capture(room: String?)
    case edit(EditableNote)
    case rhythm
    case search

    var id: String {
      switch self {
      case .capture(let room): return "capture:\(room ?? "inbox")"
      case .edit(let editable): return "edit:\(editable.id)"
      case .rhythm: return "rhythm"
      case .search: return "search"
      }
    }
  }

  // Today's rhythm. Hemisphere comes from the device's location (persisted across
  // launches); the cycle from HealthKit. Moon and felt season need neither.
  private var almanacContext: RhythmContext {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    let today = formatter.string(from: Date())
    return Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: hemisphere, cycle: cycle), date: today)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          AlmanacView(context: almanacContext)
          Button {
            activeSheet = .rhythm
          } label: {
            Text("Your rhythm ›")
              .font(StudioFont.control)
              .foregroundStyle(Studio.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("rhythm-button")
          Divider().overlay(Studio.line)

          RoomHeading(
            eyebrow: "welcome back",
            title: "The Foyer",
            intro: "Today's rhythm, your rooms, and what you've been noticing.")

          studioBar

          Button {
            activeSheet = .capture(room: nil)
          } label: {
            Label("Add a reflection", systemImage: "plus.circle.fill")
              .font(StudioFont.control)
              .foregroundStyle(Studio.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("capture-button")

          if let error = store.error {
            Text(error).font(StudioFont.meta).foregroundStyle(Studio.celebration)
          }

          roomsSection
          recentlySection
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(Studio.canvas)
    }
    .fileImporter(
      isPresented: $picking, allowedContentTypes: [.folder], allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        store.open(url: url)
      }
    }
    .task {
      // Resolve hemisphere from location first, then the cycle from HealthKit —
      // sequentially so the two permission prompts don't stack. Both refine the
      // almanac and both degrade quietly when unavailable.
      if let resolved = await location.resolve() { hemisphere = resolved }
      cycle = await health.loadCycle()
    }
    .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .capture(let room):
        NoteEditorSheet(
          heading: "Capture", confirmLabel: "Keep", initialTitle: "", initialBody: "",
          onSave: { title, body in store.capture(title: title, body: body, room: room ?? "inbox") },
          onClose: { activeSheet = nil })
      case .edit(let editable):
        NoteEditorSheet(
          heading: "Edit", confirmLabel: "Save",
          initialTitle: editable.note.title ?? "", initialBody: editable.note.body,
          onSave: { title, body in store.saveEdit(editable, title: title, body: body) },
          onClose: { activeSheet = nil })
      case .rhythm:
        RhythmSettingsView(
          store: profileStore, isPresented: Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } }))
      case .search:
        SearchView(
          store: store,
          onOpen: { note in
            if let editable = store.beginEdit(path: note.id) { activeSheet = .edit(editable) }
          },
          onClose: { activeSheet = nil })
      }
    }
  }

  private func openEdit(_ note: NoteSummary) {
    if let editable = store.beginEdit(path: note.id) { activeSheet = .edit(editable) }
  }

  // The rooms you can step into, each with how many notes it holds.
  private var roomsSection: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("ROOMS")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(Studio.inkFaint)
        .padding(.bottom, 8)
      ForEach(Room.all) { room in
        NavigationLink {
          RoomView(
            room: room, store: store, onOpen: openEdit,
            onCapture: { activeSheet = .capture(room: room.id) })
        } label: {
          HStack(spacing: 10) {
            Text(room.title).font(StudioFont.cardTitle).foregroundStyle(Studio.inkStrong)
            Spacer(minLength: 0)
            let count = store.notes.filter { $0.rooms.contains(room.id) }.count
            if count > 0 {
              Text("\(count)").font(StudioFont.meta).foregroundStyle(Studio.inkMuted)
            }
            Image(systemName: "chevron.right")
              .font(.system(size: 12)).foregroundStyle(Studio.inkFaint)
          }
          .padding(.vertical, 14)
        }
        .accessibilityIdentifier("room-\(room.id)")
        Divider().overlay(Studio.line)
      }
    }
  }

  // Everything you've captured, newest first, whatever room it's in.
  private var recentlySection: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !store.notes.isEmpty {
        Text("RECENTLY")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(Studio.inkFaint)
          .padding(.bottom, 8)
      }
      ForEach(store.notes) { note in
        Button { openEdit(note) } label: { NoteRow(note: note) }
          .buttonStyle(.plain)
        Divider().overlay(Studio.line)
      }
    }
  }

  private var studioBar: some View {
    HStack {
      HStack(spacing: 6) {
        Text("STUDIO")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(Studio.inkFaint)
        Text(store.vaultName)
          .font(StudioFont.control).foregroundStyle(Studio.inkMuted)
      }
      Spacer()
      Button {
        activeSheet = .search
      } label: {
        Image(systemName: "magnifyingglass").font(StudioFont.control)
      }
      .foregroundStyle(Studio.link)
      .accessibilityIdentifier("search-button")
      .accessibilityLabel("Search")
      Button("Choose folder…") { picking = true }
        .font(StudioFont.control)
        .foregroundStyle(Studio.link)
    }
    .padding(.bottom, 4)
    .overlay(alignment: .bottom) { Divider().overlay(Studio.line) }
  }
}

// A note as it appears in a list: a meaning-coloured mark, title, and snippet.
private struct NoteRow: View {
  let note: NoteSummary

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: "heart.fill")
        .font(.system(size: 12))
        .foregroundStyle(meaningColour(note.meaning))
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 4) {
        Text(note.title)
          .font(StudioFont.cardTitle)
          .foregroundStyle(Studio.inkStrong)
        if !note.snippet.isEmpty {
          Text(note.snippet)
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 14)
  }
}

// A single room: its heading and the notes tagged to it, tap to edit.
private struct RoomView: View {
  let room: Room
  let store: VaultStore
  let onOpen: (NoteSummary) -> Void
  let onCapture: () -> Void

  private var notes: [NoteSummary] { store.notes.filter { $0.rooms.contains(room.id) } }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        RoomHeading(eyebrow: room.eyebrow, title: room.title, intro: room.intro)
        Button(action: onCapture) {
          Label("Add to \(room.title)", systemImage: "plus.circle.fill")
            .font(StudioFont.control)
            .foregroundStyle(Studio.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("room-capture-button")
        if notes.isEmpty {
          Text("Nothing here yet.")
            .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
        } else {
          VStack(spacing: 0) {
            ForEach(notes) { note in
              Button { onOpen(note) } label: { NoteRow(note: note) }
                .buttonStyle(.plain)
              Divider().overlay(Studio.line)
            }
          }
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Studio.canvas)
    .navigationTitle(room.title)
  }
}

private func meaningColour(_ meaning: String) -> Color {
  switch meaning {
  case "foundation", "foundations": return Studio.foundation
  case "vision": return Studio.vision
  case "growth": return Studio.growth
  case "celebration": return Studio.celebration
  case "uncharted": return Studio.uncharted
  default: return Studio.reflection
  }
}

private struct RoomHeading: View {
  let eyebrow: String
  let title: String
  let intro: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(eyebrow)
        .font(StudioFont.greeting)
        .foregroundStyle(Studio.vision)
      Text(title)
        .font(StudioFont.roomTitle)
        .tracking(-0.5)
        .foregroundStyle(Studio.inkStrong)
      Text(intro)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(Studio.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

// The note composer, shared by capture (a new note) and edit (an existing one):
// an optional title and the note body. The confirm button calls `onSave` and
// dismisses only when it returns true, so a write conflict or empty note keeps the
// sheet open with the error shown in the room behind it.
private struct NoteEditorSheet: View {
  let heading: String
  let confirmLabel: String
  let onSave: (_ title: String, _ body: String) -> Bool
  let onClose: () -> Void
  @State private var noteTitle: String
  @State private var noteText: String

  init(
    heading: String, confirmLabel: String, initialTitle: String, initialBody: String,
    onSave: @escaping (_ title: String, _ body: String) -> Bool, onClose: @escaping () -> Void
  ) {
    self.heading = heading
    self.confirmLabel = confirmLabel
    self.onSave = onSave
    self.onClose = onClose
    _noteTitle = State(initialValue: initialTitle)
    _noteText = State(initialValue: initialBody)
  }

  private var canConfirm: Bool {
    !noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func fieldLabel(_ text: String) -> some View {
    Text(text.uppercased())
      .font(StudioFont.eyebrow)
      .tracking(1.6)
      .foregroundStyle(Studio.inkFaint)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Title")
            TextField("A short name (optional)", text: $noteTitle)
              .font(StudioFont.cardTitle)
              .foregroundStyle(Studio.inkStrong)
              .accessibilityIdentifier("note-title-field")
          }
          Divider().overlay(Studio.line)
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Reflection")
            ZStack(alignment: .topLeading) {
              if noteText.isEmpty {
                Text("Write what you're noticing…")
                  .font(StudioFont.pageSubtitle)
                  .foregroundStyle(Studio.inkFaint)
                  .padding(.top, 8)
                  .padding(.leading, 5)
                  .allowsHitTesting(false)
              }
              TextEditor(text: $noteText)
                .font(StudioFont.pageSubtitle)
                .foregroundStyle(Studio.inkStrong)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 200)
                .accessibilityIdentifier("note-body-editor")
            }
          }
          Text("Notice what is changing. Fifteen minutes still counts.")
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkFaint)
        }
        .padding(24)
      }
      .background(Studio.canvas)
      .toolbar {
        // A styled principal title instead of `.navigationTitle`, so the heading
        // is always high-contrast ink rather than a faint system default.
        ToolbarItem(placement: .principal) {
          Text(heading)
            .font(StudioFont.control)
            .foregroundStyle(Studio.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onClose() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(confirmLabel) {
            if onSave(noteTitle, noteText) { onClose() }
          }
          .disabled(!canConfirm)
          .accessibilityIdentifier("note-save-button")
        }
      }
    }
  }
}

// Search the vault by title or body text. Tapping a result opens it for editing.
private struct SearchView: View {
  let store: VaultStore
  let onOpen: (NoteSummary) -> Void
  let onClose: () -> Void
  @State private var query = ""
  @FocusState private var focused: Bool

  private var results: [NoteSummary] { store.search(query) }
  private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass").foregroundStyle(Studio.inkFaint)
          TextField("Search your notes", text: $query)
            .font(StudioFont.control)
            .foregroundStyle(Studio.inkStrong)
            .focused($focused)
            .submitLabel(.search)
            .accessibilityIdentifier("search-field")
        }
        .padding(14)
        .overlay(alignment: .bottom) { Divider().overlay(Studio.line) }

        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            if trimmed.isEmpty {
              hint("Find a note by its title or words inside it.")
            } else if results.isEmpty {
              hint("Nothing found for “\(trimmed)”.")
            } else {
              ForEach(results) { note in
                Button { onOpen(note) } label: { resultRow(note) }
                  .buttonStyle(.plain)
                Divider().overlay(Studio.line)
              }
            }
          }
          .padding(.horizontal, 20)
        }
      }
      .background(Studio.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Search").font(StudioFont.control).foregroundStyle(Studio.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { onClose() }
        }
      }
    }
    .onAppear { focused = true }
  }

  private func hint(_ text: String) -> some View {
    Text(text)
      .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
      .padding(.vertical, 20)
  }

  private func resultRow(_ note: NoteSummary) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(note.title)
        .font(StudioFont.cardTitle).foregroundStyle(Studio.inkStrong)
      if !note.snippet.isEmpty {
        Text(note.snippet)
          .font(StudioFont.meta).foregroundStyle(Studio.inkMuted)
          .lineLimit(2)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 14)
  }
}

#Preview {
  RootView()
}
