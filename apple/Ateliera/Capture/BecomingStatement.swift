import Foundation

// The becoming statement: a fixed lead-in that the person completes. The capture shows
// the lead-in above the field, so the person only types the rest; when they type the
// whole sentence anyway, the opening they typed is dropped so it's saved once.
enum BecomingStatement {
  static let leadIn = "I am becoming someone who"

  // Openings that say the same thing as the lead-in, compared case-insensitively.
  private static let openings = [
    "i am becoming someone who", "i'm becoming someone who", "i’m becoming someone who",
  ]

  /// The full statement for what was typed after (or including) the lead-in.
  static func compose(_ typed: String) -> String {
    var rest = typed.trimmingCharacters(in: .whitespacesAndNewlines)
    let lowered = rest.lowercased()
    if let opening = openings.first(where: { lowered.hasPrefix($0) }) {
      let after = rest.dropFirst(opening.count)
      // Only a whole opening counts: "someone whole" is not "someone who".
      if after.isEmpty || after.first == " " || after.first == "…" || after.hasPrefix("...") {
        rest = String(after)
        while let first = rest.first, first == "…" || first == "." || first == " " {
          rest.removeFirst()
        }
      }
    }
    return "\(leadIn) \(rest)"
  }
}
