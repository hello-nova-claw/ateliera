import Foundation

// StudioNote ↔ SeasonState, ported from `season-service.ts`. `markdownForSeason` and
// `seasonLetterBody` are byte-identical to the web (golden-tested); the note carries
// the wizard state in `season_workflow` (a nested map, with `decisions` as a block
// sequence of maps).
struct SeasonCloseDisposition: Equatable {
  var noteId: String
  var title: String
  var disposition: String  // celebrate | archive | return-landscape | invite-forward | release
}

struct SeasonCloseReflection: Equatable {
  var celebration: String
  var learning: String
  var identity: String
  var dispositions: [SeasonCloseDisposition]
}

enum SeasonNoteMapper {
  static let room = "current-season"

  static func markdownForSeason(_ state: SeasonState) -> String {
    let trimmed = state.statement.trimmingCharacters(in: .whitespaces)
    let firstLine: String
    if trimmed.isEmpty {
      firstLine = ""
    } else {
      let stripped = trimmed.replacingOccurrences(
        of: "^this is a season of\\s*", with: "",
        options: [.regularExpression, .caseInsensitive])
      firstLine = "This is a season of \(stripped)"
    }
    var lines: [String] = [
      firstLine, "", "## How I want it to feel", "", state.feelings.joined(separator: " · "),
      "", "## Enough", "", state.enough,
      "", "## Practices", "",
    ]
    lines += state.practices.map { "- \($0)" }
    lines += ["", "## Support", ""]
    lines += state.supports.map { "- \($0)" }
    lines += state.constraints.map { "- Constraint: \($0)" }
    lines += ["", "## Not now", ""]
    lines += state.notNow.map { "- \($0)" }
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
  }

  static func seasonLetterBody(_ state: SeasonState, _ reflection: SeasonCloseReflection) -> String {
    let dispositions = reflection.dispositions.map {
      "- \($0.title): \($0.disposition.replacingOccurrences(of: "-", with: " "))"
    }
    var lines = [
      "# A letter from \(state.title)", "", "## What I celebrate", "", reflection.celebration,
      "", "## What I learned", "", reflection.learning, "", "## Who I became", "",
      reflection.identity, "", "## Where each thread rests", "",
    ]
    lines += dispositions
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
  }

  // MARK: - State ↔ note

  static func stateFromNote(_ note: StudioNote) -> SeasonState {
    let stored = note.frontmatterScalar("season_id")?.trimmingCharacters(in: .whitespaces)
    let canonicalId = (stored?.isEmpty == false) ? stored! : note.id
    let status: SeasonStatus =
      note.status == "archived" ? .archived : (note.status == "active" ? .active : .draft)

    var state = SeasonEngine.createDraft(id: canonicalId, now: note.created)
    state.title = note.title ?? ""
    state.startsOn = note.frontmatterScalar("date_start")
    state.endsOn = note.frontmatterScalar("date_end")
    state.status = status
    state.statement = note.nestedScalar("season_workflow", "statement") ?? ""
    state.priorReflection = note.nestedScalar("season_workflow", "prior_reflection") ?? ""
    state.skippedPriorReflection = note.nestedBool("season_workflow", "skipped_prior_reflection")
    state.feelings = note.nestedList("season_workflow", "feelings")
    state.priorities = note.frontmatterList("priorities")
    state.decisions = note.nestedMapSeq("season_workflow", "decisions").compactMap(decision(from:))
    state.practices = note.nestedList("season_workflow", "practices")
    state.supports = note.nestedList("season_workflow", "supports")
    state.constraints = note.nestedList("season_workflow", "constraints")
    state.enough = note.nestedScalar("season_workflow", "enough") ?? ""
    state.notNow = note.nestedList("season_workflow", "not_now")
    state.midSeasonNotes = note.nestedList("season_workflow", "mid_season_notes")
    state.completedSteps = note.nestedList("season_workflow", "completed_steps")
      .compactMap { SeasonWizardStep(rawValue: $0) }
    state.updated = note.updated
    return state
  }

  private static func decision(from pairs: [(String, String)]) -> SeasonDecision? {
    let map = Dictionary(pairs, uniquingKeysWith: { first, _ in first })
    guard let id = map["id"], let text = map["text"],
      let horizon = map["horizon"].flatMap(SeasonHorizon.init(rawValue:)),
      let kind = map["kind"].flatMap(SeasonDecision.Kind.init(rawValue:))
    else { return nil }
    return SeasonDecision(id: id, text: text, horizon: horizon, kind: kind)
  }

  static func noteWithState(_ note: StudioNote, _ state: SeasonState) -> StudioNote {
    var updated = note
    updated.title = state.title
    updated.body = markdownForSeason(state)
    updated.status = state.status.rawValue
    var rooms = note.rooms
    for room in ["current-season", "foyer"] where !rooms.contains(room) { rooms.append(room) }
    updated.rooms = rooms

    let decisions = state.decisions.map { decision -> [(String, String)] in
      [
        ("id", decision.id), ("text", decision.text),
        ("horizon", decision.horizon.rawValue), ("kind", decision.kind.rawValue),
      ]
    }
    updated.applySeasonFrontmatter(
      seasonId: state.id, dateStart: state.startsOn, dateEnd: state.endsOn,
      priorities: state.priorities, statement: state.statement,
      priorReflection: state.priorReflection, skippedPriorReflection: state.skippedPriorReflection,
      feelings: state.feelings, decisions: decisions, practices: state.practices,
      supports: state.supports, constraints: state.constraints, enough: state.enough,
      notNow: state.notNow, midSeasonNotes: state.midSeasonNotes,
      completedSteps: state.completedSteps.map { $0.rawValue })
    return updated
  }

  static func createSeasonNote(_ state: SeasonState, id: String) -> StudioNote {
    let base = StudioNote(
      schemaVersion: 1, id: id, title: state.title, cardType: "season", semanticType: "growth",
      status: "draft", rooms: ["current-season", "foyer"], lifeAreas: [], landscapeAnchor: nil,
      seasons: [], tags: ["season"], created: state.created, updated: state.updated, source: nil,
      sourceNoteIds: nil, resurfaceKind: nil, resurfaceDue: nil, resurfaceIntervalDays: nil,
      attachments: [], display: NoteDisplay(cover: nil, featured: false),
      privacy: NotePrivacy(sensitivity: "private", aiAccess: "ask"), extraFrontmatter: [], body: "",
      lineEnding: "\n")
    return noteWithState(base, state)
  }
}
