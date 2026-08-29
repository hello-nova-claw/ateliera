import SwiftUI
import UniformTypeIdentifiers

// The Reflection Garden as a real room: its notes are read from the vault through
// the Rust core (VaultStore). The Studio folder is a user-picked, security-scoped
// iCloud folder via the native `.fileImporter`, or a seeded fixture in the sim.
struct RootView: View {
  let themeStore: ThemeStore
  @Environment(\.studioTheme) private var theme
  @State private var store: VaultStore
  @State private var giftStore: GiftStore
  @State private var picking = false

  init(themeStore: ThemeStore = ThemeStore()) {
    self.themeStore = themeStore
    // One VaultStore, shared by the room lists and the Foyer's Gift, so a graded
    // card's write is reflected in both without a second load.
    let vault = VaultStore()
    _store = State(initialValue: vault)
    _giftStore = State(initialValue: GiftStore(store: vault))
  }

  @State private var activeSheet: ActiveSheet?
  @State private var health = HealthCycleSource()
  @State private var cycle: CycleProfile?
  @State private var location = LocationHemisphere()
  @State private var hemisphere: Hemisphere = SharedStore.bestHemisphere
  @State private var profileStore = RhythmProfileStore()

  // One sheet at a time: a fresh capture, an edit, or the rhythm profile.
  private enum ActiveSheet: Identifiable {
    case capture(room: String?)
    case edit(EditableNote)
    case rhythm
    case search
    case settings
    case placement

    var id: String {
      switch self {
      case .capture(let room): return "capture:\(room ?? "inbox")"
      case .edit(let editable): return "edit:\(editable.id)"
      case .rhythm: return "rhythm"
      case .search: return "search"
      case .settings: return "settings"
      case .placement: return "placement"
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
          TodaysGiftView(store: giftStore) { quality in
            giftStore.grade(quality, today: almanacContext.date)
          }
          Button {
            activeSheet = .rhythm
          } label: {
            Text("Your rhythm ›")
              .font(StudioFont.control)
              .foregroundStyle(theme.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("rhythm-button")
          Divider().overlay(theme.line)

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
              .foregroundStyle(theme.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("capture-button")

          Button {
            activeSheet = .placement
          } label: {
            Label("Place a card", systemImage: "square.on.square")
              .font(StudioFont.control)
              .foregroundStyle(theme.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("placement-button")

          if let error = store.error {
            Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
          }

          roomsSection
          recentlySection
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
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
      giftStore.refresh(ctx: almanacContext, today: almanacContext.date)
    }
    .onChange(of: almanacContext.date) {
      giftStore.refresh(ctx: almanacContext, today: almanacContext.date)
    }
    .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .capture(let room):
        NoteEditorSheet(
          heading: "Capture", confirmLabel: "Keep", initialTitle: "", initialBody: "",
          onSave: { title, body in store.capture(title: title, body: body, room: room ?? "inbox") },
          onClose: { activeSheet = nil })
      case .edit(let editable):
        NoteEditView(
          store: store, editable: editable, onClose: { activeSheet = nil },
          onNavigate: { target in navigateWikilink(target) },
          onOpenPath: { path in
            if let next = store.beginEdit(path: path) { activeSheet = .edit(next) }
          })
      case .rhythm:
        RhythmSettingsView(
          store: profileStore, isPresented: Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } }))
      case .search:
        SearchView(
          store: store,
          onOpen: { path in
            if let editable = store.beginEdit(path: path) { activeSheet = .edit(editable) }
          },
          onClose: { activeSheet = nil })
      case .settings:
        SettingsView(themeStore: themeStore, store: store, onClose: { activeSheet = nil })
          .studioTheme(themeStore.current)
      case .placement:
        ClassifiedCaptureSheet(store: store, onClose: { activeSheet = nil })
      }
    }
  }

