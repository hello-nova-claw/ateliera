import XCTest

@testable import Ateliera

// Golden-matched to @studio/index/src/sqlite-index.ts search + facets. bm25 scores
// are not an interop contract, so cross-note ranking asserts membership and the
// documented ordering rule, while snippet text, highlight ranges, matchReason,
// matchContext, the default `status != trashed` filter, and facet counts are all
// asserted against values captured from a throwaway vitest over the same corpus.
final class SearchIndexTests: XCTestCase {
  private func index() -> SearchIndex {
    let idx = SearchIndex()
    idx.rebuild([
      IndexedNote(
        id: "01H00000000000000000000001", path: "Reflection/morning.md", title: "A quiet morning",
        body: "Meet [[Future Self|her]]. See proof and self .",
        cardType: "text", semanticType: "reflection", status: "active", updated: "2026-07-10T00:00:00.000Z",
        rooms: ["reflection-garden"], lifeAreas: ["home"], seasons: ["2026-summer"], tags: ["calm", "morning"]),
      IndexedNote(
        id: "01H00000000000000000000002", path: "Identity/future.md", title: "Future Self",
        body: "Links to [[A quiet morning]] and [[not a link]] [[also ignored]] [[A quiet morning|dup]].",
        cardType: "identity", semanticType: "vision", status: "active", updated: "2026-07-12T00:00:00.000Z",
        rooms: ["identity-studio"], lifeAreas: ["home", "work"], seasons: ["2026-summer"], tags: ["calm"]),
      IndexedNote(
        id: "01H00000000000000000000003", path: "Identity/proof.md", title: "Proof of calm",
        body: "Evidence [[Ambiguous]] here. Also ext and rel .",
        cardType: "evidence", semanticType: "growth", status: "active", updated: "2026-07-08T00:00:00.000Z",
        rooms: ["reflection-garden"], lifeAreas: ["work"], seasons: ["2026-winter"], tags: ["practice"]),
      IndexedNote(
        id: "01H00000000000000000000004", path: "Landscape/ambig-a.md", title: "Ambiguous",
        body: "One of two with the same title.",
        cardType: "text", semanticType: "foundations", status: "active", updated: "2026-07-05T00:00:00.000Z",
        rooms: ["life-landscape"], lifeAreas: ["health"], seasons: ["2026-winter"], tags: ["calm"]),
      IndexedNote(
        id: "01H00000000000000000000005", path: "Landscape/ambig-b.md", title: "Ambiguous",
        body: "The other Ambiguous note.",
        cardType: "text", semanticType: "foundations", status: "archived", updated: "2026-07-04T00:00:00.000Z",
        rooms: ["life-landscape"], lifeAreas: ["health"], seasons: ["2026-spring"], tags: ["calm"]),
      IndexedNote(
        id: "01H00000000000000000000006", path: "Reflection/trashed.md", title: "Trashed calm note",
        body: "This one is trashed and should be filtered by default.",
        cardType: "text", semanticType: "reflection", status: "trashed", updated: "2026-07-11T00:00:00.000Z",
        rooms: ["reflection-garden"], lifeAreas: ["home"], seasons: ["2026-summer"], tags: ["calm"]),
      IndexedNote(
        id: "01H00000000000000000000007", path: "Wisdom/spelling.md", title: "Calmness practice",
        body: "A note about steadiness.",
        cardType: "practice", semanticType: "growth", status: "active", updated: "2026-07-09T00:00:00.000Z",
        rooms: ["wisdom-garden"], lifeAreas: ["work"], seasons: ["2026-summer"], tags: ["steady"]),
    ])
    return idx
  }

  // MARK: - Tokeniser

  func testTokeniserFoldsAndUniques() {
    XCTAssertEqual(SearchIndex.tokens("Café CAFÉ  work_flow"), ["cafe", "work_flow"])
    XCTAssertEqual(SearchIndex.tokens("   "), [])
  }

  func testEmptyButNonBlankQueryReturnsNoHits() {
    // A query with only punctuation tokenises to nothing but is non-blank ⇒ [].
    XCTAssertTrue(index().search("!!!").isEmpty)
  }

  // MARK: - Membership + default trashed exclusion

  func testCalmMatchesAllNonTrashedTaggedOrTitled() {
    let ids = Set(index().search("calm").map(\.id))
    XCTAssertEqual(
      ids,
      [
        "01H00000000000000000000001",  // tag calm
        "01H00000000000000000000002",  // tag calm
        "01H00000000000000000000003",  // title "Proof of calm"
        "01H00000000000000000000004",  // tag calm
        "01H00000000000000000000005",  // tag calm (archived, still included by default)
        "01H00000000000000000000007",  // title "Calmness practice" (prefix)
      ])
    // Trashed note 06 is excluded by default despite the calm tag.
    XCTAssertFalse(ids.contains("01H00000000000000000000006"))
  }

  func testNoMatch() {
    XCTAssertTrue(index().search("nomatchxyz").isEmpty)
  }

  // MARK: - Multi-token AND (prefix)

  func testMultiTokenAndMatchesOnlyNotesWithBothTokens() {
    let ids = Set(index().search("calm morning").map(\.id))
    XCTAssertEqual(ids, ["01H00000000000000000000001", "01H00000000000000000000002"])
  }

  // MARK: - matchReason / matchContext / snippet / highlights

