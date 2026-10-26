import Foundation

// Writing guidance for the Season surface, ported verbatim from
// `apps/studio/src/features/season/field-guidance.ts`. The copy itself is content:
// Content/season-guidance.json, the same file as apps/studio/src/content/.
enum SeasonGuidance {
  private struct Library: Decodable {
    struct Priorities: Decodable {
      let description: String
    }

    let fields: [String: FieldGuidance]
    let priorities: Priorities
  }

  private static let library: Library = ContentLibrary.load("season-guidance")

  private static func field(_ key: String) -> FieldGuidance {
    library.fields[key] ?? FieldGuidance(description: "", example: "")
  }

  static let name = field("name")
  static let carryAsLearning = field("carryAsLearning")
  static let statement = field("statement")
  static let feelings = field("feelings")
  static let newPriority = field("newPriority")
  static let decisions30 = field("decisions30")
  static let decisions60 = field("decisions60")
  static let decisions90 = field("decisions90")
  static let practices = field("practices")
  static let supports = field("supports")
  static let constraints = field("constraints")
  static let enough = field("enough")
  static let notNow = field("notNow")
  static let celebration = field("celebration")
  static let learning = field("learning")
  static let identity = field("identity")

  // The priorities fieldset is a grouped control; its description renders near the
  // legend rather than through a single GuidedField.
  static let prioritiesDescription = library.priorities.description
}
