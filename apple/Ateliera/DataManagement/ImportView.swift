import SwiftUI
import UniformTypeIdentifiers

// Import a portable ZIP backup: pick a `.zip`, preview what it will add or replace,
// then apply it atomically.
struct ImportView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var picking = false
  @State private var plan: ImportPlan?
  @State private var status: String?
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("Bring in a portable backup ZIP — new notes are added, and matching paths are replaced.")
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)

        Button("Choose a backup…") { picking = true }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("import-choose")

        if let plan {
          VStack(alignment: .leading, spacing: 6) {
            Text("\(plan.createCount) new · \(plan.overwriteCount) replaced")
              .font(StudioFont.body).foregroundStyle(theme.inkStrong)
            Button("Apply backup") { apply(plan) }
              .font(StudioFont.control).foregroundStyle(theme.link)
              .accessibilityIdentifier("import-apply")
          }
          .padding(14)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(RoundedRectangle(cornerRadius: 10).fill(theme.surface))
          .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(theme.line, lineWidth: 1))
        }
        if let status {
          Text(status).font(StudioFont.meta).foregroundStyle(theme.growth)
        }
        if let error {
          Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Import")
    .fileImporter(isPresented: $picking, allowedContentTypes: [.zip]) { result in
      guard case .success(let url) = result else { return }
      loadPlan(from: url)
    }
  }

  private func loadPlan(from url: URL) {
    let accessing = url.startAccessingSecurityScopedResource()
    defer { if accessing { url.stopAccessingSecurityScopedResource() } }
    do {
      let data = try Data(contentsOf: url)
      plan = try VaultImporter.prepare(archive: data, store: store)
      status = nil
      error = nil
    } catch {
      self.error = "Couldn't read that backup: \(error)"
    }
  }

  private func apply(_ plan: ImportPlan) {
    if VaultImporter.apply(plan: plan, store: store) {
      status = "Imported \(plan.items.count) file\(plan.items.count == 1 ? "" : "s")."
      self.plan = nil
    } else {
      error = store.error ?? "Import failed."
    }
  }
}
