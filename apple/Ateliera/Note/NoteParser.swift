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
    let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
    let lines = normalized.components(separatedBy: "\n")
    guard lines.first == "---",
      let close = lines.dropFirst().firstIndex(of: "---")
    else { return nil }
    let frontLines = Array(lines[1..<close])
    let body = lines[(close + 1)...].joined(separator: "\n")

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
      lineEnding: "\n"
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
          var items: [String] = []
          while i < lines.count && leadingSpaces(lines[i]) == indent + 2
            && lines[i].dropFirst(indent + 2).hasPrefix("- ")
          {
            items.append(unquote(String(lines[i].dropFirst(indent + 4))))
            i += 1
          }
          pairs.append((key, .list(items)))
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
      } else {
        pairs.append((key, .scalar(unquote(rest))))
        i += 1
      }
    }
    return pairs
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
