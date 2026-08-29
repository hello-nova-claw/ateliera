import SwiftUI

// The Life Landscape room, Focus view: pick a life area, see its five anchors with
// the cards filed under each. Moving a card to another anchor is a plain Menu (fully
// keyboard/VoiceOver operable — no drag required). Areas are managed in place — an
// "+ Area" pill adds one, and a per-area context menu (or the "Areas" sheet) renames,
// hides, or removes them.
struct LandscapeRoomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var landscape: LandscapeStore
  @State private var selectedArea: String = ""
  @State private var managingAreas = false
  @State private var addingArea = false
  @State private var renamingArea: LifeArea?
  @State private var removingArea: LifeArea?

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

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        header
        areaPicker
        if currentArea.isEmpty {
          Text("Add a life area to begin.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        } else {
          ForEach(LandscapeAnchor.ordered, id: \.self) { anchor in
            anchorSection(anchor)
          }
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Life Landscape")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button("Areas") { managingAreas = true }
          .accessibilityIdentifier("manage-areas-button")
      }
    }
    .sheet(isPresented: $managingAreas) {
      LandscapeAreaManagerView(landscape: landscape, onClose: { managingAreas = false })
        .studioTheme(theme)
    }
    .sheet(isPresented: $addingArea) {
      AreaNameSheet(
        title: "New area", initial: "", guidance: LandscapeGuidance.newArea,
        onSave: { landscape.addArea(title: $0) }, onClose: { addingArea = false })
        .studioTheme(theme)
    }
    .sheet(item: $renamingArea) { area in
      AreaNameSheet(
        title: "Rename area", initial: area.title, guidance: LandscapeGuidance.renameArea,
        onSave: { landscape.renameArea(id: area.id, title: $0) }, onClose: { renamingArea = nil })
        .studioTheme(theme)
    }
    .confirmationDialog(
      "Remove “\(removingArea?.title ?? "")”?", isPresented: removeBinding, presenting: removingArea
    ) { area in
      Button("Remove area", role: .destructive) {
        if landscape.removeArea(id: area.id), selectedArea == area.id { selectedArea = "" }
      }
      Button("Cancel", role: .cancel) {}
    } message: { _ in
      Text("It leaves the board. Cards keep their tag, so you can bring it back any time by adding it again.")
    }
  }

  private var removeBinding: Binding<Bool> {
    Binding(get: { removingArea != nil }, set: { if !$0 { removingArea = nil } })
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
          .contextMenu {
            Button { renamingArea = area } label: { Label("Rename", systemImage: "pencil") }
            Button { _ = landscape.setHidden(id: area.id, hidden: true) } label: {
              Label("Hide from board", systemImage: "eye.slash")
            }
            Button(role: .destructive) { removingArea = area } label: {
              Label("Remove", systemImage: "trash")
            }
          }
        }
        Button { addingArea = true } label: {
          Label("Area", systemImage: "plus")
            .font(StudioFont.control)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(theme.sunken))
            .overlay(Capsule().strokeBorder(theme.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            .foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("add-area-pill")
        .accessibilityLabel("Add a life area")
      }
    }
  }

  private func anchorSection(_ anchor: LandscapeAnchor) -> some View {
    let cell = landscape.board.cell(area: currentArea, anchor: anchor)
    return VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text(anchor.label.uppercased())
          .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
        Text(anchor.prompt)
          .font(StudioFont.meta).foregroundStyle(theme.inkSoft)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let cards = cell?.cards, !cards.isEmpty {
        ForEach(cards) { card in
          LandscapeCardView(
            card: card, anchors: LandscapeAnchor.ordered.filter { $0 != anchor },
            onOpen: { onOpen(card.path) },
            onMove: { target in _ = landscape.move(card: card, toAnchor: target) })
        }
      } else {
        Text("Nothing here yet.")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      }
      Divider().overlay(theme.line)
    }
  }
}

// A single landscape card: title, optional decision-horizon badge, and a Move menu.
private struct LandscapeCardView: View {
  @Environment(\.studioTheme) private var theme
  let card: LandscapeCardModel
  let anchors: [LandscapeAnchor]
  let onOpen: () -> Void
  let onMove: (LandscapeAnchor) -> Void

  var body: some View {
    HStack(spacing: 10) {
      Button(action: onOpen) {
        VStack(alignment: .leading, spacing: 3) {
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
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      Menu {
        ForEach(anchors, id: \.self) { anchor in
          Button(anchor.label) { onMove(anchor) }
            .accessibilityIdentifier("move-\(card.id)-\(anchor.rawValue)")
        }
      } label: {
        Image(systemName: "arrow.left.arrow.right")
          .font(.system(size: 14)).foregroundStyle(theme.link)
          .padding(6)
      }
      .accessibilityIdentifier("card-menu-\(card.id)")
      .accessibilityLabel("Move \(card.title)")
    }
    .padding(.vertical, 8)
  }
}

// Add / rename / show-hide / remove life areas — the discoverable CRUD surface behind
// the "Areas" toolbar button (the board itself offers the same via an add pill and a
// per-area context menu).
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
