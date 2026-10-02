import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// Constellation — FIRST-CUT SPIKE (read-only). "Your life, over time": each
// moment is a dot, each real relationship between moments is a line.
//
// LAYOUT CHOICE (spike — Anna to weigh in):
//   A deterministic time-radial layout, no physics simulation and no third-party
//   graph library. Notes are sorted oldest→newest and placed on an Archimedean
//   spiral from the centre outward, so time reads as "distance from the middle"
//   and the newest moments sit on the rim. This is O(n) to lay out and O(n+e) to
//   draw — no per-frame force solving. It trades the organic clustering of a
//   force-directed graph for legibility and stability (the same note is always
//   in the same place), which felt right for a calm first cut.
//
//   Alternatives a v2 could try: a proper force-directed layout (clusters pull
//   related moments together), clustering by life area into separate lobes, and a
//   draggable/zoomable canvas with time scrubbing. See ConstellationGraph.swift
//   for the edge-definition questions.
//
// ACCESSIBILITY: the graph is decorative-with-a-twist — every relationship it
// draws is ALSO reachable as text. A segmented control flips between the visual
// "Map" and an accessible "List" of moments; each moment lists its connected
// moments in words ("Linked", "Grew from this", "Shares calm"). VoiceOver users
// get the whole graph as navigable text, and any moment opens from either view.
// ─────────────────────────────────────────────────────────────────────────────

struct ConstellationView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void  // note path

  private enum Mode: String, CaseIterable { case map = "Map", list = "List" }
  @State private var mode: Mode = .map
  @State private var selected: ConstellationNode?

  // Build the graph from live notes + their parsed source_notes and raw bodies.
  // Recomputed when the note set changes (cheap — hundreds of notes).
  private var graph: ConstellationGraph {
    ConstellationGraph.build(from: Self.inputs(from: store))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      RoomHeading(
        eyebrow: "small moments, bigger patterns",
        title: "Constellation",
        intro: "Your moments as dots, and the meaning between them as lines — your life, over time.")
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 12)

      Picker("View", selection: $mode) {
        ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
      }
      .pickerStyle(.segmented)
      .padding(.horizontal, 24)
      .padding(.bottom, 12)
      .accessibilityIdentifier("constellation-mode-picker")

      let g = graph
      if g.nodes.isEmpty {
        emptyState
      } else {
        switch mode {
        case .map: ConstellationCanvas(graph: g, selected: $selected)
        case .list: ConstellationList(graph: g, onOpen: onOpen)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.canvas)
    .navigationTitle("Constellation")
    .sheet(item: $selected) { node in
      ConstellationMomentSheet(
        node: node, graph: graph,
        onOpen: { path in selected = nil; onOpen(path) },
        onSelect: { selected = $0 })
    }
  }

  private var emptyState: some View {
    VStack(spacing: 12) {
      Image(systemName: "sparkles")
        .font(.system(size: 34)).foregroundStyle(theme.inkFaint)
      Text("No moments yet.")
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkMuted)
      Text("As you capture moments and connect them, a constellation will form here.")
        .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 40).padding(.top, 60)
    .accessibilityIdentifier("constellation-empty")
  }

  // Project the store's live notes into pure builder inputs. Keeps the view thin
  // and the graph logic testable without a vault.
  static func inputs(from store: VaultStore) -> [ConstellationInput] {
    // sourceNoteIds + raw body live on the full parsed note, keyed by path.
    var parsedByPath: [String: StudioNote] = [:]
    for entry in store.parsedNotesByPath { parsedByPath[entry.path] = entry.note }

    return store.liveNotes.compactMap { summary in
      guard let note = parsedByPath[summary.id], !note.id.isEmpty else { return nil }
      return ConstellationInput(
        id: note.id, path: summary.id, title: summary.title,
        timestamp: summary.timestamp, meaning: summary.meaning,
        tags: summary.tags, lifeAreas: summary.lifeAreas,
        sourceNoteIds: note.sourceNoteIds ?? [], body: note.body)
    }
  }
}

// MARK: - The visual map (Canvas: lines then dots)

private struct ConstellationCanvas: View {
  @Environment(\.studioTheme) private var theme
  let graph: ConstellationGraph
  @Binding var selected: ConstellationNode?

