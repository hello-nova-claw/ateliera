import SwiftUI

// What a tapped badge explains: one sheet per rhythm, built from the almanac's own
// sentences so it never disagrees with the Today panel. Pure, so every line a sheet shows
// is testable. The cycle sheet always says "estimated" and attaches nothing to a phase
// but its span and where the estimate comes from (design principle 3).
struct RhythmBadgeSheet: Equatable {
  struct Line: Equatable, Identifiable {
    let id: String
    let text: String
    var detail: String?
  }

  let identifier: String
  let title: String
  let headline: String
  let lines: [Line]
  var note: String?

  // Everything a sheet needs, as the almanac already has it. `cycleLength` is the average
  // cycle Health implied, so the phase's span is given for a cycle of that length.
  struct Context {
    let rhythm: RhythmContext
    let hemisphere: Hemisphere
    let seasonStyle: SeasonStyle
    let microSeason: MicroSeason
    var cycleLength: Int?
    let locale: Locale
    var calendar: Calendar = Calendar(identifier: .gregorian)
    var timeZone: TimeZone = TimeZone(identifier: "UTC") ?? .gmt
  }

  static func sheet(for badge: RhythmBadge, in context: Context) -> RhythmBadgeSheet {
    switch badge {
    case .season: return season(context)
    case .moon(let phase, let illumination, _): return moon(phase, illumination, context)
    case .cycle(let day, let phase): return cycle(day: day, phase: phase, context)
    }
  }

  // MARK: Season

  private static func season(_ context: Context) -> RhythmBadgeSheet {
    let locale = context.locale
    let date = context.rhythm.date
    let turning = AlmanacText.turningPoint(date: date, locale: locale)
    return RhythmBadgeSheet(
      identifier: "rhythm-sheet-season",
      title: String(localized: "Season", locale: locale, comment: "Title of the season sheet"),
      headline: AlmanacText.seasonText(
        date: date, hemisphere: context.hemisphere, style: context.seasonStyle, locale: locale),
      lines: [
        Line(
          id: "rhythm-sheet-other-season",
          text: AlmanacText.otherSeasonText(
            date: date, hemisphere: context.hemisphere, style: context.seasonStyle,
            locale: locale)),
        Line(
          id: "rhythm-sheet-micro-season", text: context.microSeason.term,
          detail: context.microSeason.gloss),
        Line(
          id: "rhythm-sheet-turning-point", text: turning.text,
          detail: day(turning.ms, context)),
      ])
  }

  // MARK: Moon

  private static func moon(_ phase: MoonPhase, _ illumination: Double, _ context: Context)
    -> RhythmBadgeSheet
  {
    let locale = context.locale
    let date = context.rhythm.date
    let lit = AlmanacText.percent(illumination, locale: locale)
    // Both lunations, nearest first, so the first line is the panel's own callout.
    let lunations = [Sky.MoonPhase.new, .full]
      .map { (phase: $0, line: AlmanacText.lunation($0, date: date, locale: locale)) }
      .sorted { $0.line.ms < $1.line.ms }
    let lunarSeason = Line(
      id: "rhythm-sheet-lunar-season",
      text: AlmanacText.lunarSeasonText(context: context.rhythm, locale: locale))
    let hemisphereNote =
      context.hemisphere == .south
      ? String(
        localized:
          "The disc is drawn as you see it from the southern hemisphere: the moon waxes from the left.",
        locale: locale, comment: "Moon sheet note on how the drawn moon is oriented")
      : String(
        localized:
          "The disc is drawn as you see it from the northern hemisphere: the moon waxes from the right.",
        locale: locale, comment: "Moon sheet note on how the drawn moon is oriented")
    return RhythmBadgeSheet(
      identifier: "rhythm-sheet-moon",
      title: String(localized: "Moon", locale: locale, comment: "Title of the moon sheet"),
      headline: String(
        localized: "\(phase.localizedName(locale: locale)) moon · \(lit) lit", locale: locale,
        comment: "Moon sheet headline. 1: the phase, like Waning gibbous. 2: a share, like 62%."),
      lines: [lunarSeason]
        + lunations.map {
          Line(
            id: $0.phase == .new ? "rhythm-sheet-new-moon" : "rhythm-sheet-full-moon",
            text: $0.line.text, detail: day($0.line.ms, context))
        },
      note: hemisphereNote)
  }

  // MARK: Cycle

  private static func cycle(day: Int, phase: CyclePhase, _ context: Context) -> RhythmBadgeSheet {
    let locale = context.locale
    let length = context.cycleLength ?? Rhythm.typicalCycleLengthDays
    let phaseName = phase.localizedName(locale: locale)
    var lines: [Line] = []
    if let span = Rhythm.cyclePhaseSpan(phase, avgLengthDays: length) {
      lines.append(
        Line(
          id: "rhythm-sheet-cycle-span",
          text: String(
            localized: """
              The \(phaseName) phase is estimated to run from day \(span.lowerBound) \
              to day \(span.upperBound) of a \(length)-day cycle.
              """,
            locale: locale,
            comment: """
              Cycle sheet. 1: the phase, like follicular. 2 and 3: the first and last day. \
              4: the cycle length in days.
              """
          )))
    }
    return RhythmBadgeSheet(
      identifier: "rhythm-sheet-cycle",
      title: String(localized: "Cycle", locale: locale, comment: "Title of the cycle sheet"),
      headline: String(
        localized: "Day \(day) · estimated \(phaseName) phase", locale: locale,
        comment: "Cycle sheet headline. 1: the day number. 2: the phase, like follicular."),
      lines: lines,
      note: String(
        localized: """
          This estimate comes from the menstrual flow recorded in Health, which Ateliera \
          only reads. Nothing from Health is stored, and this is not medical advice.
          """,
        locale: locale, comment: "Cycle sheet note on where the estimate comes from"))
  }

  private static func day(_ instantMs: Int64, _ context: Context) -> String {
    AlmanacText.dayText(
      instantMs: instantMs, locale: context.locale, calendar: context.calendar,
      timeZone: context.timeZone)
  }
}

// The sheet itself: a title bar with Done, then the headline and each line in order, so
// VoiceOver reads it top to bottom. No fixed heights, so the largest text sizes scroll.
struct RhythmBadgeSheetView: View {
  @Environment(\.studioTheme) private var theme
  let sheet: RhythmBadgeSheet
  let onClose: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text(sheet.headline)
            .font(StudioFont.section)
            .foregroundStyle(theme.inkStrong)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("\(sheet.identifier)-headline")
          ForEach(sheet.lines) { line in
            VStack(alignment: .leading, spacing: 4) {
              Text(line.text)
                .font(StudioFont.body)
                .foregroundStyle(theme.inkStrong)
                .fixedSize(horizontal: false, vertical: true)
              if let detail = line.detail {
                Text(detail)
                  .font(StudioFont.quote)
                  .foregroundStyle(theme.inkMuted)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(line.id)
          }
          if let note = sheet.note {
            Text(note)
              .font(StudioFont.quote)
              .foregroundStyle(theme.inkMuted)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.top, 6)
              .accessibilityIdentifier("\(sheet.identifier)-note")
          }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .navigationTitle(sheet.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(String(localized: "Done", comment: "Closes a sheet")) { onClose() }
        }
      }
    }
    .accessibilityIdentifier(sheet.identifier)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
  }
}
