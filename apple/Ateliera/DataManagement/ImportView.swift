import SwiftUI
import UniformTypeIdentifiers

// Import a portable ZIP backup: pick a `.zip`, preview what it will add or replace,
// then apply it atomically.
struct ImportView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @State private var picking = false
  @State private var plan: ImportPlan?
  @State private var resolutions: [String: ImportAction] = [:]
  @State private var status: String?
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text(
          "Bring in a portable backup ZIP — new notes are added, and matching paths are replaced."
        )
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)

        Button("Choose a backup…") { picking = true }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("import-choose")

        if let plan {
          planCard(plan)
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

  @ViewBuilder
  private func planCard(_ plan: ImportPlan) -> some View {
    let tally = plan.counts(resolutions: resolutions)
    let overwrites = plan.items.filter { $0.action == .overwrite }
    VStack(alignment: .leading, spacing: 10) {
      Text("\(tally.created) new · \(tally.replaced) replaced · \(tally.skipped) skipped")
        .font(StudioFont.body).foregroundStyle(theme.inkStrong)

      if !overwrites.isEmpty {
        Text("These paths already exist — keep each replacement, or skip it.")
          .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
        ForEach(Array(overwrites.enumerated()), id: \.element.id) { index, item in
          overwriteRow(item, index: index)
        }
      }

      Button("Apply backup") { apply(plan) }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .accessibilityIdentifier("import-apply")
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 10).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(theme.line, lineWidth: 1))
  }

  @ViewBuilder
  private func overwriteRow(_ item: ImportItem, index: Int) -> some View {
    let binding = Binding(
      get: { resolutions[item.path] == .skip ? ImportAction.skip : .overwrite },
      set: { resolutions[item.path] = $0 })
    VStack(alignment: .leading, spacing: 4) {
      Text(item.path)
        .font(StudioFont.meta).foregroundStyle(theme.inkStrong)
        .lineLimit(1).truncationMode(.middle)
      Picker("Resolution", selection: binding) {
        Text("Replace").tag(ImportAction.overwrite)
        Text("Skip").tag(ImportAction.skip)
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("import-resolution-\(index)")
    }
  }

  private func loadPlan(from url: URL) {
    let accessing = url.startAccessingSecurityScopedResource()
    defer { if accessing { url.stopAccessingSecurityScopedResource() } }
    do {
      let data = try VaultImporter.readArchive(at: url)
      plan = try VaultImporter.prepare(archive: data, store: store)
      resolutions = [:]
      status = nil
      error = nil
    } catch {
      plan = nil
      self.error =
        (error as? ImportError)?.message
        ?? String(
          localized: "Couldn't read that backup. Nothing was imported.",
          comment: "Import refused for a reason with no message of its own")
    }
  }

  private func apply(_ plan: ImportPlan) {
    let tally = plan.counts(resolutions: resolutions)
    if VaultImporter.apply(plan: plan, resolutions: resolutions, store: store) {
      status =
        "Imported: \(tally.created) new, \(tally.replaced) replaced, \(tally.skipped) skipped."
      self.plan = nil
      resolutions = [:]
    } else {
      error = store.error ?? "Import failed."
    }
  }
}
