import Foundation

// Writing guidance for the Landscape surface, ported verbatim from
// `apps/studio/src/features/landscape/field-guidance.ts`.
enum LandscapeGuidance {
  static let newArea = FieldGuidance(
    description:
      "A part of your life you want to tend. Five to ten keeps the Landscape spacious.",
    example: "e.g. Body & energy")
  static let renameArea = FieldGuidance(
    description: "A name that feels like yours.",
    example: "e.g. Home & belonging")
}
