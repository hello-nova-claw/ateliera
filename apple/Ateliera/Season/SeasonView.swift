import SwiftUI

// The Current Season room: begin a season, walk the nine-step wizard, then an active
// view with a close flow (which files a reflection letter and archives the season).
// List fields are one item per line. Structured decisions are a documented follow-up.
struct SeasonView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  @State private var season: SeasonStore
  @State private var wizardStep: SeasonWizardStep = .nameDates
  @State private var beginTitle = ""
  @State private var fields = Fields()
  @State private var decisions: [EditableDecision] = []
  @State private var closing = false

  // A decision being edited in the wizard (the model's SeasonDecision needs an id).
  struct EditableDecision: Identifiable {
    let id = UUID()
    var text = ""
    var horizon: SeasonHorizon = .d30
    var kind: SeasonDecision.Kind = .decision
  }

  init(store: VaultStore, onOpen: @escaping (String) -> Void) {
    self.store = store
    self.onOpen = onOpen
    _season = State(initialValue: SeasonStore(store: store))
  }

  private struct Fields {
    var title = "", startsOn = "", endsOn = ""
    var priorReflection = "", statement = "", enough = ""
    var skipReflection = false
    var feelings = "", priorities = "", practices = "", supports = "", constraints = "", notNow = ""
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        if let error = season.error {
          Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
        }
        if let record = season.record {
          if record.state.status == .draft {
            wizard(record.state)
          } else {
            activeView(record.state)
          }
        } else {
          emptyState
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Current Season")
    .sheet(isPresented: $closing) {
      if let record = season.record {
        SeasonCloseView(
          priorities: record.state.priorities,
          onClose: { reflection in season.close(reflection) },
          onCancel: { closing = false })
          .studioTheme(theme)
      }
    }
  }

  private var emptyState: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("A HUMANE PRESENT FOCUS")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("Current Season")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
      Text("Name what matters now as a gentle chapter.")
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
      TextField("Name this season", text: $beginTitle)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
        .accessibilityIdentifier("season-title-field")
      Button("Begin a season") {
        let title = beginTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        if season.beginSeason(title: title, startsOn: nil, endsOn: nil) {
          wizardStep = .priorReflection
          fields.title = title
        }
      }
      .font(StudioFont.control).foregroundStyle(theme.link)
      .accessibilityIdentifier("season-begin")
    }
  }

  // MARK: - Wizard

  private func wizard(_ state: SeasonState) -> some View {
    let index = (seasonWizardSteps.firstIndex(of: wizardStep) ?? 0) + 1
    return VStack(alignment: .leading, spacing: 16) {
      Text("STEP \(index) OF \(seasonWizardSteps.count)")
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
      Text(stepTitle).font(StudioFont.section).foregroundStyle(theme.inkStrong)
      stepFields
      Button(wizardStep == .confirm ? "Begin this season" : "Continue") {
        advance(from: state)
      }
      .font(StudioFont.control).foregroundStyle(theme.link)
      .accessibilityIdentifier("season-continue")
    }
  }

  private var stepTitle: String {
    switch wizardStep {
    case .nameDates: return "Name & dates"
    case .priorReflection: return "Looking back"
    case .feelings: return "How I want it to feel"
    case .priorities: return "Priorities"
    case .decisionsPractices: return "Practices"
    case .supportsConstraints: return "Support & constraints"
    case .enough: return "Enough"
    case .notNow: return "Not now"
    case .confirm: return "Confirm"
    }
  }

  @ViewBuilder
  private var stepFields: some View {
    switch wizardStep {
    case .nameDates:
      field("Name", text: $fields.title, id: "season-field-title")
      field("Starts (YYYY-MM-DD, optional)", text: $fields.startsOn, id: "season-field-start")
      field("Ends (YYYY-MM-DD, optional)", text: $fields.endsOn, id: "season-field-end")
    case .priorReflection:
      editor("What are you carrying in from before?", text: $fields.priorReflection, id: "season-field-reflection")
      Toggle("Skip this step", isOn: $fields.skipReflection)
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("season-skip-reflection")
    case .feelings:
      editor("Feelings (one per line)", text: $fields.feelings, id: "season-field-feelings")
      field("A season of…", text: $fields.statement, id: "season-field-statement")
    case .priorities:
      editor("Priorities (one per line)", text: $fields.priorities, id: "season-field-priorities")
    case .decisionsPractices:
      editor("Practices (one per line)", text: $fields.practices, id: "season-field-practices")
      decisionsEditor
    case .supportsConstraints:
      editor("Support (one per line)", text: $fields.supports, id: "season-field-supports")
      editor("Constraints (one per line)", text: $fields.constraints, id: "season-field-constraints")
    case .enough:
      editor("What would be enough?", text: $fields.enough, id: "season-field-enough")
    case .notNow:
      editor("Not now (one per line)", text: $fields.notNow, id: "season-field-notnow")
    case .confirm:
      Text("Review and begin this season.")
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
    }
  }

  private func advance(from state: SeasonState) {
    let answers: SeasonStepAnswers
    switch wizardStep {
    case .nameDates:
      answers = .nameDates(
        title: fields.title, startsOn: nilIfEmpty(fields.startsOn), endsOn: nilIfEmpty(fields.endsOn))
    case .priorReflection:
      answers = .priorReflection(text: fields.priorReflection, skipped: fields.skipReflection)
    case .feelings:
      answers = .feelings(feelings: lines(fields.feelings), statement: fields.statement)
    case .priorities:
      answers = .priorities(lines(fields.priorities))
    case .decisionsPractices:
      let structured = decisions
        .filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
        .map {
          SeasonDecision(
            id: $0.id.uuidString, text: $0.text.trimmingCharacters(in: .whitespaces),
            horizon: $0.horizon, kind: $0.kind)
        }
      answers = .decisionsPractices(decisions: structured, practices: lines(fields.practices))
    case .supportsConstraints:
      answers = .supportsConstraints(
        supports: lines(fields.supports), constraints: lines(fields.constraints))
    case .enough:
      answers = .enough(fields.enough)
    case .notNow:
      answers = .notNow(lines(fields.notNow))
    case .confirm:
      answers = .confirm
    }
    guard season.saveStep(answers, priorityOverride: true) else { return }
    if wizardStep == .confirm {
      _ = season.activate()
    } else if let idx = seasonWizardSteps.firstIndex(of: wizardStep),
      idx + 1 < seasonWizardSteps.count
    {
      wizardStep = seasonWizardSteps[idx + 1]
    }
  }

  // MARK: - Active

  private func activeView(_ state: SeasonState) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("THIS SEASON")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text(state.title)
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
        .accessibilityIdentifier("season-active-title")
      if !state.statement.isEmpty {
        Text("A season of \(state.statement)")
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
      }
      summary("How I want to feel", state.feelings)
      if !state.enough.isEmpty { paragraph("Enough", state.enough) }
      summary("Practices", state.practices)
      summary("Support", state.supports)
      summary("Not now", state.notNow)
      Button("Close this season") { closing = true }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .padding(.top, 8)
        .accessibilityIdentifier("season-close")
    }
  }

  private func summary(_ title: String, _ items: [String]) -> some View {
    Group {
      if !items.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Text(title.uppercased())
            .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
          ForEach(items, id: \.self) { Text("· \($0)").font(StudioFont.body).foregroundStyle(theme.inkStrong) }
        }
      }
    }
  }

  private func paragraph(_ title: String, _ text: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title.uppercased())
        .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      Text(text).font(StudioFont.body).foregroundStyle(theme.inkStrong)
    }
  }

  // MARK: - Field helpers

  // A small editor for structured decisions: text + a 30/60/90 horizon + decision or
  // experiment. Empty rows are dropped when the step is saved.
  private var decisionsEditor: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("DECISIONS")
        .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      ForEach($decisions) { $decision in
        VStack(alignment: .leading, spacing: 6) {
          TextField("A choice you can make", text: $decision.text)
            .font(StudioFont.body).foregroundStyle(theme.inkStrong)
            .padding(10)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
          HStack(spacing: 10) {
            Picker("Horizon", selection: $decision.horizon) {
              ForEach(SeasonHorizon.allCases, id: \.self) { Text("\($0.rawValue)d").tag($0) }
            }
            .pickerStyle(.segmented)
            Picker("Kind", selection: $decision.kind) {
              Text("Decision").tag(SeasonDecision.Kind.decision)
              Text("Experiment").tag(SeasonDecision.Kind.experiment)
            }
            .pickerStyle(.segmented)
          }
        }
        .padding(.vertical, 4)
      }
      Button {
        decisions.append(EditableDecision())
      } label: {
        Label("Add a decision", systemImage: "plus.circle").font(StudioFont.control)
          .foregroundStyle(theme.link)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("season-add-decision")
    }
  }

  private func field(_ label: String, text: Binding<String>, id: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label.uppercased()).font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      TextField("", text: text)
        .font(StudioFont.body).foregroundStyle(theme.inkStrong)
        .padding(10)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
        .accessibilityIdentifier(id)
    }
  }

  private func editor(_ label: String, text: Binding<String>, id: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label.uppercased()).font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      TextEditor(text: text)
        .font(StudioFont.body).foregroundStyle(theme.inkStrong)
        .scrollContentBackground(.hidden).frame(minHeight: 80)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
        .accessibilityIdentifier(id)
    }
  }

  private func lines(_ text: String) -> [String] {
    text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
  }

  private func nilIfEmpty(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespaces)
    return trimmed.isEmpty ? nil : trimmed
  }
}

