import Foundation

// Context-guided capture copy, ported verbatim from
// `apps/studio/src/features/capture/field-guidance.ts`. Copy is data, not scattered
// through views.
struct CaptureGuidance: Equatable {
  let title: String
  let prompt: String
  let description: String
  let example: String

  static let generic = CaptureGuidance(
    title: "Hold this thought",
    prompt: "What would you like remembered?",
    description:
      "Anything you want the Studio to hold — a thought, a line, a fragment. It doesn't need to be finished.",
    example: "e.g. Kept choosing rest today instead of pushing through.")

  static func foyer(_ slot: FoyerSlot) -> CaptureGuidance {
    switch slot {
    case .becoming:
      return CaptureGuidance(
        title: "Name a becoming",
        prompt: "What are you currently becoming?",
        description:
          "A short sentence about who you're growing into — present tense, as if it is already beginning. It can change any time.",
        example: "e.g. I'm becoming someone who rests before they're depleted.")
    case .feeling:
      return CaptureGuidance(
        title: "Make room for a feeling",
        prompt: "What feeling would you like to make room for?",
        description:
          "A feeling you want more of in ordinary days. One word or a short phrase is plenty.",
        example: "e.g. Unhurried.")
    case .principle:
      return CaptureGuidance(
        title: "Name a guiding principle",
        prompt: "What supports this life?",
        description: "A value or principle you want to steer by.",
        example: "e.g. Depth over breadth — a few things, done with care.")
    }
  }
}
