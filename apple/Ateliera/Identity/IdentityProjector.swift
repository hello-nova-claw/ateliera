import Foundation

// Pure projection of the Identity Studio room — a port of
// `projectIdentityStudioRoom` in `packages/application/src/projections.ts`. Eligible
// notes are those in the identity-studio room whose card type maps to a section;
// reflection/celebration notes with `related_notes` become evidence on the identity
// cards they point to; each section is ordered (manual overlay else fallback); the
// "currently becoming" card is the promoted practicing-now note (else a legacy
// Foyer identity card). Pure: manual orders + the promoted id arrive as inputs.
enum IdentityProjector {
  static func project(
    notes: [Projection.Loaded],
    sectionOrders: [IdentitySection: [String]] = [:],
    currentlyBecomingOrder: [String] = []
  ) -> IdentityBoardModel {
    let eligible = notes.filter {
      $0.note.rooms.contains("identity-studio")
        && Identity.sectionForCardType($0.note.cardType) != nil
    }

    // Evidence: reflection/celebration notes' `related_notes` → identity note ids.
    var evidenceByIdentity: [String: [IdentityEvidenceModel]] = [:]
    for loaded in notes {
      let note = loaded.note
      guard Projection.visible(note, viewKey: "identity:evidence"),
        note.semanticType == "reflection" || note.semanticType == "celebration"
      else { continue }
      let related = note.frontmatterList("related_notes")
        .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      var seen = Set<String>()
      for id in related where seen.insert(id).inserted {
        evidenceByIdentity[id, default: []].append(
          IdentityEvidenceModel(
            id: note.id, path: loaded.path, title: Projection.title(note),
            created: note.created))
      }
    }

    let byId = Dictionary(eligible.map { ($0.note.id, $0) }, uniquingKeysWith: { a, _ in a })
    func enrich(_ loaded: Projection.Loaded) -> IdentityCardModel {
      let note = loaded.note
      return IdentityCardModel(
        id: note.id, path: loaded.path, title: Projection.title(note),
        excerpt: Projection.excerpt(note), semanticType: note.semanticType, hash: "",
        created: note.created, evidence: evidenceByIdentity[note.id] ?? [])
    }

    var sections: [IdentitySection: [IdentityCardModel]] = [:]
    for section in IdentitySection.allCases {
      let inSection = eligible.filter {
        Identity.sectionForCardType($0.note.cardType) == section
      }
      let ordered = Projection.ordered(
        inSection, viewKey: "identity:\(section.rawValue)",
        manual: sectionOrders[section] ?? [])
      sections[section] = ordered.map(enrich)
    }

    // Currently becoming: first promoted id that is a practicing-now card, else the
    // legacy `card_type: identity` note pinned to the Foyer.
    let promoted = currentlyBecomingOrder.lazy.compactMap { id -> Projection.Loaded? in
      guard let loaded = byId[id],
        Identity.sectionForCardType(loaded.note.cardType) == .practicingNow
      else { return nil }
      return loaded
    }.first
    let legacy = eligible.first {
      $0.note.cardType == "identity" && $0.note.rooms.contains("foyer")
    }
    let becoming = (promoted ?? legacy).map(enrich)

    return IdentityBoardModel(currentlyBecoming: becoming, sections: sections)
  }
}
