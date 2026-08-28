import Foundation

// The Studio note model + serializer, matching `@studio/content`'s serialize-note.ts
// byte-for-byte so a note written natively is identical to the web serializer's
// output (the guarantee that both apps share one vault — ADR-012, plan §4). The
// frontmatter key order and the block-YAML shape (non-empty sequences block,
// empty sequences `[]`, maps block, plain scalars, extraFrontmatter first) are
// reproduced exactly; see the golden test.

struct NoteDisplay: Equatable {
  var cover: String?
  var featured: Bool
}

struct NotePrivacy: Equatable {
  var sensitivity: String
  var aiAccess: String
}

struct NoteSource: Equatable {
  var title: String?
  var creator: String?
  var url: String?
}

// A minimal YAML value covering the note schema + common extra-frontmatter shapes.
indirect enum YamlNode: Equatable {
  case scalar(String)
  case int(Int)
  case bool(Bool)
  case list([String])
  case map([(String, YamlNode)])

  static func == (lhs: YamlNode, rhs: YamlNode) -> Bool {
    switch (lhs, rhs) {
    case (.scalar(let a), .scalar(let b)): return a == b
    case (.int(let a), .int(let b)): return a == b
    case (.bool(let a), .bool(let b)): return a == b
    case (.list(let a), .list(let b)): return a == b
    case (.map(let a), .map(let b)):
      return a.count == b.count && zip(a, b).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
    default: return false
    }
  }

  var scalarValue: String? { if case .scalar(let s) = self { return s }; return nil }
  var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
  var listValue: [String]? { if case .list(let l) = self { return l }; return nil }
}

// Typed reads of unknown (`extraFrontmatter`) keys. These live in the same file as
// `YamlNode` on purpose: cross-file access to this `indirect enum`'s members trips a
// spurious "circular reference" in the Swift frontend, so other files call these
// StudioNote methods instead of matching YamlNode cases directly.
extension StudioNote {
  func frontmatterScalar(_ key: String) -> String? {
    for (k, v) in extraFrontmatter where k == key { if let s = v.scalarValue { return s } }
    return nil
  }
  func frontmatterBool(_ key: String) -> Bool {
    for (k, v) in extraFrontmatter where k == key { if let b = v.boolValue { return b } }
    return false
  }
  func frontmatterList(_ key: String) -> [String] {
    for (k, v) in extraFrontmatter where k == key { if let l = v.listValue { return l } }
    return []
  }
}

struct StudioNote {
  var schemaVersion: Int = 1
  var id: String
  var title: String?
  var cardType: String
  var semanticType: String
  var status: String
  var rooms: [String]
  var lifeAreas: [String]
  var landscapeAnchor: String?
  var seasons: [String]
  var tags: [String]
  var created: String
  var updated: String
  var source: NoteSource?
  var sourceNoteIds: [String]?
  var resurfaceKind: String?
  var resurfaceDue: String?
  var resurfaceIntervalDays: Int?
  var attachments: [String]
  var display: NoteDisplay
  var privacy: NotePrivacy
  var extraFrontmatter: [(String, YamlNode)] = []
  var body: String
  var lineEnding: String = "\n"

  func serialize() -> String {
    var pairs: [(String, YamlNode)] = extraFrontmatter
    pairs.append(("schema_version", .int(schemaVersion)))
    pairs.append(("id", .scalar(id)))
    if let title { pairs.append(("title", .scalar(title))) }
    pairs.append(("card_type", .scalar(cardType)))
    pairs.append(("semantic_type", .scalar(semanticType)))
    pairs.append(("status", .scalar(status)))
    pairs.append(("rooms", .list(rooms)))
    pairs.append(("life_areas", .list(lifeAreas)))
    if let landscapeAnchor { pairs.append(("landscape_anchor", .scalar(landscapeAnchor))) }
    pairs.append(("seasons", .list(seasons)))
    pairs.append(("tags", .list(tags)))
    pairs.append(("created", .scalar(created)))
    pairs.append(("updated", .scalar(updated)))
    if let source {
      var sourcePairs: [(String, YamlNode)] = []
      if let title = source.title { sourcePairs.append(("title", .scalar(title))) }
      if let creator = source.creator { sourcePairs.append(("creator", .scalar(creator))) }
      if let url = source.url { sourcePairs.append(("url", .scalar(url))) }
      pairs.append(("source", .map(sourcePairs)))
    }
    if let sourceNoteIds { pairs.append(("source_notes", .list(sourceNoteIds))) }
    if let resurfaceKind { pairs.append(("resurface_kind", .scalar(resurfaceKind))) }
    if let resurfaceDue { pairs.append(("resurface_due", .scalar(resurfaceDue))) }
    if let resurfaceIntervalDays {
      pairs.append(("resurface_interval_days", .int(resurfaceIntervalDays)))
    }
    pairs.append(("attachments", .list(attachments)))
    var displayPairs: [(String, YamlNode)] = []
    if let cover = display.cover { displayPairs.append(("cover", .scalar(cover))) }
    displayPairs.append(("featured", .bool(display.featured)))
    pairs.append(("display", .map(displayPairs)))
    pairs.append((
      "privacy",
      .map([
        ("sensitivity", .scalar(privacy.sensitivity)),
        ("ai_access", .scalar(privacy.aiAccess)),
      ])
    ))

    let yaml = Self.emit(pairs, indent: 0)
      .trimmingTrailingNewlines()
      .replacingOccurrences(of: "\n", with: lineEnding)
    let eol = lineEnding
    return "---\(eol)\(yaml)\(eol)---\(eol)\(body)"
  }

