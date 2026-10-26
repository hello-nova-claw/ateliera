import Foundation

// Context-guided capture copy, ported verbatim from
// `apps/studio/src/features/capture/field-guidance.ts`. The copy itself is content:
// Content/capture-guidance.json.
struct CaptureGuidance: Equatable, Decodable {
  let title: String
  let prompt: String
  let description: String
  let example: String

  private struct Library: Decodable {
    let generic: CaptureGuidance
    let celebration: CaptureGuidance
    let possibilities: CaptureGuidance
    let foyer: [String: CaptureGuidance]
  }

  private static let library: Library = ContentLibrary.load("capture-guidance")

  static let generic = library.generic

  // Guided gratitude — a win or a thank-you, kept in the Reflection Garden.
  static let celebration = library.celebration

  // Guided possibilities — a future you're reaching toward that doesn't need a plan yet.
  static let possibilities = library.possibilities

  static func foyer(_ slot: FoyerSlot) -> CaptureGuidance {
    library.foyer[slot.rawValue] ?? generic
  }
}
