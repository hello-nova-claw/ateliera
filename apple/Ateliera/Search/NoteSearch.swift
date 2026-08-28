import Foundation

// A small, offline, native search over the vault's notes. Unlike the note format
// or the rhythm math, search results are not an interop contract (the web app's
// index is a disposable projection), so this is a straightforward native ranker
// rather than a port: match every query token somewhere, weight title hits above
// body hits, order by score. Pure and deterministic — the UI and VaultStore feed
// it plain docs.
struct SearchDoc: Equatable {
  let id: String
  let title: String
  let body: String
}

enum NoteSearch {
  private static let titleWeight = 3
  private static let bodyWeight = 1

  /// Notes matching all query tokens, best first. Empty/whitespace query → no
  /// results. A note matches only when every token appears in its title or body;
  /// score sums a higher weight for title hits, ties broken by title A→Z.
  static func rank(_ docs: [SearchDoc], query: String) -> [SearchDoc] {
    let tokens = query.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard !tokens.isEmpty else { return [] }

    var scored: [(doc: SearchDoc, score: Int)] = []
    for doc in docs {
      let title = doc.title.lowercased()
      let body = doc.body.lowercased()
      var score = 0
      var matchedAll = true
      for token in tokens {
        let inTitle = title.contains(token)
        let inBody = body.contains(token)
        if !inTitle && !inBody {
          matchedAll = false
          break
        }
        score += (inTitle ? titleWeight : 0) + (inBody ? bodyWeight : 0)
      }
      if matchedAll { scored.append((doc, score)) }
    }
    return
      scored
      .sorted {
        $0.score != $1.score
          ? $0.score > $1.score : $0.doc.title.lowercased() < $1.doc.title.lowercased()
      }
      .map(\.doc)
  }
}
