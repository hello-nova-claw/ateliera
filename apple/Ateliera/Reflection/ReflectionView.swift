import SwiftUI

// The Reflection Garden: a chronology with four views (Garden · Reflection ·
// Celebration · Themes), a capture bar for reflections and celebrations, and entry
// cards showing their cover image + evidence connections, with a connect-evidence form
// and Then-&-Now pairing.
struct ReflectionView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var reflection: ReflectionStore
  @State private var tab: Tab = .garden
  @State private var draft = ""
  @State private var kind = "reflection"
  @State private var activeTheme: String?
  @State private var connecting: ReflectionCard?
  @State private var pairing: ReflectionCard?

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
        if tab == .garden {
          thenAndNow
        }
        cardList
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Reflection Garden")
    .sheet(item: $connecting) { card in
      ConnectEvidenceView(
        card: card,
        noteCandidates: reflection.thenCandidates(for: card),
        lifeAreas: reflection.visibleLifeAreas,
        onConnect: { noteIds, areas in
          reflection.connectEvidence(card: card, noteIds: noteIds, lifeAreas: areas)
        },
        onClose: { connecting = nil })
        .studioTheme(theme)
    }
    .sheet(item: $pairing) { card in
      ThenAndNowPickerView(
        card: card,
        candidates: reflection.thenCandidates(for: card),
        currentThenId: card.thenNoteId,
        onPick: { reflection.linkThen(card: card, thenNoteId: $0) },
        onClose: { pairing = nil })
        .studioTheme(theme)
    }
  }

  // Then-&-Now pairs: entries that name an earlier "then" note, shown side by side.
  @ViewBuilder
  private var thenAndNow: some View {
    let byId = Dictionary(reflection.garden.cards.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let pairs = reflection.garden.cards.compactMap { now -> (now: ReflectionCard, then: ReflectionCard)? in
      guard let thenId = now.thenNoteId, let then = byId[thenId] else { return nil }
      return (now, then)
    }
    if !pairs.isEmpty {
      VStack(alignment: .leading, spacing: 10) {
        Text("THEN & NOW").font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
        ForEach(pairs, id: \.now.id) { pair in
          HStack(alignment: .top, spacing: 10) {
            thenNowCell("Then", pair.then)
            Image(systemName: "arrow.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
              .padding(.top, 6)
            thenNowCell("Now", pair.now)
          }
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
      .accessibilityIdentifier("reflection-then-now")
    }
  }

  private func thenNowCell(_ label: String, _ card: ReflectionCard) -> some View {
    Button { onOpen(card.path) } label: {
      VStack(alignment: .leading, spacing: 3) {
        Text(label.uppercased()).font(StudioFont.eyebrow).tracking(1.0).foregroundStyle(theme.inkFaint)
        Text(card.title).font(StudioFont.meta).foregroundStyle(theme.inkStrong)
          .lineLimit(2).fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
    .buttonStyle(.plain)
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
      GuidedField(description: ReflectionGuidance.sentenceToKeep.description) {
        GuidedEditor(
          text: $draft, example: ReflectionGuidance.sentenceToKeep.example,
          minHeight: 80, accessibilityId: "reflection-editor")
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
        EntryCard(
          card: card, store: store,
          onOpen: { onOpen(card.path) },
          onConnect: { connecting = card },
          onPair: { pairing = card })
        Divider().overlay(theme.line)
      }
    }
  }
}

private struct EntryCard: View {
  @Environment(\.studioTheme) private var theme
  let card: ReflectionCard
  let store: VaultStore
  let onOpen: () -> Void
  let onConnect: () -> Void
  let onPair: () -> Void
  @State private var cover: UIImage?

  private var markColour: Color {
    card.semanticType == "celebration" ? theme.celebration : theme.reflection
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Button(action: onOpen) {
        HStack(alignment: .top, spacing: 12) {
          Circle().fill(markColour).frame(width: 8, height: 8).padding(.top, 6)
          VStack(alignment: .leading, spacing: 5) {
            if let cover {
              Image(uiImage: cover)
                .resizable().scaledToFill()
                .frame(maxWidth: .infinity).frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityIdentifier("reflection-cover-\(card.id)")
            }
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

      HStack(spacing: 18) {
        Button("Connect evidence", action: onConnect)
          .accessibilityIdentifier("reflection-connect-\(card.id)")
        Button(card.thenNoteId == nil ? "Then & now" : "Then & now ✓", action: onPair)
          .accessibilityIdentifier("reflection-pair-\(card.id)")
      }
      .font(StudioFont.meta).foregroundStyle(theme.link)
    }
    .task(id: card.coverReference) { loadCover() }
  }

  private func loadCover() {
    guard let reference = card.coverReference,
      let media = store.readCover(reference: reference, forNotePath: card.path)
    else {
      cover = nil
      return
    }
    cover = UIImage(data: media.data)
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

// Connect evidence to an entry: pick other entries to link as notes, and life areas.
private struct ConnectEvidenceView: View {
  @Environment(\.studioTheme) private var theme
  let card: ReflectionCard
  let noteCandidates: [ReflectionCard]
  let lifeAreas: [ReflectionLifeAreaTarget]
  let onConnect: (_ noteIds: [String], _ lifeAreas: [String]) -> Bool
  let onClose: () -> Void

  @State private var chosenNotes: Set<String> = []
  @State private var chosenAreas: Set<String> = []

  private var canSave: Bool { !chosenNotes.isEmpty || !chosenAreas.isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text("Link the evidence this reflection grew from.")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)

          if !lifeAreas.isEmpty {
            Text("LIFE AREAS").font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            FlowChips(
              items: lifeAreas.map { ($0.id, $0.title) }, chosen: chosenAreas,
              idPrefix: "connect-area") { toggle($0, in: &chosenAreas) }
          }

          if !noteCandidates.isEmpty {
            Text("ENTRIES").font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            ForEach(noteCandidates) { candidate in
              Button { toggle(candidate.id, in: &chosenNotes) } label: {
                HStack(spacing: 10) {
                  Image(systemName: chosenNotes.contains(candidate.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(chosenNotes.contains(candidate.id) ? theme.link : theme.inkFaint)
                  Text(candidate.title).font(StudioFont.control).foregroundStyle(theme.inkStrong)
                    .lineLimit(1)
                  Spacer(minLength: 0)
                }
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("connect-note-\(candidate.id)")
            }
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Connect evidence").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Connect") {
            if onConnect(Array(chosenNotes), Array(chosenAreas)) { onClose() }
          }
          .disabled(!canSave).accessibilityIdentifier("connect-save")
        }
      }
    }
  }

  private func toggle(_ id: String, in set: inout Set<String>) {
    if set.contains(id) { set.remove(id) } else { set.insert(id) }
  }
}

// Pick (or clear) the earlier "then" entry this one pairs with.
private struct ThenAndNowPickerView: View {
  @Environment(\.studioTheme) private var theme
  let card: ReflectionCard
  let candidates: [ReflectionCard]
  let currentThenId: String?
  let onPick: (_ thenNoteId: String?) -> Bool
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("Which earlier entry shows where this began?")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          if currentThenId != nil {
            Button("Clear pairing") { if onPick(nil) { onClose() } }
              .font(StudioFont.control).foregroundStyle(theme.celebration)
              .accessibilityIdentifier("then-clear")
            Divider().overlay(theme.line)
          }
          ForEach(candidates) { candidate in
            Button { if onPick(candidate.id) { onClose() } } label: {
              HStack(spacing: 10) {
                Image(systemName: currentThenId == candidate.id ? "checkmark.circle.fill" : "circle")
                  .foregroundStyle(currentThenId == candidate.id ? theme.link : theme.inkFaint)
                Text(candidate.title).font(StudioFont.control).foregroundStyle(theme.inkStrong)
                  .lineLimit(1)
                Spacer(minLength: 0)
              }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("then-pick-\(candidate.id)")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Then & now").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
      }
    }
  }
}

// A simple wrapping row of selectable chips.
private struct FlowChips: View {
  @Environment(\.studioTheme) private var theme
  let items: [(id: String, title: String)]
  let chosen: Set<String>
  let idPrefix: String
  let onToggle: (String) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(items, id: \.id) { item in
          let on = chosen.contains(item.id)
          Button { onToggle(item.id) } label: {
            Text(item.title).font(StudioFont.control)
              .padding(.horizontal, 10).padding(.vertical, 6)
              .background(Capsule().fill(on ? theme.accentSoft : theme.sunken))
              .overlay(Capsule().strokeBorder(on ? theme.link : theme.line, lineWidth: 1))
              .foregroundStyle(on ? theme.link : theme.inkMuted)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("\(idPrefix)-\(item.id)")
        }
      }
    }
  }
}
