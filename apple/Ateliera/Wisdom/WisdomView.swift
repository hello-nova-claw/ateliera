import SwiftUI

// The Wisdom Garden: keep ideas of seven kinds, theme them, filter by theme, and
// synthesize several into a new synthesis card. (Theme editing + "make it mine" are
// documented follow-ups.)
struct WisdomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var wisdom: WisdomStore
  @State private var adding = false
  @State private var activeTheme: String?
  @State private var selected: Set<String> = []
  @State private var synthesizing = false

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
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        header
        themeFilter
        if !selected.isEmpty {
          Button("Synthesize \(selected.count)") { synthesizing = true }
            .font(StudioFont.control).foregroundStyle(theme.link)
            .disabled(selected.count < 2)
            .accessibilityIdentifier("synthesize-button")
        }
        if cards.isEmpty {
          Text("Nothing kept here yet.").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        } else {
          ForEach(cards) { card in
            WisdomCardRow(
              card: card, selected: selected.contains(card.id),
              onOpen: { onOpen(card.path) },
              onToggleSelect: { toggle(card.id) })
            Divider().overlay(theme.line)
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Wisdom Garden")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Add") { adding = true }.accessibilityIdentifier("add-idea-button")
      }
    }
    .sheet(isPresented: $adding) {
      WisdomAddView(themes: wisdom.projection.themes, onSave: keepIdea, onClose: { adding = false })
        .studioTheme(theme)
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
          TextField("A short name (optional)", text: $title)
            .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            .accessibilityIdentifier("wisdom-title-field")
          TextEditor(text: $noteBody)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
            .scrollContentBackground(.hidden).frame(minHeight: 140)
            .accessibilityIdentifier("wisdom-body-editor")
          if !themes.isEmpty {
            Text("THEMES").font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            themeChips
          }
          DisclosureGroup("Source", isExpanded: $showSource) {
            VStack(spacing: 8) {
              TextField("Creator", text: $creator).accessibilityIdentifier("wisdom-source-creator")
              TextField("Title", text: $sourceTitle)
              TextField("URL", text: $url).textInputAutocapitalization(.never)
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
          TextEditor(text: $noteBody)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
            .scrollContentBackground(.hidden).frame(minHeight: 160)
            .accessibilityIdentifier("synthesis-body")
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
