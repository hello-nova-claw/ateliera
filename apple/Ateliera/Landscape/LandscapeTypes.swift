import Foundation

// P5 Life Landscape vocabulary + projection models. `LandscapeAnchor` itself is
// owned by P1's NoteMetadata.swift (single source — do not redeclare); this file
// only extends it with display copy + the anchor→semantic mapping, and adds the
// horizon/area/board types the room needs. Golden values match
// `packages/domain/src/landscape.ts` and `life-area.ts`.

extension LandscapeAnchor {
  // Ordered as the web board lays out its rows (landscapeAnchorDefinitions).
  static let ordered: [LandscapeAnchor] = [
    .vision, .identityValuesFeelings, .decisions, .practices, .structureStrategy,
  ]

  var label: String {
    switch self {
    case .vision: return "Vision"
    case .identityValuesFeelings: return "Identity, values & feelings"
    case .decisions: return "Decisions"
    case .practices: return "Practices"
    case .structureStrategy: return "Structure & strategy"
    }
  }

  var prompt: String {
    switch self {
    case .vision:
      return "What would an ordinary Tuesday look like if this were true?"
    case .identityValuesFeelings:
      return "Who is the version of me living this? How does she move in rooms?"
    case .decisions:
      return "What can I choose in the next 30, 60, or 90 days?"
    case .practices:
      return "What rhythm lets this be lived repeatedly?"
    case .structureStrategy:
      return "What time, environment, help, boundary, money, or system supports it?"
    }
  }

  // semanticTypeForLandscapeAnchor in domain/landscape.ts. Written to the note's
  // `semantic_type` (alongside `card_type = rawValue`) when a card is moved.
  var semanticType: String {
    switch self {
    case .vision: return "vision"
    case .identityValuesFeelings: return "foundations"
    case .decisions: return "growth"
    case .practices: return "growth"
    case .structureStrategy: return "foundations"
    }
  }

  var cardType: String { rawValue }
}

// A decision's time horizon (domain `decisionHorizons`). Read-only in P5 — shown as
// a badge on decision cards; writing one at capture is a P7 concern.
enum DecisionHorizon: String, CaseIterable {
  case d30 = "30d"
  case d60 = "60d"
  case d90 = "90d"
  case someday

  var label: String {
    switch self {
    case .d30: return "30 days"
    case .d60: return "60 days"
    case .d90: return "90 days"
    case .someday: return "Someday"
    }
  }
}

// A configured life area (id + display title).
struct LifeArea: Identifiable, Equatable, Codable {
  var id: String
  var title: String
}

// A life-area preference row as stored in landscape-areas.json.
struct LifeAreaPreference: Identifiable, Equatable, Codable {
  var id: String
  var title: String
  var hidden: Bool
  var order: Int
}

extension LifeAreaPreference {
  // The 10 defaults from domain/life-area.ts: the first five active, the rest
  // hidden — matching the web's initial board.
  static let defaults: [LifeAreaPreference] = NoteMetadata.defaultLifeAreas.enumerated()
    .map { index, area in
      LifeAreaPreference(id: area.id, title: area.label, hidden: index >= 5, order: index)
    }

  var asLifeArea: LifeArea { LifeArea(id: id, title: title) }
}

// MARK: - Board projection models

struct LandscapeCardModel: Identifiable, Equatable {
  let id: String  // noteId
  let path: String
  let title: String
  let excerpt: String
  let semanticType: String
  let hash: String
  var lifeAreas: [String]
  var anchor: LandscapeAnchor
  var decisionHorizon: DecisionHorizon?
  var isFeatured: Bool
}

struct LandscapeCellModel: Equatable, Identifiable {
  let lifeArea: String
  let anchor: LandscapeAnchor
  let featured: LandscapeCardModel?
  let additionalCount: Int
  let cards: [LandscapeCardModel]
  let noteIds: [String]

  var id: String { "\(lifeArea):\(anchor.rawValue)" }
}

struct LandscapeBoardModel: Equatable {
  let cells: [LandscapeCellModel]

  static let empty = LandscapeBoardModel(cells: [])

  func cell(area: String, anchor: LandscapeAnchor) -> LandscapeCellModel? {
    cells.first { $0.lifeArea == area && $0.anchor == anchor }
  }
}
