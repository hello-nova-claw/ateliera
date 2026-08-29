import Foundation

// Writing guidance for the Season surface, ported verbatim from
// `apps/studio/src/features/season/field-guidance.ts`.
enum SeasonGuidance {
  static let name = FieldGuidance(
    description: "A short name for this chapter — evocative, not a deadline.",
    example: "e.g. Quiet foundations")
  static let carryAsLearning = FieldGuidance(
    description: "One thing from the last stretch you want to bring forward.",
    example: "e.g. Protecting mornings mattered more than any to-do list.")
  static let statement = FieldGuidance(
    description: "Finish the sentence in a few words.",
    example: "e.g. …tending what I've already started.")
  static let feelings = FieldGuidance(
    description: "A few feelings you want this season to have. One per line.",
    example: "e.g. steady · spacious · warm")
  static let newPriority = FieldGuidance(
    description: "A focus that isn't a life area yet.",
    example: "e.g. Finish the studio rewrite")
  static let decisions30 = FieldGuidance(
    description: "Small experiments or decisions for the next month. One per line.",
    example: "e.g. Try a 4-day writing week")
  static let decisions60 = FieldGuidance(
    description: "Slightly further out. One per line.",
    example: "e.g. Decide whether to keep the Tuesday commitment")
  static let decisions90 = FieldGuidance(
    description: "The horizon of this season. One per line.",
    example: "e.g. Revisit where I live")
  static let practices = FieldGuidance(
    description: "Repeatable things that support the season. One per line.",
    example: "e.g. Walk before screens")
  static let supports = FieldGuidance(
    description: "People, tools, or conditions you can lean on. One per line.",
    example: "e.g. Thursday call with Sam")
  static let constraints = FieldGuidance(
    description: "Honest limits to design around, without judgement. One per line.",
    example: "e.g. Low energy until the meds settle")
  static let enough = FieldGuidance(
    description: "Name \"enough\" now, so you can recognise it later.",
    example: "e.g. If mornings stay mine, this season did its work.")
  static let notNow = FieldGuidance(
    description: "What you're deliberately not doing now — resting, not backlog. One per line.",
    example: "e.g. Learning a new language")
  static let celebration = FieldGuidance(
    description: "Something worth marking from this season.",
    example: "e.g. I kept the promise about mornings.")
  static let learning = FieldGuidance(
    description: "One lesson you're taking forward.",
    example: "e.g. Constraints made me more, not less, creative.")
  static let identity = FieldGuidance(
    description: "A way you changed across this chapter.",
    example: "e.g. Someone who stops at enough.")

  // The priorities fieldset is a grouped control; its description renders near the
  // legend rather than through a single GuidedField.
  static let prioritiesDescription = "Up to three areas that deserve the clearest attention now."
}
