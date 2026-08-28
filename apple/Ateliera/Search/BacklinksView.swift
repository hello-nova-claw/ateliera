import SwiftUI

// The note's link neighbourhood, shown from the editor's "Links" screen: which
// notes link here (backlinks, "Linked from"), and where this note links out to
// ("Links to") with a resolved / broken / ambiguous badge. Tapping a resolved link
// navigates. Read-only over the disposable P4 index; repair is a later slice.
struct BacklinksView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let sourcePath: String
  let onNavigate: (String) -> Void  // note path

  private var backlinks: [Backlink] { store.backlinks(path: sourcePath) }
  private var forwardLinks: [ForwardLink] { store.forwardLinks(path: sourcePath) }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        section("Linked from") {
          if backlinks.isEmpty {
            emptyLine("No notes link here yet.")
          } else {
            ForEach(backlinks, id: \.id) { back in
              row(title: back.title.isEmpty ? "Untitled" : back.title, badge: nil) {
                onNavigate(back.path)
              }
              .accessibilityIdentifier("backlink-\(back.id)")
            }
          }
        }
        section("Links to") {
          if forwardLinks.isEmpty {
            emptyLine("This note doesn't link out yet.")
          } else {
            ForEach(Array(forwardLinks.enumerated()), id: \.offset) { _, forward in
              forwardRow(forward)
            }
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Links")
  }

  @ViewBuilder
  private func forwardRow(_ forward: ForwardLink) -> some View {
    let label = forward.link.label.isEmpty ? forward.link.target : forward.link.label
    switch forward.state {
    case .resolved(let id):
      row(title: label, badge: nil) {
        if let path = store.path(forNoteId: id) { onNavigate(path) }
      }
    case .broken:
      row(title: label, badge: ("broken", theme.celebration), action: nil)
    case .ambiguous:
      row(title: label, badge: ("ambiguous", theme.vision), action: nil)
    }
  }

  private func section<Content: View>(
    _ title: String, @ViewBuilder _ content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title.uppercased())
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      content()
    }
  }

  private func row(
    title: String, badge: (String, Color)?, action: (() -> Void)?
  ) -> some View {
    Button {
      action?()
    } label: {
      HStack(spacing: 10) {
        Text(title)
          .font(StudioFont.body).foregroundStyle(action == nil ? theme.inkMuted : theme.link)
        Spacer(minLength: 0)
        if let badge {
          Text(badge.0)
            .font(StudioFont.eyebrow).tracking(0.6)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(theme.sunken))
            .foregroundStyle(badge.1)
        } else if action != nil {
          Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
        }
      }
      .padding(.vertical, 10)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(action == nil)
  }

  // Convenience for the tappable variant (no badge).
  private func row(title: String, badge: (String, Color)?, action: @escaping () -> Void) -> some View {
    row(title: title, badge: badge, action: Optional(action))
  }

  private func emptyLine(_ text: String) -> some View {
    Text(text).font(StudioFont.meta).foregroundStyle(theme.inkFaint)
  }
}
