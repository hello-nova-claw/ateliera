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
    // Frontmatter the web's strict `yaml` parse would reject (an undefined escape,
    // say) in a recognised key is rejected here too, so the note goes to Repair
    // untouched.
    guard let pairs = try? readFrontmatter(document.frontLines) else { return nil }
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

  // Every top-level entry in order: a key with the lines under it, or a comment or
  // other line that is not a plain key. Nothing is skipped, so an odd line never
  // loses the keys after it.
  private static func readFrontmatter(_ lines: [String]) throws -> [(String, YamlNode)] {
    var pairs: [(String, YamlNode)] = []
    var start = 0
    while start < lines.count {
      var end = start + 1
      while end < lines.count && continuesEntry(lines[end]) { end += 1 }
      if let pair = try readEntry(Array(lines[start..<end])) { pairs.append(pair) }
      start = end
    }
    return pairs
  }

  // A line belongs to the entry above it when it is blank, indented, or an item of
  // a sequence written at the key's own column.
  private static func continuesEntry(_ line: String) -> Bool {
    guard let first = line.unicodeScalars.first else { return true }
    return first == " " || first == "\t" || line == "-" || line.hasPrefix("- ")
  }

  // An unknown key keeps its model only when writing it back gives the same lines;
  // otherwise it is kept verbatim (with the model, when there is one, for reads), so
  // another tool's comments, flow collections and styles survive a native save. A
  // recognised key the reader cannot model rejects the note.
  private static func readEntry(_ entry: [String]) throws -> (String, YamlNode)? {
    if entry.allSatisfy({ trimmingYamlSpace($0).isEmpty }) { return nil }
    guard isPlainKey(entry[0]), let (key, rest) = keyAndValue(entry[0]) else {
      return ("", .verbatim(entry, nil))
    }
    var index = 0
    var node: YamlNode?
    do {
      node = try parseValue(rest, entry, &index, indent: 0)
    } catch is UnmodelledShape {
      node = nil
    }
    let readAll = entry[index...].allSatisfy(isBlankOrComment)
    if recognizedKeys.contains(key) {
      guard let node, readAll else { throw MalformedScalar() }
      return (key, node)
    }
    guard let node, readAll else { return (key, .verbatim(entry, nil)) }
    if StudioNote.emitted(key, node) == entry.map({ $0 + "\n" }).joined() { return (key, node) }
    return (key, .verbatim(entry, node))
  }

  // A key YAML reads as plain text: not quoted, not complex, not a comment.
  private static func isPlainKey(_ line: String) -> Bool {
    guard let first = line.unicodeScalars.first else { return false }
    return !"\"'?{[#&*!|>%@`-".unicodeScalars.contains(first)
  }

  private static func isBlankOrComment(_ line: String) -> Bool {
    let trimmed = trimmingYamlSpace(line)
    return trimmed.isEmpty || trimmed.hasPrefix("#")
  }

  // Recursive block reader. Consumes lines at `indent`; returns ordered pairs.
  private static func parseBlock(_ lines: [String], _ index: inout Int, indent: Int)
    throws -> [(String, YamlNode)]
  {
    var pairs: [(String, YamlNode)] = []
    while index < lines.count {
      let line = lines[index]
      if isBlankOrComment(line) {
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
    guard
      let colon = content.indices.first(where: { position in
        let next = content.index(after: position)
        return content[position] == ":"
          && (next == content.endIndex || content[next] == " " || content[next] == "\t")
      })
    else { return nil }
    let key = String(content[..<colon]).trimmingCharacters(in: .whitespaces)
    let value = content[content.index(after: colon)...].unicodeScalars.drop {
      $0 == " " || $0 == "\t"
    }
    return (key, String(value))
  }

  // The value after `key:` on line `index`, whose key starts at column `indent`.
  // Leaves `index` at the first line after the value. Shapes the reader does not
  // model (flow maps, anchors, aliases, tags) throw.
  private static func parseValue(
    _ rest: String, _ lines: [String], _ index: inout Int, indent: Int
  ) throws -> YamlNode {
    index += 1
    let value = withoutComment(trimmingYamlSpace(rest))
    if value.isEmpty {
      if let column = sequenceColumn(lines, index, indent: indent) {
        return try parseSequence(lines, &index, column: column)
      }
      return .map(try parseBlock(lines, &index, indent: indent + 2))
    }
    if value.hasPrefix("{") { return try flowMap(value) }
    if let first = value.unicodeScalars.first, "&*!".unicodeScalars.contains(first) {
      throw UnmodelledShape()
    }
    if let first = value.unicodeScalars.first, "%@`".unicodeScalars.contains(first) {
      throw MalformedScalar()
    }
    if value.hasPrefix("[") { return .list(try flowSequence(value)) }
    if value == "true" || value == "false" {
      // An unquoted boolean (the web quotes a bool-like string, so bare true/false
      // is a real boolean) — keep it as .bool so it re-serializes unquoted.
      return .bool(value == "true")
    }
    if StudioNote.resolvesAsNonString(value) { return .raw(value) }
    return .scalar(try readScalar(rest, lines, &index, parentIndent: indent))
  }

  // A plain value ends where ` #` starts a comment. A quoted one is left alone: its
  // reader stops at the closing quote.
  private static func withoutComment(_ value: String) -> String {
    guard let first = value.unicodeScalars.first, first != "\"" && first != "'" else {
      return value
    }
    let scalars = Array(value.unicodeScalars)
    for position in scalars.indices.dropFirst()
    where scalars[position] == "#"
      && (scalars[position - 1] == " " || scalars[position - 1] == "\t")
    {
      return trimmingYamlSpace(String(String.UnicodeScalarView(scalars[..<position])))
    }
    return value
  }

  // A one-line flow sequence of scalars, split at the commas outside quotes.
  private static func flowSequence(_ value: String) throws -> [String] {
    try flowItems(value, closing: "]").map { try unquote($0) }
  }

  // A one-line flow map of scalars (`{ featured: false }`), as other writers use for
  // small maps. A nested collection is not modelled.
  private static func flowMap(_ value: String) throws -> YamlNode {
    let pairs: [(String, YamlNode)] = try flowItems(value, closing: "}").map { item in
      guard let (key, rest) = keyAndValue(item) else { throw UnmodelledShape() }
      let text = trimmingYamlSpace(rest)
      if text == "true" || text == "false" { return (key, .bool(text == "true")) }
      if StudioNote.resolvesAsNonString(text) { return (key, .raw(text)) }
      return (key, .scalar(try unquote(text)))
    }
    return .map(pairs)
  }

  // The items of a one-line flow collection, split at the commas outside quotes and
  // trimmed. `value` runs from the opening bracket to `closing`.
  private static func flowItems(_ value: String, closing: Unicode.Scalar) throws -> [String] {
    let scalars = Array(value.unicodeScalars)
    guard scalars.last == closing else { throw MalformedScalar() }
    var items: [String] = []
    var current = String.UnicodeScalarView()
    var quote: Unicode.Scalar?
    var position = 1
    while position < scalars.count - 1 {
      let scalar = scalars[position]
      current.append(scalar)
      position += 1
      if let open = quote {
        if open == "\"" && scalar == "\\" && position < scalars.count - 1 {
          current.append(scalars[position])
          position += 1
        } else if scalar == open {
          quote = nil
        }
      } else if scalar == "\"" || scalar == "'" {
        quote = scalar
      } else if "[]{}".unicodeScalars.contains(scalar) {
        throw UnmodelledShape()
      } else if scalar == "," {
        current.removeLast()
        items.append(String(current))
        current = String.UnicodeScalarView()
      }
    }
    guard quote == nil else { throw MalformedScalar() }
    items.append(String(current))
    if items.count == 1 && trimmingYamlSpace(items[0]).isEmpty { return [] }
    return items.map { withoutComment(trimmingYamlSpace($0)) }
  }

  // The column of a block sequence under a key at `indent`: indented by two, or, as
  // some writers do, at the key's own column.
  private static func sequenceColumn(_ lines: [String], _ index: Int, indent: Int) -> Int? {
    for column in [indent + 2, indent] where isSequenceItem(lines, index, column: column) {
      return column
    }
    return nil
  }

  private static func isSequenceItem(_ lines: [String], _ index: Int, column: Int) -> Bool {
    guard index < lines.count, leadingSpaces(lines[index]) == column else { return false }
    let item = lines[index].dropFirst(column)
    return item == "-" || item.hasPrefix("- ")
  }

  // A block sequence whose `-` sits at `column`. Each item is either a scalar
  // (`- value`) or a map (`- key: value` with continuation lines) — the web quotes
  // any scalar containing `: `, so an unquoted `key: value` after `- ` is a map.
  private static func parseSequence(_ lines: [String], _ index: inout Int, column: Int)
    throws -> YamlNode
  {
    let content = column + 2
    let firstItem = String(lines[index].dropFirst(content))
    guard isPlainKey(firstItem), keyAndValue(firstItem) != nil else {
      var items: [String] = []
      while isSequenceItem(lines, index, column: column) {
        let text = String(lines[index].dropFirst(content))
        index += 1
        items.append(try readScalar(text, lines, &index, parentIndent: column))
      }
      return .list(items)
    }
    var maps: [[(String, YamlNode)]] = []
    while isSequenceItem(lines, index, column: column) {
      var itemPairs: [(String, YamlNode)] = []
      if let (key, rest) = keyAndValue(String(lines[index].dropFirst(content))) {
        itemPairs.append((key, try parseValue(rest, lines, &index, indent: content)))
      } else {
        index += 1
      }
      itemPairs.append(contentsOf: try parseBlock(lines, &index, indent: content))
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
    if trimmed.hasPrefix("|") || trimmed.hasPrefix(">") {
      guard let header = BlockHeader(trimmed) else { throw MalformedScalar() }
      return readBlock(header, lines, &index, parentIndent: parentIndent)
    }
    guard let quote = trimmed.unicodeScalars.first, quote == "\"" || quote == "'" else {
      return withoutComment(trimmed)
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

  // A block scalar header: `|` (literal) or `>` (folded), then a chomping indicator
  // and an indentation digit in either order, then nothing or a comment.
  private struct BlockHeader {
    var folded = false
    var chomp: Unicode.Scalar?
    var indentation: Int?

    init?(_ text: String) {
      var scalars = text.unicodeScalars[...]
      guard let style = scalars.first, style == "|" || style == ">" else { return nil }
      folded = style == ">"
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

  // The lines of a block scalar: everything indented past the parent, with blank
  // lines kept, folded if the header says so, then the trailing line feeds chomped
  // as it says.
  private static func readBlock(
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
    let content = collected.map { line in
      line.count <= indent && line.allSatisfy({ $0 == " " }) ? "" : String(line.dropFirst(indent))
    }
    let text = header.folded ? folded(content) : content.map { $0 + "\n" }.joined()
    var core = Substring(text)
    while core.last == "\n" { core = core.dropLast() }
    switch header.chomp {
    case "+": return text
    case "-": return String(core)
    default: return core.isEmpty ? "" : core + "\n"
    }
  }

  // YAML's folding of a `>` block's lines: a single line break between two lines
  // becomes a space, each empty line a line feed, and the breaks around a
  // more-indented line are kept. The result ends with the block's line feeds.
  private static func folded(_ lines: [String]) -> String {
    var out = ""
    var emptyLines = 0
    var didRead = false
    var afterIndented = false
    for line in lines {
      if line.isEmpty {
        emptyLines += 1
        continue
      }
      if line.hasPrefix(" ") || line.hasPrefix("\t") {
        afterIndented = true
        out += String(repeating: "\n", count: didRead ? emptyLines + 1 : emptyLines)
      } else if afterIndented {
        afterIndented = false
        out += String(repeating: "\n", count: emptyLines + 1)
      } else if emptyLines == 0 {
        if didRead { out += " " }
      } else {
        out += String(repeating: "\n", count: emptyLines)
      }
      out += line
      didRead = true
      emptyLines = 0
    }
    return out + (didRead ? "\n" : "") + String(repeating: "\n", count: emptyLines)
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
    var closed = false
    var pos = 0
    while pos < raw.count {
      let scalar = raw[pos]
      if scalar == "\n" {
        lines.append([])
        escapedBreaks.append(false)
        pos += 1
      } else if scalar == quote {
        guard quote == "'" && pos + 1 < raw.count && raw[pos + 1] == "'" else {
          // Only spaces may follow the closing quote: the web rejects anything else,
          // and a native save would drop it.
          guard raw[(pos + 1)...].allSatisfy({ $0 == " " || $0 == "\t" }) else {
            throw MalformedScalar()
          }
          closed = true
          break
        }
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
    // A backslash before the last quote escaped it, so the scalar never closed.
    guard closed else { throw MalformedScalar() }
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
  // or one naming no code point: YAML the web's parser rejects too.
  private struct MalformedScalar: Error {}

  // Valid YAML the reader does not model (an anchor, an alias, a tag, a nested flow
  // collection).
  private struct UnmodelledShape: Error {}

  // One escape of YAML's double-quoted set, starting at the backslash at `pos`: the
  // scalar it stands for and how many scalars it took. A high and a low surrogate are
  // joined however wide their escapes are, as the web does. An escape the web's
  // `yaml` parser rejects is rejected, and so is a lone surrogate: the web keeps it,
  // but a Swift string cannot hold it, so a native save would change the value.
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
    guard let width = hexEscapeWidths[escape], let first = hex(at: pos + 2, width: width) else {
      throw MalformedScalar()
    }
    var code = first
    var consumed = 2 + width
    if (0xD800...0xDBFF).contains(code), pos + consumed + 1 < scalars.count,
      scalars[pos + consumed] == "\\",
      let lowWidth = ["u": 4, "U": 8][scalars[pos + consumed + 1]],
      let low = hex(at: pos + consumed + 2, width: lowWidth), (0xDC00...0xDFFF).contains(low)
    {
      code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
      consumed += 2 + lowWidth
    }
    guard let decoded = Unicode.Scalar(code) else { throw MalformedScalar() }
    return (decoded, consumed)
  }
}
