import Foundation

// Parse a note's Markdown into `StudioNote`, matching `@studio/content`'s
// parse-note.ts mapping: split the `---` frontmatter, read recognised keys into
// the model, keep unknown keys (in order) as extraFrontmatter, and preserve the
// body. A dependency-free block-YAML reader handles the shape our serializer (and
// the web's `yaml` emitter) produces; `\n` line endings for now.
enum NoteParser {
  static let recognizedKeys: Set<String> = [
    "schema_version", "id", "title", "card_type", "semantic_type", "status",
    "rooms", "life_areas", "landscape_anchor", "seasons", "tags", "created",
    "updated", "source", "source_notes", "resurface_kind", "resurface_due",
    "resurface_interval_days", "attachments", "display", "privacy",
  ]

  static func parse(_ text: String) -> StudioNote? {
    // Detect the document's line ending from its first terminator, matching
    // `@studio/content`'s splitDocument (which keys off the opening `---` break),
    // then normalise to `\n` for parsing and restore the ending on the body.
    let lineEnding = detectLineEnding(text)
    let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
    let lines = normalized.components(separatedBy: "\n")
    guard lines.first == "---",
      let close = lines.dropFirst().firstIndex(of: "---")
    else { return nil }
    let frontLines = Array(lines[1..<close])
    let normalizedBody = lines[(close + 1)...].joined(separator: "\n")
    let body =
      lineEnding == "\r\n"
      ? normalizedBody.replacingOccurrences(of: "\n", with: "\r\n")
      : normalizedBody

    var index = 0
    // Frontmatter the web's strict `yaml` parse would reject (an undefined escape,
    // say) is rejected here too, so the note goes to Repair untouched.
    guard let pairs = try? parseBlock(frontLines, &index, indent: 0) else { return nil }

    var known: [String: YamlNode] = [:]
    var extra: [(String, YamlNode)] = []
    for (key, node) in pairs {
      if recognizedKeys.contains(key) {
        known[key] = node
      } else {
        extra.append((key, node))
      }
    }

    func str(_ key: String) -> String? {
      if case .scalar(let value)? = known[key] { return value }
      return nil
    }
    func list(_ key: String) -> [String] {
      if case .list(let items)? = known[key] { return items }
      return []
    }
    func map(_ key: String) -> [(String, YamlNode)] {
      if case .map(let pairs)? = known[key] { return pairs }
      return []
    }
    func mapValue(_ pairs: [(String, YamlNode)], _ key: String) -> String? {
      for (k, node) in pairs where k == key {
        if case .scalar(let value) = node { return value }
        if case .bool(let value) = node { return value ? "true" : "false" }
      }
      return nil
    }

    guard
      let id = str("id"),
      let cardType = str("card_type"),
      let semanticType = str("semantic_type"),
      let status = str("status"),
      let created = str("created"),
      let updated = str("updated")
    else { return nil }

    let displayPairs = map("display")
    let privacyPairs = map("privacy")
    var note = StudioNote(
      schemaVersion: Int(str("schema_version") ?? "1") ?? 1,
      id: id,
      title: str("title"),
      cardType: cardType,
      semanticType: semanticType,
      status: status,
      rooms: list("rooms"),
      lifeAreas: list("life_areas"),
      landscapeAnchor: str("landscape_anchor"),
      seasons: list("seasons"),
      tags: list("tags"),
      created: created,
      updated: updated,
      source: nil,
      sourceNoteIds: known["source_notes"] == nil ? nil : list("source_notes"),
      resurfaceKind: str("resurface_kind"),
      resurfaceDue: str("resurface_due"),
      resurfaceIntervalDays: str("resurface_interval_days").flatMap(Int.init),
      attachments: list("attachments"),
      display: NoteDisplay(
        cover: mapValue(displayPairs, "cover"),
        featured: mapValue(displayPairs, "featured") == "true"),
      privacy: NotePrivacy(
        sensitivity: mapValue(privacyPairs, "sensitivity") ?? "private",
        aiAccess: mapValue(privacyPairs, "ai_access") ?? "ask"),
      extraFrontmatter: extra,
      body: body,
      lineEnding: lineEnding
    )
    if known["source"] != nil {
      let sourcePairs = map("source")
      note.source = NoteSource(
        title: mapValue(sourcePairs, "title"),
        creator: mapValue(sourcePairs, "creator"),
        url: mapValue(sourcePairs, "url"))
    }
    return note
  }

