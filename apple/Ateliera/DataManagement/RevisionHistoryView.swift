import SwiftUI

// Point-in-time snapshots (e.g. the version kept before a conflict overwrite). Each
// can be restored, writing its files back to their original paths, once the person has
// seen which files that replaces.
struct RevisionHistoryView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var snapshots: [RevisionSnapshot] = []
  @State private var status: String?
  @State private var pending: RestorePlan?

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
    .confirmationDialog(
      String(localized: "Restore this version?", comment: "Title of the restore confirmation"),
      isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }),
      titleVisibility: .visible, presenting: pending
    ) { plan in
      Button(String(localized: "Restore", comment: "Confirms restoring a saved version")) {
        confirm(plan)
      }
      .accessibilityIdentifier("confirm-restore")
      Button(String(localized: "Cancel", comment: "Closes the restore confirmation"), role: .cancel)
      {}
    } message: { plan in
      Text(
        String(
          localized: "This replaces:\n\(plan.paths.joined(separator: "\n"))",
          comment: "Lists the vault files a restore will replace, one per line"))
    }
  }

  private func confirm(_ plan: RestorePlan) {
    pending = nil
    let count = plan.changes.count
    if revisions.restore(plan) {
      status =
        count == 1
        ? String(localized: "Restored 1 file.", comment: "Shown after restoring one file")
        : String(
          localized: "Restored \(count) files.",
          comment: "Shown after a restore. The placeholder is the number of files written.")
    } else if revisions.planRestore(plan.snapshot) == nil {
      status = Self.failedChecks
    } else {
      status = String(
        localized:
          "Nothing was restored. A file changed after you chose this version, so try again.",
        comment: "Shown when a restore finds a file changed since it was confirmed")
    }
  }

  private static let failedChecks = String(
    localized:
      "This saved version can't be restored: it didn't pass its checks, or a file it replaces can't be read.",
    comment: "Shown when a saved version's files or manifest have changed, or a file is unreadable")

  private func row(_ snapshot: RevisionSnapshot) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(snapshot.manifest.reason.replacingOccurrences(of: "-", with: " ").capitalized)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      Text(snapshot.manifest.createdAt).font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      Text("\(snapshot.manifest.files.count) file\(snapshot.manifest.files.count == 1 ? "" : "s")")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
      Button("Restore this version") {
        if let plan = revisions.planRestore(snapshot) {
          if plan.changes.isEmpty {
            status = String(
              localized: "Nothing to restore: your files already match this version.",
              comment: "Shown when every file in a saved version matches the current one")
          } else {
            pending = plan
          }
        } else {
          status = Self.failedChecks
        }
      }
      .font(StudioFont.control).foregroundStyle(theme.link)
      .accessibilityIdentifier("restore-\(snapshot.id)")
    }
    .padding(.vertical, 14)
  }
}
