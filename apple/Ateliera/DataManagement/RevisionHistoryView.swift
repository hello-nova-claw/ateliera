import SwiftUI

// Point-in-time snapshots (e.g. the version kept before a conflict overwrite). Each
// can be restored, writing its files back to their original paths.
struct RevisionHistoryView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var snapshots: [RevisionSnapshot] = []
  @State private var status: String?

  private var revisions: RevisionStore { RevisionStore(store: store) }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if let status {
          Text(status).font(StudioFont.meta).foregroundStyle(theme.growth).padding(.bottom, 12)
        }
        if snapshots.isEmpty {
          Text("No saved versions yet. The Studio keeps one whenever it resolves a conflict.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .fixedSize(horizontal: false, vertical: true).padding(.vertical, 20)
        } else {
          ForEach(snapshots) { snapshot in
            row(snapshot)
            Divider().overlay(theme.line)
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("History")
    .onAppear { snapshots = revisions.list() }
  }

  private func row(_ snapshot: RevisionSnapshot) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(snapshot.manifest.reason.replacingOccurrences(of: "-", with: " ").capitalized)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      Text(snapshot.manifest.createdAt).font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      Text("\(snapshot.manifest.files.count) file\(snapshot.manifest.files.count == 1 ? "" : "s")")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
      Button("Restore this version") {
        if revisions.restore(snapshot) {
          status = "Restored \(snapshot.manifest.files.count) file(s)."
        } else {
          status = store.error ?? "Couldn't restore."
        }
      }
      .font(StudioFont.control).foregroundStyle(theme.link)
      .accessibilityIdentifier("restore-\(snapshot.id)")
    }
    .padding(.vertical, 14)
  }
}
