import SwiftUI

// The Life Landscape room, Focus view: pick a life area, then five anchor blocks. Each
// block shows its featured card (tap to open · swipe-left for the move/delete nudge bar)
// with a quiet "+N more" to expand the rest; tapping a block's heading adds a card there,
// and an empty block invites the first. Area tools (add / rename / hide / remove) live
// behind the cogwheel's manager sheet.
struct LandscapeRoomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var landscape: LandscapeStore
  @State private var selectedArea: String = ""
  @State private var managingAreas = false
  @State private var addingCard: LandscapeAnchor?
  @State private var expanded: Set<String> = []
  @State private var pendingMove: PendingMove?

  // A card awaiting a "move to…" choice, raised by its swipe action.
  private struct PendingMove: Identifiable {
    let card: LandscapeCardModel
    let from: LandscapeAnchor
    var id: String { card.id }
  }

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _landscape = State(initialValue: LandscapeStore(store: store))
  }

  private var currentArea: String {
    if !selectedArea.isEmpty, landscape.areas.contains(where: { $0.id == selectedArea }) {
      return selectedArea
    }
    return landscape.areas.first?.id ?? ""
  }

  private var currentAreaTitle: String {
    landscape.areas.first { $0.id == currentArea }?.title ?? ""
  }

  var body: some View {
    List {
      Section {
        header
        areaPicker
      }
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets(top: 10, leading: 24, bottom: 6, trailing: 24))

      if currentArea.isEmpty {
        Button { managingAreas = true } label: {
          Label("Add a life area to begin", systemImage: "plus")
            .font(StudioFont.control).foregroundStyle(theme.link)
        }
        .accessibilityIdentifier("add-area-empty")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 6, leading: 24, bottom: 6, trailing: 24))
      } else {
        ForEach(LandscapeAnchor.ordered) { anchor in
          anchorSection(anchor)
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(theme.canvas)
    .navigationTitle("Life Landscape")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { managingAreas = true } label: { Image(systemName: "gearshape") }
          .accessibilityIdentifier("manage-areas-button")
          .accessibilityLabel("Manage life areas")
      }
    }
    .sheet(isPresented: $managingAreas) {
      LandscapeAreaManagerView(landscape: landscape, onClose: { managingAreas = false })
        .studioTheme(theme)
    }
    .sheet(item: $addingCard) { anchor in
      LandscapeCardSheet(
        areaTitle: currentAreaTitle, anchor: anchor,
        onSave: { title, body, horizon in
          landscape.addCard(
            lifeArea: currentArea, anchor: anchor, horizon: horizon, title: title, body: body)
        },
        onClose: { addingCard = nil })
        .studioTheme(theme)
    }
    .confirmationDialog(
      "Move to…",
      isPresented: Binding(get: { pendingMove != nil }, set: { if !$0 { pendingMove = nil } }),
      presenting: pendingMove
    ) { move in
      ForEach(LandscapeAnchor.ordered.filter { $0 != move.from }) { target in
        Button(target.label) { _ = landscape.move(card: move.card, toAnchor: target) }
      }
      Button("Cancel", role: .cancel) {}
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("THE SHAPE OF A LIFE")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Life Landscape")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
    }
  }

  private var areaPicker: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(landscape.areas) { area in
          let selected = area.id == currentArea
          Button { selectedArea = area.id } label: {
            Text(area.title)
              .font(StudioFont.control)
              .padding(.horizontal, 12).padding(.vertical, 7)
              .background(Capsule().fill(selected ? theme.accentSoft : theme.sunken))
              .overlay(Capsule().strokeBorder(selected ? theme.link : theme.line, lineWidth: 1))
              .foregroundStyle(selected ? theme.link : theme.inkMuted)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("area-\(area.id)")
          .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
      }
    }
  }

  // One anchor block: its heading (tap anywhere on it to add a card here), the featured
  // card that fills the block (tap to edit · swipe-left to move or delete), and a quiet
  // "+N more" that expands the rest. An empty block invites the first card.
  @ViewBuilder
  private func anchorSection(_ anchor: LandscapeAnchor) -> some View {
    let cell = landscape.board.cell(area: currentArea, anchor: anchor)
    Section {
      if let featured = cell?.featured {
        cardRow(featured, anchor: anchor)
        if expanded.contains(anchor.rawValue) {
          ForEach(Array((cell?.cards ?? []).dropFirst())) { card in
            cardRow(card, anchor: anchor)
          }
        } else if let more = cell?.additionalCount, more > 0 {
          Button { expanded.insert(anchor.rawValue) } label: {
            Text("+\(more) more").font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          }
          .buttonStyle(.plain)
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 2, leading: 24, bottom: 6, trailing: 24))
        }
      } else {
        Button { addingCard = anchor } label: {
          Text("Tap to add a card")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.horizontal, 14)
            .background(RoundedRectangle(cornerRadius: 10).fill(theme.sunken))
            .overlay(
              RoundedRectangle(cornerRadius: 10)
                .strokeBorder(theme.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 6, trailing: 24))
      }
    } header: {
      anchorHeader(anchor)
    }
  }

  // The block heading doubles as the "add a card here" target (the whole heading is
  // tappable — no plus button needed).
  private func anchorHeader(_ anchor: LandscapeAnchor) -> some View {
    Button { addingCard = anchor } label: {
      VStack(alignment: .leading, spacing: 3) {
        Text(anchor.label.uppercased())
          .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
        Text(anchor.prompt)
          .font(StudioFont.meta).foregroundStyle(theme.inkSoft)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .textCase(nil)
    .listRowInsets(EdgeInsets(top: 14, leading: 24, bottom: 6, trailing: 24))
    .accessibilityIdentifier("add-card-\(anchor.rawValue)")
    .accessibilityLabel("Add to \(anchor.label)")
  }

  // A card that fills its block: tap to open, swipe-left for the move/delete nudge bar.
  private func cardRow(_ card: LandscapeCardModel, anchor: LandscapeAnchor) -> some View {
    Button { onOpen(card.path) } label: {
      VStack(alignment: .leading, spacing: 4) {
        Text(card.title).font(StudioFont.body).foregroundStyle(theme.inkStrong)
        if let horizon = card.decisionHorizon {
          Text(horizon.label)
            .font(StudioFont.eyebrow).tracking(0.6)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Capsule().fill(theme.sunken))
            .foregroundStyle(theme.growth)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
      .background(RoundedRectangle(cornerRadius: 10).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(theme.line, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowSeparator(.hidden)
    .listRowBackground(Color.clear)
    .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 4, trailing: 24))
    .accessibilityIdentifier("landscape-card-\(card.id)")
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        _ = landscape.deleteCard(card)
      } label: { Label("Delete", systemImage: "trash") }
      Button {
        pendingMove = PendingMove(card: card, from: anchor)
      } label: { Label("Move", systemImage: "arrow.left.arrow.right") }
      .tint(theme.link)
    }
  }
}

// Add / rename / show-hide / remove life areas — the CRUD surface behind the
// Landscape room's cogwheel. All area tools live here, keeping the board itself about
// content (its cards), not configuration.
private struct LandscapeAreaManagerView: View {
  @Environment(\.studioTheme) private var theme
  let landscape: LandscapeStore
  let onClose: () -> Void
  @State private var newArea = ""
  @State private var renaming: LifeAreaPreference?
  @State private var removing: LifeAreaPreference?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          GuidedField(label: "Add an area", description: LandscapeGuidance.newArea.description) {
            HStack(spacing: 8) {
              TextField(LandscapeGuidance.newArea.example, text: $newArea)
                .font(StudioFont.control).foregroundStyle(theme.inkStrong)
                .accessibilityIdentifier("new-area-field")
              Button("Add") {
                let title = newArea.trimmingCharacters(in: .whitespacesAndNewlines)
                if !title.isEmpty, landscape.addArea(title: title) { newArea = "" }
              }
              .font(StudioFont.control).foregroundStyle(theme.link)
              .accessibilityIdentifier("add-area-button")
            }
            .padding(12)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
          }
          VStack(alignment: .leading, spacing: 0) {
            Text("AREAS")
              .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
              .padding(.bottom, 6)
            ForEach(landscape.preferences.sorted { $0.order < $1.order }) { area in
              HStack(spacing: 14) {
                Button { renaming = area } label: {
                  Text(area.title)
                    .font(StudioFont.body)
                    .foregroundStyle(area.hidden ? theme.inkFaint : theme.inkStrong)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("area-row-\(area.id)")
                Spacer()
                Button(area.hidden ? "Show" : "Hide") {
                  _ = landscape.setHidden(id: area.id, hidden: !area.hidden)
                }
                .font(StudioFont.meta).foregroundStyle(theme.link)
                .accessibilityIdentifier("area-hide-\(area.id)")
                Button { removing = area } label: {
                  Image(systemName: "trash").font(.system(size: 13))
                }
                .foregroundStyle(theme.inkFaint)
                .accessibilityIdentifier("area-remove-\(area.id)")
                .accessibilityLabel("Remove \(area.title)")
              }
              .padding(.vertical, 10)
              Divider().overlay(theme.line)
            }
          }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Life areas").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { onClose() }
        }
      }
      .sheet(item: $renaming) { area in
        AreaNameSheet(
          title: "Rename area", initial: area.title, guidance: LandscapeGuidance.renameArea,
          onSave: { landscape.renameArea(id: area.id, title: $0) }, onClose: { renaming = nil })
          .studioTheme(theme)
      }
      .confirmationDialog(
        "Remove “\(removing?.title ?? "")”?",
        isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
        presenting: removing
      ) { area in
        Button("Remove area", role: .destructive) { _ = landscape.removeArea(id: area.id) }
        Button("Cancel", role: .cancel) {}
      } message: { _ in
        Text("It leaves the board. Cards keep their tag, so you can bring it back any time.")
      }
    }
  }
}

