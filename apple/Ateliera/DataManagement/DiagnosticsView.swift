import SwiftUI

// A calm log of recent vault operations (saves, conflicts, failures) for support.
struct DiagnosticsView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var entries: [DiagnosticEntry] = []

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if entries.isEmpty {
          Text("Nothing recorded yet.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .padding(.vertical, 20)
        } else {
          ForEach(entries) { entry in
            row(entry)
            Divider().overlay(theme.line)
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Diagnostics")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Clear") {
          store.diagnostics.clear()
          entries = []
        }
        .accessibilityIdentifier("diagnostics-clear")
      }
    }
    .onAppear { entries = store.diagnostics.entries }
  }

  private func row(_ entry: DiagnosticEntry) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack {
        Text(entry.operation).font(StudioFont.body).foregroundStyle(theme.inkStrong)
        Spacer()
        Text(entry.outcome)
          .font(StudioFont.eyebrow).tracking(0.6)
          .padding(.horizontal, 7).padding(.vertical, 2)
          .background(Capsule().fill(theme.sunken))
          .foregroundStyle(colour(for: entry.outcome))
      }
      Text(entry.occurredAt).font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      if let code = entry.errorCode {
        Text(code).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.vertical, 12)
  }

  private func colour(for outcome: String) -> Color {
    switch outcome {
    case "success": return theme.growth
    case "conflict": return theme.vision
    default: return theme.celebration
    }
  }
}
