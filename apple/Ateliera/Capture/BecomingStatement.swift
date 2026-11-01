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
      // Only a whole opening counts: "someone whole" and "someone who's" carry on the word.
      if let next = after.first, next.isLetter || next.isNumber || next == "'" || next == "’" {
        return "\(leadIn) \(rest)"
      }
      rest = String(after)
      // The separator someone typed after "who": an ellipsis, a comma, then spaces or a
      // line break. A full stop that starts the completion is kept.
      for separator in ["...", "…", ","] where rest.hasPrefix(separator) {
        rest.removeFirst(separator.count)
        break
      }
      rest = rest.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return "\(leadIn) \(rest)"
  }
}
