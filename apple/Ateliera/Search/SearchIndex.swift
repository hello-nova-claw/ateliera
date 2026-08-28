import Foundation

// Pure, in-memory, rebuildable faceted search index — the P4 core. This is the
// disposable projection: `rebuild(_:)` replaces its contents wholesale, and it is
// never persisted. VaultStore maps NoteSummary → IndexedNote and calls `rebuild`
// on every `reload()`.
//
// Behaviour is golden-matched to @studio/index sqlite-index.ts for the *observable*
// contract (which notes match, the tokeniser, the fold, snippet window + highlight
// ranges, matchReason.field / matchContext, the default `status != trashed`
// filter, and the facet counts). bm25 scores are NOT an interop contract, so
// cross-note ranking uses the documented rule (title-weight, then `updated` desc,
// then `id` asc) rather than reproducing bm25 numerically.

// The doc fed into the index. The orchestrator builds these from NoteSummary +
// full parsed notes (searchText = markdownToPlainText of the body).
struct IndexedNote: Equatable {
  let id: String  // stable note id
  let path: String
  let title: String
  let body: String  // plain-text (searchText); already markdown-stripped
  let cardType: String
  let semanticType: String
  let status: String
  let updated: String
  let rooms: [String]
  let lifeAreas: [String]
  let seasons: [String]
  let tags: [String]
  let sourceText: String  // source title/creator/url joined, for match context
  // The raw Markdown body, used to extract the link graph (wikilinks + markdown
  // links live in the raw source, not the plain-text `body`). Defaults to `body`
  // when a caller doesn't distinguish them.
  let rawBody: String

  init(
    id: String, path: String, title: String, body: String,
    cardType: String, semanticType: String, status: String, updated: String,
    rooms: [String] = [], lifeAreas: [String] = [], seasons: [String] = [],
    tags: [String] = [], sourceText: String = "", rawBody: String? = nil
  ) {
    self.id = id
    self.path = path
    self.title = title
    self.body = body
    self.rawBody = rawBody ?? body
    self.cardType = cardType
    self.semanticType = semanticType
    self.status = status
    self.updated = updated
    self.rooms = rooms
    self.lifeAreas = lifeAreas
    self.seasons = seasons
    self.tags = tags
    self.sourceText = sourceText
  }
}

struct HighlightRange: Equatable {
  let start: Int  // UTF-16 offset into the snippet
  let end: Int
}

enum MatchStrategy: String, Equatable {
  case keyword
  case fuzzyTitle = "fuzzy-title"
  case fuzzyTag = "fuzzy-tag"
}

enum MatchField: String, Equatable {
  case title
  case body
  case tags
  case source
}

struct MatchReason: Equatable {
  let field: MatchField
  let strategy: MatchStrategy
  let text: String
  let distance: Int?
}

struct MatchContext: Equatable {
  let field: MatchField  // .tags or .source
  let text: String
}

struct SearchHit: Identifiable, Equatable {
  let id: String
  let path: String
  let title: String
  let snippet: String
  let highlightRanges: [HighlightRange]
  let semanticType: String
  let cardType: String
  let status: String
  let updated: String
  let matchReason: MatchReason
  let matchContext: MatchContext?
}

// Optional filter sets (empty = no filter for that dimension).
struct SearchFilters: Equatable {
  var rooms: [String]
  var semanticTypes: [String]
  var lifeAreas: [String]
  var seasons: [String]
  var statuses: [String]
  var tags: [String]
  var cardTypes: [String]

  init(
    rooms: [String] = [], semanticTypes: [String] = [], lifeAreas: [String] = [],
    seasons: [String] = [], statuses: [String] = [], tags: [String] = [],
    cardTypes: [String] = []
  ) {
    self.rooms = rooms
    self.semanticTypes = semanticTypes
    self.lifeAreas = lifeAreas
    self.seasons = seasons
    self.statuses = statuses
    self.tags = tags
    self.cardTypes = cardTypes
  }
}

struct FacetValue: Equatable {
  let value: String
  let count: Int
}

struct SearchFacets: Equatable {
  let rooms: [FacetValue]
  let semanticTypes: [FacetValue]
  let lifeAreas: [FacetValue]
  let seasons: [FacetValue]
  let statuses: [FacetValue]
  let tags: [FacetValue]
  let cardTypes: [FacetValue]
}

