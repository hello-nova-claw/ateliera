import Foundation

// Writing guidance for the Identity surface, ported verbatim from
// `apps/studio/src/features/identity/field-guidance.ts`.
extension IdentitySection {
  var guidance: FieldGuidance {
    switch self {
    case .alreadyTrue:
      return FieldGuidance(
        description: "A quality you no longer have to force — it's just how you are now.",
        example: "e.g. I rest before I'm depleted, not after.")
    case .practicingNow:
      return FieldGuidance(
        description: "Something you're growing into, not yet automatic.",
        example: "e.g. Saying \"let me think about it\" instead of an instant yes.")
    case .valuesPrinciples:
      return FieldGuidance(
        description: "A value you want to steer by.",
        example: "e.g. Depth over breadth — a few things, done with care.")
    case .desiredFeelings:
      return FieldGuidance(
        description: "A feeling you want more room for in ordinary days.",
        example: "e.g. Unhurried.")
    case .beliefsPractice:
      return FieldGuidance(
        description: "A belief, and how it shows up in what you do.",
        example: "e.g. My work is enough — so I stop at a good stopping point.")
    case .embodimentCues:
      return FieldGuidance(
        description: "A small physical reminder of who you're being.",
        example: "e.g. Shoulders down, slow exhale, before I open the laptop.")
    case .identityShifts:
      return FieldGuidance(
        description: "A change you've noticed in yourself, however small.",
        example: "e.g. I used to over-explain; lately I let a \"no\" stand.")
    }
  }
}

extension Identity {
  static let titleGuidance = FieldGuidance(
    description: "Optional. A handful of words to find this by later.",
    example: "e.g. Unhurried mornings")
}