  private func openEdit(_ note: NoteSummary) {
    if let editable = store.beginEdit(path: note.id) { activeSheet = .edit(editable) }
  }

  // Resolve a wikilink target to a note and open it; returns false (caller shows
  // "not found") when it can't be resolved.
  private func navigateWikilink(_ target: String) -> Bool {
    guard let path = WikilinkNavigator.resolvePath(target: target, in: store.notes),
      let editable = store.beginEdit(path: path)
    else { return false }
    activeSheet = .edit(editable)
    return true
  }

  // The rooms you can step into, each with how many notes it holds.
  private var roomsSection: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("ROOMS")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        .padding(.bottom, 8)
      ForEach(Room.all) { room in
        NavigationLink {
          roomDestination(room)
        } label: {
          HStack(spacing: 10) {
            Text(room.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            Spacer(minLength: 0)
            let count = store.notes.filter { $0.rooms.contains(room.id) }.count
            if count > 0 {
              Text("\(count)").font(StudioFont.meta).foregroundStyle(theme.inkMuted)
            }
            Image(systemName: "chevron.right")
              .font(.system(size: 12)).foregroundStyle(theme.inkFaint)
          }
          .padding(.vertical, 14)
        }
        .accessibilityIdentifier("room-\(room.id)")
        Divider().overlay(theme.line)
      }
    }
  }

  // Life Landscape and Identity Studio are projected rooms with their own stores;
  // every other room is the generic note-list RoomView.
  @ViewBuilder
  private func roomDestination(_ room: Room) -> some View {
    switch room.id {
    case "landscape":
      LandscapeRoomView(store: store, onOpen: openPath)
    case "identity-studio":
      IdentityRoomView(store: store, onOpen: openPath)
    case "uncharted":
      UnchartedView(store: store, onOpen: openPath)
    case "wisdom-garden":
      WisdomView(store: store, onOpen: openPath)
    case "reflection-garden":
      ReflectionView(store: store, onOpen: openPath)
    case "current-season":
      SeasonView(store: store, onOpen: openPath)
    default:
      RoomView(
        room: room, store: store, onOpen: openEdit,
        onCapture: { activeSheet = .capture(room: room.id) })
    }
  }

  private func openPath(_ path: String) {
    if let editable = store.beginEdit(path: path) { activeSheet = .edit(editable) }
  }

  // Everything you've captured, newest first, whatever room it's in.
  private var recentlySection: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !store.notes.isEmpty {
        Text("RECENTLY")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
          .padding(.bottom, 8)
      }
      ForEach(store.notes) { note in
        Button { openEdit(note) } label: { NoteRow(note: note) }
          .buttonStyle(.plain)
        Divider().overlay(theme.line)
      }
    }
  }

  private var studioBar: some View {
    HStack {
      HStack(spacing: 6) {
        Text("STUDIO")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        Text(store.vaultName)
          .font(StudioFont.control).foregroundStyle(theme.inkMuted)
      }
      Spacer()
      Button {
        activeSheet = .search
      } label: {
        Image(systemName: "magnifyingglass").font(StudioFont.control)
      }
      .foregroundStyle(theme.link)
      .accessibilityIdentifier("search-button")
      .accessibilityLabel("Search")
      Button {
        activeSheet = .settings
      } label: {
        Image(systemName: "gearshape").font(StudioFont.control)
      }
      .foregroundStyle(theme.link)
      .accessibilityIdentifier("settings-button")
      .accessibilityLabel("Settings")
      Button("Choose folder…") { picking = true }
        .font(StudioFont.control)
        .foregroundStyle(theme.link)
    }
    .padding(.bottom, 4)
    .overlay(alignment: .bottom) { Divider().overlay(theme.line) }
  }
}

