import SwiftUI

// The Reflection Garden: a chronology with four views (Garden · Reflection ·
// Celebration · Themes), a capture bar for reflections and celebrations, and entry
// cards showing their evidence connections. (Cover images + Then & Now + the connect-
// evidence form are documented follow-ups.)
struct ReflectionView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var reflection: ReflectionStore
  @State private var tab: Tab = .garden
  @State private var draft = ""
  @State private var kind = "reflection"
  @State private var activeTheme: String?

  private enum Tab: String, CaseIterable {
    case garden = "Garden"
    case reflection = "Reflection"
    case celebration = "Celebration"
    case themes = "Themes"
  }

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _reflection = State(initialValue: ReflectionStore(store: store))
  }

  private var shownCards: [ReflectionCard] {
    switch tab {
    case .garden: return reflection.garden.cards
    case .reflection: return reflection.garden.cards.filter { $0.semanticType == "reflection" }
    case .celebration: return reflection.garden.cards.filter { $0.semanticType == "celebration" }
    case .themes:
      guard let active = activeTheme else { return [] }
      return reflection.garden.cards.filter { $0.tags.contains(active) }
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        header
        composer
        Picker("View", selection: $tab) {
          ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("reflection-tabs")

        if tab == .themes {
          themeFilter
        }
        cardList
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Reflection Garden")
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("NOTICE WHAT IS CHANGING")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Reflection Garden")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
    }
  }

  private var composer: some View {
    VStack(alignment: .leading, spacing: 10) {
      Picker("Kind", selection: $kind) {
        Text("Reflection").tag("reflection")
        Text("Celebration").tag("celebration")
      }
      .pickerStyle(.segmented)
      .accessibilityIdentifier("reflection-kind")
      ZStack(alignment: .topLeading) {
        if draft.isEmpty {
          Text("What are you noticing?")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
            .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
        }
        TextEditor(text: $draft)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
          .scrollContentBackground(.hidden).frame(minHeight: 80)
          .accessibilityIdentifier("reflection-editor")
      }
      HStack {
        Spacer()
        Button("Keep") {
          let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !body.isEmpty else { return }
          if reflection.keep(kind: kind, body: body) { draft = "" }
        }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityIdentifier("reflection-keep")
      }
    }
    .padding(16)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
  }

  private var themeFilter: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(reflection.garden.themes) { theme in
          let active = activeTheme == theme.name
          Button { activeTheme = theme.name } label: {
            HStack(spacing: 5) {
              Text(theme.name).font(StudioFont.control)
              Text("\(theme.count)").font(StudioFont.eyebrow).foregroundStyle(self.theme.inkFaint)
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .background(Capsule().fill(active ? self.theme.accentSoft : self.theme.sunken))
            .overlay(Capsule().strokeBorder(active ? self.theme.link : self.theme.line, lineWidth: 1))
            .foregroundStyle(active ? self.theme.link : self.theme.inkMuted)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("reflection-theme-\(theme.name)")
        }
      }
    }
  }

  @ViewBuilder
  private var cardList: some View {
    if tab == .themes && activeTheme == nil {
      Text("Pick a theme to filter.").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
    } else if shownCards.isEmpty {
      Text("Nothing here yet.").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
    } else {
      ForEach(shownCards) { card in
        EntryCard(card: card, onOpen: { onOpen(card.path) })
        Divider().overlay(theme.line)
      }
    }
  }
}

private struct EntryCard: View {
  @Environment(\.studioTheme) private var theme
  let card: ReflectionCard
  let onOpen: () -> Void

  private var markColour: Color {
    card.semanticType == "celebration" ? theme.celebration : theme.reflection
  }

  var body: some View {
    Button(action: onOpen) {
      HStack(alignment: .top, spacing: 12) {
        Circle().fill(markColour).frame(width: 8, height: 8).padding(.top, 6)
        VStack(alignment: .leading, spacing: 5) {
          Text(card.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
          if !card.excerpt.isEmpty {
            Text(card.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
              .lineLimit(3).fixedSize(horizontal: false, vertical: true)
          }
          ForEach(card.evidence) { connection in
            Text(evidenceLine(connection))
              .font(StudioFont.eyebrow).tracking(0.4)
              .foregroundStyle(colour(for: connection.state))
          }
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 12).contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func evidenceLine(_ connection: EvidenceConnection) -> String {
    let noun: String
    switch connection.kind {
    case .note: noun = "Linked note"
    case .lifeArea: noun = "Life area"
    case .season: noun = "Season"
    }
    let label = connection.label ?? connection.targetId
    return "\(noun) · \(label) · \(connection.state.rawValue)"
  }

  private func colour(for state: EvidenceState) -> Color {
    switch state {
    case .available: return theme.inkMuted
    case .archived: return theme.inkFaint
    case .missing: return theme.celebration
    }
  }
}