  // Emit block YAML matching the `yaml` library's `stringify({ lineWidth: 0 })`.
  private static func emit(_ pairs: [(String, YamlNode)], indent: Int) -> String {
    let pad = String(repeating: " ", count: indent)
    var out = ""
    for (key, node) in pairs {
      switch node {
      case .scalar(let value):
        out += "\(pad)\(key): \(scalar(value))\n"
      case .int(let value):
        out += "\(pad)\(key): \(value)\n"
      case .bool(let value):
        out += "\(pad)\(key): \(value ? "true" : "false")\n"
      case .list(let items):
        if items.isEmpty {
          out += "\(pad)\(key): []\n"
        } else {
          out += "\(pad)\(key):\n"
          for item in items { out += "\(pad)  - \(scalar(item))\n" }
        }
      case .map(let sub):
        out += "\(pad)\(key):\n"
        out += emit(sub, indent: indent + 2)
      }
    }
    return out
  }

  // Emit a scalar the way the `yaml` library's `stringify` does: plain (unquoted)
  // when safe, otherwise double-quoted. The rules below are derived empirically
  // from `yaml`'s output (see NoteFixturesTests) so a value that needs quoting is
  // byte-identical to the web serializer.
  private static func scalar(_ value: String) -> String {
    needsQuoting(value) ? doubleQuote(value) : value
  }

  private static func needsQuoting(_ value: String) -> Bool {
    if value.isEmpty { return true }
    if value.hasPrefix(" ") || value.hasSuffix(" ") { return true }
    if value.contains(": ") || value.hasSuffix(":") { return true }
    if value.contains(" #") { return true }
    if resolvesAsNonString(value) { return true }
    if let first = value.first, leadingIndicators.contains(first) {
      // `-`, `?`, `:` only force quoting when alone or followed by a space; the
      // rest (`,#&*!|>%@` backtick brackets braces quotes) always do.
      if first == "-" || first == "?" || first == ":" {
        return value.count == 1 || value.dropFirst().hasPrefix(" ")
      }
      return true
    }
    return false
  }

  private static let leadingIndicators: Set<Character> = [
    "-", "?", ":", ",", "#", "&", "*", "!", "|", ">", "%", "@", "`", "\"", "'", "[",
    "]", "{", "}",
  ]

  // Would the plain scalar be resolved by YAML's core schema as a bool, null, or
  // number rather than a string? Matches the `yaml` library: case-insensitive
  // true/false/null and `~`, and decimal/hex/octal/float/inf/nan literals.
  private static func resolvesAsNonString(_ value: String) -> Bool {
    let lower = value.lowercased()
    if lower == "true" || lower == "false" || lower == "null" || value == "~" {
      return true
    }
    for pattern in numberPatterns where matches(value, pattern) { return true }
    return false
  }

  private static let numberPatterns = [
    "^[-+]?[0-9]+$",  // decimal int
    "^0x[0-9a-fA-F]+$",  // hex
    "^0o[0-7]+$",  // octal
    "^[-+]?(?:\\.[0-9]+|[0-9]+(?:\\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$",  // float / exp
    "^[-+]?\\.(?:inf|Inf|INF)$",  // infinity
    "^\\.(?:nan|NaN|NAN)$",  // not-a-number
  ]

  private static func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
  }

  private static func doubleQuote(_ value: String) -> String {
    var out = "\""
    for ch in value {
      switch ch {
      case "\\": out += "\\\\"
      case "\"": out += "\\\""
      default: out.append(ch)
      }
    }
    out += "\""
    return out
  }
}

extension String {
  fileprivate func trimmingTrailingNewlines() -> String {
    var s = self[...]
    while s.last == "\n" { s = s.dropLast() }
    return String(s)
  }
}