// A small sheet for naming a life area — shared by add and rename, showing the
// matching field guidance (description + greyed example).
private struct AreaNameSheet: View {
  @Environment(\.studioTheme) private var theme
  let title: String
  let guidance: FieldGuidance
  let onSave: (String) -> Bool
  let onClose: () -> Void
  @State private var text: String

  init(
    title: String, initial: String, guidance: FieldGuidance,
    onSave: @escaping (String) -> Bool, onClose: @escaping () -> Void
  ) {
    self.title = title
    self.guidance = guidance
    self.onSave = onSave
    self.onClose = onClose
    _text = State(initialValue: initial)
  }

  private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    NavigationStack {
      ScrollView {
        GuidedField(description: guidance.description) {
          TextField(guidance.example, text: $text)
            .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            .padding(12)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
            .accessibilityIdentifier("area-name-field")
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text(title).font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { if onSave(trimmed) { onClose() } }
            .disabled(trimmed.isEmpty)
            .accessibilityIdentifier("area-name-save")
        }
      }
    }
  }
}

// Add a card into a life area under a given anchor. The anchor's own prompt is the
// guidance; the decisions anchor also offers a 30/60/90 horizon.
private struct LandscapeCardSheet: View {
  @Environment(\.studioTheme) private var theme
  let areaTitle: String
  let anchor: LandscapeAnchor
  let onSave: (_ title: String?, _ body: String, _ horizon: DecisionHorizon?) -> Bool
  let onClose: () -> Void

  @State private var title = ""
  @State private var noteBody = ""
  @State private var horizon: DecisionHorizon = .d30

  private var canSave: Bool { !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text(anchor.prompt)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
          TextField("A short name (optional)", text: $title)
            .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            .accessibilityIdentifier("landscape-card-title")
          GuidedEditor(
            text: $noteBody, example: "Write it in your own words.", minHeight: 140,
            accessibilityId: "landscape-card-body")
          if anchor == .decisions {
            Text("HORIZON")
              .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            Picker("Horizon", selection: $horizon) {
              ForEach([DecisionHorizon.d30, .d60, .d90], id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("landscape-card-horizon")
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Add to \(areaTitle)").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Keep") {
            let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
            if onSave(
              trimmed.isEmpty ? nil : trimmed, noteBody, anchor == .decisions ? horizon : nil)
            {
              onClose()
            }
          }
          .disabled(!canSave)
          .accessibilityIdentifier("landscape-card-keep")
        }
      }
    }
  }
}
