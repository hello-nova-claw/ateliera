import SwiftUI

// The repair panel: broken/ambiguous wiki links you can relink (to a valid title) or
// remove, plus duplicate-id notices. Read from the disposable index; each fix routes
// through the atomic write path and the queue refreshes.
struct RepairView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore

  @State private var items: [RepairItem] = []
  @State private var targets: [String: String] = [:]

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        if items.isEmpty {
          Text("Nothing to repair — every link resolves.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        } else {
          ForEach(items) { item in
            switch item {
            case .brokenLink(let broken): brokenRow(broken)
            case .metadata(let meta): metadataRow(meta)
            }
            Divider().overlay(theme.line)
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Repair")
    .onAppear(perform: refresh)
  }

  private func refresh() {
    items = store.repairQueue()
    for item in items {
      if case .brokenLink(let broken) = item, targets[broken.id] == nil {
        targets[broken.id] = broken.target
      }
    }
  }

  private func brokenRow(_ broken: BrokenLinkItem) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Text("[[\(broken.target)]]")
          .font(StudioFont.body).foregroundStyle(theme.inkStrong)
        Text(broken.isAmbiguous ? "ambiguous" : "broken")
          .font(StudioFont.eyebrow).tracking(0.6)
          .padding(.horizontal, 7).padding(.vertical, 2)
          .background(Capsule().fill(theme.sunken))
          .foregroundStyle(broken.isAmbiguous ? theme.vision : theme.celebration)
      }
      Text("in \(fileName(broken.path))")
        .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      HStack(spacing: 8) {
        TextField(
          "Correct title",
          text: Binding(
            get: { targets[broken.id] ?? broken.target },
            set: { targets[broken.id] = $0 }))
          .font(StudioFont.control).foregroundStyle(theme.inkStrong)
          .textInputAutocapitalization(.never)
          .padding(10)
          .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
          .accessibilityIdentifier("relink-field-\(broken.occurrence)")
        Button("Relink") {
          let target = (targets[broken.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          guard !target.isEmpty else { return }
          _ = store.repairLink(
            path: broken.path, occurrence: broken.occurrence, edit: .relink(kind: .wiki, target: target))
          refresh()
        }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .accessibilityIdentifier("relink-button-\(broken.occurrence)")
        Button("Remove") {
          _ = store.repairLink(path: broken.path, occurrence: broken.occurrence, edit: .remove)
          refresh()
        }
        .font(StudioFont.control).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("remove-button-\(broken.occurrence)")
      }
    }
    .padding(.vertical, 10)
  }

  private func metadataRow(_ meta: MetadataItem) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(fileName(meta.path)).font(StudioFont.body).foregroundStyle(theme.inkStrong)
      Text(meta.message).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, 10)
  }

  private func fileName(_ path: String) -> String {
    (path as NSString).lastPathComponent
  }
}
