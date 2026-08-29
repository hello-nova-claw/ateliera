import SwiftUI

// The Wisdom Garden: keep ideas of seven kinds, theme them (with a theme editor and a
// "make it mine" composer), filter by theme, and synthesize several into a new
// synthesis card.
struct WisdomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var wisdom: WisdomStore
  @State private var adding = false
  @State private var activeTheme: String?
  @State private var selected: Set<String> = []
  @State private var synthesizing = false
  @State private var editingThemes = false
  @State private var makingMine = false

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _wisdom = State(initialValue: WisdomStore(store: store))
  }

  private var cards: [WisdomCard] {
    guard let active = activeTheme else { return wisdom.projection.cards }
    return wisdom.projection.cards.filter { $0.themes.contains(active) }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 22) {
        header
        themeFilter
        if let active = activeTheme {
          Button("Make “\(themeTitle(active))” mine") { makingMine = true }
            .font(StudioFont.control).foregroundStyle(theme.link)
            .accessibilityIdentifier("wisdom-make-mine")
        }
        if !selected.isEmpty {
          Button("Synthesize \(selected.count)") { synthesizing = true }
            .font(StudioFont.control).foregroundStyle(theme.link)
            .disabled(selected.count < 2)
            .accessibilityIdentifier("synthesize-button")
        }
      }
      .padding(.horizontal, 24)
      .padding(.top, 22)

      List {
        if cards.isEmpty {
          Text("Nothing kept here yet.").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .studioRoomRow()
        } else {
          ForEach(cards) { card in
            WisdomCardRow(
              card: card, selected: selected.contains(card.id),
              onOpen: { onOpen(card.path) },
              onToggleSelect: { toggle(card.id) })
              .studioRoomRow()
              .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) {
                  _ = store.setNoteStatus(path: card.path, status: "trashed")
                  wisdom.refresh()
                } label: { Label("Delete", systemImage: "trash") }
                Button {
                  _ = store.setNoteStatus(path: card.path, status: "archived")
                  wisdom.refresh()
                } label: { Label("Archive", systemImage: "archivebox") }
                .tint(theme.inkMuted)
              }
          }
        }
      }
      .studioRoomList(theme.canvas)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.canvas)
    .navigationTitle("Wisdom Garden")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Add") { adding = true }.accessibilityIdentifier("add-idea-button")
      }
      ToolbarItem(placement: .secondaryAction) {
        Button("Edit themes") { editingThemes = true }.accessibilityIdentifier("edit-themes-button")
      }
    }
    .sheet(isPresented: $adding) {
      WisdomAddView(themes: wisdom.projection.themes, onSave: keepIdea, onClose: { adding = false })
        .studioTheme(theme)
    }
    .sheet(isPresented: $editingThemes) {
      WisdomThemesView(wisdom: wisdom, onClose: { editingThemes = false })
        .studioTheme(theme)
    }
    .sheet(isPresented: $makingMine) {
      if let active = activeTheme {
        WisdomMakeMineView(
          themeTitle: themeTitle(active),
          onSave: { body in wisdom.makeItMine(themeId: active, body: body) },
          onClose: { makingMine = false })
          .studioTheme(theme)
      }
    }
    .sheet(isPresented: $synthesizing) {
      WisdomSynthesisView(
        count: selected.count,
        onSave: { title, body in
          let ok = wisdom.synthesize(
            sourceIds: Array(selected), title: title.isEmpty ? nil : title, body: body)
          if ok { selected = [] }
          return ok
        },
        onClose: { synthesizing = false })
        .studioTheme(theme)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("WHAT YOU WANT TO KEEP")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Wisdom Garden")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
    }
  }

  private var themeFilter: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        chip(title: "All ideas", count: wisdom.projection.cards.count, active: activeTheme == nil) {
          activeTheme = nil
        }
        .accessibilityIdentifier("wisdom-theme-all")
        ForEach(wisdom.projection.themes.filter { $0.count > 0 }) { theme in
          chip(title: theme.title, count: theme.count, active: activeTheme == theme.id) {
            activeTheme = theme.id
          }
          .accessibilityIdentifier("wisdom-theme-\(theme.id)")
        }
      }
    }
  }

  private func chip(title: String, count: Int, active: Bool, _ tap: @escaping () -> Void) -> some View {
    Button(action: tap) {
      HStack(spacing: 5) {
        Text(title).font(StudioFont.control)
        Text("\(count)").font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      }
      .padding(.horizontal, 11).padding(.vertical, 6)
      .background(Capsule().fill(active ? theme.accentSoft : theme.sunken))
      .overlay(Capsule().strokeBorder(active ? theme.link : theme.line, lineWidth: 1))
      .foregroundStyle(active ? theme.link : theme.inkMuted)
    }
    .buttonStyle(.plain)
  }

  private func toggle(_ id: String) {
    if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
  }

  private func themeTitle(_ id: String) -> String {
    wisdom.projection.themes.first { $0.id == id }?.title ?? WisdomDomain.titleForTheme(id)
  }

  private func keepIdea(_ input: WisdomAddView.Input) -> Bool {
    let source = input.hasSource
      ? NoteSource(
        title: input.sourceTitle.isEmpty ? nil : input.sourceTitle,
        creator: input.sourceCreator.isEmpty ? nil : input.sourceCreator,
        url: input.sourceURL.isEmpty ? nil : input.sourceURL)
      : nil
    return wisdom.addIdea(
      kind: input.kind, title: input.title.isEmpty ? nil : input.title, body: input.body,
      themes: Array(input.themes), source: source)
  }
}