final class SearchIndex {
  private var docs: [IndexedNote] = []
  private var graph = LinkGraph([(id: String, title: String, body: String)]())

  static let maxResults = 200

  func rebuild(_ notes: [IndexedNote]) {
    docs = notes
    graph = LinkGraph(notes.map { (id: $0.id, path: $0.path, title: $0.title, body: $0.rawBody) })
  }

  // MARK: - Search

  func search(_ query: String, filters: SearchFilters = SearchFilters()) -> [SearchHit] {
    let queryTokens = Self.tokens(query)
    // A non-blank query that tokenises to nothing yields no hits (matches web).
    if !query.trimmingCharacters(in: .whitespaces).isEmpty && queryTokens.isEmpty {
      return []
    }

    let candidates = docs.filter { matchesFilters($0, filters) }
    let matched = candidates.filter { matches($0, queryTokens) }

    let ranked = matched.sorted { left, right in
      let ls = score(left, queryTokens)
      let rs = score(right, queryTokens)
      if ls != rs { return ls > rs }
      if left.updated != right.updated { return left.updated > right.updated }
      return left.id < right.id
    }

    return ranked.prefix(Self.maxResults).map { hit($0, queryTokens) }
  }

  // A note matches iff every token is a prefix of some token in title/body/tags/source.
  private func matches(_ note: IndexedNote, _ queryTokens: [String]) -> Bool {
    guard !queryTokens.isEmpty else { return true }
    let haystack = Self.wordTokens(
      [note.title, note.body, note.tags.joined(separator: " "), note.sourceText]
        .joined(separator: " "))
    return queryTokens.allSatisfy { token in
      haystack.contains { $0.hasPrefix(token) }
    }
  }

  private func score(_ note: IndexedNote, _ queryTokens: [String]) -> Int {
    let titleTokens = Self.wordTokens(note.title)
    let bodyTokens = Self.wordTokens(note.body)
    var total = 0
    for token in queryTokens {
      if titleTokens.contains(where: { $0.hasPrefix(token) }) { total += 3 }
      if bodyTokens.contains(where: { $0.hasPrefix(token) }) { total += 1 }
    }
    return total
  }

  private func matchesFilters(_ note: IndexedNote, _ filters: SearchFilters) -> Bool {
    if !filters.rooms.isEmpty && Set(note.rooms).isDisjoint(with: filters.rooms) { return false }
    if !filters.semanticTypes.isEmpty && !filters.semanticTypes.contains(note.semanticType) { return false }
    if !filters.lifeAreas.isEmpty && Set(note.lifeAreas).isDisjoint(with: filters.lifeAreas) { return false }
    if !filters.seasons.isEmpty && Set(note.seasons).isDisjoint(with: filters.seasons) { return false }
    if !filters.cardTypes.isEmpty && !filters.cardTypes.contains(note.cardType) { return false }
    if filters.tags.isEmpty {
      // no tag filter
    } else if Set(note.tags).isDisjoint(with: filters.tags) {
      return false
    }
    // Status: explicit filter, else default excludes trashed.
    if filters.statuses.isEmpty {
      if note.status == "trashed" { return false }
    } else if !filters.statuses.contains(note.status) {
      return false
    }
    return true
  }

  // MARK: - Hit / snippet / match reason

  private func hit(_ note: IndexedNote, _ queryTokens: [String]) -> SearchHit {
    let (snippet, highlightRanges) = Self.makeSnippet(title: note.title, body: note.body, queryTokens: queryTokens)

    let context: MatchContext?
    if highlightRanges.isEmpty {
      if note.tags.contains(where: { tag in queryTokens.contains { Self.foldForMatch(tag).contains($0) } }) {
        context = MatchContext(field: .tags, text: note.tags.joined(separator: ", "))
      } else if queryTokens.contains(where: { Self.foldForMatch(note.sourceText).contains($0) }) {
        context = MatchContext(field: .source, text: note.sourceText)
      } else {
        context = nil
      }
    } else {
      context = nil
    }

    let field: MatchField
    if let context {
      field = context.field
    } else if queryTokens.contains(where: { Self.foldForMatch(note.title).contains($0) }) {
      field = .title
    } else {
      field = .body
    }

    return SearchHit(
      id: note.id, path: note.path, title: note.title,
      snippet: snippet, highlightRanges: highlightRanges,
      semanticType: note.semanticType, cardType: note.cardType,
      status: note.status, updated: note.updated,
      matchReason: MatchReason(field: field, strategy: .keyword, text: queryTokens.joined(separator: " "), distance: nil),
      matchContext: context)
  }