  // Recursive block reader. Consumes lines at `indent`; returns ordered pairs.
  private static func parseBlock(_ lines: [String], _ index: inout Int, indent: Int)
    throws -> [(String, YamlNode)]
  {
    var pairs: [(String, YamlNode)] = []
    while index < lines.count {
      let line = lines[index]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        index += 1
        continue
      }
      guard leadingSpaces(line) == indent,
        let (key, rest) = keyAndValue(String(line.dropFirst(indent)))
      else { break }
      pairs.append((key, try parseValue(rest, lines, &index, indent: indent)))
    }
    return pairs
  }

  private static func keyAndValue(_ content: String) -> (String, String)? {
    guard let colon = content.firstIndex(of: ":") else { return nil }
    let key = String(content[..<colon]).trimmingCharacters(in: .whitespaces)
    return (key, trimmingYamlSpace(String(content[content.index(after: colon)...])))
  }

  // The value after `key:` on line `index`, whose key starts at column `indent`.
  // Leaves `index` at the first line after the value.
  private static func parseValue(
    _ rest: String, _ lines: [String], _ index: inout Int, indent: Int
  ) throws -> YamlNode {
    index += 1
    if rest.isEmpty {
      if isSequenceItem(lines, index, indent: indent) {
        return try parseSequence(lines, &index, indent: indent)
      }
      return .map(try parseBlock(lines, &index, indent: indent + 2))
    }
    if rest.hasPrefix("[") && rest.hasSuffix("]") {
      let inner = String(rest.dropFirst().dropLast())
      if trimmingYamlSpace(inner).isEmpty { return .list([]) }
      return .list(
        try inner.components(separatedBy: ",").map { try unquote(trimmingYamlSpace($0)) })
    }
    if rest == "true" || rest == "false" {
      // An unquoted boolean (the web quotes a bool-like string, so bare true/false
      // is a real boolean) — keep it as .bool so it re-serializes unquoted.
      return .bool(rest == "true")
    }
    return .scalar(try unquote(rest))
  }

  private static func isSequenceItem(_ lines: [String], _ index: Int, indent: Int) -> Bool {
    index < lines.count && leadingSpaces(lines[index]) == indent + 2
      && lines[index].dropFirst(indent + 2).hasPrefix("- ")
  }

  // A block sequence under a key at `indent`. Each item is either a scalar
  // (`- value`) or a map (`- key: value` with continuation lines) — the web quotes
  // any scalar containing `: `, so an unquoted `key: value` after `- ` is a map.
  private static func parseSequence(_ lines: [String], _ index: inout Int, indent: Int)
    throws -> YamlNode
  {
    let firstItem = String(lines[index].dropFirst(indent + 4))
    // `key:` then a space, a tab or the end of the item; `a:b` is a plain scalar.
    let isMapItem =
      firstItem.contains(": ") || firstItem.contains(":\t") || firstItem.hasSuffix(":")
    guard isMapItem, !firstItem.hasPrefix("\""), !firstItem.hasPrefix("'") else {
      var items: [String] = []
      while isSequenceItem(lines, index, indent: indent) {
        items.append(try unquote(trimmingYamlSpace(String(lines[index].dropFirst(indent + 4)))))
        index += 1
      }
      return .list(items)
    }
    var maps: [[(String, YamlNode)]] = []
    while isSequenceItem(lines, index, indent: indent) {
      var itemPairs: [(String, YamlNode)] = []
      if let (key, rest) = keyAndValue(String(lines[index].dropFirst(indent + 4))) {
        itemPairs.append((key, try parseValue(rest, lines, &index, indent: indent + 4)))
      } else {
        index += 1
      }
      itemPairs.append(contentsOf: try parseBlock(lines, &index, indent: indent + 4))
      maps.append(itemPairs)
    }
    return .mapSeq(maps)
  }

  // Work at the unicode-scalar level: Swift treats "\r\n" as a single Character,
  // so Character-based searches for "\n" never match a CRLF terminator.
  private static func detectLineEnding(_ text: String) -> String {
    let scalars = Array(text.unicodeScalars)
    for (i, scalar) in scalars.enumerated() where scalar == "\n" {
      return i > 0 && scalars[i - 1] == "\r" ? "\r\n" : "\n"
    }
    return "\n"
  }

  private static func leadingSpaces(_ line: String) -> Int {
    line.prefix { $0 == " " }.count
  }

  // YAML's own whitespace: spaces and tabs, never the other Unicode spaces (a
  // plain scalar may begin or end with a no-break space).
  private static func trimmingYamlSpace(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let first = scalars.firstIndex(where: { $0 != " " && $0 != "\t" }),
      let last = scalars.lastIndex(where: { $0 != " " && $0 != "\t" })
    else { return "" }
    return String(scalars[first...last])
  }

  // Read a flow scalar as YAML does: a double-quoted one has its escapes decoded,
  // a single-quoted one reads `''` as `'`, and a plain one is returned as it is.
  private static func unquote(_ value: String) throws -> String {
    let scalars = Array(value.unicodeScalars)
    guard scalars.count >= 2, let quote = scalars.first, quote == scalars.last else {
      return value
    }
    let inner = scalars[1..<(scalars.count - 1)]
    if quote == "\"" { return try decodeDoubleQuoted(inner) }
    if quote == "'" {
      var out = String.UnicodeScalarView()
      var pos = inner.startIndex
      while pos < inner.endIndex {
        out.append(inner[pos])
        pos += inner[pos] == "'" && pos + 1 < inner.endIndex && inner[pos + 1] == "'" ? 2 : 1
      }
      return String(out)
    }
    return value
  }

  private static let simpleEscapes: [Unicode.Scalar: Unicode.Scalar] = [
    "0": "\u{0}", "a": "\u{7}", "b": "\u{8}", "t": "\t", "\t": "\t", "n": "\n",
    "v": "\u{B}", "f": "\u{C}", "r": "\r", "e": "\u{1B}", " ": " ", "\"": "\"", "/": "/",
    "\\": "\\", "N": "\u{85}", "_": "\u{A0}", "L": "\u{2028}", "P": "\u{2029}",
  ]
  private static let hexEscapeWidths: [Unicode.Scalar: Int] = ["x": 2, "u": 4, "U": 8]

  // A double-quoted escape YAML does not define, or one naming no code point.
  private struct MalformedEscape: Error {}

  // The YAML double-quoted escape set. A UTF-16 surrogate pair written as two `\u`
  // escapes is joined. An escape the web's `yaml` parser rejects is rejected, and so
  // is a lone surrogate: the web keeps it, but a Swift string cannot hold it, so a
  // native save would change the value.
  private static func decodeDoubleQuoted(_ scalars: ArraySlice<Unicode.Scalar>) throws -> String {
    var out = String.UnicodeScalarView()
    var pos = scalars.startIndex
    func hex(at start: Int, width: Int) -> UInt32? {
      guard start + width <= scalars.endIndex else { return nil }
      let digits = String(String.UnicodeScalarView(scalars[start..<(start + width)]))
      guard digits.allSatisfy(\.isHexDigit) else { return nil }
      return UInt32(digits, radix: 16)
    }
    while pos < scalars.endIndex {
      let scalar = scalars[pos]
      guard scalar == "\\" else {
        out.append(scalar)
        pos += 1
        continue
      }
      // A backslash before the closing quote escaped it, so the scalar never closed.
      guard pos + 1 < scalars.endIndex else { throw MalformedEscape() }
      let escape = scalars[pos + 1]
      if let decoded = simpleEscapes[escape] {
        out.append(decoded)
        pos += 2
      } else if let width = hexEscapeWidths[escape], var code = hex(at: pos + 2, width: width) {
        pos += 2 + width
        if (0xD800...0xDBFF).contains(code), pos + 6 <= scalars.endIndex, scalars[pos] == "\\",
          scalars[pos + 1] == "u", let low = hex(at: pos + 2, width: 4),
          (0xDC00...0xDFFF).contains(low)
        {
          code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
          pos += 6
        }
        guard let decoded = Unicode.Scalar(code) else { throw MalformedEscape() }
        out.append(decoded)
      } else {
        throw MalformedEscape()
      }
    }
    return String(out)
  }
}
