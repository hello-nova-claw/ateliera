import SwiftUI

// The one way in: a single guided capture. You choose an intention — plan a little of
// your life (a becoming that opens the guided Landscape thread), celebrate something, or
// leave a dream — and the heading, prompt, and placeholder follow that choice. There is
// no ungated "quick note": every capture is guided. Routes through the tested classified
// write path.
struct ClassifiedCaptureSheet: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  // Life planning captures the becoming statement, then hands its path + text up so the
  // guided Become thread can open on it.
  let onStartThread: (_ seedPath: String, _ seedText: String) -> Void
  // Gratitude / dream capture the entry, then open their own guided thread on it.
  let onStartGuided: (_ kind: GuidedThreadKind, _ seedPath: String, _ seedText: String) -> Void
  let onClose: () -> Void

  enum Intention: Int, CaseIterable, Identifiable {
    case lifePlanning, gratitude, dream
    var id: Int { rawValue }

    var label: String {
      switch self {
      case .lifePlanning: return "Life planning"
      case .gratitude: return "Gratitude"
      case .dream: return "Dream"
      }
    }

    var guidance: CaptureGuidance {
      switch self {
      case .lifePlanning: return .foyer(.becoming)
      case .gratitude: return .celebration
      case .dream: return .dream
      }
    }

    var confirmLabel: String { self == .lifePlanning ? "Begin" : "Keep" }
  }

  @State private var intention: Intention = .lifePlanning
  @State private var titleText = ""
  @State private var draft = ""

  private var guidance: CaptureGuidance { intention.guidance }
  private var canSave: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Picker("Intention", selection: $intention) {
            ForEach(Intention.allCases) { Text($0.label).tag($0) }
          }
          .pickerStyle(.segmented)
          .accessibilityIdentifier("classified-placement")

          Text(guidance.prompt)
            .font(StudioFont.section).foregroundStyle(theme.inkStrong)
          Text(guidance.description)
            .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)

          TextField("A short name (optional)", text: $titleText)
            .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            .accessibilityIdentifier("classified-title")

          ZStack(alignment: .topLeading) {
            if draft.isEmpty {
              Text(guidance.example)
                .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
                .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
            }
            TextEditor(text: $draft)
              .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
              .scrollContentBackground(.hidden).frame(minHeight: 160)
              .accessibilityIdentifier("classified-body")
          }

          if intention == .lifePlanning {
            Text("You'll be guided from here — an ordinary day, the version of you living it, and what supports it.")
              .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text(guidance.title).font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(intention.confirmLabel) { save() }
            .disabled(!canSave)
            .accessibilityIdentifier("classified-keep")
        }
      }
    }
  }

  private func save() {
    let title = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    let named = title.isEmpty ? nil : title
    switch intention {
    case .lifePlanning:
      // Capture the becoming (it surfaces as "Currently becoming"), then open the thread.
      guard store.capture(title: named, body: body, destination: .foyer(.becoming)),
        let path = store.lastCapturedPath
      else { return }
      onStartThread(path, body)
      onClose()
    case .gratitude:
      guard store.capture(title: named, body: body, destination: .celebration),
        let path = store.lastCapturedPath
      else { return }
      onStartGuided(.gratitude, path, body)
      onClose()
    case .dream:
      guard store.capture(title: named, body: body, destination: .uncharted(beyond: false)),
        let path = store.lastCapturedPath
      else { return }
      onStartGuided(.dream, path, body)
      onClose()
    }
  }
}
