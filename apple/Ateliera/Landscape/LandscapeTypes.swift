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

  /// The dimension prompt personalised to a becoming statement, so a guided thread
  /// carries the person's own words forward. The statement is quoted so any phrasing
  /// stays grammatical, and an empty seed falls back to the plain (golden-matched)
  /// `prompt`. Apple-only guided copy — no golden to match.
  func prompt(seed: String) -> String {
    let s = seed.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !s.isEmpty else { return prompt }
    switch self {
    case .vision:
      return "If “\(s)” were already true, what would an ordinary Tuesday look like?"
    case .identityValuesFeelings:
      return "Picture the version of you living “\(s)”. How does she move in rooms?"
    case .decisions:
      return "To grow into “\(s)”, what could you choose in the next 30, 60, or 90 days?"
    case .practices:
      return "What daily rhythm would let “\(s)” be lived, not just wished?"
    case .structureStrategy:
      return "What time, space, help, boundary, or money would support “\(s)”?"
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

extension LandscapeAnchor: Identifiable {
  var id: String { rawValue }
}

// A decision's time horizon. The far three + `someday` are golden-matched to the web's
// `decisionHorizons` (domain `landscape.ts`). `thisWeek`/`today` are Apple-only near-term
// rungs the reverse Possibility workshop lands on; they survive as ordinary frontmatter
// in the shared vault (the web app keeps the scalar on round-trip, it just shows no badge).
enum DecisionHorizon: String, CaseIterable {
  case d30 = "30d"
  case d60 = "60d"
  case d90 = "90d"
  case thisWeek = "this-week"
  case today
  case someday

  var label: String {
    switch self {
    case .d30: return "30 days"
    case .d60: return "60 days"
    case .d90: return "90 days"
    case .thisWeek: return "This week"
    case .today: return "Today"
    case .someday: return "Someday"
    }
  }

  // The decision rungs the reverse Possibility workshop climbs down — far horizon first,
  // breaking a possibility into progressively smaller next steps.
  static let reverseLadder: [DecisionHorizon] = [.d90, .d60, .d30, .thisWeek, .today]
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
