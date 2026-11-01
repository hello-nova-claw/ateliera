import Foundation

// The app's one source of "now" and of the writer's time zone. UI tests pin them with
// ATELIERA_UITEST_NOW (ISO 8601) and ATELIERA_UITEST_TIME_ZONE (an IANA name), so audits
// and screenshots see the same day, season and moon on every run.
enum AppClock {
  static func now(environment: [String: String] = ProcessInfo.processInfo.environment) -> Date {
    guard environment["ATELIERA_UITEST"] == "1",
      let pinned = environment["ATELIERA_UITEST_NOW"],
      let date = ISO8601DateFormatter().date(from: pinned)
    else { return Date() }
    return date
  }

  static func timeZone(environment: [String: String] = ProcessInfo.processInfo.environment)
    -> TimeZone
  {
    guard environment["ATELIERA_UITEST"] == "1",
      let pinned = environment["ATELIERA_UITEST_TIME_ZONE"],
      let zone = TimeZone(identifier: pinned)
    else { return .autoupdatingCurrent }
    return zone
  }
}