  func testTitleHitHighlightAndReason() {
    let hit = index().search("quiet").first { $0.id == "01H00000000000000000000001" }!
    XCTAssertEqual(hit.snippet, "A quiet morning. Meet [[Future Self|her]]. See proof and self .")
    XCTAssertEqual(hit.highlightRanges, [HighlightRange(start: 2, end: 7)])
    XCTAssertEqual(hit.matchReason.field, .title)
    XCTAssertEqual(hit.matchReason.strategy, .keyword)
    XCTAssertNil(hit.matchContext)
  }

  func testTagContextWhenNoSnippetHighlight() {
    let hit = index().search("calm").first { $0.id == "01H00000000000000000000001" }!
    XCTAssertTrue(hit.highlightRanges.isEmpty)
    XCTAssertEqual(hit.matchReason.field, .tags)
    XCTAssertEqual(hit.matchContext, MatchContext(field: .tags, text: "calm, morning"))
  }

  func testTitleTagMatchReasonForCalmnessPrefix() {
    let hit = index().search("calm").first { $0.id == "01H00000000000000000000007" }!
    // "calm" is a prefix of "Calmness" in the title ⇒ highlight + title reason.
    XCTAssertEqual(hit.snippet, "Calmness practice. A note about steadiness.")
    XCTAssertEqual(hit.highlightRanges, [HighlightRange(start: 0, end: 4)])
    XCTAssertEqual(hit.matchReason.field, .title)
    XCTAssertNil(hit.matchContext)
  }

  // MARK: - Filters

  func testRoomFilterNarrows() {
    let ids = Set(index().search("calm", filters: SearchFilters(rooms: ["reflection-garden"])).map(\.id))
    XCTAssertEqual(ids, ["01H00000000000000000000001", "01H00000000000000000000003"])
  }

  func testExplicitStatusFilterOverridesTrashedDefault() {
    let hits = index().search("calm", filters: SearchFilters(statuses: ["archived"]))
    XCTAssertEqual(hits.map(\.id), ["01H00000000000000000000005"])
  }

  // MARK: - Facets (exact counts golden-matched to the web index)

  func testFacetsForCalm() {
    let facets = index().facets("calm")
    XCTAssertEqual(
      facets.rooms,
      [
        FacetValue(value: "life-landscape", count: 2),
        FacetValue(value: "reflection-garden", count: 2),
        FacetValue(value: "identity-studio", count: 1),
        FacetValue(value: "wisdom-garden", count: 1),
      ])
    XCTAssertEqual(
      facets.semanticTypes,
      [
        FacetValue(value: "foundations", count: 2),
        FacetValue(value: "growth", count: 2),
        FacetValue(value: "reflection", count: 1),
        FacetValue(value: "vision", count: 1),
      ])
    XCTAssertEqual(
      facets.lifeAreas,
      [
        FacetValue(value: "work", count: 3),
        FacetValue(value: "health", count: 2),
        FacetValue(value: "home", count: 2),
      ])
    XCTAssertEqual(
      facets.statuses,
      [FacetValue(value: "active", count: 5), FacetValue(value: "archived", count: 1)])
    XCTAssertEqual(
      facets.tags,
      [
        FacetValue(value: "calm", count: 4),
        FacetValue(value: "morning", count: 1),
        FacetValue(value: "practice", count: 1),
        FacetValue(value: "steady", count: 1),
      ])
    XCTAssertEqual(
      facets.cardTypes,
      [
        FacetValue(value: "text", count: 3),
        FacetValue(value: "evidence", count: 1),
        FacetValue(value: "identity", count: 1),
        FacetValue(value: "practice", count: 1),
      ])
  }

  func testFacetsExcludeOwnDimensionAndInjectSelected() {
    // With a room filter, the rooms facet is computed WITHOUT its own filter (all
    // rooms still appear) while other dimensions are narrowed to that room.
    let facets = index().facets("calm", filters: SearchFilters(rooms: ["reflection-garden"]))
    XCTAssertEqual(
      facets.rooms,
      [
        FacetValue(value: "life-landscape", count: 2),
        FacetValue(value: "reflection-garden", count: 2),
        FacetValue(value: "identity-studio", count: 1),
        FacetValue(value: "wisdom-garden", count: 1),
      ])
    XCTAssertEqual(
      facets.semanticTypes,
      [FacetValue(value: "growth", count: 1), FacetValue(value: "reflection", count: 1)])
    XCTAssertEqual(
      facets.statuses,
      [FacetValue(value: "active", count: 2)])
    XCTAssertEqual(
      facets.cardTypes,
      [FacetValue(value: "evidence", count: 1), FacetValue(value: "text", count: 1)])
  }

  func testFacetsInjectSelectedValueWithCountZero() {
    // Selecting a status that no matching note has still surfaces it with count 0.
    let facets = index().facets("calm", filters: SearchFilters(statuses: ["resting"]))
    XCTAssertTrue(facets.statuses.contains(FacetValue(value: "resting", count: 0)))
  }

  // MARK: - Cap

  func testResultsCappedAt200() {
    let idx = SearchIndex()
    idx.rebuild((0..<250).map { i in
      IndexedNote(
        id: String(format: "note-%03d", i), path: "n/\(i).md", title: "calm \(i)",
        body: "calm body", cardType: "text", semanticType: "vision", status: "active",
        updated: "2026-07-01T00:00:00.000Z", tags: [])
    })
    XCTAssertEqual(idx.search("calm").count, 200)
  }
}
