import Foundation

// Turns the days a person logged menstrual flow (from HealthKit) into the
// `CycleProfile` the rhythm engine needs: the most recent period's start date and
// the average cycle length. Pure and deterministic — the HealthKit adapter maps
// samples to day strings and hands them here, so this logic is fully testable
// without the framework.
enum CycleDeriver {
  /// `periodDays`: ISO `YYYY-MM-DD` strings on which menstrual flow was recorded
  /// (order/duplicates don't matter). Consecutive flow days within
  /// `newPeriodGapDays` are one period (so a missing mid-period day doesn't split
  /// it); a larger gap begins a new period. `lastPeriodStart` is the most recent
  /// period's first day; `avgLengthDays` is the mean spacing between period
  /// starts, clamped to a plausible range, defaulting to 28 with < 2 periods.
  static func derive(periodDays: [String], newPeriodGapDays: Int = 10) -> CycleProfile? {
    let days = Array(Set(periodDays)).sorted()  // zero-padded ISO sorts chronologically
    guard !days.isEmpty else { return nil }

    var starts: [String] = []
    var previous: Int?
    for day in days {
      let number = dayNumber(day)
      if previous == nil || number - previous! > newPeriodGapDays { starts.append(day) }
      previous = number
    }

    let avgLengthDays: Int
    if starts.count >= 2 {
      let numbers = starts.map(dayNumber)
      let gaps = zip(numbers.dropFirst(), numbers).map { $0 - $1 }
      let mean = Double(gaps.reduce(0, +)) / Double(gaps.count)
      avgLengthDays = min(35, max(21, Int(mean.rounded())))
    } else {
      avgLengthDays = 28
    }
    return CycleProfile(lastPeriodStart: starts.last!, avgLengthDays: avgLengthDays)
  }

  private static func dayNumber(_ iso: String) -> Int {
    Int(
      Rhythm.utcMillis(
        year: Int(iso.prefix(4)) ?? 0,
        month: Int(iso.dropFirst(5).prefix(2)) ?? 0,
        day: Int(iso.dropFirst(8).prefix(2)) ?? 0) / 86_400_000)
  }
}
