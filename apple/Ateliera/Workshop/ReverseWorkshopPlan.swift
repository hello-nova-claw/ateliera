import Foundation

// The reverse Possibility workshop's step plan: a possibility is worked *backwards* in
// time — 90 → 60 → 30 days → this week → today — into progressively smaller decisions,
// then the practices and the structure/strategy that let it hold. Each step reuses a
// Landscape anchor so an answer writes a real card through the tested capture path.
// Apple-only guided copy — no golden to match; the cards it writes are golden-matched.
struct ReverseWorkshopStep: Identifiable, Equatable {
  let anchor: LandscapeAnchor
  let horizon: DecisionHorizon?  // only the decision rungs carry one

  var id: String { horizon.map { "\(anchor.rawValue):\($0.rawValue)" } ?? anchor.rawValue }

  // A short eyebrow for the step (the time horizon, or the anchor's name).
  var eyebrow: String { horizon?.label ?? anchor.label }

  // The prompt, with the possibility woven in so your own words lead the way. The far
  // horizons ask for larger moves; the near ones narrow to the next real step. An empty
  // seed still yields a usable prompt.
  func prompt(seed: String) -> String {
    let copy = ReverseWorkshopCopy.library
    let s = seed.trimmingCharacters(in: .whitespacesAndNewlines)
    let it = s.isEmpty ? copy.seed.empty : copy.seed.quoted.filled(["seed": s])
    let template: String?
    switch (anchor, horizon) {
    case (.decisions, let horizon?):
      template = copy.decisions[horizon.rawValue]
    case (.practices, _):
      template = copy.practices
    case (.structureStrategy, _):
      template = copy.structureStrategy
    default:
      template = nil
    }
    return template?.filled(["it": it]) ?? anchor.prompt
  }
}

// The workshop's prompts are content: Content/reverse-workshop.json, where `{it}` stands
// for the possibility (quoted, or a gentle stand-in when the seed is empty).
private struct ReverseWorkshopCopy: Decodable {
  struct Seed: Decodable {
    let empty: String
    let quoted: String
  }

  let seed: Seed
  let decisions: [String: String]
  let practices: String
  let structureStrategy: String

  enum CodingKeys: String, CodingKey {
    case seed, decisions, practices
    case structureStrategy = "structure-strategy"
  }

  static let library: ReverseWorkshopCopy = ContentLibrary.load("reverse-workshop")
}

enum ReverseWorkshopPlan {
  // Five decisions (far → near), then a practice, then a structure/strategy card.
  static let steps: [ReverseWorkshopStep] =
    DecisionHorizon.reverseLadder.map { ReverseWorkshopStep(anchor: .decisions, horizon: $0) }
    + [
      ReverseWorkshopStep(anchor: .practices, horizon: nil),
      ReverseWorkshopStep(anchor: .structureStrategy, horizon: nil),
    ]
}
