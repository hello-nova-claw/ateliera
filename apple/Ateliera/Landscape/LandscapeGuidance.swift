import Foundation

// Writing guidance for the Landscape surface, ported verbatim from
// `apps/studio/src/features/landscape/field-guidance.ts`. The copy itself is content:
// Content/landscape-guidance.json, the same file as apps/studio/src/content/.
enum LandscapeGuidance {
  private struct Library: Decodable {
    let newArea: FieldGuidance
    let renameArea: FieldGuidance
  }

  private static let library: Library = ContentLibrary.load("landscape-guidance")

  static let newArea = library.newArea
  static let renameArea = library.renameArea
}
