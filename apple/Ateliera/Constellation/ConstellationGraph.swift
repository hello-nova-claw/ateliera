import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Constellation — FIRST-CUT SPIKE (v2 Phase 7, concept-stage).
//
// The v2 metaphor: "moments are dots, meaning is the lines between them — small
// moments, bigger patterns." This file is the pure, testable core: it turns the
// user's notes and their REAL existing relationships into nodes + typed edges.
// No layout, no SwiftUI — that lives in ConstellationView.swift.
//
// EDGE DEFINITIONS (what became a "line") — all derived from relationships that
// already exist in the vault, never invented:
//
//   .link     — a resolved body link between two notes (wiki `[[Title]]`,
//               `studio://note/<id>`, or a relative `*.md` path), via the same
//               LinkGraph the backlinks/repair features use. Reciprocal links
//               collapse to ONE undirected edge. This is the strongest line.
//   .lineage  — a `source_notes` (sourceNoteIds) relationship: a developed card
//               tied back to the seed it grew from (guided threads / workshop).
//               A real, explicit "this came from that" connection.
//   .sharedFacet — two notes sharing a tag or a life area. The LIGHTEST line: a
//               thematic resonance rather than an authored link.
//
// Dedup rule: at most one edge per unordered pair, strongest-wins
// (link > lineage > sharedFacet). Self-references never make an edge.
//
// ── NEEDS ANNA'S CALL (spike decisions to react to) ──────────────────────────
//  1. Should shared-tag / shared-life-area count as a "line" at all, or is that
//     too noisy? (A busy tag like #calm could over-connect everything. v2 could
//     weight by rarity, or drop facet edges entirely and keep only authored links.)
//  2. Strength ordering link > lineage > sharedFacet — is lineage actually the
//     most meaningful line to Anna (seed→becoming), above a plain body link?
//  3. Should seasons also be an edge dimension? (Omitted for now to keep it legible.)
//
// v2 would add: the Phase-1 brand palette (Ivory/Sand/Clay/Olive/Ink/Dusk) on the
// dots+lines, richer clustering (by life area / season), and time scrubbing along
// a timeline axis. See ateliera-v2-concept memory.
// ─────────────────────────────────────────────────────────────────────────────

// A note as fed into the constellation builder — a pure value so the graph logic
// is testable without a vault. Built from NoteSummary + the parsed note's
// `sourceNoteIds` and raw body.
struct ConstellationInput: Equatable {
  let id: String  // StudioNote.id
  let path: String  // vault file path (what onOpen needs)
  let title: String
  let timestamp: String  // ISO updated/created, for a time-ordered layout
  let meaning: String  // cardType, drives the dot colour
  let tags: [String]
  let lifeAreas: [String]
  let sourceNoteIds: [String]  // source_notes — lineage edges
  let body: String  // raw Markdown, for resolving body links
}

struct ConstellationNode: Identifiable, Equatable {
  let id: String  // note id
  let path: String
  let title: String
  let timestamp: String
  let meaning: String
}

struct ConstellationGraph {
  // An unordered pair of node ids. Equality/hashing ignore order so a link in
  // either direction is the same edge.
  struct Endpoints: Hashable {
    let a: String
    let b: String

    init(_ x: String, _ y: String) {
      // Canonicalise so {a,b} == {b,a}.
      if x <= y {
        a = x
        b = y
      } else {
        a = y
        b = x
      }
    }
  }

  enum EdgeKind: Int, Comparable {
    // Raw values encode strength; higher wins when a pair qualifies for several.
    case sharedFacet = 0
    case lineage = 1
    case link = 2

    static func < (lhs: EdgeKind, rhs: EdgeKind) -> Bool {
      lhs.rawValue < rhs.rawValue
    }
  }

  struct Edge: Equatable {
    let endpoints: Endpoints
    let kind: EdgeKind
    // The facets (tags / life areas) that joined the pair, for the a11y wording.
    // Empty for link/lineage edges.
    let sharedFacets: [String]
  }

  let nodes: [ConstellationNode]
  let edges: [Edge]
  private let nodesById: [String: ConstellationNode]
  private let adjacency: [String: [Edge]]

  func node(_ id: String) -> ConstellationNode? { nodesById[id] }

  // Node ids with no edges at all — rendered gently on the periphery, and the
  // "unconnected moments" section of the accessible list.
  var isolatedNodeIds: [String] {
    nodes.map(\.id).filter { (adjacency[$0] ?? []).isEmpty }
  }

  // One connected neighbour + how it connects — the non-visual alternative. Sorted
  // by strongest edge first, then title, so the list reads consistently.
  struct Neighbour: Equatable {
    let node: ConstellationNode
    let kind: EdgeKind
    let relationshipDescription: String
  }