private struct WisdomCardRow: View {
  @Environment(\.studioTheme) private var theme
  let card: WisdomCard
  let selected: Bool
  let onOpen: () -> Void
  let onToggleSelect: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Button(action: onToggleSelect) {
        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
          .font(.system(size: 18)).foregroundStyle(selected ? theme.link : theme.inkFaint)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("wisdom-select-\(card.id)")
      Button(action: onOpen) {
        VStack(alignment: .leading, spacing: 4) {
          Text(card.kind.uppercased())
            .font(StudioFont.eyebrow).tracking(1.0).foregroundStyle(theme.inkFaint)
          Text(card.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
          if !card.excerpt.isEmpty {
            Text(card.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
              .lineLimit(3).fixedSize(horizontal: false, vertical: true)
          }
          if let creator = card.source?.creator {
            Text("— \(creator)").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .padding(.vertical, 12)
  }
}

private struct WisdomAddView: View {
  struct Input {
    var kind: String
    var title: String
    var body: String
    var themes: Set<String>
    var hasSource: Bool
    var sourceCreator: String
    var sourceTitle: String
    var sourceURL: String
  }

  @Environment(\.studioTheme) private var theme
  let themes: [WisdomThemeCount]
  let onSave: (Input) -> Bool
  let onClose: () -> Void

  @State private var kind = "insight"
  @State private var title = ""
  @State private var noteBody = ""
  @State private var chosen: Set<String> = []
  @State private var showSource = false
  @State private var creator = ""
  @State private var sourceTitle = ""
  @State private var url = ""

  private var canSave: Bool { !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Picker("Kind", selection: $kind) {
            ForEach(WisdomDomain.kinds, id: \.self) { Text($0.capitalized).tag($0) }
          }
          .pickerStyle(.menu).accessibilityIdentifier("wisdom-kind-menu")
          GuidedField(description: WisdomGuidance.title.description) {
            TextField(WisdomGuidance.title.example, text: $title)
              .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("wisdom-title-field")
          }
          GuidedField(description: WisdomGuidance.idea.description) {
            GuidedEditor(
              text: $noteBody, example: WisdomGuidance.idea.example,
              minHeight: 140, accessibilityId: "wisdom-body-editor")
          }
          if !themes.isEmpty {
            Text("THEMES").font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            themeChips
          }
          DisclosureGroup("Source", isExpanded: $showSource) {
            VStack(alignment: .leading, spacing: 12) {
              GuidedField(label: "Creator", description: WisdomGuidance.creator.description) {
                TextField(WisdomGuidance.creator.example, text: $creator)
                  .accessibilityIdentifier("wisdom-source-creator")
              }
              GuidedField(label: "Title", description: WisdomGuidance.sourceTitle.description) {
                TextField(WisdomGuidance.sourceTitle.example, text: $sourceTitle)
              }
              GuidedField(label: "Link", description: WisdomGuidance.sourceUrl.description) {
                TextField(WisdomGuidance.sourceUrl.example, text: $url)
                  .textInputAutocapitalization(.never)
              }
            }
            .font(StudioFont.control).foregroundStyle(theme.inkStrong)
          }
          .font(StudioFont.control).foregroundStyle(theme.inkMuted)
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Add an idea").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Keep") {
            let input = Input(
              kind: kind, title: title, body: noteBody, themes: chosen, hasSource: showSource,
              sourceCreator: creator, sourceTitle: sourceTitle, sourceURL: url)
            if onSave(input) { onClose() }
          }
          .disabled(!canSave).accessibilityIdentifier("wisdom-keep")
        }
      }
    }
  }

  private var themeChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(themes) { theme in
          let on = chosen.contains(theme.id)
          Button {
            if on { chosen.remove(theme.id) } else { chosen.insert(theme.id) }
          } label: {
            Text(theme.title).font(StudioFont.control)
              .padding(.horizontal, 10).padding(.vertical, 6)
              .background(Capsule().fill(on ? self.theme.accentSoft : self.theme.sunken))
              .overlay(Capsule().strokeBorder(on ? self.theme.link : self.theme.line, lineWidth: 1))
              .foregroundStyle(on ? self.theme.link : self.theme.inkMuted)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("wisdom-add-theme-\(theme.id)")
        }
      }
    }
  }
}

