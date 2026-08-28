import Foundation

// Pure projection of the Uncharted room — a port of `projectUnchartedRoom`. Cards are
// notes in the uncharted room (or of semantic type uncharted), ordered by the shared
// fallback, split into "near" and "beyond the gate" by the `beyond_gate` frontmatter.
enum UnchartedHorizon: String, Equatable {
  case near
  case beyond
}

struct UnchartedCard: Identifiable, Equatable {
  let id: String  // noteId
  let path: String
  let title: String
  let excerpt: String
  let horizon: UnchartedHorizon
  let seasons: [String]
}

enum UnchartedProjection {
  // belongsToRoom(note, "uncharted"): tagged uncharted, or of uncharted semantic type.
  static func belongs(_ note: StudioNote) -> Bool {
    note.rooms.contains("uncharted") || note.semanticType == "uncharted"
  }

  static func project(notes: [Projection.Loaded], manual: [String] = []) -> [UnchartedCard] {
    let candidates = notes.filter { belongs($0.note) }
    return Projection.ordered(candidates, viewKey: "room:uncharted", manual: manual).map { loaded in
      let note = loaded.note
      return UnchartedCard(
        id: note.id, path: loaded.path, title: Projection.title(note),
        excerpt: Projection.excerpt(note),
        horizon: note.frontmatterBool("beyond_gate") ? .beyond : .near,
        seasons: note.seasons)
    }
  }
}
