import SwiftUI

// The note's link neighbourhood, reached from the editor's "Links" screen: which notes
// link here ("Notes that link here"), and where this note links out to ("This note
// links to") — each resolved link tappable, each unresolved one labelled plainly.
// Read-only over the disposable P4 index.
struct BacklinksView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let sourcePath: String
  let onNavigate: (String) -> Void  // note path

  private var backlinks: [Backlink] { store.backlinks(path: sourcePath) }
  private var forwardLinks: [ForwardLink] { store.forwardLinks(path: sourcePath) }

  var body: some View {
    List {
      Section {
        Text("How this note connects to the rest of your Studio. Tap a link to open it.")
          .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
          .studioRoomRow(EdgeInsets(top: 12, leading: 24, bottom: 4, trailing: 24))
      }

      Section {
        if backlinks.isEmpty {
          emptyRow("No notes link here yet.")
        } else {
          ForEach(backlinks, id: \.id) { back in
            linkRow(title: back.title.isEmpty ? "Untitled" : back.title, hint: nil) {
              onNavigate(back.path)
            }
            .accessibilityIdentifier("backlink-\(back.id)")
          }
        }
      } header: {
        sectionHeader("Notes that link here", count: backlinks.count)
      }

      Section {
        if forwardLinks.isEmpty {
          emptyRow("This note doesn't link out yet.")
        } else {
          ForEach(Array(forwardLinks.enumerated()), id: \.offset) { _, forward in
            forwardRow(forward)
          }
        }
      } header: {
        sectionHeader("This note links to", count: forwardLinks.count)
      }
    }
    .studioRoomList(theme.canvas)
    .navigationTitle("Links")
  }

  @ViewBuilder
  private func forwardRow(_ forward: ForwardLink) -> some View {
    let label = forward.link.label.isEmpty ? forward.link.target : forward.link.label
    switch forward.state {
    case .resolved(let id):
      linkRow(title: label, hint: nil) {
        if let path = store.path(forNoteId: id) { onNavigate(path) }
      }
    case .broken:
      linkRow(title: label, hint: "no match yet", action: nil)
    case .ambiguous:
      linkRow(title: label, hint: "several matches", action: nil)
    }
  }

  private func sectionHeader(_ title: String, count: Int) -> some View {
    HStack {
      Text(title.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
      if count > 0 {
        Text("\(count)").font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      }
    }
    .textCase(nil)
    .studioRoomRow(EdgeInsets(top: 16, leading: 24, bottom: 4, trailing: 24))
  }

  private func linkRow(title: String, hint: String?, action: (() -> Void)?) -> some View {
    Button {
      action?()
    } label: {
      HStack(spacing: 10) {
        Text(title)
          .font(StudioFont.body).foregroundStyle(action == nil ? theme.inkMuted : theme.link)
        Spacer(minLength: 0)
        if let hint {
          Text(hint)
            .font(StudioFont.eyebrow).tracking(0.4)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(theme.sunken))
            .foregroundStyle(theme.inkFaint)
        } else if action != nil {
          Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(action == nil)
    .studioRoomRow(EdgeInsets(top: 10, leading: 24, bottom: 10, trailing: 24))
  }

  private func linkRow(title: String, hint: String?, action: @escaping () -> Void) -> some View {
    linkRow(title: title, hint: hint, action: Optional(action))
  }

  private func emptyRow(_ text: String) -> some View {
    Text(text).font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      .studioRoomRow(EdgeInsets(top: 4, leading: 24, bottom: 4, trailing: 24))
  }
}
