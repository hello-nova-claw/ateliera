import Foundation

// Writing guidance for the Wisdom surface, ported verbatim from
// `apps/studio/src/features/wisdom/field-guidance.ts`.
enum WisdomGuidance {
  static let idea = FieldGuidance(
    description: "The insight, quote, or principle, in your own words or theirs.",
    example: "e.g. You don't rise to your goals; you fall to your systems.")
  static let title = FieldGuidance(
    description: "Optional. A short handle for this idea.",
    example: "e.g. Systems over goals")
  static let creator = FieldGuidance(
    description: "Who said or made it.",
    example: "e.g. James Clear")
  static let sourceTitle = FieldGuidance(
    description: "Where you met it.",
    example: "e.g. Atomic Habits")
  static let sourceUrl = FieldGuidance(
    description: "Optional link back to it.",
    example: "e.g. https://…")
  static let synthesis = FieldGuidance(
    description: "The thread you see running through the ones you've chosen.",
    example: "e.g. All three are really about lowering the cost of starting.")
  static let makeItMine = FieldGuidance(
    description: "Your own take — what you've observed, how it fits your life.",
    example: "e.g. For me this shows up as: prepare the space the night before.")
}
