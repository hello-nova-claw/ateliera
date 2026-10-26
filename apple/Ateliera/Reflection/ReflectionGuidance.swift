import Foundation

// Writing guidance for the Reflection surface, ported verbatim from
// `apps/studio/src/features/reflection/field-guidance.ts`. The copy itself is content:
// Content/reflection-guidance.json, the same file as apps/studio/src/content/.
enum ReflectionGuidance {
  private struct Library: Decodable {
    let sentenceToKeep: FieldGuidance
  }

  private static let library: Library = ContentLibrary.load("reflection-guidance")

  static let sentenceToKeep = library.sentenceToKeep
}