  // MARK: - Facets

  func facets(_ query: String, filters: SearchFilters = SearchFilters()) -> SearchFacets {
    let queryTokens = Self.tokens(query)
    if !query.trimmingCharacters(in: .whitespaces).isEmpty && queryTokens.isEmpty {
      return SearchFacets(
        rooms: Self.withSelected([:], filters.rooms),
        semanticTypes: Self.withSelected([:], filters.semanticTypes),
        lifeAreas: Self.withSelected([:], filters.lifeAreas),
        seasons: Self.withSelected([:], filters.seasons),
        statuses: Self.withSelected([:], filters.statuses),
        tags: Self.withSelected([:], filters.tags),
        cardTypes: Self.withSelected([:], filters.cardTypes))
    }

    func facet(_ selected: [String], _ removing: (inout SearchFilters) -> Void, _ values: (IndexedNote) -> [String]) -> [FacetValue] {
      var scoped = filters
      removing(&scoped)
      let matching = docs.filter { matchesFilters($0, scoped) && matches($0, queryTokens) }
      var counts: [String: Int] = [:]
      for note in matching {
        // Unique per note (dictionary values already de-duped in construction).
        for value in Set(values(note)) { counts[value, default: 0] += 1 }
      }
      return Self.withSelected(counts, selected)
    }

    return SearchFacets(
      rooms: facet(filters.rooms, { $0.rooms = [] }, { $0.rooms }),
      semanticTypes: facet(filters.semanticTypes, { $0.semanticTypes = [] }, { [$0.semanticType] }),
      lifeAreas: facet(filters.lifeAreas, { $0.lifeAreas = [] }, { $0.lifeAreas }),
      seasons: facet(filters.seasons, { $0.seasons = [] }, { $0.seasons }),
      statuses: facet(filters.statuses, { $0.statuses = [] }, { [$0.status] }),
      tags: facet(filters.tags, { $0.tags = [] }, { $0.tags }),
      cardTypes: facet(filters.cardTypes, { $0.cardTypes = [] }, { [$0.cardType] }))
  }

  // Inject selected values with count 0 when absent, sort count desc, value asc.
  private static func withSelected(_ counts: [String: Int], _ selected: [String]) -> [FacetValue] {
    var merged = counts
    for value in selected where merged[value] == nil { merged[value] = 0 }
    return merged
      .map { FacetValue(value: $0.key, count: $0.value) }
      .sorted { left, right in
        if left.count != right.count { return left.count > right.count }
        return left.value < right.value
      }
  }

  // MARK: - Link graph passthrough

  func backlinks(_ id: String) -> [Backlink] { graph.backlinks(of: id) }
  func forwardLinks(_ id: String) -> [ForwardLink] { graph.forwardLinks(of: id) }

  // MARK: - Tokeniser + fold (ports sqlite-index.ts `tokens` / `foldForMatch`)

  // query.match(/[\p{L}\p{N}_-]+/gu), fold each, drop empties, unique (order kept).
  static func tokens(_ query: String) -> [String] {
    var out: [String] = []
    var seen = Set<String>()
    for word in wordSplit(query) {
      let folded = foldForMatch(word)
      guard !folded.isEmpty, !seen.contains(folded) else { continue }
      seen.insert(folded)
      out.append(folded)
    }
    return out
  }

  // The folded word tokens of a source string (not de-duped, order preserved).
  static func wordTokens(_ value: String) -> [String] {
    wordSplit(value).map(foldForMatch).filter { !$0.isEmpty }
  }

  // Split on runs of letters/numbers/`_`/`-` (the `[\p{L}\p{N}_-]+` class).
  private static func wordSplit(_ value: String) -> [String] {
    var words: [String] = []
    var current = ""
    for scalar in value.unicodeScalars {
      if isWordScalar(scalar) {
        current.unicodeScalars.append(scalar)
      } else if !current.isEmpty {
        words.append(current)
        current = ""
      }
    }
    if !current.isEmpty { words.append(current) }
    return words
  }

