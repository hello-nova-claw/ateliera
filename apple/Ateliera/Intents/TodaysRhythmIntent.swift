import AppIntents
import Foundation

// A Siri / Shortcuts action: "Today's rhythm" — speaks the season, micro-season,
// and moon for today. Pure rhythm, no vault needed; hemisphere comes from the
// last resolved location (defaulting north). Runs anywhere App Intents do.
struct TodaysRhythmIntent: AppIntent {
  static var title: LocalizedStringResource = "Today's Rhythm"
  static var description = IntentDescription(
    "The felt season, micro-season, and moon for today.")

  func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
    let hemisphere = SharedStore.bestHemisphere
    let context = Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: hemisphere, cycle: nil), date: Self.today())
    let line = RhythmSummary.line(for: context)
    return .result(value: line, dialog: IntentDialog(stringLiteral: line))
  }

  private static func today() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: AppClock.now())
  }
}

// Makes the intent discoverable in the Shortcuts app and by Siri, with spoken
// phrases. `.applicationName` resolves to the app's display name (Ateliera).
struct AtelieraShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TodaysRhythmIntent(),
      phrases: [
        "Today's rhythm in \(.applicationName)",
        "What's today's rhythm in \(.applicationName)",
        "Ask \(.applicationName) for today's rhythm",
      ],
      shortTitle: "Today's Rhythm",
      systemImageName: "moon.stars")
  }
}
