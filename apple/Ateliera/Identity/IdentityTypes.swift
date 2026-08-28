import Foundation

// P5 Identity Studio vocabulary + projection models. Section definitions and the
// card-type → section mapping match `packages/domain/src/identity.ts` exactly.
//
// NOTE on the mapping: the web `identitySectionForCardType` looks a card type up by
// each section's `cardType`, then falls back to a small shared-card table. It does
// NOT map the section *ids* (e.g. "values-principles", "embodiment-cues") — those
// return nil. We reproduce the web behaviour, not the (looser) P5 spec table, since
// the web function is the golden contract.

enum IdentitySection: String, CaseIterable {
  case alreadyTrue = "already-true"
  case practicingNow = "practicing-now"
  case valuesPrinciples = "values-principles"
  case desiredFeelings = "desired-feelings"
  case beliefsPractice = "beliefs-practice"
  case embodimentCues = "embodiment-cues"
  case identityShifts = "identity-shifts"

  var label: String {
    switch self {
    case .alreadyTrue: return "Already true"
    case .practicingNow: return "Practicing now"
    case .valuesPrinciples: return "Values & principles"
    case .desiredFeelings: return "How I want to feel"
    case .beliefsPractice: return "Beliefs in practice"
    case .embodimentCues: return "Embodiment cues"
    case .identityShifts: return "Identity shifts"
    }
  }

  var prompt: String {
    switch self {
    case .alreadyTrue: return "What already feels quietly and honestly true?"
    case .practicingNow: return "What quality are you practicing in this season?"
    case .valuesPrinciples: return "What helps you recognise a life that feels like yours?"
    case .desiredFeelings: return "What feeling would you like to make room for?"
    case .beliefsPractice: return "What belief are you testing, strengthening, or revising?"
    case .embodimentCues: return "What does this look like in an ordinary hour?"
    case .identityShifts: return "What language or assumption has changed over time?"
    }
  }

  // The card_type a note captured into this section carries.
  var cardType: String {
    switch self {
    case .alreadyTrue: return "identity-truth"
    case .practicingNow: return "identity-emerging"
    case .valuesPrinciples: return "principle"
    case .desiredFeelings: return "feeling"
    case .beliefsPractice: return "belief"
    case .embodimentCues: return "embodiment-cue"
    case .identityShifts: return "identity-shift"
    }
  }

  var semanticType: String {
    switch self {
    case .alreadyTrue: return "foundations"
    case .practicingNow: return "growth"
    case .valuesPrinciples: return "foundations"
    case .desiredFeelings: return "vision"
    case .beliefsPractice: return "foundations"
    case .embodimentCues: return "growth"
    case .identityShifts: return "reflection"
    }
  }
}

enum Identity {
  // Shared-card fallbacks (domain identity.ts `sharedCardSections`).
  private static let sharedCardSections: [String: IdentitySection] = [
    "identity": .practicingNow,
    "value": .valuesPrinciples,
    "principle": .valuesPrinciples,
    "feeling": .desiredFeelings,
  ]

  /// Which identity section a card type belongs to, or nil. Mirrors the web:
  /// match a section's own `cardType` first, then the shared-card table.
  static func sectionForCardType(_ cardType: String) -> IdentitySection? {
    if let section = IdentitySection.allCases.first(where: { $0.cardType == cardType }) {
      return section
    }
    return sharedCardSections[cardType]
  }
}

// MARK: - Board projection models

struct IdentityEvidenceModel: Identifiable, Equatable {
  let id: String
  let path: String
  let title: String
  let created: String
}

struct IdentityCardModel: Identifiable, Equatable {
  let id: String
  let path: String
  let title: String
  let excerpt: String
  let semanticType: String
  let hash: String
  let created: String
  let evidence: [IdentityEvidenceModel]
}

struct IdentityBoardModel: Equatable {
  var currentlyBecoming: IdentityCardModel?
  var sections: [IdentitySection: [IdentityCardModel]]

  static let empty = IdentityBoardModel(currentlyBecoming: nil, sections: [:])
}
