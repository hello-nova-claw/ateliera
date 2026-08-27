import SwiftUI
import UniformTypeIdentifiers

// The Reflection Garden as a real room: its notes are read from the vault through
// the Rust core (VaultStore). The Studio folder is a user-picked, security-scoped
// iCloud folder via the native `.fileImporter`, or a seeded fixture in the sim.
struct RootView: View {
  @State private var store = VaultStore()
  @State private var picking = false
  @State private var capturing = false

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
          capturing = true
        } label: {
          Label("Add a reflection", systemImage: "plus.circle.fill")
            .font(StudioFont.control)
            .foregroundStyle(Studio.link)
        }
        .buttonStyle(.plain)

        if let error = store.error {
          Text(error).font(StudioFont.meta).foregroundStyle(Studio.celebration)
        }

        VStack(spacing: 0) {
          ForEach(store.notes) { note in
            noteRow(note)
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
    .sheet(isPresented: $capturing) {
      CaptureSheet(store: store, isPresented: $capturing)
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

// A quick capture: an optional title and the reflection itself. "Keep" writes a
// new note to the vault through the Rust core (VaultStore.capture) and dismisses.
private struct CaptureSheet: View {
  let store: VaultStore
  @Binding var isPresented: Bool
  @State private var noteTitle = ""
  @State private var noteText = ""

  private var canKeep: Bool {
    !noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          TextField("Title (optional)", text: $noteTitle)
            .font(StudioFont.cardTitle)
            .foregroundStyle(Studio.inkStrong)
          Divider().overlay(Studio.line)
          TextEditor(text: $noteText)
            .font(StudioFont.pageSubtitle)
            .foregroundStyle(Studio.inkStrong)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 220)
          Text("Notice what is changing. Fifteen minutes still counts.")
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkFaint)
        }
        .padding(24)
      }
      .background(Studio.canvas)
      .navigationTitle("Capture")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { isPresented = false }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Keep") {
            if store.capture(title: noteTitle, body: noteText) { isPresented = false }
          }
          .disabled(!canKeep)
        }
      }
    }
  }
}

#Preview {
  RootView()
}
