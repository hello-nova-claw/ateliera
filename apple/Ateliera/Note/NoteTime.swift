import Foundation

// Note timestamps keep the writer's wall clock and offset, so an entry stays on the day
// it was written wherever and whenever it is read. Mirrors `written-time.ts` in
// `@studio/domain`.
enum NoteTime {
  /// `instant` as ISO 8601 in `timeZone`'s wall clock with its offset, for example
  /// `2026-11-02T08:00:00.000+11:00`. UTC is written `+00:00`, like the web app.
  static func timestamp(_ instant: Date, timeZone: TimeZone) -> String {
    let offset = timeZone.secondsFromGMT(for: instant) / 60
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: offset * 60) ?? .gmt
    let parts = calendar.dateComponents(
      [.year, .month, .day, .hour, .minute, .second], from: instant)
    let whole = instant.timeIntervalSince1970.rounded(.down)
    let millis = Int(((instant.timeIntervalSince1970 - whole) * 1000).rounded(.down))
    let sign = offset < 0 ? "-" : "+"
    return String(
      format: "%04d-%02d-%02dT%02d:%02d:%02d.%03d%@%02d:%02d",
      parts.year ?? 0, parts.month ?? 0, parts.day ?? 0, parts.hour ?? 0, parts.minute ?? 0,
      parts.second ?? 0, millis, sign, abs(offset) / 60, abs(offset) % 60)
  }

  // ISO8601DateFormatter is thread-safe, and these run inside sorts, so they're shared.
  private static let fractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
  private static let plain: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  /// The instant a timestamp names, with or without fractional seconds.
  static func instant(_ timestamp: String) -> Date? {
    fractional.date(from: timestamp) ?? plain.date(from: timestamp)
  }

  /// The day a timestamp was written on, in the writer's own zone: `YYYY-MM-DD`. A
  /// timestamp ending in `Z` gives its UTC day. Nil for text that isn't a timestamp.
  static func writtenDay(_ timestamp: String) -> String? {
    guard instant(timestamp) != nil else { return nil }
    let day = String(timestamp.prefix(10))
    let fields = day.split(separator: "-").compactMap { Int($0) }
    guard fields.count == 3 else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    let components = DateComponents(year: fields[0], month: fields[1], day: fields[2])
    guard components.isValidDate(in: calendar) else { return nil }
    return day
  }

  /// Orders two timestamps by the instants they name, so offsets don't matter. Text
  /// that isn't a timestamp, or two forms of one instant, fall back to the text.
  static func compare(_ left: String, _ right: String) -> ComparisonResult {
    // Same shape and same offset: the text already sorts in time order, so skip parsing
    // (this runs inside sorts over the whole vault).
    if left.count == right.count, offsetText(left) == offsetText(right) {
      if left == right { return .orderedSame }
      return left < right ? .orderedAscending : .orderedDescending
    }
    if let leftInstant = instant(left), let rightInstant = instant(right),
      leftInstant != rightInstant
    {
      return leftInstant < rightInstant ? .orderedAscending : .orderedDescending
    }
    if left == right { return .orderedSame }
    return left < right ? .orderedAscending : .orderedDescending
  }

  /// Whether `left` was written after `right`.
  static func isNewer(_ left: String, than right: String) -> Bool {
    compare(left, right) == .orderedDescending
  }

  // The offset a timestamp ends with: `Z`, or `±HH:MM`.
  private static func offsetText(_ timestamp: String) -> Substring {
    timestamp.hasSuffix("Z") ? timestamp.suffix(1) : timestamp.suffix(6)
  }
}
