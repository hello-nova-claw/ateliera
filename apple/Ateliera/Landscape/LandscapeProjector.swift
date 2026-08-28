import Foundation

// Pure projection of the Life Landscape board — a port of `projectLandscapeBoard`
// in `packages/application/src/projections.ts`. For every (area × anchor) cell it
// selects the notes carrying that life area + landscape anchor, orders them
// (manual overlay from view state, else the deterministic fallback), promotes a
// featured card to the front, and reports the featured card + how many more sit
// behind it. Pure: manual orders arrive as a dict so there is no I/O here.
enum LandscapeProjector {
  /// - notes: every parsed note (path + model).
  /// - areas: the active life-area ids, in display order.
  /// - orders: manual card order per cell, keyed by the view key
  ///   `"landscape:<area>:<anchor>"` → `[noteId]`.
  static func project(
    notes: [Projection.Loaded], areas: [String], orders: [String: [String]] = [:]
  ) -> LandscapeBoardModel {
    var cells: [LandscapeCellModel] = []
    var seenAreas = Set<String>()
    for area in areas where seenAreas.insert(area).inserted {
      for anchor in LandscapeAnchor.ordered {
        let viewKey = "landscape:\(area):\(anchor.rawValue)"
        let candidates = notes.filter {
          $0.note.lifeAreas.contains(area) && $0.note.landscapeAnchor == anchor.rawValue
        }
        let ordered = Projection.ordered(candidates, viewKey: viewKey, manual: orders[viewKey] ?? [])
        var cards = ordered.map { card($0, anchor: anchor) }

        // Promote the featured card to index 0 (matching the web's splice/unshift).
        if let featuredIndex = cards.firstIndex(where: { $0.isFeatured }), featuredIndex > 0 {
          let featured = cards.remove(at: featuredIndex)
          cards.insert(featured, at: 0)
        }

        cells.append(
          LandscapeCellModel(
            lifeArea: area, anchor: anchor, featured: cards.first,
            additionalCount: max(0, cards.count - 1),
            cards: cards, noteIds: cards.map { $0.id }))
      }
    }
    return LandscapeBoardModel(cells: cells)
  }

  private static func card(_ loaded: Projection.Loaded, anchor: LandscapeAnchor)
    -> LandscapeCardModel
  {
    let note = loaded.note
    let horizon = note.frontmatterScalar("decision_horizon")
      .flatMap { DecisionHorizon(rawValue: $0) }
    return LandscapeCardModel(
      id: note.id, path: loaded.path, title: Projection.title(note),
      excerpt: Projection.excerpt(note), semanticType: note.semanticType, hash: "",
      lifeAreas: note.lifeAreas, anchor: anchor, decisionHorizon: horizon,
      isFeatured: note.display.featured)
  }
}
