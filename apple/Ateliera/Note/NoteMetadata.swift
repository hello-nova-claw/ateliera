import Foundation

// The note-metadata vocabulary, mirroring `@studio/domain` exactly (golden-tested).
// This is the SINGLE source of these enums for the whole app — later phases
// (landscape, identity, wisdom, capture) import from here and never redeclare
// them (Swift's redeclaration error is the guardrail against drift).

enum SemanticType: String, CaseIterable, Codable {
  case foundations, vision, growth, reflection, celebration, uncharted
}

enum NoteStatus: String, CaseIterable, Codable {
  case draft, active, resting, archived, trashed
}

enum Sensitivity: String, CaseIterable { case `private`, sensitive }

enum AiAccess: String, CaseIterable { case never, ask, selected, scoped }

enum LandscapeAnchor: String, CaseIterable {
  case vision
  case identityValuesFeelings = "identity-values-feelings"
  case decisions
  case practices
  case structureStrategy = "structure-strategy"
}

enum NoteMetadata {
  // From `packages/domain/src/life-area.ts` (order matters).
  static let defaultLifeAreas: [(id: String, label: String)] = [
    ("family", "Family"),
    ("home", "Home"),
    ("health-wellbeing", "Health & Wellbeing"),
    ("work-business", "Work / Business"),
    ("money", "Money"),
    ("creativity", "Creativity"),
    ("relationships-community", "Relationships / Community"),
    ("adventure", "Adventure"),
    ("spirituality", "Spirituality"),
    ("learning", "Learning"),
  ]

  // The card kinds worth offering in the editor (from wisdom.ts + identity.ts,
  // plus capture/reflection); cardType stays a free-form string, so a "Custom…"
  // escape hatch covers anything else.
  static let knownCardTypes: [String] = [
    "capture", "reflection", "insight", "quote", "principle", "practice",
    "question", "resource", "synthesis", "identity-truth", "identity-emerging",
    "belief", "feeling", "embodiment-cue", "identity-shift",
  ]
}

// Typed views over StudioNote's string fields — read-only conveniences that never
// change how the model serializes (raw values match the web schema).
extension StudioNote {
  var semanticTypeEnum: SemanticType? { SemanticType(rawValue: semanticType) }
  var statusEnum: NoteStatus? { NoteStatus(rawValue: status) }
  var landscapeAnchorEnum: LandscapeAnchor? {
    landscapeAnchor.flatMap { LandscapeAnchor(rawValue: $0) }
  }
}
