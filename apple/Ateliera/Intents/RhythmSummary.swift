import Foundation

// A one-line, speakable summary of today's rhythm, shared by the Siri/Shortcuts
// intent (and anywhere else a plain-text almanac is useful). Pure and testable.
enum RhythmSummary {
  static func line(for context: RhythmContext) -> String {
    let season = sentenceCase(context.season.rawValue)
    let moon = sentenceCase(context.moon.phase.rawValue)
    let lit = Int((context.moon.illumination * 100).rounded())
    var line =
      "Today's rhythm: \(context.microSeason.term), \(season). The moon is \(moon), \(lit)% lit."
    if let cycle = context.cycle {
      line += " Cycle day \(cycle.day), \(sentenceCase(cycle.phase.rawValue))."
    }
    return line
  }

  // "waxing-crescent" -> "Waxing crescent" (matches the almanac).
  static func sentenceCase(_ value: String) -> String {
    let spaced = value.replacingOccurrences(of: "-", with: " ")
    guard let first = spaced.first else { return spaced }
    return first.uppercased() + spaced.dropFirst()
  }
}
