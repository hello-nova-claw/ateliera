import SwiftUI

// The Identity Studio room: a "currently becoming" hero, then the seven sections,
// each with its cards and an add form. Practicing-now cards can be promoted to the
// hero; reflection/celebration evidence shows beneath the card it points to.
struct IdentityRoomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var identity: IdentityStore
  @State private var addingSection: IdentitySection?

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _identity = State(initialValue: IdentityStore(store: store))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      header
        .padding(.horizontal, 24)
        .padding(.top, 24)
      List {
        if let becoming = identity.model.currentlyBecoming {
          currentlyBecoming(becoming)
            .studioRoomRow(EdgeInsets(top: 8, leading: 24, bottom: 8, trailing: 24))
        }
        ForEach(IdentitySection.allCases, id: \.self) { section in
          sectionView(section)
        }
      }
      .studioRoomList(theme.canvas)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.canvas)
    .navigationTitle("Identity Studio")
    .sheet(item: $addingSection) { section in
      IdentityAddView(
        section: section,
        onSave: { title, body in identity.add(section: section, title: title, body: body) },
        onClose: { addingSection = nil })
        .studioTheme(theme)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("WHO YOU ARE BECOMING")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Identity Studio")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
    }
  }

  private func currentlyBecoming(_ card: IdentityCardModel) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("CURRENTLY BECOMING")
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.vision)
      Text(card.title).font(StudioFont.section).foregroundStyle(theme.inkStrong)
      if !card.excerpt.isEmpty {
        Text(card.excerpt).font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
    .accessibilityIdentifier("currently-becoming")
  }

  @ViewBuilder
  private func sectionView(_ section: IdentitySection) -> some View {
    let cards = identity.model.sections[section] ?? []
    Section {
      ForEach(cards) { card in
        cardRow(card, section: section)
          .studioRoomRow()
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
              _ = store.setNoteStatus(path: card.path, status: "trashed")
              identity.refresh()
            } label: { Label("Delete", systemImage: "trash") }
            Button {
              _ = store.setNoteStatus(path: card.path, status: "archived")
              identity.refresh()
            } label: { Label("Archive", systemImage: "archivebox") }
            .tint(theme.inkMuted)
          }
      }
      Button {
        addingSection = section
      } label: {
        Label("Add", systemImage: "plus.circle").font(StudioFont.control).foregroundStyle(theme.link)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("add-\(section.rawValue)")
      .studioRoomRow()
    } header: {
      VStack(alignment: .leading, spacing: 3) {
        Text(section.label).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        Text(section.prompt)
          .font(StudioFont.meta).foregroundStyle(theme.inkSoft)
          .fixedSize(horizontal: false, vertical: true)
      }
      .textCase(nil)
      .accessibilityIdentifier("section-\(section.rawValue)")
      .studioRoomRow(EdgeInsets(top: 16, leading: 24, bottom: 4, trailing: 24))
    }
  }

  @ViewBuilder
  private func cardRow(_ card: IdentityCardModel, section: IdentitySection) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(alignment: .top, spacing: 10) {
        Button { onOpen(card.path) } label: {
          VStack(alignment: .leading, spacing: 3) {
            Text(card.title).font(StudioFont.body).foregroundStyle(theme.inkStrong)
            if !card.excerpt.isEmpty {
              Text(card.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if section == .practicingNow {
          Button("Make current") { _ = identity.promote(noteId: card.id) }
            .font(StudioFont.meta).foregroundStyle(theme.link)
            .accessibilityIdentifier("promote-\(card.id)")
        }
      }
      ForEach(card.evidence) { evidence in
        Text("Evidence · \(evidence.title)")
          .font(StudioFont.eyebrow).tracking(0.4).foregroundStyle(theme.inkFaint)
          .accessibilityIdentifier("evidence-\(evidence.id)")
      }
    }
    .padding(.vertical, 8)
  }
}

// A small capture form for adding a card to an identity section.
private struct IdentityAddView: View {
  @Environment(\.studioTheme) private var theme
  let section: IdentitySection
  let onSave: (_ title: String?, _ body: String) -> Bool
  let onClose: () -> Void
  @State private var title = ""
  @State private var noteBody = ""

  private var canSave: Bool { !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text(section.prompt)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
          GuidedField(description: Identity.titleGuidance.description) {
            TextField(Identity.titleGuidance.example, text: $title)
              .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("identity-title-field")
          }
          Divider().overlay(theme.line)
          GuidedField(description: section.guidance.description) {
            GuidedEditor(
              text: $noteBody, example: section.guidance.example,
              minHeight: 160, accessibilityId: "identity-body-editor")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Add — \(section.label)").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
            if onSave(t.isEmpty ? nil : t, noteBody) { onClose() }
          }
          .disabled(!canSave)
          .accessibilityIdentifier("identity-save-button")
        }
      }
    }
  }
}

extension IdentitySection: Identifiable {
  var id: String { rawValue }
}