// The close flow: three reflections + one disposition per priority.
private struct SeasonCloseView: View {
  @Environment(\.studioTheme) private var theme
  let priorities: [String]
  let onClose: (SeasonCloseReflection) -> Bool
  let onCancel: () -> Void

  @State private var celebration = ""
  @State private var learning = ""
  @State private var identity = ""
  @State private var dispositions: [String: String] = [:]

  private let options = ["celebrate", "archive", "return-landscape", "invite-forward", "release"]

  private var canClose: Bool {
    ![celebration, learning, identity].contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          reflection("What I celebrate", $celebration, id: "close-celebration")
          reflection("What I learned", $learning, id: "close-learning")
          reflection("Who I became", $identity, id: "close-identity")
          if !priorities.isEmpty {
            Text("WHERE EACH THREAD RESTS")
              .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
            ForEach(priorities, id: \.self) { priority in
              HStack {
                Text(priority).font(StudioFont.body).foregroundStyle(theme.inkStrong)
                Spacer()
                Picker("", selection: binding(for: priority)) {
                  ForEach(options, id: \.self) { Text($0.replacingOccurrences(of: "-", with: " ")).tag($0) }
                }
                .pickerStyle(.menu)
              }
            }
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Close season").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onCancel() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Close") {
            let reflection = SeasonCloseReflection(
              celebration: celebration, learning: learning, identity: identity,
              dispositions: priorities.map {
                SeasonCloseDisposition(
                  noteId: $0, title: $0, disposition: dispositions[$0] ?? "archive")
              })
            if onClose(reflection) { onCancel() }
          }
          .disabled(!canClose)
          .accessibilityIdentifier("close-confirm")
        }
      }
    }
  }

  private func binding(for priority: String) -> Binding<String> {
    Binding(get: { dispositions[priority] ?? "archive" }, set: { dispositions[priority] = $0 })
  }

  private func reflection(_ label: String, _ text: Binding<String>, id: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label.uppercased()).font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      TextEditor(text: text)
        .font(StudioFont.body).foregroundStyle(theme.inkStrong)
        .scrollContentBackground(.hidden).frame(minHeight: 70)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
        .accessibilityIdentifier(id)
    }
  }
}
