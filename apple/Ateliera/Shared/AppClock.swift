import Foundation

// The app's one source of "now". UI tests pin it with ATELIERA_UITEST_NOW (ISO 8601),
// so audits and screenshots see the same day, season and moon on every run.
enum AppClock {
  static func now(environment: [String: String] = ProcessInfo.processInfo.environment) -> Date {
    guard environment["ATELIERA_UITEST"] == "1",
      let pinned = environment["ATELIERA_UITEST_NOW"],
      let date = ISO8601DateFormatter().date(from: pinned)
    else { return Date() }
    return date
  }
}