  var body: some View {
    GeometryReader { geo in
      let layout = ConstellationLayout(nodes: graph.nodes, size: geo.size)
      ZStack {
        // A clear backdrop carries the canvas identifier (so the test can confirm
        // the map rendered) WITHOUT wrapping the dot buttons — an identifier on the
        // container would be inherited by the children and clobber their own ids.
        Color.clear
          .contentShape(Rectangle())
          .accessibilityIdentifier("constellation-canvas")

        // Lines (behind the dots). Decorative — the a11y alternative is the List
        // mode and the per-moment sheet.
        Canvas { ctx, _ in
          for edge in graph.edges {
            guard let p1 = layout.position(edge.endpoints.a),
              let p2 = layout.position(edge.endpoints.b) else { continue }
            var path = Path()
            path.move(to: p1)
            path.addLine(to: p2)
            ctx.stroke(
              path, with: .color(theme.line.opacity(Self.lineOpacity(edge.kind))),
              lineWidth: edge.kind == .link ? 1.2 : 0.8)
          }
        }
        .accessibilityHidden(true)

        // Dots — each a real, tappable button so VoiceOver/Full-Keyboard reach it.
        // The visible mark is small, but the button carries a 44pt transparent hit
        // area (Apple's minimum touch target — and large enough that XCUITest and
        // Full-Keyboard Access reliably resolve it).
        ForEach(graph.nodes) { node in
          if let p = layout.position(node.id) {
            Button { selected = node } label: {
              Circle()
                .fill(meaningColour(node.meaning, theme: theme))
                .frame(width: 13, height: 13)
                .overlay(Circle().strokeBorder(theme.canvas, lineWidth: 1.5))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .position(p)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(node.title.isEmpty ? "Untitled moment" : node.title)
            .accessibilityHint("Opens this moment")
            .accessibilityIdentifier("constellation-dot-\(node.id)")
          }
        }
      }
      .frame(width: geo.size.width, height: geo.size.height)
    }
  }

  // Fainter lines for lighter relationships, so authored links read first.
  static func lineOpacity(_ kind: ConstellationGraph.EdgeKind) -> Double {
    switch kind {
    case .link: return 0.9
    case .lineage: return 0.7
    case .sharedFacet: return 0.35
    }
  }
}

// A deterministic time-radial layout (Archimedean spiral), computed once per
// render. Oldest moment at the centre, newest on the rim. O(n).
struct ConstellationLayout {
  private let positions: [String: CGPoint]

  init(nodes: [ConstellationNode], size: CGSize) {
    let centre = CGPoint(x: size.width / 2, y: size.height / 2)
    // Sort oldest→newest; blank timestamps sort first (treated as oldest).
    let ordered = nodes.sorted { $0.timestamp < $1.timestamp }
    let count = max(ordered.count, 1)
    // Clamp to >= 0: a transient zero/tiny size (e.g. first layout pass) must never
    // yield a negative radius, which would place dots at invalid, off-screen points.
    let maxRadius = max(0, min(size.width, size.height) / 2 - 28)
    // Golden-angle spiral spreads points evenly without clumping.
    let goldenAngle = Double.pi * (3 - (5.0).squareRoot())  // ≈ 2.399963 rad

    var out: [String: CGPoint] = [:]
    for (index, node) in ordered.enumerated() {
      // Single node sits dead centre; otherwise spread sqrt-spaced so area is even.
      let t = count == 1 ? 0 : Double(index) / Double(count - 1)
      let radius = maxRadius * t.squareRoot()
      let angle = Double(index) * goldenAngle
      out[node.id] = CGPoint(
        x: centre.x + radius * cos(angle),
        y: centre.y + radius * sin(angle))
    }
    positions = out
  }

  func position(_ id: String) -> CGPoint? { positions[id] }
}

// MARK: - The accessible list alternative

private struct ConstellationList: View {
  @Environment(\.studioTheme) private var theme
  let graph: ConstellationGraph
  let onOpen: (String) -> Void

  var body: some View {
    List {
      ForEach(graph.nodes) { node in
        Section {
          Button { onOpen(node.path) } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(node.title.isEmpty ? "Untitled" : node.title)
                .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              let neighbours = graph.neighbours(of: node.id)
              if neighbours.isEmpty {
                Text("No connections yet")
                  .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
              } else {
                ForEach(Array(neighbours.enumerated()), id: \.offset) { _, n in
                  Text("\(n.relationshipDescription): \(n.node.title.isEmpty ? "Untitled" : n.node.title)")
                    .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                }
              }
            }
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("constellation-list-row-\(node.id)")
        }
      }
    }
    .studioRoomList(theme.canvas)
    .accessibilityIdentifier("constellation-list")
  }
}

// MARK: - A tapped moment

private struct ConstellationMomentSheet: View {
  @Environment(\.studioTheme) private var theme
  let node: ConstellationNode
  let graph: ConstellationGraph
  let onOpen: (String) -> Void
  let onSelect: (ConstellationNode) -> Void

  var body: some View {
    NavigationStack {
      List {
        Section {
          Text(node.title.isEmpty ? "Untitled" : node.title)
            .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
          if !node.timestamp.isEmpty {
            Text(JournalEntryRow.dateLabel(node.timestamp))
              .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          }
          Button { onOpen(node.path) } label: {
            Label("Open this moment", systemImage: "arrow.up.forward.square")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("constellation-open-\(node.id)")
        }

        let neighbours = graph.neighbours(of: node.id)
        if !neighbours.isEmpty {
          Section("Connected moments") {
            ForEach(Array(neighbours.enumerated()), id: \.offset) { _, n in
              Button { onSelect(n.node) } label: {
                VStack(alignment: .leading, spacing: 2) {
                  Text(n.node.title.isEmpty ? "Untitled" : n.node.title)
                    .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
                  Text(n.relationshipDescription)
                    .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                }
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .navigationTitle("Moment")
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.medium, .large])
  }
}
