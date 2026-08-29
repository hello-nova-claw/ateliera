import Foundation

// Pure projection of the Wisdom Garden — a port of `projectWisdomGardenRoom`. Cards
// are notes in the wisdom-garden room, ordered by the shared fallback; themes are the
// union of the configured themes (defaults when none are supplied) and every tag in
// use, each with its card count.
struct WisdomCard: Identifiable, Equatable {
  let id: String  // noteId
  let path: String
  let title: String
  let excerpt: String
  let kind: String  // cardType
  let themes: [String]  // tags
  let source: NoteSource?
}

struct WisdomThemeCount: Identifiable, Equatable {
  let id: String
  let title: String
  let count: Int
}

struct WisdomProjection: Equatable {
  let cards: [WisdomCard]
  let themes: [WisdomThemeCount]

  static func project(
    notes: [Projection.Loaded], themes configured: [WisdomTheme]? = nil, manual: [String] = []
  ) -> WisdomProjection {
    let candidates = notes.filter { $0.note.rooms.contains("wisdom-garden") }
    let ordered = Projection.ordered(candidates, viewKey: "room:wisdom-garden", manual: manual)
    let cards = ordered.map { loaded -> WisdomCard in
      let note = loaded.note
      return WisdomCard(
        id: note.id, path: loaded.path, title: Projection.title(note),
        excerpt: Projection.excerpt(note), kind: note.cardType, themes: note.tags,
        source: note.source)
    }

    // Count tags across cards, then present the default themes + any extra tags in use.
    var counts: [String: Int] = [:]
    for card in cards {
      for theme in card.themes { counts[theme, default: 0] += 1 }
    }
    let base = configured ?? WisdomDomain.defaultThemes
    var known: [(id: String, title: String)] = base.map { ($0.id, $0.title) }
    let knownIds = Set(known.map { $0.id })
    for id in counts.keys where !knownIds.contains(id) {
      known.append((id, WisdomDomain.titleForTheme(id)))
    }
    let themes = known.map { WisdomThemeCount(id: $0.id, title: $0.title, count: counts[$0.id] ?? 0) }
    return WisdomProjection(cards: cards, themes: themes)
  }
}
