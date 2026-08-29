import Foundation

// Pure projection of the Reflection Garden — a port of `projectReflectionGardenRoom`
// + `reflectionEvidenceConnections`. A Garden is a chronology (created desc, id asc),
// not a manually-ordered board. Each entry carries its evidence connections (linked
// notes, life areas, seasons) resolved to available / archived / missing.

enum EvidenceKind: String, Equatable {
  case note
  case lifeArea = "life-area"
  case season
}

enum EvidenceState: String, Equatable {
  case available
  case archived
  case missing
}

struct EvidenceConnection: Equatable, Identifiable {
  let kind: EvidenceKind
  let targetId: String
  let label: String?
  let state: EvidenceState

  var id: String { "\(kind.rawValue):\(targetId)" }
}

struct ReflectionLifeAreaTarget: Equatable {
  let id: String
  let title: String
  let hidden: Bool
}

struct ReflectionCard: Identifiable, Equatable {
  let id: String  // noteId
  let path: String
  let title: String
  let excerpt: String
  let created: String
  let semanticType: String
  let lifeAreas: [String]
  let seasons: [String]
  let tags: [String]
  let linkedNoteIds: [String]
  let evidence: [EvidenceConnection]
  let thenNoteId: String?
  let coverReference: String?
}

struct ReflectionThemeCount: Identifiable, Equatable {
  let name: String
  let count: Int
  var id: String { name }
}

struct ReflectionGarden: Equatable {
  let cards: [ReflectionCard]
  let themes: [ReflectionThemeCount]

  static let empty = ReflectionGarden(cards: [], themes: [])
}

enum ReflectionProjection {
  // belongsToRoom(note, "reflection-garden"): tagged, or reflection/celebration.
  static func belongs(_ note: StudioNote) -> Bool {
    note.rooms.contains("reflection-garden")
      || note.semanticType == "reflection" || note.semanticType == "celebration"
  }

  static func project(
    notes: [Projection.Loaded], lifeAreas: [ReflectionLifeAreaTarget] = []
  ) -> ReflectionGarden {
    let candidates = notes.filter { belongs($0.note) }

    // Chronological, newest first (created desc, id asc), visible + de-duped.
    var seen = Set<String>()
    let ordered = candidates
      .filter { Projection.visible($0.note, viewKey: "room:reflection-garden") }
      .sorted { a, b in
        if a.note.created != b.note.created { return a.note.created > b.note.created }
        return a.note.id < b.note.id
      }
      .filter { seen.insert($0.note.id).inserted }

    // All notes grouped by id (for note-evidence resolution incl. duplicates/archived).
    var byId: [String: [StudioNote]] = [:]
    for loaded in notes { byId[loaded.note.id, default: []].append(loaded.note) }

    let cards = ordered.map { loaded -> ReflectionCard in
      let note = loaded.note
      return ReflectionCard(
        id: note.id, path: loaded.path, title: Projection.title(note),
        excerpt: Projection.excerpt(note), created: note.created, semanticType: note.semanticType,
        lifeAreas: note.lifeAreas, seasons: note.seasons, tags: note.tags,
        linkedNoteIds: stringList(note.frontmatterList("related_notes")),
        evidence: evidence(for: note, byId: byId, lifeAreas: lifeAreas),
        thenNoteId: note.frontmatterScalar("then_note_id").flatMap {
          $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0
        },
        coverReference: note.display.cover)
    }

    var counts: [String: Int] = [:]
    for card in cards {
      for tag in Set(card.tags) { counts[tag, default: 0] += 1 }
    }
    let themes = counts.map { ReflectionThemeCount(name: $0.key, count: $0.value) }
      .sorted { a, b in
        a.count != b.count ? a.count > b.count : a.name.localizedCompare(b.name) == .orderedAscending
      }
    return ReflectionGarden(cards: cards, themes: themes)
  }

  // MARK: - Evidence resolution (port of resolveReflectionEvidenceTargetFromMap)

  private static func evidence(
    for note: StudioNote, byId: [String: [StudioNote]], lifeAreas: [ReflectionLifeAreaTarget]
  ) -> [EvidenceConnection] {
    let lifeAreasById = Dictionary(lifeAreas.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

    // Seasons grouped by their season_id (or note id).
    var seasonsById: [String: [StudioNote]] = [:]
    for notes in byId.values {
      for candidate in notes where candidate.cardType == "season" {
        let stored = candidate.frontmatterScalar("season_id")?.trimmingCharacters(in: .whitespaces)
        let seasonId = (stored?.isEmpty == false) ? stored! : candidate.id
        seasonsById[seasonId, default: []].append(candidate)
      }
    }

    var connections: [EvidenceConnection] = []
    for id in stringList(note.frontmatterList("related_notes")) {
      let targets = byId[id] ?? []
      let state: EvidenceState =
        targets.contains { $0.status != "archived" && $0.status != "trashed" }
        ? .available : (targets.contains { $0.status == "archived" } ? .archived : .missing)
      connections.append(EvidenceConnection(kind: .note, targetId: id, label: nil, state: state))
    }
    for id in stringList(note.lifeAreas) {
      if let area = lifeAreasById[id] {
        connections.append(
          EvidenceConnection(
            kind: .lifeArea, targetId: id, label: area.title,
            state: area.hidden ? .archived : .available))
      } else {
        connections.append(
          EvidenceConnection(kind: .lifeArea, targetId: id, label: nil, state: .missing))
      }
    }
    for id in stringList(note.seasons) {
      let targets = seasonsById[id] ?? []
      if let active = targets.first(where: { $0.status == "active" }) {
        connections.append(
          EvidenceConnection(
            kind: .season, targetId: id, label: seasonLabel(active, id), state: .available))
      } else if let archived = targets.first(where: { $0.status == "archived" }) {
        connections.append(
          EvidenceConnection(
            kind: .season, targetId: id, label: seasonLabel(archived, id), state: .archived))
      } else {
        connections.append(
          EvidenceConnection(kind: .season, targetId: id, label: nil, state: .missing))
      }
    }
    return connections
  }

  private static func seasonLabel(_ note: StudioNote, _ id: String) -> String {
    let title = note.title?.trimmingCharacters(in: .whitespaces) ?? ""
    return title.isEmpty ? id : title
  }

  // stringList: trimmed, non-empty, de-duped preserving order.
  private static func stringList(_ values: [String]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for value in values {
      let trimmed = value.trimmingCharacters(in: .whitespaces)
      if !trimmed.isEmpty && seen.insert(trimmed).inserted { out.append(trimmed) }
    }
    return out
  }
}
