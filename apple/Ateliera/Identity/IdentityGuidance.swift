import Foundation

// Writing guidance for the Identity surface, ported verbatim from
// `apps/studio/src/features/identity/field-guidance.ts`. The copy itself is content:
// Content/identity-guidance.json, the same file as apps/studio/src/content/.
private struct IdentityGuidanceLibrary: Decodable {
  let sections: [String: FieldGuidance]
  let title: FieldGuidance

  static let shared: IdentityGuidanceLibrary = ContentLibrary.load("identity-guidance")
}

extension IdentitySection {
  var guidance: FieldGuidance {
    IdentityGuidanceLibrary.shared.sections[rawValue] ?? FieldGuidance(description: "", example: "")
  }
}

extension Identity {
  static let titleGuidance = IdentityGuidanceLibrary.shared.title
}
