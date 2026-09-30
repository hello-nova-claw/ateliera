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

  // Guided gratitude — a win or a thank-you, kept in the Reflection Garden.
  static let celebration = CaptureGuidance(
    title: "Celebrate something",
    prompt: "What's one thing that went well?",
    description:
      "A win, a small mercy, or something you're grateful for. Naming it lets the Studio remember it with you.",
    example: "e.g. Finished the hard email — and someone thanked me for it.")

  // Guided possibilities — a future you're reaching toward that doesn't need a plan yet.
  static let possibilities = CaptureGuidance(
    title: "Leave a possibility",
    prompt: "What if…?",
    description:
      "A possibility you want to keep, with no plan attached. It can stay a question.",
    example: "e.g. What if we spent a whole winter somewhere warm?")

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
