import XCTest

@testable import Ateliera

// Pure graph-building logic for the Constellation spike: notes + their real
// relationships → nodes + typed edges, with dedup and dangling-link handling.
// (First-cut spike — the edge definitions here are what Anna should weigh in on;
// see ConstellationGraph.swift for the design notes.)
final class ConstellationGraphTests: XCTestCase {
  // A small corpus exercising every edge kind:
  //  seed ← develops (source_notes) ← card
  //  seed ←→ morning (reciprocal wiki links resolve to one undirected edge)
  //  morning & card share tag "calm"; card & seed share life area "work"
  //  orphan has no relationships at all.
  private func inputs() -> [ConstellationInput] {
    [
      ConstellationInput(
        id: "seed", path: "Journal/seed.md", title: "A seed of a thought",
        timestamp: "2026-07-01T00:00:00.000Z", meaning: "text",
        tags: [], lifeAreas: ["work"], sourceNoteIds: [],
        body: "Points to [[A quiet morning]]."),
      ConstellationInput(
        id: "morning", path: "Journal/morning.md", title: "A quiet morning",
        timestamp: "2026-07-02T00:00:00.000Z", meaning: "celebration",
        tags: ["calm"], lifeAreas: [], sourceNoteIds: [],
        body: "Back to [[A seed of a thought]]."),
      ConstellationInput(
        id: "card", path: "Landscape/card.md", title: "A developed card",
        timestamp: "2026-07-03T00:00:00.000Z", meaning: "identity",
        tags: ["calm"], lifeAreas: ["work"], sourceNoteIds: ["seed"],
        body: "No body links."),
      ConstellationInput(
        id: "orphan", path: "Journal/orphan.md", title: "An orphan moment",
        timestamp: "2026-07-04T00:00:00.000Z", meaning: "text",
        tags: ["solo"], lifeAreas: ["health"], sourceNoteIds: [],
        body: "Alone, and pointing at [[Nothing that exists]]."),
    ]
  }

  // MARK: - Nodes

  func testEveryNoteBecomesExactlyOneNode() {
    let graph = ConstellationGraph.build(from: inputs())
    XCTAssertEqual(graph.nodes.count, 4)
    XCTAssertEqual(Set(graph.nodes.map(\.id)), ["seed", "morning", "card", "orphan"])
    // Node carries enough to show the moment and open it.
    let morning = graph.node("morning")
    XCTAssertEqual(morning?.title, "A quiet morning")
    XCTAssertEqual(morning?.path, "Journal/morning.md")
    XCTAssertEqual(morning?.meaning, "celebration")
  }

  // MARK: - Link edges (backlinks / resolved wiki-id-path)

  func testReciprocalWikiLinksCollapseToOneUndirectedLinkEdge() {
    let graph = ConstellationGraph.build(from: inputs())
    let links = graph.edges.filter { $0.kind == .link }
    // seed↔morning is a single undirected edge despite links in both directions.
    XCTAssertEqual(links.count, 1)
    XCTAssertEqual(links.first?.endpoints, ConstellationGraph.Endpoints("morning", "seed"))
  }

  // MARK: - source_notes edges

  func testSourceNotesBecomesALineageEdge() {
    let graph = ConstellationGraph.build(from: inputs())
    let lineage = graph.edges.filter { $0.kind == .lineage }
    XCTAssertEqual(lineage.count, 1)
    XCTAssertEqual(lineage.first?.endpoints, ConstellationGraph.Endpoints("card", "seed"))
  }

  // MARK: - Shared-facet edges (lighter lines)

  func testSharedTagAndSharedLifeAreaBecomeFacetEdges() {
    let graph = ConstellationGraph.build(from: inputs())
    let facet = graph.edges.filter { $0.kind == .sharedFacet }
    // morning↔card share tag "calm" (seed↔card's shared area "work" is subsumed by
    // their stronger lineage edge, so it is not a separate facet edge).
    XCTAssertEqual(
      Set(facet.map(\.endpoints)),
      [ConstellationGraph.Endpoints("card", "morning")])
  }

  func testAFacetEdgeIsNotDuplicatedByAStrongerEdgeOnTheSamePair() {
    // seed↔card are joined by BOTH source_notes (lineage) and a shared life area.
    // The stronger edge wins — no second, redundant facet edge on that pair.
    let graph = ConstellationGraph.build(from: inputs())
    let seedCard = graph.edges.filter {
      $0.endpoints == ConstellationGraph.Endpoints("card", "seed")
    }
    XCTAssertEqual(seedCard.count, 1)
    XCTAssertEqual(seedCard.first?.kind, .lineage)
  }

  // MARK: - Dangling / missing links

  func testDanglingLinkToANonexistentNoteProducesNoEdge() {
    let graph = ConstellationGraph.build(from: inputs())
    // orphan links to "Nothing that exists" (unresolved) and its only facets are
    // tag "solo"/area "health" shared with no one → it stays an isolated node.
    let orphanEdges = graph.edges.filter {
      $0.endpoints.a == "orphan" || $0.endpoints.b == "orphan"
    }
    XCTAssertTrue(orphanEdges.isEmpty)
    XCTAssertTrue(graph.isolatedNodeIds.contains("orphan"))
  }

  func testSelfReferenceNeverBecomesAnEdge() {
    let selfLink = [
      ConstellationInput(
        id: "n1", path: "n1.md", title: "Navel", timestamp: "", meaning: "text",
        tags: ["x"], lifeAreas: ["y"], sourceNoteIds: ["n1"], body: "[[Navel]]")
    ]
    let graph = ConstellationGraph.build(from: selfLink)
    XCTAssertTrue(graph.edges.isEmpty)
  }

  // MARK: - Degrade gracefully

  func testEmptyInputGivesEmptyGraph() {
    let graph = ConstellationGraph.build(from: [])
    XCTAssertTrue(graph.nodes.isEmpty)
    XCTAssertTrue(graph.edges.isEmpty)
    XCTAssertTrue(graph.isolatedNodeIds.isEmpty)
  }

  func testSingleNoteIsOneIsolatedNode() {
    let one = [
      ConstellationInput(
        id: "only", path: "only.md", title: "The only moment", timestamp: "",
        meaning: "text", tags: [], lifeAreas: [], sourceNoteIds: [], body: "")
    ]
    let graph = ConstellationGraph.build(from: one)
    XCTAssertEqual(graph.nodes.count, 1)
    XCTAssertTrue(graph.edges.isEmpty)
    XCTAssertEqual(graph.isolatedNodeIds, ["only"])
  }

  // MARK: - Endpoints are order-independent (undirected)

  func testEndpointsEqualityIsUndirected() {
    XCTAssertEqual(
      ConstellationGraph.Endpoints("a", "b"), ConstellationGraph.Endpoints("b", "a"))
    XCTAssertEqual(
      ConstellationGraph.Endpoints("a", "b").hashValue,
      ConstellationGraph.Endpoints("b", "a").hashValue)
  }

  // MARK: - Accessibility alternative (relationships as text)

  func testNeighboursListsEveryConnectedMomentWithRelationshipWording() {
    let graph = ConstellationGraph.build(from: inputs())
    let neighbours = graph.neighbours(of: "seed")
    // seed connects to morning (link) and card (lineage).
    XCTAssertEqual(Set(neighbours.map(\.node.id)), ["morning", "card"])
    let toCard = neighbours.first { $0.node.id == "card" }
    XCTAssertEqual(toCard?.kind, .lineage)
    XCTAssertFalse(toCard?.relationshipDescription.isEmpty ?? true)
  }
}
