import SwiftUI
import UniformTypeIdentifiers

// The Reflection Garden as a real room: its notes are read from the vault through
// the Rust core (VaultStore). The Studio folder is a user-picked, security-scoped
// iCloud folder via the native `.fileImporter`, or a seeded fixture in the sim.
struct RootView: View {
  @State private var store = VaultStore()
  @State private var picking = false
  @State private var activeSheet: ActiveSheet?

  // One sheet at a time: a fresh capture, or an edit of an existing note.
  private enum ActiveSheet: Identifiable {
    case capture
    case edit(EditableNote)

    var id: String {
      switch self {
      case .capture: return "capture"
      case .edit(let editable): return "edit:\(editable.id)"
      }
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        RoomHeading(
          eyebrow: "notice what is changing",
          title: "Reflection Garden",
          intro:
            "Gather what you're learning and celebrating, so the Studio remembers with you."
        )

        studioBar

        Button {
          activeSheet = .capture
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

        VStack(spacing: 0) {
          ForEach(store.notes) { note in
            Button {
              if let editable = store.beginEdit(path: note.id) { activeSheet = .edit(editable) }
            } label: {
              noteRow(note)
            }
            .buttonStyle(.plain)
            Divider().overlay(Studio.line)
          }
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Studio.canvas)
    .fileImporter(
      isPresented: $picking, allowedContentTypes: [.folder], allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        store.open(url: url)
      }
    }
    .sheet(item: $activeSheet) { sheet in
      switch sheet {
      case .capture:
        NoteEditorSheet(
          heading: "Capture", confirmLabel: "Keep", initialTitle: "", initialBody: "",
          onSave: { title, body in store.capture(title: title, body: body) },
          onClose: { activeSheet = nil })
      case .edit(let editable):
        NoteEditorSheet(
          heading: "Edit", confirmLabel: "Save",
          initialTitle: editable.note.title ?? "", initialBody: editable.note.body,
          onSave: { title, body in store.saveEdit(editable, title: title, body: body) },
          onClose: { activeSheet = nil })
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
      Button("Choose folder…") { picking = true }
        .font(StudioFont.control)
        .foregroundStyle(Studio.link)
    }
    .padding(.bottom, 4)
    .overlay(alignment: .bottom) { Divider().overlay(Studio.line) }
  }

  private func noteRow(_ note: NoteSummary) -> some View {
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

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          TextField("Title (optional)", text: $noteTitle)
            .font(StudioFont.cardTitle)
            .foregroundStyle(Studio.inkStrong)
            .accessibilityIdentifier("note-title-field")
          Divider().overlay(Studio.line)
          TextEditor(text: $noteText)
            .font(StudioFont.pageSubtitle)
            .foregroundStyle(Studio.inkStrong)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 220)
            .accessibilityIdentifier("note-body-editor")
          Text("Notice what is changing. Fifteen minutes still counts.")
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkFaint)
        }
        .padding(24)
      }
      .background(Studio.canvas)
      .navigationTitle(heading)
      .toolbar {
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

#Preview {
  RootView()
}
