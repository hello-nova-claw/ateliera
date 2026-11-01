import Foundation

// The app's one source of "now" and of the writer's time zone. UI tests pin them (an ISO
// 8601 instant, an IANA zone; see UITestLaunch) in debug builds, so audits and screenshots
// see the same day, season and moon on every run.
enum AppClock {
  static func now(environment: [String: String] = ProcessInfo.processInfo.environment) -> Date {
    guard let pinned = UITestLaunch.value(.now, environment: environment),
      let date = ISO8601DateFormatter().date(from: pinned)
    else { return Date() }
    return date
  }

  static func timeZone(environment: [String: String] = ProcessInfo.processInfo.environment)
    -> TimeZone
  {
    guard let pinned = UITestLaunch.value(.timeZone, environment: environment),
      let zone = TimeZone(identifier: pinned)
    else { return .autoupdatingCurrent }
    return zone
  }
}
