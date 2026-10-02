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
  @State private var retiring: BecomingModel?  // the becoming awaiting a retire reason

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
        becomingsSection
        ForEach(IdentitySection.allCases, id: \.self) { section in
          sectionView(section)
        }
        retiredSection
      }
      .studioRoomList(theme.canvas)
    }
    .confirmationDialog(
      "Retire this becoming?",
      isPresented: Binding(get: { retiring != nil }, set: { if !$0 { retiring = nil } }),
      presenting: retiring
    ) { becoming in
      ForEach(BecomingRetireReason.allCases) { reason in
        Button(reason.label) {
          _ = identity.retireBecoming(path: becoming.path, reason: reason.rawValue)
          retiring = nil
        }
      }
      Button("Just archive") {
        _ = identity.retireBecoming(path: becoming.path, reason: nil)
        retiring = nil
      }
      Button("Cancel", role: .cancel) { retiring = nil }
    } message: { becoming in
      Text(becoming.title)
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
      if card.hasExplicitTitle, !card.excerpt.isEmpty {
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

  // Active becomings — several in play at once, one per area of life. Each can be
  // retired (with a reason) when it's complete or no longer wanted.
  @ViewBuilder
  private var becomingsSection: some View {
    let becomings = identity.model.activeBecomings
    if !becomings.isEmpty {
      Section {
        ForEach(becomings) { becoming in
          becomingRow(becoming).studioRoomRow()
        }
      } header: {
        sectionHeader("Becomings", "What you're growing into — one for each area of life.")
      }
    }
  }

  private func becomingRow(_ becoming: BecomingModel) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Button { onOpen(becoming.path) } label: {
        VStack(alignment: .leading, spacing: 3) {
          Text(becoming.title).font(StudioFont.body).foregroundStyle(theme.inkStrong)
          if let area = identity.areaTitle(becoming.lifeAreaId) {
            Text(area.uppercased())
              .font(StudioFont.eyebrow).tracking(0.4).foregroundStyle(theme.inkFaint)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Button("Retire…") { retiring = becoming }
        .font(StudioFont.meta).foregroundStyle(theme.link)
        .accessibilityIdentifier("retire-becoming-\(becoming.id)")
    }
    .padding(.vertical, 8)
    .accessibilityIdentifier("becoming-\(becoming.id)")
  }

  // Retired becomings — set down, and why. Kept together so the history reads clearly;
  // each can be brought back into play.
  @ViewBuilder
  private var retiredSection: some View {
    let retired = identity.model.retiredBecomings
    if !retired.isEmpty {
      Section {
        ForEach(retired) { becoming in
          retiredRow(becoming).studioRoomRow()
        }
      } header: {
        sectionHeader("Retired becomings", "Set down, and why — kept so the story stays clear.")
      }
    }
  }

  private func retiredRow(_ becoming: RetiredBecomingModel) -> some View {
    HStack(alignment: .top, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text(becoming.title).font(StudioFont.body).foregroundStyle(theme.inkMuted)
        Text(retiredSubtitle(becoming))
          .font(StudioFont.eyebrow).tracking(0.4).foregroundStyle(theme.inkFaint)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button("Restore") { _ = identity.restoreBecoming(path: becoming.path) }
        .font(StudioFont.meta).foregroundStyle(theme.link)
        .accessibilityIdentifier("restore-becoming-\(becoming.id)")
    }
    .padding(.vertical, 8)
    .accessibilityIdentifier("retired-becoming-\(becoming.id)")
  }

  private func retiredSubtitle(_ becoming: RetiredBecomingModel) -> String {
    let reason = BecomingRetireReason.label(forRaw: becoming.reason)
    if let area = identity.areaTitle(becoming.lifeAreaId) { return "\(area) · \(reason)" }
    return reason
  }

  private func sectionHeader(_ title: String, _ subtitle: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      Text(subtitle)
        .font(StudioFont.meta).foregroundStyle(theme.inkSoft)
        .fixedSize(horizontal: false, vertical: true)
    }
    .textCase(nil)
    .studioRoomRow(EdgeInsets(top: 16, leading: 24, bottom: 4, trailing: 24))
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
            if card.hasExplicitTitle, !card.excerpt.isEmpty {
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
