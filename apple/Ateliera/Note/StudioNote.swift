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
  // A plain scalar YAML reads as a number, null or bool other than `true`/`false`
  // (`5`, `1e3`, `~`, `True`), kept as written so its type survives a save. The web
  // canonicalises these (`~` to `null`, `1e3` to `1000`); both read the same value
  // from either, and keeping the literal never rewrites another tool's file.
  case raw(String)
  case int(Int)
  case bool(Bool)
  case list([String])
  case map([(String, YamlNode)])
  // A block sequence of maps (e.g. season_workflow.decisions).
  case mapSeq([[(String, YamlNode)]])

  static func == (lhs: YamlNode, rhs: YamlNode) -> Bool {
    switch (lhs, rhs) {
    case (.scalar(let a), .scalar(let b)): return a == b
    case (.raw(let left), .raw(let right)): return left == right
    case (.int(let a), .int(let b)): return a == b
    case (.bool(let a), .bool(let b)): return a == b
    case (.list(let a), .list(let b)): return a == b
    case (.map(let a), .map(let b)):
      return a.count == b.count && zip(a, b).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
    case (.mapSeq(let a), .mapSeq(let b)):
      return a.count == b.count
        && zip(a, b).allSatisfy { left, right in
          left.count == right.count
            && zip(left, right).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
        }
    default: return false
    }
  }

  var scalarValue: String? {
    // A raw literal reads as its text, as it did before it had its own case.
    switch self {
    case .scalar(let value), .raw(let value): return value
    default: return nil
    }
  }
  var boolValue: Bool? {
    if case .bool(let value) = self { return value }
    return nil
  }
  var listValue: [String]? {
    if case .list(let value) = self { return value }
    return nil
  }
  var mapValue: [(String, YamlNode)]? {
    if case .map(let value) = self { return value }
    return nil
  }
  var mapSeqValue: [[(String, YamlNode)]]? {
    if case .mapSeq(let value) = self { return value }
    return nil
  }
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

  // Readers for a nested map under an unknown key (e.g. season_workflow.*). Kept
  // here so all YamlNode case access stays in this file.
  private func nestedMap(_ outerKey: String) -> [(String, YamlNode)]? {
    for (k, v) in extraFrontmatter where k == outerKey { return v.mapValue }
    return nil
  }
  func nestedScalar(_ outerKey: String, _ innerKey: String) -> String? {
    nestedMap(outerKey)?.first { $0.0 == innerKey }?.1.scalarValue
  }
  func nestedBool(_ outerKey: String, _ innerKey: String) -> Bool {
    nestedMap(outerKey)?.first { $0.0 == innerKey }?.1.boolValue ?? false
  }
  func nestedList(_ outerKey: String, _ innerKey: String) -> [String] {
    nestedMap(outerKey)?.first { $0.0 == innerKey }?.1.listValue ?? []
  }
  // A nested list-of-maps flattened to scalar (key,value) pairs (e.g. decisions).
  func nestedMapSeq(_ outerKey: String, _ innerKey: String) -> [[(String, String)]] {
    guard let seq = nestedMap(outerKey)?.first(where: { $0.0 == innerKey })?.1.mapSeqValue
    else { return [] }
    return seq.map { entry in entry.compactMap { pair in pair.1.scalarValue.map { (pair.0, $0) } } }
  }

  // Build the season note's managed frontmatter from plain values. All YamlNode
  // construction stays in this file — cross-file YamlNode use trips a compiler cycle.
  mutating func applySeasonFrontmatter(
    seasonId: String, dateStart: String?, dateEnd: String?, priorities: [String],
    statement: String, priorReflection: String, skippedPriorReflection: Bool, feelings: [String],
    decisions: [[(String, String)]], practices: [String], supports: [String], constraints: [String],
    enough: String, notNow: [String], midSeasonNotes: [String], completedSteps: [String]
  ) {
    let managed: Set<String> = [
      "season_id", "date_start", "date_end", "priorities", "season_workflow",
    ]
    var extra = extraFrontmatter.filter { !managed.contains($0.0) }
    extra.append(("season_id", .scalar(seasonId)))
    if let dateStart { extra.append(("date_start", .scalar(dateStart))) }
    if let dateEnd { extra.append(("date_end", .scalar(dateEnd))) }
    extra.append(("priorities", .list(priorities)))
    let decisionMaps: [[(String, YamlNode)]] = decisions.map { entry in
      entry.map { ($0.0, YamlNode.scalar($0.1)) }
    }
    extra.append(
      (
        "season_workflow",
        .map([
          ("statement", .scalar(statement)),
          ("prior_reflection", .scalar(priorReflection)),
          ("skipped_prior_reflection", .bool(skippedPriorReflection)),
          ("feelings", .list(feelings)),
          ("decisions", .mapSeq(decisionMaps)),
          ("practices", .list(practices)),
          ("supports", .list(supports)),
          ("constraints", .list(constraints)),
          ("enough", .scalar(enough)),
          ("not_now", .list(notNow)),
          ("mid_season_notes", .list(midSeasonNotes)),
          ("completed_steps", .list(completedSteps)),
        ])
      ))
    extraFrontmatter = extra
  }

  // Reflection evidence + Then-&-Now writers. Kept here so all YamlNode construction
  // stays in this file (cross-file nested YamlNode use trips a compiler cycle).

  /// Replace the `related_notes` list, dropping the key entirely when empty.
  mutating func setRelatedNotes(_ ids: [String]) {
    var extra = extraFrontmatter.filter { $0.0 != "related_notes" }
    if !ids.isEmpty { extra.append(("related_notes", .list(ids))) }
    extraFrontmatter = extra
  }

  /// Set (or clear, when nil/empty) the `then_note_id` scalar.
  mutating func setThenNoteId(_ id: String?) {
    var extra = extraFrontmatter.filter { $0.0 != "then_note_id" }
    if let id, !id.trimmingCharacters(in: .whitespaces).isEmpty {
      extra.append(("then_note_id", .scalar(id)))
    }
    extraFrontmatter = extra
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
    pairs.append(
      (
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
      if let text = inline(node, indent: indent + 2) {
        out += "\(pad)\(key): \(text)\n"
        continue
      }
      switch node {
      case .list(let items) where !items.isEmpty:
        out += "\(pad)\(key):\n"
        for item in items { out += "\(pad)  - \(scalar(item, indent: indent + 4))\n" }
      case .map(let sub):
        out += "\(pad)\(key):\n"
        out += emit(sub, indent: indent + 2)
      case .mapSeq(let maps) where !maps.isEmpty:
        out += "\(pad)\(key):\n"
        out += emitMapSeq(maps, indent: indent)
      default:
        out += "\(pad)\(key): []\n"
      }
    }
    return out
  }

  // The text after `key: ` for a value written on the key's own line, or nil for a
  // collection (an empty one is written `[]` by `emit`).
  private static func inline(_ node: YamlNode, indent: Int) -> String? {
    switch node {
    case .scalar(let value): return scalar(value, indent: indent)
    case .int(let value): return "\(value)"
    case .raw(let value): return value
    case .bool(let value): return value ? "true" : "false"
    default: return nil
    }
  }

  // A block sequence of maps under a key at `indent`. Only values that fit on their
  // key's line are written.
  private static func emitMapSeq(_ maps: [[(String, YamlNode)]], indent: Int) -> String {
    let itemPad = String(repeating: " ", count: indent + 2)
    var out = ""
    for entry in maps {
      for (idx, pair) in entry.enumerated() {
        guard let text = inline(pair.1, indent: indent + 6) else { continue }
        out += "\(itemPad)\(idx == 0 ? "- " : "  ")\(pair.0): \(text)\n"
      }
    }
    return out
  }

  // Emit a scalar the way the `yaml` library's `stringify` does: plain when safe,
  // otherwise quoted, choosing single or double quotes as it does. Ported from
  // `yaml`'s stringifyString.js and checked against its output (YamlParityTests).
  // `indent` is the column a continuation line of the value would start at.
  private static func scalar(_ value: String, indent: Int) -> String {
    if value.unicodeScalars.contains(where: isForcedDoubleQuote) {
      return doubleQuoted(value, indent: indent)
    }
    if value.unicodeScalars.contains("\n") {
      // A multi-line string is a block scalar, unless it ends in a line feed and
      // then spaces or tabs, which a block cannot hold.
      return matches(value, #"\n[\t ]+\z"#)
        ? quoted(value, indent: indent) : literalBlock(value, indent: indent)
    }
    if matches(value, plainForbidden) || resolvesAsNonString(value) {
      return quoted(value, indent: indent)
    }
    return value
  }

  // `yaml`'s blockString with `lineWidth: 0`, which always picks the literal style:
  // the chomping indicator comes from the trailing line feeds (`-` none, clip one,
  // `+` more), and an indentation indicator from a leading space.
  private static func literalBlock(_ value: String, indent: Int) -> String {
    let pad = Array(repeating: UInt16(0x20), count: indent)
    let newline: UInt16 = 0x0A
    var body = Array(value.utf16)
    func isBlank(_ unit: UInt16) -> Bool { unit == 0x0A || unit == 0x09 || unit == 0x20 }
    var endStart = body.count
    while endStart > 0 && isBlank(body[endStart - 1]) { endStart -= 1 }
    var end = Array(body[endStart...])
    let chomp: String
    if let firstNewline = end.firstIndex(of: newline) {
      chomp = endStart == 0 || firstNewline != end.count - 1 ? "+" : ""
    } else {
      chomp = "-"
    }
    if !end.isEmpty {
      body = Array(body[..<endStart])
      if end.last == newline { end.removeLast() }
      end = indentingRuns(end, pad: pad, onlyBeforeText: true)
    }
    var startWithSpace = false
    var startEnd = 0
    var lastLeadingNewline = -1
    while startEnd < body.count {
      if body[startEnd] == 0x20 {
        startWithSpace = true
      } else if body[startEnd] == newline {
        lastLeadingNewline = startEnd
      } else {
        break
      }
      startEnd += 1
    }
    var start = Array(body[..<(lastLeadingNewline + 1)])
    if !start.isEmpty {
      body = Array(body[start.count...])
      start = indentingRuns(start, pad: pad, onlyBeforeText: false)
    }
    let header = (startWithSpace ? "2" : "") + chomp
    let text = pad + start + indentingRuns(body, pad: pad, onlyBeforeText: false) + end
    return "|\(header)\n" + String(decoding: text, as: UTF16.self)
  }

  // Put `pad` after every run of line feeds (`/\n+/g` → `$&pad`). With
  // `onlyBeforeText`, only after a run that more text follows, as `yaml` does for
  // the trailing whitespace of a block.
  private static func indentingRuns(_ units: [UInt16], pad: [UInt16], onlyBeforeText: Bool)
    -> [UInt16]
  {
    var out: [UInt16] = []
    for (pos, unit) in units.enumerated() {
      out.append(unit)
      let endsRun =
        unit == Unit.newline && (pos + 1 == units.count || units[pos + 1] != Unit.newline)
      if endsRun && (!onlyBeforeText || pos + 1 < units.count) { out += pad }
    }
    return out
  }

  // Control characters other than tab and line feed can only be written escaped.
  private static func isForcedDoubleQuote(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x00...0x08, 0x0B...0x1F, 0x7F...0x9F: return true
    default: return false
    }
  }

  // `yaml`'s test for a string that cannot be written plain: a leading indicator,
  // a lone or space-led `-`/`?`, `: ` or ` #` inside, or a trailing space or colon.
  private static let plainForbidden =
    #"\A[\n\t ,\[\]{}#\&*!|>'"%@`]|\A[?\-]\z|\A[?\-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]\z"#

  // Would the plain scalar be read by YAML 1.2's core schema as a null, bool or
  // number rather than a string? These are the `yaml` library's own tag tests.
  static func resolvesAsNonString(_ value: String) -> Bool {
    nonStringPatterns.contains { matches(value, $0) }
  }

  private static let nonStringPatterns = [
    #"\A(?:~|[Nn]ull|NULL)?\z"#,  // null, including the empty string
    #"\A(?:[Tt]rue|TRUE|[Ff]alse|FALSE)\z"#,  // bool
    #"\A0o[0-7]+\z"#,  // octal
    #"\A[-+]?[0-9]+\z"#,  // decimal int
    #"\A0x[0-9a-fA-F]+\z"#,  // hex
    #"\A(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)\z"#,  // infinity, not-a-number
    #"\A[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+\z"#,  // exponent
    #"\A[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)\z"#,  // float
  ]

  private static func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
  }

  // Single quotes when the string holds a double quote and no single quote, as the
  // web does; double quotes otherwise.
  private static func quoted(_ value: String, indent: Int) -> String {
    let scalars = value.unicodeScalars
    if scalars.contains("\""), !scalars.contains("'") {
      return singleQuoted(value, indent: indent)
    }
    return doubleQuoted(value, indent: indent)
  }

  private static func singleQuoted(_ value: String, indent: Int) -> String {
    // A single-quoted scalar cannot keep spaces around a line break.
    if matches(value, #"[ \t]\n|\n[ \t]"#) { return doubleQuoted(value, indent: indent) }
    var out = String.UnicodeScalarView(["'"])
    for scalar in value.unicodeScalars {
      out.append(scalar)
      if scalar == "'" { out.append("'") }
    }
    out.append("'")
    return String(out)
  }

  // `yaml`'s doubleQuotedString: JSON.stringify's escapes, then YAML's shorter
  // `\0 \a \v \e \xNN` forms, and, in a string of 40 or more JSON characters, line
  // feeds written as folded line breaks. The loop is a direct port, working on the
  // UTF-16 code units of the JSON text just as the JavaScript does.
  private static func doubleQuoted(_ value: String, indent: Int) -> String {
    let (backslash, quote, space, newline) = (Unit.backslash, Unit.quote, Unit.space, Unit.newline)
    let (letterN, letterU) = (Unit.letterN, Unit.letterU)
    let json = jsonString(value)
    func at(_ index: Int) -> UInt16? { index < json.count ? json[index] : nil }
    var out: [UInt16] = []
    var start = 0
    var pos = 0
    while pos < json.count {
      var unit = json[pos]
      if unit == space && at(pos + 1) == backslash && at(pos + 2) == letterN {
        // A space before a line feed is escaped so folding cannot eat it.
        out += json[start..<pos]
        out += [backslash, space]
        pos += 1
        start = pos
        unit = backslash
      }
      if unit == backslash {
        switch at(pos + 1) {
        case letterU:
          out += json[start..<pos]
          let code = String(decoding: json[(pos + 2)..<(pos + 6)], as: UTF16.self)
          out += (shortEscapes[code] ?? "\\x\(code.dropFirst(2))").utf16
          pos += 5
          start = pos + 1
        case letterN:
          if at(pos + 2) == quote || json.count < 40 {
            pos += 1
          } else {
            out += json[start..<pos]
            out += [newline, newline]
            while at(pos + 2) == backslash && at(pos + 3) == letterN && at(pos + 4) != quote {
              out.append(newline)
              pos += 2
            }
            out += Array(repeating: space, count: indent)
            if at(pos + 2) == space { out.append(backslash) }
            pos += 1
            start = pos + 1
          }
        default:
          pos += 1
        }
      }
      pos += 1
    }
    out += json[start...]
    return String(decoding: out, as: UTF16.self)
  }

  private enum Unit {
    static let backslash: UInt16 = 0x5C
    static let quote: UInt16 = 0x22
    static let space: UInt16 = 0x20
    static let newline: UInt16 = 0x0A
    static let letterN: UInt16 = 0x6E
    static let letterU: UInt16 = 0x75
  }

  private static let shortEscapes = ["0000": "\\0", "0007": "\\a", "000b": "\\v", "001b": "\\e"]

  // JSON.stringify of a string: quotes, backslashes and C0 controls escaped, with
  // lowercase hex, everything else (DEL, C1 controls, U+2028) left as it is.
  private static func jsonString(_ value: String) -> [UInt16] {
    var json: [UInt16] = [0x22]
    for unit in value.utf16 {
      switch unit {
      case 0x22: json += "\\\"".utf16
      case 0x5C: json += "\\\\".utf16
      case 0x08: json += "\\b".utf16
      case 0x09: json += "\\t".utf16
      case 0x0A: json += "\\n".utf16
      case 0x0C: json += "\\f".utf16
      case 0x0D: json += "\\r".utf16
      case 0x00..<0x20: json += String(format: "\\u%04x", unit).utf16
      default: json.append(unit)
      }
    }
    json.append(0x22)
    return json
  }
}

extension String {
  fileprivate func trimmingTrailingNewlines() -> String {
    var s = self[...]
    while s.last == "\n" { s = s.dropLast() }
    return String(s)
  }
}