// The theme editor: rename or hide the configured themes, and add your own. Writes
// through the store to .studio/config/wisdom-themes.json.
private struct WisdomThemesView: View {
  @Environment(\.studioTheme) private var theme
  @Bindable var wisdom: WisdomStore
  let onClose: () -> Void
  @State private var newTheme = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Text("Name what you keep returning to. Hidden themes stay on your notes but leave the shelf.")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)

          ForEach(wisdom.themePreferences.sorted { $0.order < $1.order }) { pref in
            WisdomThemeRow(
              pref: pref,
              onRename: { wisdom.renameTheme(id: pref.id, title: $0) },
              onToggleHidden: { _ = wisdom.setThemeHidden(id: pref.id, hidden: !pref.hidden) })
            Divider().overlay(theme.line)
          }

          HStack(spacing: 8) {
            TextField("Add a theme", text: $newTheme)
              .font(StudioFont.control).foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("wisdom-new-theme-field")
            Button("Add") {
              if wisdom.addTheme(title: newTheme) { newTheme = "" }
            }
            .font(StudioFont.control).foregroundStyle(theme.link)
            .disabled(newTheme.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityIdentifier("wisdom-add-theme")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Themes").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .confirmationAction) { Button("Done") { onClose() } }
      }
    }
  }

}

private struct WisdomThemeRow: View {
  @Environment(\.studioTheme) private var theme
  let pref: WisdomThemePreference
  let onRename: (String) -> Bool
  let onToggleHidden: () -> Void
  @State private var draft: String

  init(
    pref: WisdomThemePreference, onRename: @escaping (String) -> Bool,
    onToggleHidden: @escaping () -> Void
  ) {
    self.pref = pref
    self.onRename = onRename
    self.onToggleHidden = onToggleHidden
    _draft = State(initialValue: pref.title)
  }

  var body: some View {
    HStack(spacing: 10) {
      TextField("Theme name", text: $draft)
        .font(StudioFont.control).foregroundStyle(pref.hidden ? theme.inkFaint : theme.inkStrong)
        .onSubmit { if !onRename(draft) { draft = pref.title } }
        .accessibilityIdentifier("wisdom-theme-name-\(pref.id)")
      Button(pref.hidden ? "Show" : "Hide") { onToggleHidden() }
        .font(StudioFont.meta).foregroundStyle(theme.link)
        .accessibilityIdentifier("wisdom-theme-toggle-\(pref.id)")
    }
    .padding(.vertical, 8)
  }
}

// "Make it mine": capture a personal belief about the active theme as an insight.
private struct WisdomMakeMineView: View {
  @Environment(\.studioTheme) private var theme
  let themeTitle: String
  let onSave: (_ body: String) -> Bool
  let onClose: () -> Void
  @State private var noteBody = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Text("What do I believe about \(themeTitle)? What have I observed? How would this fit my actual life?")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
          GuidedField(description: WisdomGuidance.makeItMine.description) {
            GuidedEditor(
              text: $noteBody, example: WisdomGuidance.makeItMine.example,
              minHeight: 160, accessibilityId: "wisdom-mine-body")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Make it mine").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Not now") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Keep") {
            if onSave(noteBody) { onClose() }
          }
          .disabled(noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          .accessibilityIdentifier("wisdom-mine-keep")
        }
      }
    }
  }
}

private struct WisdomSynthesisView: View {
  @Environment(\.studioTheme) private var theme
  let count: Int
  let onSave: (_ title: String, _ body: String) -> Bool
  let onClose: () -> Void
  @State private var title = ""
  @State private var noteBody = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Text("Weave \(count) ideas into one.")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          TextField("A name for this synthesis (optional)", text: $title)
            .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
          GuidedField(description: WisdomGuidance.synthesis.description) {
            GuidedEditor(
              text: $noteBody, example: WisdomGuidance.synthesis.example,
              minHeight: 160, accessibilityId: "synthesis-body")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Synthesize").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Keep") {
            if onSave(title, noteBody) { onClose() }
          }
          .disabled(noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          .accessibilityIdentifier("synthesis-keep")
        }
      }
    }
  }
}
