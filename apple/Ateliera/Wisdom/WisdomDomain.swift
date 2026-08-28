import Foundation

// Wisdom Garden vocabulary, golden-matched to `packages/domain/src/wisdom.ts`.
enum WisdomDomain {
  static let kinds: [String] = [
    "insight", "quote", "principle", "practice", "question", "resource", "synthesis",
  ]

  // semanticTypeForWisdomKind: principle/synthesis → foundations, practice → growth,
  // question → uncharted, everything else → reflection.
  static func semanticType(forKind kind: String) -> String {
    switch kind {
    case "principle", "synthesis": return "foundations"
    case "practice": return "growth"
    case "question": return "uncharted"
    default: return "reflection"
    }
  }

  // The 13 default themes (id + title), in order.
  static let defaultThemes: [WisdomTheme] = [
    WisdomTheme(id: "alignment", title: "Alignment"),
    WisdomTheme(id: "identity", title: "Identity"),
    WisdomTheme(id: "self-worth", title: "Self-worth"),
    WisdomTheme(id: "creativity", title: "Creativity"),
    WisdomTheme(id: "motherhood", title: "Motherhood"),
    WisdomTheme(id: "money", title: "Money"),
    WisdomTheme(id: "business", title: "Business"),
    WisdomTheme(id: "relationships", title: "Relationships"),
    WisdomTheme(id: "beauty", title: "Beauty"),
    WisdomTheme(id: "rest", title: "Rest"),
    WisdomTheme(id: "decision-making", title: "Decision-making"),
    WisdomTheme(id: "imagination", title: "Imagination"),
    WisdomTheme(id: "nervous-system-care", title: "Nervous-system care"),
  ]

  // titleForTheme: title-case a theme id the config doesn't name (matches web).
  static func titleForTheme(_ id: String) -> String {
    id.split(separator: "-").map { part in
      guard let first = part.first else { return "" }
      return first.uppercased() + part.dropFirst()
    }.joined(separator: " ")
  }
}

struct WisdomTheme: Identifiable, Equatable, Codable {
  var id: String
  var title: String
}
