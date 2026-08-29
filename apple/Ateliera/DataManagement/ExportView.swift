import SwiftUI

// Create a portable ZIP backup of the Studio and share it. The ZIP is the same
// portable-vault format the web app reads, so a backup moves between apps.
struct ExportView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var exportURL: URL?
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("A portable backup is a single ZIP of your Markdown and settings — readable by the web Studio too. Disposable caches are left out.")
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)

        Button("Prepare a backup") { prepare() }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("export-prepare")

        if let exportURL {
          ShareLink(item: exportURL) {
            Label("Share backup", systemImage: "square.and.arrow.up")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .accessibilityIdentifier("export-share")
          Text("Ready: \(exportURL.lastPathComponent)")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        }
        if let error {
          Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Export")
  }

  private func prepare() {
    do {
      let data = try VaultExporter.export(store: store, generatedAt: NoteFactory.isoTimestamp())
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("Ateliera-backup.zip")
      try data.write(to: url)
      exportURL = url
      error = nil
    } catch {
      self.error = "Couldn't prepare the backup: \(error)"
    }
  }
}
