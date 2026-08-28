import Foundation

// The repair queue: duplicate stable-note-ID metadata issues + broken/ambiguous
// links across the vault, ordered like the web `repairQueue` (path, then kind, then
// occurrence). Scoped to the link forms `LinkEditor` can rewrite (wiki links);
// parse-error metadata repair is a follow-up. Pure over the parsed notes.

struct BrokenLinkItem: Equatable, Identifiable {
  let path: String
  let noteId: String
  let occurrence: Int
  let kind: LinkKind
  let target: String
  let label: String
  let state: LinkState

  var id: String { "\(path)#\(occurrence)" }

  var isAmbiguous: Bool {
    if case .ambiguous = state { return true }
    return false
  }
}

struct MetadataItem: Equatable, Identifiable {
  let path: String
  let message: String
  var id: String { path }
}

enum RepairItem: Equatable, Identifiable {
  case metadata(MetadataItem)
  case brokenLink(BrokenLinkItem)

  var id: String {
    switch self {
    case .metadata(let item): return "meta:\(item.id)"
    case .brokenLink(let item): return "link:\(item.id)"
    }
  }
}

enum RepairQueue {
  static func build(notes: [(path: String, note: StudioNote)]) -> [RepairItem] {
    // Canonical owner of each id is the first note by path; later ones are duplicates.
    let byPath = notes.sorted { $0.path.localizedCompare($1.path) == .orderedAscending }
    var canonical: [String: String] = [:]
    var metadata: [MetadataItem] = []
    for (path, note) in byPath {
      if let owner = canonical[note.id] {
        metadata.append(
          MetadataItem(
            path: path,
            message: "Duplicate note ID “\(note.id)”; the canonical note is \(owner)."))
      } else {
        canonical[note.id] = path
      }
    }

    let graph = LinkGraph(
      notes.map { (id: $0.note.id, path: $0.path, title: $0.note.title ?? "", body: $0.note.body) })

    var broken: [BrokenLinkItem] = []
    for (path, note) in byPath {
      for link in LinkEditor.editableLinks(note.body) {
        let parsed = ParsedLink(kind: link.kind, target: link.target, label: link.label)
        let state = graph.resolve(sourcePath: path, parsed)
        if case .resolved = state { continue }
        broken.append(
          BrokenLinkItem(
            path: path, noteId: note.id, occurrence: link.index, kind: link.kind,
            target: link.target, label: link.label, state: state))
      }
    }

    // Order: path, then kind ("broken-link" < "metadata"), then occurrence (-1 for metadata).
    let items: [(path: String, kind: String, occurrence: Int, item: RepairItem)] =
      metadata.map { ($0.path, "metadata", -1, RepairItem.metadata($0)) }
      + broken.map { ($0.path, "broken-link", $0.occurrence, RepairItem.brokenLink($0)) }
    return items.sorted { left, right in
      if left.path != right.path { return left.path.localizedCompare(right.path) == .orderedAscending }
      if left.kind != right.kind { return left.kind < right.kind }
      return left.occurrence < right.occurrence
    }.map { $0.item }
  }
}
