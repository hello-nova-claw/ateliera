import SwiftUI

// A classified capture sheet reachable from the Foyer: place a note as a Foyer card
// (a becoming, a feeling, a guiding principle) or keep a quick note. The heading,
// prompt, and placeholder follow the chosen placement's guidance. Routes through the
// tested classified write path.
struct ClassifiedCaptureSheet: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onClose: () -> Void

  @State private var slot = 0  // 0 = quick note, 1…3 = Foyer slots
  @State private var titleText = ""
  @State private var draft = ""

  private let placements: [(label: String, destination: CaptureDestination, guidance: CaptureGuidance)] = [
    ("Quick note", .quickCapture, .generic),
    ("Becoming", .foyer(.becoming), .foyer(.becoming)),
    ("Feeling", .foyer(.feeling), .foyer(.feeling)),
    ("Principle", .foyer(.principle), .foyer(.principle)),
  ]

  private var guidance: CaptureGuidance { placements[slot].guidance }
  private var canSave: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Picker("Placement", selection: $slot) {
            ForEach(placements.indices, id: \.self) { Text(placements[$0].label).tag($0) }
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
          Button("Keep") {
            let title = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
            if store.capture(
              title: title.isEmpty ? nil : title, body: draft,
              destination: placements[slot].destination)
            {
              onClose()
            }
          }
          .disabled(!canSave)
          .accessibilityIdentifier("classified-keep")
        }
      }
    }
  }
}
