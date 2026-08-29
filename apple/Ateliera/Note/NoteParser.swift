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
  private static func parseBlock(_ lines: [String], _ i: inout Int, indent: Int)
    -> [(String, YamlNode)]
  {
    var pairs: [(String, YamlNode)] = []
    while i < lines.count {
      let line = lines[i]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        i += 1
        continue
      }
      let lead = leadingSpaces(line)
      if lead != indent { break }
      let content = String(line.dropFirst(indent))
      guard let colon = content.firstIndex(of: ":") else { break }
      let key = String(content[..<colon]).trimmingCharacters(in: .whitespaces)
      let rest = String(content[content.index(after: colon)...]).trimmingCharacters(
        in: .whitespaces)
      if rest.isEmpty {
        i += 1
        if i < lines.count && leadingSpaces(lines[i]) == indent + 2
          && lines[i].dropFirst(indent + 2).hasPrefix("- ")
        {
          // A block sequence. Each item is either a scalar (`- value`) or a map
          // (`- key: value` with continuation lines) — the web quotes any scalar
          // containing `: `, so an unquoted `key: value` after `- ` is a map.
          let firstItem = String(lines[i].dropFirst(indent + 4))
          if firstItem.contains(": ") && !firstItem.hasPrefix("\"") {
            var maps: [[(String, YamlNode)]] = []
            while i < lines.count && leadingSpaces(lines[i]) == indent + 2
              && lines[i].dropFirst(indent + 2).hasPrefix("- ")
            {
              var itemPairs: [(String, YamlNode)] = []
              let head = String(lines[i].dropFirst(indent + 4))
              if let colon = head.firstIndex(of: ":") {
                let k = String(head[..<colon]).trimmingCharacters(in: .whitespaces)
                let v = String(head[head.index(after: colon)...]).trimmingCharacters(
                  in: .whitespaces)
                itemPairs.append((k, .scalar(unquote(v))))
              }
              i += 1
              itemPairs.append(contentsOf: parseBlock(lines, &i, indent: indent + 4))
              maps.append(itemPairs)
            }
            pairs.append((key, .mapSeq(maps)))
          } else {
            var items: [String] = []
            while i < lines.count && leadingSpaces(lines[i]) == indent + 2
              && lines[i].dropFirst(indent + 2).hasPrefix("- ")
            {
              items.append(unquote(String(lines[i].dropFirst(indent + 4))))
              i += 1
            }
            pairs.append((key, .list(items)))
          }
        } else {
          let sub = parseBlock(lines, &i, indent: indent + 2)
          pairs.append((key, .map(sub)))
        }
      } else if rest == "[]" {
        pairs.append((key, .list([])))
        i += 1
      } else if rest.hasPrefix("[") && rest.hasSuffix("]") {
        let inner = String(rest.dropFirst().dropLast())
        let items =
          inner.trimmingCharacters(in: .whitespaces).isEmpty
          ? []
          : inner.components(separatedBy: ",").map {
            unquote($0.trimmingCharacters(in: .whitespaces))
          }
        pairs.append((key, .list(items)))
        i += 1
      } else if rest == "true" || rest == "false" {
        // An unquoted boolean (the web quotes a bool-like string, so bare true/false
        // is a real boolean) — keep it as .bool so it re-serializes unquoted.
        pairs.append((key, .bool(rest == "true")))
        i += 1
      } else {
        pairs.append((key, .scalar(unquote(rest))))
        i += 1
      }
    }
    return pairs
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

  private static func unquote(_ value: String) -> String {
    if value.count >= 2,
      (value.hasPrefix("\"") && value.hasSuffix("\""))
        || (value.hasPrefix("'") && value.hasSuffix("'"))
    {
      return String(value.dropFirst().dropLast())
    }
    return value
  }
}
