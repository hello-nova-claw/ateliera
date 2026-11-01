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
    guard let document = splitDocument(text) else { return nil }
    var index = 0
    // Frontmatter the web's strict `yaml` parse would reject (an undefined escape,
    // say) is rejected here too, so the note goes to Repair untouched.
    guard let pairs = try? parseBlock(document.frontLines, &index, indent: 0) else { return nil }
    let known = KnownKeys(pairs.filter { recognizedKeys.contains($0.0) })
    let extra = pairs.filter { !recognizedKeys.contains($0.0) }

    guard
      let id = known.str("id"),
      let cardType = known.str("card_type"),
      let semanticType = known.str("semantic_type"),
      let status = known.str("status"),
      let created = known.str("created"),
      let updated = known.str("updated")
    else { return nil }

    var note = StudioNote(
      schemaVersion: Int(known.str("schema_version") ?? "1") ?? 1,
      id: id,
      title: known.str("title"),
      cardType: cardType,
      semanticType: semanticType,
      status: status,
      rooms: known.list("rooms"),
      lifeAreas: known.list("life_areas"),
      landscapeAnchor: known.str("landscape_anchor"),
      seasons: known.list("seasons"),
      tags: known.list("tags"),
      created: created,
      updated: updated,
      source: nil,
      sourceNoteIds: known.has("source_notes") ? known.list("source_notes") : nil,
      resurfaceKind: known.str("resurface_kind"),
      resurfaceDue: known.str("resurface_due"),
      resurfaceIntervalDays: known.str("resurface_interval_days").flatMap(Int.init),
      attachments: known.list("attachments"),
      display: NoteDisplay(
        cover: known.mapValue("display", "cover"),
        featured: known.mapValue("display", "featured") == "true"),
      privacy: NotePrivacy(
        sensitivity: known.mapValue("privacy", "sensitivity") ?? "private",
        aiAccess: known.mapValue("privacy", "ai_access") ?? "ask"),
      extraFrontmatter: extra,
      body: document.body,
      lineEnding: document.lineEnding
    )
    if known.has("source") {
      note.source = NoteSource(
        title: known.mapValue("source", "title"),
        creator: known.mapValue("source", "creator"),
        url: known.mapValue("source", "url"))
    }
    return note
  }

  // Split the `---` frontmatter from the body. The document's line ending comes
  // from its first terminator, matching `@studio/content`'s splitDocument (which
  // keys off the opening `---` break); the lines are read with `\n` endings and the
  // body gets its own ending back.
  private struct Document {
    let frontLines: [String]
    let body: String
    let lineEnding: String
  }

  private static func splitDocument(_ text: String) -> Document? {
    let lineEnding = detectLineEnding(text)
    let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
    let lines = normalized.components(separatedBy: "\n")
    guard lines.first == "---",
      let close = lines.dropFirst().firstIndex(of: "---")
    else { return nil }
    let normalizedBody = lines[(close + 1)...].joined(separator: "\n")
    let body =
      lineEnding == "\r\n"
      ? normalizedBody.replacingOccurrences(of: "\n", with: "\r\n")
      : normalizedBody
    return Document(frontLines: Array(lines[1..<close]), body: body, lineEnding: lineEnding)
  }

  // Typed reads of the recognised keys.
  private struct KnownKeys {
    let pairs: [(String, YamlNode)]
    init(_ pairs: [(String, YamlNode)]) { self.pairs = pairs }

    private func node(_ key: String) -> YamlNode? { pairs.last { $0.0 == key }?.1 }
    func has(_ key: String) -> Bool { node(key) != nil }
    func str(_ key: String) -> String? { node(key)?.scalarValue }
    func list(_ key: String) -> [String] { node(key)?.listValue ?? [] }
    func mapValue(_ key: String, _ inner: String) -> String? {
      for (name, value) in node(key)?.mapValue ?? [] where name == inner {
        if let text = value.scalarValue { return text }
        if let flag = value.boolValue { return flag ? "true" : "false" }
      }
      return nil
    }
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

  // The key, and the value with its leading spaces trimmed. Trailing spaces are left
  // for `readScalar`: on a quoted scalar folded across lines, an escaped space can end
  // the first line.
  private static func keyAndValue(_ content: String) -> (String, String)? {
    guard let colon = content.firstIndex(of: ":") else { return nil }
    let key = String(content[..<colon]).trimmingCharacters(in: .whitespaces)
    let value = content[content.index(after: colon)...].unicodeScalars.drop {
      $0 == " " || $0 == "\t"
    }
    return (key, String(value))
  }

  // The value after `key:` on line `index`, whose key starts at column `indent`.
  // Leaves `index` at the first line after the value.
  private static func parseValue(
    _ rest: String, _ lines: [String], _ index: inout Int, indent: Int
  ) throws -> YamlNode {
    index += 1
    let value = trimmingYamlSpace(rest)
    if value.isEmpty {
      if isSequenceItem(lines, index, indent: indent) {
        return try parseSequence(lines, &index, indent: indent)
      }
      return .map(try parseBlock(lines, &index, indent: indent + 2))
    }
    if value.hasPrefix("[") && value.hasSuffix("]") {
      let inner = String(value.dropFirst().dropLast())
      if trimmingYamlSpace(inner).isEmpty { return .list([]) }
      return .list(
        try inner.components(separatedBy: ",").map { try unquote(trimmingYamlSpace($0)) })
    }
    if value == "true" || value == "false" {
      // An unquoted boolean (the web quotes a bool-like string, so bare true/false
      // is a real boolean) — keep it as .bool so it re-serializes unquoted.
      return .bool(value == "true")
    }
    if StudioNote.resolvesAsNonString(value) { return .raw(value) }
    return .scalar(try readScalar(rest, lines, &index, parentIndent: indent))
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
        let text = String(lines[index].dropFirst(indent + 4))
        index += 1
        items.append(try readScalar(text, lines, &index, parentIndent: indent + 2))
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

  // Read a one-line flow scalar as YAML does: a double-quoted one has its escapes
  // decoded, a single-quoted one reads `''` as `'`, and a plain one is returned as
  // it is.
  private static func unquote(_ value: String) throws -> String {
    let scalars = Array(value.unicodeScalars)
    guard scalars.count >= 2, let quote = scalars.first, quote == "\"" || quote == "'",
      quote == scalars.last
    else { return value }
    return try foldQuoted(Array(scalars.dropFirst()), quote: quote)
  }

  // Read the value that follows `key: ` (or `- `), which may run onto later lines:
  // a literal block scalar, or a quoted scalar the writer folded across lines.
  // `parentIndent` is the column of the key (or of the `-`); `index` points at the
  // line after the value's own line, and is left at the first line after the value.
  // `text` may still end in spaces, which only a quoted scalar keeps.
  private static func readScalar(
    _ text: String, _ lines: [String], _ index: inout Int, parentIndent: Int
  ) throws -> String {
    let trimmed = trimmingYamlSpace(text)
    if let header = BlockHeader(trimmed) {
      return readLiteralBlock(header, lines, &index, parentIndent: parentIndent)
    }
    guard let quote = trimmed.unicodeScalars.first, quote == "\"" || quote == "'" else {
      return trimmed
    }
    let opened = text.unicodeScalars.drop { $0 == " " || $0 == "\t" }.dropFirst()
    var raw = String.UnicodeScalarView(opened)
    var closed = closesQuote(raw[...], quote)
    while !closed && index < lines.count {
      let line = lines[index]
      index += 1
      raw.append("\n")
      raw.append(contentsOf: line.unicodeScalars)
      closed = closesQuote(line.unicodeScalars[...], quote)
    }
    guard closed else { throw MalformedScalar() }
    return try foldQuoted(Array(raw), quote: quote)
  }

  // Does this stretch of a quoted scalar hold its closing quote?
  private static func closesQuote(_ scalars: Substring.UnicodeScalarView, _ quote: Unicode.Scalar)
    -> Bool
  {
    var iterator = scalars.makeIterator()
    while let scalar = iterator.next() {
      if quote == "\"" && scalar == "\\" {
        _ = iterator.next()
      } else if scalar == quote {
        if quote == "'", let next = iterator.next() {
          if next != "'" { return true }
        } else {
          return true
        }
      }
    }
    return false
  }

  // A block scalar header: `|`, then a chomping indicator and an indentation digit
  // in either order, then nothing or a comment.
  private struct BlockHeader {
    var chomp: Unicode.Scalar?
    var indentation: Int?

    init?(_ text: String) {
      var scalars = text.unicodeScalars[...]
      guard scalars.first == "|" else { return nil }
      scalars = scalars.dropFirst()
      while let scalar = scalars.first, scalar != " " && scalar != "\t" {
        if (scalar == "-" || scalar == "+") && chomp == nil {
          chomp = scalar
        } else if ("1"..."9").contains(scalar) && indentation == nil {
          indentation = Int(scalar.value - 48)
        } else {
          return nil
        }
        scalars = scalars.dropFirst()
      }
      let rest = scalars.drop { $0 == " " || $0 == "\t" }
      guard rest.isEmpty || rest.first == "#" else { return nil }
    }
  }

  // The lines of a literal block scalar: everything indented past the parent, with
  // blank lines kept, then the trailing line feeds chomped as the header says.
  private static func readLiteralBlock(
    _ header: BlockHeader, _ lines: [String], _ index: inout Int, parentIndent: Int
  ) -> String {
    var contentIndent = header.indentation.map { parentIndent + $0 }
    var collected: [String] = []
    while index < lines.count {
      let line = lines[index]
      if !line.allSatisfy({ $0 == " " }) {
        let lead = leadingSpaces(line)
        if contentIndent == nil && lead > parentIndent { contentIndent = lead }
        guard let contentIndent, lead >= contentIndent else { break }
      }
      collected.append(line)
      index += 1
    }
    let indent = contentIndent ?? parentIndent + 2
    let text = collected.map { line in
      line.count <= indent && line.allSatisfy({ $0 == " " }) ? "" : String(line.dropFirst(indent))
    }.map { $0 + "\n" }.joined()
    var core = Substring(text)
    while core.last == "\n" { core = core.dropLast() }
    switch header.chomp {
    case "+": return text
    case "-": return String(core)
    default: return core.isEmpty ? "" : core + "\n"
    }
  }

  // Fold a quoted scalar that runs across lines, as YAML reads it: each line break
  // becomes a space, or `n` line feeds when `n` empty lines follow it; whitespace
  // around a break goes unless escaped; and an escaped break (`\` at the end of a
  // line) joins the lines. `raw` runs from after the opening quote.
  private static func foldQuoted(_ raw: [Unicode.Scalar], quote: Unicode.Scalar) throws -> String {
    // Each line as (scalar, written by an escape) pairs, and whether the break
    // after it was escaped.
    var lines: [[(Unicode.Scalar, Bool)]] = [[]]
    var escapedBreaks: [Bool] = []
    var pos = 0
    while pos < raw.count {
      let scalar = raw[pos]
      if scalar == "\n" {
        lines.append([])
        escapedBreaks.append(false)
        pos += 1
      } else if scalar == quote {
        guard quote == "'" && pos + 1 < raw.count && raw[pos + 1] == "'" else { break }
        lines[lines.count - 1].append(("'", true))
        pos += 2
      } else if quote == "\"" && scalar == "\\" && pos + 1 < raw.count && raw[pos + 1] == "\n" {
        lines.append([])
        escapedBreaks.append(true)
        pos += 2
      } else if quote == "\"" && scalar == "\\" && pos + 1 < raw.count {
        let (decoded, width) = try decodeEscape(raw, at: pos)
        lines[lines.count - 1].append((decoded, true))
        pos += width
      } else {
        lines[lines.count - 1].append((scalar, false))
        pos += 1
      }
    }
    return joinFolded(lines, escapedBreaks: escapedBreaks)
  }

  private static func joinFolded(_ lines: [[(Unicode.Scalar, Bool)]], escapedBreaks: [Bool])
    -> String
  {
    func isSpace(_ pair: (Unicode.Scalar, Bool)) -> Bool {
      !pair.1 && (pair.0 == " " || pair.0 == "\t")
    }
    var out = String.UnicodeScalarView()
    var emptyLines = 0
    for (index, line) in lines.enumerated() {
      var content = line[...]
      if index > 0 { content = content.drop(while: isSpace) }
      let isLast = index == lines.count - 1
      if !isLast && !escapedBreaks[index] {
        while let last = content.last, isSpace(last) { content = content.dropLast() }
      }
      if index > 0 && !escapedBreaks[index - 1] {
        if content.isEmpty && !isLast {
          emptyLines += 1
          continue
        }
        if emptyLines == 0 { out.append(" ") }
      }
      out.append(contentsOf: String(repeating: "\n", count: emptyLines).unicodeScalars)
      emptyLines = 0
      out.append(contentsOf: content.map(\.0))
    }
    return String(out)
  }

  private static let simpleEscapes: [Unicode.Scalar: Unicode.Scalar] = [
    "0": "\u{0}", "a": "\u{7}", "b": "\u{8}", "t": "\t", "\t": "\t", "n": "\n",
    "v": "\u{B}", "f": "\u{C}", "r": "\r", "e": "\u{1B}", " ": " ", "\"": "\"", "/": "/",
    "\\": "\\", "N": "\u{85}", "_": "\u{A0}", "L": "\u{2028}", "P": "\u{2029}",
  ]
  private static let hexEscapeWidths: [Unicode.Scalar: Int] = ["x": 2, "u": 4, "U": 8]

  // A quoted scalar that never closes, a double-quoted escape YAML does not define,
  // or one naming no code point.
  private struct MalformedScalar: Error {}

  // One escape of YAML's double-quoted set, starting at the backslash at `pos`: the
  // scalar it stands for and how many scalars it took. A UTF-16 surrogate pair
  // written as two `\u` escapes is joined. A lone surrogate, which a Swift string
  // cannot hold, reads as U+FFFD; any other escape the web's `yaml` parser rejects
  // is rejected here too.
  private static func decodeEscape(_ scalars: [Unicode.Scalar], at pos: Int)
    throws -> (Unicode.Scalar, Int)
  {
    func hex(at start: Int, width: Int) -> UInt32? {
      guard start + width <= scalars.count else { return nil }
      let digits = String(String.UnicodeScalarView(scalars[start..<(start + width)]))
      guard digits.allSatisfy(\.isHexDigit) else { return nil }
      return UInt32(digits, radix: 16)
    }
    let escape = scalars[pos + 1]
    if let decoded = simpleEscapes[escape] { return (decoded, 2) }
    guard let width = hexEscapeWidths[escape], let code = hex(at: pos + 2, width: width) else {
      throw MalformedScalar()
    }
    let next = pos + 2 + width
    if (0xD800...0xDBFF).contains(code), next + 6 <= scalars.count, scalars[next] == "\\",
      scalars[next + 1] == "u", let low = hex(at: next + 2, width: 4),
      (0xDC00...0xDFFF).contains(low)
    {
      let joined = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
      return (Unicode.Scalar(joined) ?? "\u{FFFD}", 2 + width + 6)
    }
    if code > 0x10FFFF { throw MalformedScalar() }
    return (Unicode.Scalar(code) ?? "\u{FFFD}", 2 + width)
  }
}
