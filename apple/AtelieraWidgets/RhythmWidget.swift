import SwiftUI
import WidgetKit

// A home-screen "Today's rhythm" widget: the micro-season, felt season, and moon.
// Reuses the pure rhythm engine (no vault needed); hemisphere comes from the
// App Group the app writes on each location fix. Refreshes daily at midnight.
struct RhythmEntry: TimelineEntry {
  let date: Date
  let term: String
  let gloss: String
  let season: String
  let moon: String
  let illumination: Int
}

enum RhythmWidgetData {
  static func entry(for date: Date = Date()) -> RhythmEntry {
    let hemisphere = SharedStore.hemisphere ?? .north
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    let context = Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: hemisphere, cycle: nil),
      date: formatter.string(from: date))
    return RhythmEntry(
      date: date,
      term: context.microSeason.term,
      gloss: context.microSeason.gloss,
      season: RhythmSummary.sentenceCase(context.season.rawValue),
      moon: RhythmSummary.sentenceCase(context.moon.phase.rawValue),
      illumination: Int((context.moon.illumination * 100).rounded()))
  }
}

struct RhythmProvider: TimelineProvider {
  func placeholder(in context: Context) -> RhythmEntry { RhythmWidgetData.entry() }

  func getSnapshot(in context: Context, completion: @escaping (RhythmEntry) -> Void) {
    completion(RhythmWidgetData.entry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<RhythmEntry>) -> Void) {
    let entry = RhythmWidgetData.entry()
    // The season / micro-season / moon roll over daily; refresh just after midnight.
    let nextMidnight =
      Calendar.current.nextDate(
        after: Date(), matching: DateComponents(hour: 0, minute: 5),
        matchingPolicy: .nextTime) ?? Date().addingTimeInterval(3600)
    completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
  }
}

struct RhythmWidgetView: View {
  let entry: RhythmEntry

  // Chamomile canvas + ink, inlined (the brand fonts aren't registered in the
  // widget process, so this uses system fonts).
  private let canvas = Color(red: 0.972, green: 0.960, blue: 0.930)
  private let ink = Color(red: 0.145, green: 0.129, blue: 0.106)
  private let muted = Color(red: 0.42, green: 0.39, blue: 0.34)

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text("TODAY'S RHYTHM")
        .font(.system(size: 10, weight: .semibold)).tracking(1.4)
        .foregroundStyle(muted)
      Text(entry.term)
        .font(.system(.title3, design: .serif))
        .foregroundStyle(ink)
      Text(entry.gloss)
        .font(.caption).foregroundStyle(muted)
        .lineLimit(2)
      Spacer(minLength: 0)
      HStack(spacing: 10) {
        Label(entry.season, systemImage: "leaf")
        Label("\(entry.moon) · \(entry.illumination)%", systemImage: "moon")
      }
      .font(.caption2).foregroundStyle(muted)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .containerBackground(canvas, for: .widget)
  }
}

struct RhythmWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AtelieraRhythm", provider: RhythmProvider()) { entry in
      RhythmWidgetView(entry: entry)
    }
    .configurationDisplayName("Today's Rhythm")
    .description("The season, micro-season, and moon for today.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