  func neighbours(of id: String) -> [Neighbour] {
    let edgesForNode = adjacency[id] ?? []
    let result: [Neighbour] = edgesForNode.compactMap { edge in
      let otherId = edge.endpoints.a == id ? edge.endpoints.b : edge.endpoints.a
      guard let other = nodesById[otherId] else { return nil }
      return Neighbour(
        node: other, kind: edge.kind,
        relationshipDescription: Self.describe(edge))
    }
    return result.sorted { lhs, rhs in
      if lhs.kind != rhs.kind { return lhs.kind > rhs.kind }
      return lhs.node.title < rhs.node.title
    }
  }

  // Human wording for a relationship, used by VoiceOver / the list alternative.
  static func describe(_ edge: Edge) -> String {
    switch edge.kind {
    case .link: return "Linked"
    case .lineage: return "Grew from this"
    case .sharedFacet:
      let shared = edge.sharedFacets.joined(separator: ", ")
      return shared.isEmpty ? "Shares a theme" : "Shares \(shared)"
    }
  }

  // MARK: - Build

  static func build(from inputs: [ConstellationInput]) -> ConstellationGraph {
    let nodes = inputs.map {
      ConstellationNode(
        id: $0.id, path: $0.path, title: $0.title,
        timestamp: $0.timestamp, meaning: $0.meaning)
    }
    let idSet = Set(inputs.map(\.id))

    // Strongest-wins accumulator: one entry per unordered pair.
    var best: [Endpoints: Edge] = [:]
    func offer(_ pair: Endpoints, _ kind: EdgeKind, facets: [String] = []) {
      if pair.a == pair.b { return }  // never self-edge
      if let existing = best[pair], existing.kind >= kind { return }
      best[pair] = Edge(endpoints: pair, kind: kind, sharedFacets: facets)
    }

    // (1) LINK edges — resolve body links through the shared LinkGraph, then keep
    // only edges whose both endpoints are present (dangling links drop out).
    let graph = LinkGraph(
      inputs.map { (id: $0.id, path: $0.path, title: $0.title, body: $0.body) })
    for input in inputs {
      for forward in graph.forwardLinks(of: input.id) {
        if case .resolved(let targetId) = forward.state, idSet.contains(targetId) {
          offer(Endpoints(input.id, targetId), .link)
        }
      }
    }

    // (2) LINEAGE edges — source_notes, keeping only resolvable targets.
    for input in inputs {
      for sourceId in input.sourceNoteIds where idSet.contains(sourceId) {
        offer(Endpoints(input.id, sourceId), .lineage)
      }
    }

    // (3) SHARED-FACET edges — pairs sharing a tag or life area. O(notes·facets)
    // via an inverted index (facet → note ids), not an O(n²) pair scan.
    var facetIndex: [String: [String]] = [:]  // "tag:calm" / "area:work" → [ids]
    for input in inputs {
      for tag in Set(input.tags) { facetIndex["tag:\(tag)", default: []].append(input.id) }
      for area in Set(input.lifeAreas) { facetIndex["area:\(area)", default: []].append(input.id) }
    }
    // Collect the shared facets per pair first, so one edge can name every facet
    // the pair shares (e.g. "Shares calm, work").
    var pairFacets: [Endpoints: [String]] = [:]
    for (facetKey, ids) in facetIndex where ids.count > 1 {
      let label = facetLabel(facetKey)
      // ids within a facet are unique per note (built from Set above).
      for i in 0..<ids.count {
        for j in (i + 1)..<ids.count {
          let pair = Endpoints(ids[i], ids[j])
          if pair.a == pair.b { continue }
          var list = pairFacets[pair] ?? []
          if !list.contains(label) { list.append(label) }
          pairFacets[pair] = list
        }
      }
    }
    for (pair, facets) in pairFacets {
      offer(pair, .sharedFacet, facets: facets.sorted())
    }

    let edges = Array(best.values)

    var byId: [String: ConstellationNode] = [:]
    for node in nodes { byId[node.id] = node }
    var adjacency: [String: [Edge]] = [:]
    for edge in edges {
      adjacency[edge.endpoints.a, default: []].append(edge)
      adjacency[edge.endpoints.b, default: []].append(edge)
    }

    return ConstellationGraph(
      nodes: nodes, edges: edges, nodesById: byId, adjacency: adjacency)
  }

  // "tag:calm" → "calm"; "area:work" → "work" (the human part of the facet key).
  private static func facetLabel(_ facetKey: String) -> String {
    if let colon = facetKey.firstIndex(of: ":") {
      return String(facetKey[facetKey.index(after: colon)...])
    }
    return facetKey
  }
}