// A note as it appears in a list: a meaning-coloured mark, title, and snippet.
private struct NoteRow: View {
  @Environment(\.studioTheme) private var theme
  let note: NoteSummary

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: "heart.fill")
        .font(.system(size: 12))
        .foregroundStyle(meaningColour(note.meaning, theme: theme))
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 4) {
        Text(note.title)
          .font(StudioFont.cardTitle)
          .foregroundStyle(theme.inkStrong)
        if !note.snippet.isEmpty {
          Text(note.snippet)
            .font(StudioFont.meta)
            .foregroundStyle(theme.inkMuted)
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
  @Environment(\.studioTheme) private var theme
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
            .foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("room-capture-button")
        if notes.isEmpty {
          Text("Nothing here yet.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        } else {
          VStack(spacing: 0) {
            ForEach(notes) { note in
              Button { onOpen(note) } label: { NoteRow(note: note) }
                .buttonStyle(.plain)
              Divider().overlay(theme.line)
            }
          }
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle(room.title)
  }
}

private func meaningColour(_ meaning: String, theme: StudioTheme) -> Color {
  switch meaning {
  case "foundation", "foundations": return theme.foundation
  case "vision": return theme.vision
  case "growth": return theme.growth
  case "celebration": return theme.celebration
  case "uncharted": return theme.uncharted
  default: return theme.reflection
  }
}

private struct RoomHeading: View {
  @Environment(\.studioTheme) private var theme
  let eyebrow: String
  let title: String
  let intro: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(eyebrow)
        .font(StudioFont.greeting)
        .foregroundStyle(theme.vision)
      Text(title)
        .font(StudioFont.roomTitle)
        .tracking(-0.5)
        .foregroundStyle(theme.inkStrong)
      Text(intro)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

// The note composer, shared by capture (a new note) and edit (an existing one):
// an optional title and the note body. The confirm button calls `onSave` and
// dismisses only when it returns true, so a write conflict or empty note keeps the
// sheet open with the error shown in the room behind it.
private struct NoteEditorSheet: View {
  @Environment(\.studioTheme) private var theme
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
      .foregroundStyle(theme.inkFaint)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Title")
            TextField("A short name (optional)", text: $noteTitle)
              .font(StudioFont.cardTitle)
              .foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("note-title-field")
          }
          Divider().overlay(theme.line)
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Reflection")
            ZStack(alignment: .topLeading) {
              if noteText.isEmpty {
                Text("Write what you're noticing…")
                  .font(StudioFont.pageSubtitle)
                  .foregroundStyle(theme.inkFaint)
                  .padding(.top, 8)
                  .padding(.leading, 5)
                  .allowsHitTesting(false)
              }
              TextEditor(text: $noteText)
                .font(StudioFont.pageSubtitle)
                .foregroundStyle(theme.inkStrong)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 200)
                .accessibilityIdentifier("note-body-editor")
            }
          }
          Text("Notice what is changing. Fifteen minutes still counts.")
            .font(StudioFont.meta)
            .foregroundStyle(theme.inkFaint)
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        // A styled principal title instead of `.navigationTitle`, so the heading
        // is always high-contrast ink rather than a faint system default.
        ToolbarItem(placement: .principal) {
          Text(heading)
            .font(StudioFont.control)
            .foregroundStyle(theme.inkStrong)
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

// Editing an existing note: title + body, plus a "Details" screen for all
// metadata. Holds the full StudioNote and saves it through the one write rail.
private struct NoteEditView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let editable: EditableNote
  let onClose: () -> Void
  let onNavigate: (String) -> Bool  // wikilink target → true if it navigated away
  let onOpenPath: (String) -> Void  // open another note by its vault path (backlinks)
  @State private var note: StudioNote
  @State private var titleText: String
  @State private var showingPreview = false
  @State private var notFound = false

  init(
    store: VaultStore, editable: EditableNote, onClose: @escaping () -> Void,
    onNavigate: @escaping (String) -> Bool, onOpenPath: @escaping (String) -> Void
  ) {
    self.store = store
    self.editable = editable
    self.onClose = onClose
    self.onNavigate = onNavigate
    self.onOpenPath = onOpenPath
    _note = State(initialValue: editable.note)
    _titleText = State(initialValue: editable.note.title ?? "")
  }

  private var canSave: Bool {
    !note.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Title")
            TextField("A short name (optional)", text: $titleText)
              .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("note-title-field")
          }
          Divider().overlay(theme.line)
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              fieldLabel("Reflection")
              Spacer()
              Button(showingPreview ? "Edit" : "Preview") { showingPreview.toggle() }
                .font(StudioFont.meta).foregroundStyle(theme.link)
                .accessibilityIdentifier("preview-toggle")
            }
            if showingPreview {
              BodyPreviewView(bodyText: note.body) { target in
                if !onNavigate(target) { notFound = true }
              }
            } else {
              TextEditor(text: $note.body)
                .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 180)
                .accessibilityIdentifier("note-body-editor")
            }
          }
          Divider().overlay(theme.line)
          NavigationLink {
            MetadataEditorView(note: $note)
          } label: {
            Label("Details", systemImage: "slider.horizontal.3")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .accessibilityIdentifier("note-details-button")
          NavigationLink {
            BacklinksView(store: store, sourcePath: editable.path, onNavigate: onOpenPath)
          } label: {
            Label("Links", systemImage: "link")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .accessibilityIdentifier("note-links-button")
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Edit").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onClose() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            let trimmed = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
            note.title = trimmed.isEmpty ? nil : trimmed
            if store.saveEdit(editable, updatedNote: note) { onClose() }
          }
          .disabled(!canSave)
          .accessibilityIdentifier("note-save-button")
        }
      }
      .alert("Note not found", isPresented: $notFound) {
        Button("OK", role: .cancel) {}
      } message: {
        Text("That link doesn't point to a note in this Studio yet.")
      }
    }
  }

  private func fieldLabel(_ text: String) -> some View {
    Text(text.uppercased())
      .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
  }
}

