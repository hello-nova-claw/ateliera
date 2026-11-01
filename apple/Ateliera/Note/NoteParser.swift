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
    let pairs = parseBlock(frontLines, &index, indent: 0)

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
    -> [(String, YamlNode)]
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
      pairs.append((key, parseValue(rest, lines, &index, indent: indent)))
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
  ) -> YamlNode {
    index += 1
    if rest.isEmpty {
      if isSequenceItem(lines, index, indent: indent) {
        return parseSequence(lines, &index, indent: indent)
      }
      return .map(parseBlock(lines, &index, indent: indent + 2))
    }
    if rest.hasPrefix("[") && rest.hasSuffix("]") {
      let inner = String(rest.dropFirst().dropLast())
      if trimmingYamlSpace(inner).isEmpty { return .list([]) }
      return .list(inner.components(separatedBy: ",").map { unquote(trimmingYamlSpace($0)) })
    }
    if rest == "true" || rest == "false" {
      // An unquoted boolean (the web quotes a bool-like string, so bare true/false
      // is a real boolean) — keep it as .bool so it re-serializes unquoted.
      return .bool(rest == "true")
    }
    return .scalar(readScalar(rest, lines, &index, parentIndent: indent))
  }

  private static func isSequenceItem(_ lines: [String], _ index: Int, indent: Int) -> Bool {
    index < lines.count && leadingSpaces(lines[index]) == indent + 2
      && lines[index].dropFirst(indent + 2).hasPrefix("- ")
  }

  // A block sequence under a key at `indent`. Each item is either a scalar
  // (`- value`) or a map (`- key: value` with continuation lines) — the web quotes
  // any scalar containing `: `, so an unquoted `key: value` after `- ` is a map.
  private static func parseSequence(_ lines: [String], _ index: inout Int, indent: Int)
    -> YamlNode
  {
    let firstItem = String(lines[index].dropFirst(indent + 4))
    guard firstItem.contains(": "), !firstItem.hasPrefix("\""), !firstItem.hasPrefix("'") else {
      var items: [String] = []
      while isSequenceItem(lines, index, indent: indent) {
        let text = trimmingYamlSpace(String(lines[index].dropFirst(indent + 4)))
        index += 1
        items.append(readScalar(text, lines, &index, parentIndent: indent + 2))
      }
      return .list(items)
    }
    var maps: [[(String, YamlNode)]] = []
    while isSequenceItem(lines, index, indent: indent) {
      var itemPairs: [(String, YamlNode)] = []
      if let (key, rest) = keyAndValue(String(lines[index].dropFirst(indent + 4))) {
        itemPairs.append((key, parseValue(rest, lines, &index, indent: indent + 4)))
      } else {
        index += 1
      }
      itemPairs.append(contentsOf: parseBlock(lines, &index, indent: indent + 4))
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
  private static func unquote(_ value: String) -> String {
    let scalars = Array(value.unicodeScalars)
    guard scalars.count >= 2, let quote = scalars.first, quote == "\"" || quote == "'",
      quote == scalars.last
    else { return value }
    return foldQuoted(Array(scalars.dropFirst()), quote: quote)
  }

  // Read the value that follows `key: ` (or `- `), which may run onto later lines:
  // a literal block scalar, or a quoted scalar the writer folded across lines.
  // `parentIndent` is the column of the key (or of the `-`); `index` points at the
  // line after the value's own line, and is left at the first line after the value.
  private static func readScalar(
    _ text: String, _ lines: [String], _ index: inout Int, parentIndent: Int
  ) -> String {
    if let header = BlockHeader(text) {
      return readLiteralBlock(header, lines, &index, parentIndent: parentIndent)
    }
    guard let quote = text.unicodeScalars.first, quote == "\"" || quote == "'" else {
      return text
    }
    var raw = String.UnicodeScalarView(text.unicodeScalars.dropFirst())
    var closed = closesQuote(raw[...], quote)
    while !closed && index < lines.count {
      let line = lines[index]
      index += 1
      raw.append("\n")
      raw.append(contentsOf: line.unicodeScalars)
      closed = closesQuote(line.unicodeScalars[...], quote)
    }
    return foldQuoted(Array(raw), quote: quote)
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
  private static func foldQuoted(_ raw: [Unicode.Scalar], quote: Unicode.Scalar) -> String {
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
        let (decoded, width) = decodeEscape(raw, at: pos)
        lines[lines.count - 1].append((decoded, width > 1))
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

  // One escape of YAML's double-quoted set, starting at the backslash at `pos`:
  // the scalar it stands for and how many scalars it took. A UTF-16 surrogate pair
  // written as two `\u` escapes is joined; an escape YAML does not define leaves the
  // backslash as written, with a width of 1.
  private static func decodeEscape(_ scalars: [Unicode.Scalar], at pos: Int)
    -> (Unicode.Scalar, Int)
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
      return ("\\", 1)
    }
    let next = pos + 2 + width
    if (0xD800...0xDBFF).contains(code), next + 6 <= scalars.count, scalars[next] == "\\",
      scalars[next + 1] == "u", let low = hex(at: next + 2, width: 4),
      (0xDC00...0xDFFF).contains(low)
    {
      let joined = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
      return (Unicode.Scalar(joined) ?? "\u{FFFD}", 2 + width + 6)
    }
    return (Unicode.Scalar(code) ?? "\u{FFFD}", 2 + width)
  }
}
