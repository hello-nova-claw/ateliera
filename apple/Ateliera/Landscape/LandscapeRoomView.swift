import SwiftUI

// The Life Landscape room, Focus view: pick a life area, see its five anchors with
// the cards filed under each. Moving a card to another anchor is a plain Menu (fully
// keyboard/VoiceOver operable — no drag required). An area manager adds new areas.
struct LandscapeRoomView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var landscape: LandscapeStore
  @State private var selectedArea: String = ""
  @State private var managingAreas = false

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

// Add / rename / hide life areas.
private struct LandscapeAreaManagerView: View {
  @Environment(\.studioTheme) private var theme
  let landscape: LandscapeStore
  let onClose: () -> Void
  @State private var newArea = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          VStack(alignment: .leading, spacing: 8) {
            Text("ADD AN AREA")
              .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
            HStack(spacing: 8) {
              TextField("Name a life area", text: $newArea)
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
              HStack {
                Text(area.title)
                  .font(StudioFont.body)
                  .foregroundStyle(area.hidden ? theme.inkFaint : theme.inkStrong)
                Spacer()
                Button(area.hidden ? "Show" : "Hide") {
                  _ = landscape.setHidden(id: area.id, hidden: !area.hidden)
                }
                .font(StudioFont.meta).foregroundStyle(theme.link)
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
    }
  }
}
