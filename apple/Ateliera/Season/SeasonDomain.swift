import Foundation

// The Current Season state machine — a port of `packages/domain/src/season.ts`. Pure,
// no I/O: create a draft, advance it through the nine wizard steps, activate, revise,
// and close. Validation mirrors the web (dates, priority limit, required reflection).

enum SeasonWizardStep: String, CaseIterable, Equatable {
  case nameDates = "name-dates"
  case priorReflection = "prior-reflection"
  case feelings
  case priorities
  case decisionsPractices = "decisions-practices"
  case supportsConstraints = "supports-constraints"
  case enough
  case notNow = "not-now"
  case confirm
}

let seasonWizardSteps = SeasonWizardStep.allCases

enum SeasonStatus: String, Equatable {
  case draft, active, archived
}

enum SeasonHorizon: String, Equatable, CaseIterable {
  case d30 = "30"
  case d60 = "60"
  case d90 = "90"
}

struct SeasonDecision: Equatable {
  var id: String
  var text: String
  var horizon: SeasonHorizon
  var kind: Kind
  enum Kind: String, Equatable { case decision, experiment }
}

struct SeasonState: Equatable {
  var id: String
  var title: String = ""
  var startsOn: String?
  var endsOn: String?
  var statement: String = ""
  var status: SeasonStatus = .draft
  var priorReflection: String = ""
  var skippedPriorReflection: Bool = false
  var feelings: [String] = []
  var priorities: [String] = []
  var decisions: [SeasonDecision] = []
  var practices: [String] = []
  var supports: [String] = []
  var constraints: [String] = []
  var enough: String = ""
  var notNow: [String] = []
  var midSeasonNotes: [String] = []
  var completedSteps: [SeasonWizardStep] = []
  var created: String
  var updated: String
}

// One wizard step's answers. `step` ties the case to the wizard position.
enum SeasonStepAnswers {
  case nameDates(title: String, startsOn: String?, endsOn: String?)
  case priorReflection(text: String, skipped: Bool)
  case feelings(feelings: [String], statement: String)
  case priorities([String])
  case decisionsPractices(decisions: [SeasonDecision], practices: [String])
  case supportsConstraints(supports: [String], constraints: [String])
  case enough(String)
  case notNow([String])
  case confirm

  var step: SeasonWizardStep {
    switch self {
    case .nameDates: return .nameDates
    case .priorReflection: return .priorReflection
    case .feelings: return .feelings
    case .priorities: return .priorities
    case .decisionsPractices: return .decisionsPractices
    case .supportsConstraints: return .supportsConstraints
    case .enough: return .enough
    case .notNow: return .notNow
    case .confirm: return .confirm
    }
  }
}

enum SeasonError: Error, Equatable {
  case notDraft
  case notActive
  case archived
  case invalidDates
  case endBeforeStart
  case titleRequired
  case priorityLimit
  case reflectionRequired
  case incompleteSteps
}

enum SeasonEngine {
  static func createDraft(id: String, now: String) -> SeasonState {
    SeasonState(id: id, status: .draft, created: now, updated: now)
  }

  static func updateDraft(
    _ season: SeasonState, _ answers: SeasonStepAnswers, now: String,
    priorityOverride: Bool = false
  ) throws -> SeasonState {
    guard season.status == .draft else { throw SeasonError.notDraft }
    var next = season
    switch answers {
    case .nameDates(let title, let startsOn, let endsOn):
      next.title = title
      next.startsOn = normalizeDate(startsOn)
      next.endsOn = normalizeDate(endsOn)
    case .priorReflection(let text, let skipped):
      next.priorReflection = text
      next.skippedPriorReflection = skipped
    case .feelings(let feelings, let statement):
      next.feelings = feelings
      next.statement = statement
    case .priorities(let priorities):
      next.priorities = priorities
    case .decisionsPractices(let decisions, let practices):
      next.decisions = decisions
      next.practices = practices
    case .supportsConstraints(let supports, let constraints):
      next.supports = supports
      next.constraints = constraints
    case .enough(let enough):
      next.enough = enough
    case .notNow(let notNow):
      next.notNow = notNow
    case .confirm:
      break
    }
    try validate(next, priorityOverride: answers.step != .priorities || priorityOverride)
    if answers.step == .priorReflection,
      next.priorReflection.trimmingCharacters(in: .whitespaces).isEmpty,
      !next.skippedPriorReflection
    {
      throw SeasonError.reflectionRequired
    }
    next.completedSteps = seasonWizardSteps.filter {
      $0 == answers.step || season.completedSteps.contains($0)
    }
    next.updated = now
    return next
  }

  static func activate(_ season: SeasonState, now: String) throws -> SeasonState {
    guard season.status == .draft else { throw SeasonError.notDraft }
    if season.title.trimmingCharacters(in: .whitespaces).isEmpty { throw SeasonError.titleRequired }
    guard seasonWizardSteps.allSatisfy({ season.completedSteps.contains($0) }) else {
      throw SeasonError.incompleteSteps
    }
    var next = season
    next.status = .active
    next.updated = now
    return next
  }

  static func close(_ season: SeasonState, now: String) throws -> SeasonState {
    guard season.status == .active else { throw SeasonError.notActive }
    var next = season
    next.status = .archived
    next.updated = now
    return next
  }

  static func addPriority(_ season: SeasonState, noteId: String, override: Bool = false) throws
    -> SeasonState
  {
    var seen = Set<String>()
    let priorities = (season.priorities + [noteId.trimmingCharacters(in: .whitespaces)])
      .filter { !$0.isEmpty && seen.insert($0).inserted }
    if priorities.count > 4 || (priorities.count > 3 && !override) {
      throw SeasonError.priorityLimit
    }
    var next = season
    next.priorities = priorities
    return next
  }

  // The index of the first incomplete step (or the last step when all are done).
  static func progress(_ season: SeasonState) -> Int {
    if let first = seasonWizardSteps.firstIndex(where: { !season.completedSteps.contains($0) }) {
      return first
    }
    return seasonWizardSteps.count - 1
  }

  // MARK: - Validation

  private static func validate(_ state: SeasonState, priorityOverride: Bool) throws {
    guard validDate(state.startsOn), validDate(state.endsOn) else { throw SeasonError.invalidDates }
    if let start = state.startsOn, let end = state.endsOn, end < start {
      throw SeasonError.endBeforeStart
    }
    if state.title.trimmingCharacters(in: .whitespaces).isEmpty { throw SeasonError.titleRequired }
    if state.priorities.count > 4 || (state.priorities.count > 3 && !priorityOverride) {
      throw SeasonError.priorityLimit
    }
  }

  private static func normalizeDate(_ value: String?) -> String? {
    guard let value, !value.isEmpty else { return nil }
    return value
  }

  // A real YYYY-MM-DD date (nil is allowed — an unset date).
  static func validDate(_ value: String?) -> Bool {
    guard let value else { return true }
    let parts = value.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
      let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
      month >= 1, month <= 12, day >= 1
    else { return false }
    return day <= daysInMonth(year: year, month: month)
  }

  private static func daysInMonth(year: Int, month: Int) -> Int {
    switch month {
    case 1, 3, 5, 7, 8, 10, 12: return 31
    case 4, 6, 9, 11: return 30
    default:
      let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
      return leap ? 29 : 28
    }
  }
}
