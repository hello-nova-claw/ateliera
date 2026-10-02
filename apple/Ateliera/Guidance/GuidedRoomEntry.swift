import SwiftUI

// A room's single inviting entry point, shared by the Reflection and celebration rooms.
// It leads with ONE opening prompt (no wall of options, no blank page). Answering it
// captures a real note at the kind's destination, then the same one-prompt-at-a-time
// `GuidedThreadView` opens on that seed so the follow-ups unspool — gentle, skippable,
// resumable. Nothing is forced: you can begin, or just look at what you've kept.
struct GuidedRoomEntry: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let kind: GuidedThreadKind
  // Called once the opener's note is written (so the room can refresh its list).
  var onCaptured: () -> Void = {}

  @State private var draft = ""
  @State private var seed: GuidedThreadView.Seed?

  private var opening: ThreadPrompt { kind.opening }
  private var canBegin: Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(opening.eyebrow.uppercased())
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text(opening.prompt)
        .font(StudioFont.section).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      ZStack(alignment: .topLeading) {
        if draft.isEmpty {
          Text(opening.placeholder)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
            .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
        }
        TextEditor(text: $draft)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
          .scrollContentBackground(.hidden).frame(minHeight: 96)
          .accessibilityIdentifier("guided-opening-editor")
      }
      .padding(12)
      .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
      HStack {
        Spacer()
        Button("Begin", action: begin)
          .font(StudioFont.control).foregroundStyle(theme.link)
          .disabled(!canBegin)
          .accessibilityIdentifier("guided-opening-begin")
      }
    }
    .sheet(item: $seed) { seed in
      GuidedThreadView(
        store: store, seedPath: seed.path, seedText: seed.text, kind: kind,
        onClose: { self.seed = nil })
        .studioTheme(theme)
    }
  }

  private func begin() {
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty,
      let path = store.captureGuidedOpening(kind: kind, title: nil, body: body)
    else { return }
    draft = ""
    onCaptured()
    seed = GuidedThreadView.Seed(path: path, text: body)
  }
}
