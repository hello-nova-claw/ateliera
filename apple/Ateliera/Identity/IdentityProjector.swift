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
    // Active identity cards feed the sections + hero; archived/trashed ones are set
    // aside (retired becomings surface in their own group instead).
    let eligible = notes.filter {
      $0.note.rooms.contains("identity-studio")
        && Identity.sectionForCardType($0.note.cardType) != nil
        && $0.note.status != "archived" && $0.note.status != "trashed"
    }

    // A becoming = a Life-planning identity statement pinned to the Foyer. Several can be
    // in play at once (one per life area); retired ones keep their `archived_reason`.
    let becomings: [Projection.Loaded] = notes.filter { Becoming.matches($0.note) }
    let activeLoaded: [Projection.Loaded] =
      becomings
      .filter { $0.note.status != "archived" && $0.note.status != "trashed" }
      .sorted { $0.note.created > $1.note.created }
    let retiredLoaded: [Projection.Loaded] =
      becomings
      .filter { $0.note.status == "archived" }
      .sorted { $0.note.created > $1.note.created }
    let activeBecomings: [BecomingModel] = activeLoaded.map { loaded in
      BecomingModel(
        id: loaded.note.id, path: loaded.path, title: Projection.title(loaded.note),
        excerpt: Projection.excerpt(loaded.note), lifeAreaId: loaded.note.lifeAreas.first,
        created: loaded.note.created)
    }
    let retiredBecomings: [RetiredBecomingModel] = retiredLoaded.map { loaded in
      RetiredBecomingModel(
        id: loaded.note.id, path: loaded.path, title: Projection.title(loaded.note),
        lifeAreaId: loaded.note.lifeAreas.first,
        reason: loaded.note.frontmatterScalar("archived_reason"), created: loaded.note.created)
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

    return IdentityBoardModel(
      currentlyBecoming: becoming, sections: sections, activeBecomings: activeBecomings,
      retiredBecomings: retiredBecomings)
  }
}