// Search the vault by title or body text. Tapping a result opens it for editing.
// SearchView now lives in Search/SearchView.swift (faceted, over the P4 index).

// Settings: for now, the theme picker. Choosing a palette persists it and recolors
// the whole app live (the selection re-renders the environment above RootView).
private struct SettingsView: View {
  @Environment(\.studioTheme) private var theme
  let themeStore: ThemeStore
  let store: VaultStore
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("THEME")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.bottom, 8)
          ForEach(StudioTheme.all, id: \.id) { palette in
            Button {
              themeStore.selectedId = palette.id
            } label: {
              themeRow(palette)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("theme-\(palette.id)")
            Divider().overlay(theme.line)
          }

          Text("MAINTENANCE")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          NavigationLink {
            RepairView(store: store)
          } label: {
            HStack {
              Text("Repair links").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("repair-links-button")
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Settings").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { onClose() }
        }
      }
    }
  }

  private func themeRow(_ palette: StudioTheme) -> some View {
    HStack(spacing: 14) {
      swatches(palette)
      Text(palette.name)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      Spacer(minLength: 0)
      if palette.id == themeStore.selectedId {
        Image(systemName: "checkmark")
          .font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.link)
      }
    }
    .padding(.vertical, 14)
    .contentShape(Rectangle())
  }

  // A little cluster of the palette's canvas + meaning colours, so the choice is
  // legible at a glance without applying it.
  private func swatches(_ palette: StudioTheme) -> some View {
    HStack(spacing: 3) {
      ForEach(
        Array([palette.canvas, palette.vision, palette.growth, palette.reflection].enumerated()),
        id: \.offset
      ) { _, colour in
        RoundedRectangle(cornerRadius: 3)
          .fill(colour)
          .frame(width: 14, height: 22)
      }
    }
    .overlay(RoundedRectangle(cornerRadius: 3).stroke(theme.line, lineWidth: 1))
  }
}

#Preview {
  RootView()
}
