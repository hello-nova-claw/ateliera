import SwiftUI

// The Current Season room, grounded in the sky rather than authored: the astronomical
// season and how far through it, the moon-phase season, and today's micro-season. You
// can add one light "intention for this season" (a statement, optional feelings) — no
// nine-step wizard. Legacy seasons (from the old wizard) still show their statement and
// can be closed (which files a reflection letter and archives them).
struct SeasonView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  var hemisphere: Hemisphere = .north
  var seasonStyle: SeasonStyle = .astronomical
  var personalizedMicroSeason: MicroSeason? = nil
  var personalizedPlace: String? = nil
  let onOpen: (String) -> Void

  @State private var season: SeasonStore
  @State private var statementDraft = ""
  @State private var feelingsDraft = ""
  @State private var closing = false

  init(
    store: VaultStore, hemisphere: Hemisphere = .north, seasonStyle: SeasonStyle = .astronomical,
    personalizedMicroSeason: MicroSeason? = nil, personalizedPlace: String? = nil,
    onOpen: @escaping (String) -> Void
  ) {
    self.store = store
    self.hemisphere = hemisphere
    self.seasonStyle = seasonStyle
    self.personalizedMicroSeason = personalizedMicroSeason
    self.personalizedPlace = personalizedPlace
    self.onOpen = onOpen
    _season = State(initialValue: SeasonStore(store: store))
  }

  private var shownMicroSeason: MicroSeason { personalizedMicroSeason ?? context.microSeason }

  private static let isoDay: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()

  private var today: String { Self.isoDay.string(from: Date()) }

  private var context: RhythmContext {
    Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: hemisphere, cycle: nil), date: today)
  }

  private var feltSeason: Season {
    Rhythm.season(date: today, hemisphere: hemisphere, style: seasonStyle)
  }

  // A calm, computed title for a light intention, e.g. "Autumn 2026".
  private var computedTitle: String {
    "\(AlmanacView.sentenceCase(feltSeason.rawValue)) \(today.prefix(4))"
  }

  private var seasonSpan: (start: String, end: String) {
    let span = Sky.astronomicalSeasonSpan(dateMs: Rhythm.dayMillis(date: today))
    return (Sky.isoDate(ms: span.start), Sky.isoDate(ms: span.end))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        if let error = season.error {
          Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
        }
        computedHeader
        intentionSection
        if let record = season.record, record.state.status == .active {
          legacyDetail(record.state)
        }
      }
      .padding(24)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Current Season")
    .task {
      if let state = season.record?.state {
        statementDraft = state.statement
        feelingsDraft = state.feelings.joined(separator: "\n")
      }
    }
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

  // MARK: - Computed (grounded) season

  private var computedHeader: some View {
    let pct = Int((Rhythm.seasonProgress(date: today, style: seasonStyle) * 100).rounded())
    let lunarPct = Int((context.lunarProgress * 100).rounded())
    return VStack(alignment: .leading, spacing: 12) {
      Text("THE SEASON YOU'RE IN")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("\(AlmanacView.sentenceCase(feltSeason.rawValue)) · \(pct)% through")
        .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
        .accessibilityIdentifier("season-computed-title")
      VStack(alignment: .leading, spacing: 6) {
        Text(shownMicroSeason.term).font(StudioFont.section).foregroundStyle(theme.inkStrong)
        Text(shownMicroSeason.gloss)
          .font(StudioFont.quote).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
        if let place = personalizedPlace {
          Text("✦ for \(place)")
            .font(StudioFont.eyebrow).tracking(1.0).foregroundStyle(theme.inkFaint)
            .accessibilityIdentifier("season-personalized")
        }
      }
      Text("\(context.lunarSeason.label) · \(lunarPct)% through the lunar month")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("season-lunar")
    }
  }

  // MARK: - Light intention

  private var intentionSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("YOUR INTENTION").font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
      Text("What matters this season?")
        .font(StudioFont.section).foregroundStyle(theme.inkStrong)
      Text("One line is plenty — a gentle focus for this chapter. It can change any time.")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      TextField("A season of tending what I've started…", text: $statementDraft)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
        .accessibilityIdentifier("season-intention-field")
      ZStack(alignment: .topLeading) {
        if feelingsDraft.isEmpty {
          Text("How you want it to feel — one per line (optional)")
            .font(StudioFont.body).foregroundStyle(theme.inkFaint)
            .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
        }
        TextEditor(text: $feelingsDraft)
          .font(StudioFont.body).foregroundStyle(theme.inkStrong)
          .scrollContentBackground(.hidden).frame(minHeight: 70)
          .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.line, lineWidth: 1))
          .accessibilityIdentifier("season-feelings-field")
      }
      Button(season.record == nil ? "Set intention" : "Update intention") {
        let statement = statementDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !statement.isEmpty else { return }
        let span = seasonSpan
        _ = season.setSeasonalIntention(
          statement: statement, feelings: lines(feelingsDraft), title: computedTitle,
          startsOn: span.start, endsOn: span.end)
      }
      .font(StudioFont.control).foregroundStyle(theme.link)
      .disabled(statementDraft.trimmingCharacters(in: .whitespaces).isEmpty)
      .accessibilityIdentifier("season-set-intention")
    }
  }

  // MARK: - Legacy season detail (from the old wizard) + close

  private func legacyDetail(_ state: SeasonState) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      if !state.statement.isEmpty {
        Text("A season of \(state.statement)")
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .accessibilityIdentifier("season-active-title")
      }
      summary("How I want to feel", state.feelings)
      if !state.enough.isEmpty { paragraph("Enough", state.enough) }
      summary("Practices", state.practices)
      summary("Support", state.supports)
      summary("Not now", state.notNow)
      Button("Close this season") { closing = true }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .padding(.top, 4)
        .accessibilityIdentifier("season-close")
    }
  }

  private func summary(_ title: String, _ items: [String]) -> some View {
    Group {
      if !items.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Text(title.uppercased())
            .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
          ForEach(items, id: \.self) {
            Text("· \($0)").font(StudioFont.body).foregroundStyle(theme.inkStrong)
          }
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

  private func lines(_ text: String) -> [String] {
    text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
  }
}

// The close flow: three reflections + one disposition per priority. Files a reflection
// letter and archives the season (unchanged from the wizard era, for legacy seasons).
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
                  ForEach(options, id: \.self) {
                    Text($0.replacingOccurrences(of: "-", with: " ")).tag($0)
                  }
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
