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
    let s = seed.trimmingCharacters(in: .whitespacesAndNewlines)
    let it = s.isEmpty ? "this possibility" : "“\(s)”"
    switch (anchor, horizon) {
    case (.decisions, .d90):
      return "Picture \(it) three months on. What big decision would already be made?"
    case (.decisions, .d60):
      return "Two months out, on the way to \(it) — what will you have decided by then?"
    case (.decisions, .d30):
      return "A month from now, what smaller choice moves \(it) closer?"
    case (.decisions, .thisWeek):
      return "This week, what's one decision you could make toward \(it)?"
    case (.decisions, .today):
      return "And today — what's the smallest step you could take toward \(it)?"
    case (.practices, _):
      return "What gentle rhythm would keep \(it) alive between those steps?"
    case (.structureStrategy, _):
      return "What time, space, help, or money would give \(it) room to happen?"
    default:
      return anchor.prompt
    }
  }
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