  private static func isWordScalar(_ scalar: Unicode.Scalar) -> Bool {
    if scalar == "_" || scalar == "-" { return true }
    return scalar.properties.isAlphabetic
      || scalar.properties.numericType != nil
      || CharacterSet.decimalDigits.contains(scalar)
  }

  // NFD, lowercase (en), strip combining marks (\p{M}).
  static func foldForMatch(_ value: String) -> String {
    let decomposed = value.decomposedStringWithCanonicalMapping.lowercased()
    var out = String.UnicodeScalarView()
    for scalar in decomposed.unicodeScalars where !scalar.properties.isDiacritic && !isCombiningMark(scalar) {
      out.append(scalar)
    }
    return String(out)
  }

  private static func isCombiningMark(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .nonspacingMark, .spacingMark, .enclosingMark:
      return true
    default:
      return false
    }
  }

  // MARK: - Snippet + highlight ranges (ports makeSnippet / rangesFor / mappedFold)

  static func makeSnippet(title: String, body: String, queryTokens: [String]) -> (String, [HighlightRange]) {
    let source = collapseWhitespace("\(title). \(body)")
    let first = rangesFor(source, queryTokens).first?.start ?? 0
    let sourceUTF16 = Array(source.utf16)
    let start = max(0, first - 60)
    let end = min(sourceUTF16.count, start + 180)
    let prefix = start > 0 ? "…" : ""
    let suffix = end < sourceUTF16.count ? "…" : ""
    let sliceUTF16 = Array(sourceUTF16[start..<end])
    let sliceString = String(utf16CodeUnits: sliceUTF16, count: sliceUTF16.count)
    let snippet = "\(prefix)\(sliceString)\(suffix)"
    let highlights = rangesFor(snippet, queryTokens)
    return (snippet, highlights)
  }

  private static func collapseWhitespace(_ value: String) -> String {
    let collapsed = value.replacingOccurrences(
      of: "\\s+", with: " ", options: .regularExpression)
    return collapsed.trimmingCharacters(in: .whitespaces)
  }

  // Fold-mapped highlight ranges, offsets in UTF-16 into `source`, sorted start,end.
  static func rangesFor(_ source: String, _ queryTokens: [String]) -> [HighlightRange] {
    let mapping = mappedFold(source)
    let folded = mapping.folded
    var ranges: [HighlightRange] = []
    for token in queryTokens where !token.isEmpty {
      var cursor = folded.startIndex
      while cursor < folded.endIndex {
        guard let match = folded.range(of: token, range: cursor..<folded.endIndex) else { break }
        let matchStart = folded.distance(from: folded.startIndex, to: match.lowerBound)
        let tokenLen = token.count
        if matchStart < mapping.starts.count && matchStart + tokenLen - 1 < mapping.ends.count {
          let start = mapping.starts[matchStart]
          let end = mapping.ends[matchStart + tokenLen - 1]
          // Confirm the mapped source slice folds back to the token.
          let sourceUTF16 = Array(source.utf16)
          if start <= end && end <= sourceUTF16.count {
            let sub = Array(sourceUTF16[start..<end])
            let subString = String(utf16CodeUnits: sub, count: sub.count)
            if foldForMatch(subString) == token {
              ranges.append(HighlightRange(start: start, end: end))
            }
          }
        }
        // Advance by max(token.count, 1) folded characters.
        let advance = max(tokenLen, 1)
        cursor = folded.index(match.lowerBound, offsetBy: advance, limitedBy: folded.endIndex) ?? folded.endIndex
      }
    }
    return ranges.sorted { left, right in
      if left.start != right.start { return left.start < right.start }
      return left.end < right.end
    }
  }

  // Per-folded-character start/end UTF-16 offsets into `source` (grapheme-based).
  static func mappedFold(_ value: String) -> (folded: String, starts: [Int], ends: [Int]) {
    var folded = ""
    var starts: [Int] = []
    var ends: [Int] = []
    var index = 0  // UTF-16 offset into value
    for cluster in value {
      let clusterUTF16 = String(cluster).utf16.count
      let foldedSegment = foldForMatch(String(cluster))
      folded += foldedSegment
      for _ in 0..<foldedSegment.count {
        starts.append(index)
        ends.append(index + clusterUTF16)
      }
      index += clusterUTF16
    }
    return (folded, starts, ends)
  }
}
