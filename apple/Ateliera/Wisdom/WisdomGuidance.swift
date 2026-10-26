import Foundation

// Writing guidance for the Wisdom surface, ported verbatim from
// `apps/studio/src/features/wisdom/field-guidance.ts`. The copy itself is content:
// Content/wisdom-guidance.json, the same file as apps/studio/src/content/.
enum WisdomGuidance {
  private struct Library: Decodable {
    let idea: FieldGuidance
    let title: FieldGuidance
    let creator: FieldGuidance
    let sourceTitle: FieldGuidance
    let sourceUrl: FieldGuidance
    let synthesis: FieldGuidance
    let makeItMine: FieldGuidance
  }

  private static let library: Library = ContentLibrary.load("wisdom-guidance")

  static let idea = library.idea
  static let title = library.title
  static let creator = library.creator
  static let sourceTitle = library.sourceTitle
  static let sourceUrl = library.sourceUrl
  static let synthesis = library.synthesis
  static let makeItMine = library.makeItMine
}
