import Foundation

// Shared projection helpers ported from `packages/application/src/projections.ts`:
// note visibility, the deterministic fallback ordering, manual-order overlay, and
// the title/excerpt reduction. The Landscape and Identity projectors build on these
// so both rooms honour the same eligibility + ordering rules as the web.
enum Projection {
  typealias Loaded = (path: String, note: StudioNote)

  // A note is visible in a view when it isn't archived/trashed, isn't explicitly
  // excluded, and isn't a still-in-Inbox draft leaking into another room's view.
  static func visible(_ note: StudioNote, viewKey: String) -> Bool {
    if note.status == "archived" || note.status == "trashed" { return false }
    if extraBool(note, "excluded_from_views") { return false }
    if extraBool(note, "excluded") { return false }
    if note.status == "draft" && note.rooms.contains("inbox") && viewKey != "room:inbox" {
      return false
    }
    return true
  }

  static func extraBool(_ note: StudioNote, _ key: String) -> Bool {
    note.frontmatterBool(key)
  }

  // Deterministic order: updated desc, created desc, title asc, id asc — mirroring
  // `fallbackCompare` (ISO strings compare chronologically for equal formats).
  static func before(_ a: StudioNote, _ b: StudioNote) -> Bool {
    if a.updated != b.updated { return a.updated > b.updated }
    if a.created != b.created { return a.created > b.created }
    let at = a.title ?? "", bt = b.title ?? ""
    if at != bt { return at.localizedCompare(bt) == .orderedAscending }
    return a.id < b.id
  }

  // orderedProjection: keep visible notes, sort by the fallback, de-dup by id, then
  // overlay the manual order (manually-placed ids first, in that order).
  static func ordered(_ notes: [Loaded], viewKey: String, manual: [String]) -> [Loaded] {
    var seen = Set<String>()
    let sorted = notes
      .filter { visible($0.note, viewKey: viewKey) }
      .sorted { before($0.note, $1.note) }
      .filter { seen.insert($0.note.id).inserted }

    let byId = Dictionary(sorted.map { ($0.note.id, $0) }, uniquingKeysWith: { first, _ in first })
    let manualItems = manual.compactMap { byId[$0] }
    let placed = Set(manualItems.map { $0.note.id })
    return manualItems + sorted.filter { !placed.contains($0.note.id) }
  }

  // toCard's title/excerpt: title, else the first 80 plain-text chars, else Untitled;
  // excerpt = first 240 plain-text chars.
  static func title(_ note: StudioNote) -> String {
    let trimmed = note.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !trimmed.isEmpty { return trimmed }
    let plain = String(plainText(note.body).prefix(80))
    return plain.isEmpty ? "Untitled" : plain
  }

  static func excerpt(_ note: StudioNote) -> String {
    String(plainText(note.body).prefix(240))
  }

  // Whether the note carries its own title (vs. a title derived from the body's first
  // line). A note is one piece of text; display uses this to avoid showing a derived
  // title and then repeating it as an excerpt.
  static func hasExplicitTitle(_ note: StudioNote) -> Bool {
    !(note.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty
  }

  // A light Markdown→plain reduction for display (not an interop contract).
  static func plainText(_ body: String) -> String {
    let noFences = body.components(separatedBy: "\n")
      .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("```") }
      .joined(separator: " ")
    var stripped = noFences
    for token in ["[[", "]]", "**", "__", "`", "#", ">", "*", "_"] {
      stripped = stripped.replacingOccurrences(of: token, with: " ")
    }
    return stripped
      .split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" })
      .joined(separator: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

}
