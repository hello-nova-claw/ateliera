import SwiftUI

// The Uncharted room: a gentle composer for possibilities that don't need a plan yet,
// and two sections — "Near" (things stirring now) and "Beyond the gate" (further off).
struct UnchartedView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var uncharted: UnchartedStore
  @State private var draft = ""
  @State private var beyond = false

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _uncharted = State(initialValue: UnchartedStore(store: store))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 24) {
        header
        composer
      }
      .padding(.horizontal, 24)
      .padding(.top, 24)

      List {
        section("Near", cards: uncharted.near, empty: "Nothing stirring yet.")
        section(
          "Beyond the gate", cards: uncharted.beyond,
          empty: "Nothing left beyond the gate yet.")
      }
      .studioRoomList(theme.canvas)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.canvas)
    .navigationTitle("Uncharted")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("LEAVE ROOM FOR POSSIBILITY")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Uncharted")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
      Text("Keep possibilities that don't need a plan yet.")
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
    }
  }

  private var composer: some View {
    VStack(alignment: .leading, spacing: 10) {
      ZStack(alignment: .topLeading) {
        if draft.isEmpty {
          Text("What if…?")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
            .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
        }
        TextEditor(text: $draft)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
          .scrollContentBackground(.hidden).frame(minHeight: 90)
          .accessibilityIdentifier("uncharted-editor")
      }
      HStack {
        Toggle("Leave this beyond the gate", isOn: $beyond)
          .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
          .toggleStyle(.switch)
          .accessibilityIdentifier("beyond-toggle")
        Spacer()
        Button("Keep") {
          let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !body.isEmpty else { return }
          if uncharted.keep(body: body, beyond: beyond) {
            draft = ""
            beyond = false
          }
        }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityIdentifier("uncharted-keep")
      }
    }
    .padding(16)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
  }

  @ViewBuilder
  private func section(_ title: String, cards: [UnchartedCard], empty: String) -> some View {
    Section {
      if cards.isEmpty {
        Text(empty).font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          .studioRoomRow()
      } else {
        ForEach(cards) { card in
          Button { onOpen(card.path) } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(card.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              if !card.excerpt.isEmpty {
                Text(card.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                  .lineLimit(3).fixedSize(horizontal: false, vertical: true)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .studioRoomRow()
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
              _ = store.setNoteStatus(path: card.path, status: "trashed")
              uncharted.refresh()
            } label: { Label("Delete", systemImage: "trash") }
            Button {
              _ = store.setNoteStatus(path: card.path, status: "archived")
              uncharted.refresh()
            } label: { Label("Archive", systemImage: "archivebox") }
            .tint(theme.inkMuted)
          }
        }
      }
    } header: {
      Text(title.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
        .textCase(nil)
        .studioRoomRow(EdgeInsets(top: 12, leading: 24, bottom: 4, trailing: 24))
    }
  }
}
