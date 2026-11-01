import Foundation

// Pure, rebuildable link graph for the native vault — the P4 core.
//
// `extractLinks` ports @studio/content/src/links.ts `extractLinks`: wiki links
// (reusing the existing WikilinkParser), Markdown `[label](url)` links,
// `studio://note/<id>` stable links, and relative `*.md` paths. It de-dups by
// `kind:target.lowercased()` preserving first-seen order, and (like links.ts)
// skips code spans / fenced blocks. Golden-matched to links.ts, not to mdast.
//
// `LinkGraph` builds `byId` / `byTitle` (NFC + lowercased) / `byPath` (normalised)
// over a set of notes and resolves the four link cases from the web's authoritative
// resolver (search-service.ts `createResolver` / sqlite-index.ts `resolveLinks`):
// id → exactly one note; wiki → match by title (1 resolved, >1 ambiguous, 0 broken);
// path → resolve against the source note's folder (broken if it escapes root).

enum LinkKind: String, Equatable {
  case wiki
  case path
  case id
}

struct ParsedLink: Equatable {
  let kind: LinkKind
  let target: String
  let label: String
}

// Resolution outcome for a forward link, mirroring the web's resolved/broken/ambiguous.
enum LinkState: Equatable {
  case resolved(String)  // resolved note id
  case broken
  case ambiguous([String])  // >1 candidate ids
}

struct ForwardLink: Equatable {
  let link: ParsedLink
  let state: LinkState
}

struct Backlink: Equatable {
  let id: String
  let path: String
  let title: String
}

enum LinkExtractor {
  // Markdown inline/reference link scanner + wiki links, de-duped like links.ts.
  static func extractLinks(from body: String) -> [ParsedLink] {
    var located: [ParsedLink] = []

    // Wiki links first, in source order (WikilinkParser already skips code + dedups
    // by target, but the global dedup below is by kind:target so re-including is safe).
    for wiki in WikilinkParser.parse(body) {
      located.append(ParsedLink(kind: .wiki, target: wiki.target, label: wiki.label))
    }

    // Markdown links from the code-masked body so links inside code are ignored.
    for md in locatedMarkdownLinks(from: body) {
      located.append(md.link)
    }

    // De-dup by kind:target.lowercased(), first-seen order preserved.
    var seen = Set<String>()
    var output: [ParsedLink] = []
    for link in located {
      let key = "\(link.kind.rawValue):\(link.target.lowercased())"
      if seen.contains(key) { continue }
      seen.insert(key)
      output.append(link)
    }
    return output
  }

  // Classify a Markdown link URL like links.ts `markdownTarget`: studio note id,
  // else drop absolute/scheme/`//`, else require a `.md` path.
  private static func classify(_ url: String) -> (kind: LinkKind, target: String)? {
    let cleaned = cleanTarget(url)
    if let id = studioNoteId(cleaned) {
      return (.id, id)
    }
    if hasScheme(cleaned) || cleaned.hasPrefix("//") {
      return nil
    }
    guard cleaned.lowercased().hasSuffix(".md") else { return nil }
    return (.path, cleaned)
  }

  private static func studioNoteId(_ value: String) -> String? {
    let lower = value.lowercased()
    let prefix = "studio://note/"
    guard lower.hasPrefix(prefix) else { return nil }
    let id = String(value.dropFirst(prefix.count))
    // Must be a single path segment with no query/fragment.
    guard !id.isEmpty, !id.contains("/"), !id.contains("?"), !id.contains("#") else {
      return nil
    }
    return id
  }

  private static func hasScheme(_ value: String) -> Bool {
    // /^[a-z][a-z\d+.-]*:/i — a scheme like https:, mailto:, studio: (already handled).
    guard let colon = value.firstIndex(of: ":") else { return false }
    let scheme = value[value.startIndex..<colon]
    guard let first = scheme.first, first.isLetter else { return false }
    for ch in scheme {
      let ok = ch.isLetter || ch.isNumber || ch == "+" || ch == "." || ch == "-"
      if !ok { return false }
    }
    return !scheme.isEmpty
  }

  // Strip `#fragment` then percent-decode + trim, matching links.ts `cleanTarget`.
  private static func cleanTarget(_ target: String) -> String {
    let withoutFragment =
      target.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(
        String.init) ?? target
    let decoded = withoutFragment.removingPercentEncoding ?? withoutFragment
    return decoded.trimmingCharacters(in: .whitespaces)
  }

  // ---- Markdown link + reference scanning (mask-based, no mdast) ----

  // A markdown/reference/shortcut link with the UTF-16 span of its whole source node
  // (from the opening `[` to just past the closing `)`/`]`), so the repair editor can
  // splice a replacement by the same boundaries the web's mdast offsets give.
  struct LocatedLink: Equatable {
    let link: ParsedLink
    let start: Int  // UTF-16 offset into the body
    let end: Int
  }

  // Inline links `[label](url)` (supporting <...> destinations) and reference
  // links `[label][id]` / `[id][]` / `[id]` resolved through definitions, each with
  // its UTF-16 source span. Scans the code-masked body (offsets stay aligned to the
  // original), so links inside code are ignored.
  static func locatedMarkdownLinks(from body: String) -> [LocatedLink] {
    let masked = maskCode(body)
    let definitions = referenceDefinitions(in: masked)
    let scalars = Array(masked)
    let u16 = utf16Offsets(scalars)

    var out: [LocatedLink] = []
    func emit(
      _ kind: LinkKind, _ target: String, _ label: String, from openChar: Int, toChar closeChar: Int
    ) {
      out.append(
        LocatedLink(
          link: ParsedLink(kind: kind, target: target, label: normalizeLabel(label)),
          start: u16[openChar], end: u16[closeChar + 1]))
    }

    var i = 0
    while i < scalars.count {
      guard let close = linkClose(scalars, at: i) else {
        i += skipWidth(scalars, at: i)
        continue
      }
      let label = String(scalars[(i + 1)..<close])
      let next = close + 1
      if next < scalars.count && scalars[next] == "(" {
        // Inline link — read destination up to the matching ")".
        if let (url, end) = readInlineDestination(scalars, open: next) {
          if let c = classify(url) { emit(c.kind, c.target, label, from: i, toChar: end) }
          i = end + 1
          continue
        }
      } else if next < scalars.count && scalars[next] == "[" {
        // Full or collapsed reference `[label][id]` / `[label][]`.
        if let refClose = matchBracket(scalars, open: next) {
          let refId = String(scalars[(next + 1)..<refClose])
          let key = refId.isEmpty ? label : refId
          if let url = definitions[referenceKey(key)], let c = classify(url) {
            emit(c.kind, c.target, label, from: i, toChar: refClose)
          }
          i = refClose + 1
          continue
        }
      } else if !(next < scalars.count && scalars[next] == ":") {
        // Shortcut reference `[id]` — but not a `[id]:` definition line.
        if let url = definitions[referenceKey(label)], let c = classify(url) {
          emit(c.kind, c.target, label, from: i, toChar: close)
        }
      }
      i = close + 1
    }
    return out
  }

  // The `]` that closes a markdown link's `[` at `index`, or nil when there's no link
  // there: another character, an unclosed bracket, or a wiki `[[`.
  private static func linkClose(_ scalars: [Character], at index: Int) -> Int? {
    guard scalars[index] == "[", !isWikiOpening(scalars, at: index) else { return nil }
    return matchBracket(scalars, open: index)
  }

  // Prefix sum of UTF-16 lengths, so a character index maps to a UTF-16 offset.
  private static func utf16Offsets(_ scalars: [Character]) -> [Int] {
    var offsets = [Int](repeating: 0, count: scalars.count + 1)
    for (index, character) in scalars.enumerated() {
      offsets[index + 1] = offsets[index] + character.utf16.count
    }
    return offsets
  }

  // How far to step past a `[` that isn't a link: both brackets of a wiki `[[`.
  private static func skipWidth(_ scalars: [Character], at index: Int) -> Int {
    isWikiOpening(scalars, at: index) ? 2 : 1
  }

  private static func isWikiOpening(_ scalars: [Character], at index: Int) -> Bool {
    scalars[index] == "[" && index + 1 < scalars.count && scalars[index + 1] == "["
  }

  // `[id]: url` definitions (line-leading), first normalised key wins.
  private static func referenceDefinitions(in masked: String) -> [String: String] {
    var defs: [String: String] = [:]
    for rawLine in masked.split(separator: "\n", omittingEmptySubsequences: false) {
      var line = String(rawLine)
      // Definitions may be inside blockquotes / list items; strip leading markers.
      line = stripLeadingMarkers(line)
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      guard trimmed.hasPrefix("[") else { continue }
      guard let closeIdx = trimmed.dropFirst().firstIndex(of: "]") else { continue }
      let afterClose = trimmed.index(after: closeIdx)
      guard afterClose < trimmed.endIndex, trimmed[afterClose] == ":" else { continue }
      let idStart = trimmed.index(after: trimmed.startIndex)
      let identifier = String(trimmed[idStart..<closeIdx])
      guard !identifier.isEmpty else { continue }
      var url = String(trimmed[trimmed.index(after: afterClose)...]).trimmingCharacters(
        in: .whitespaces)
      if url.hasPrefix("<") && url.hasSuffix(">") && url.count >= 2 {
        url = String(url.dropFirst().dropLast())
      } else {
        // Definition URL ends at first whitespace (title portion ignored).
        url = String(url.split(whereSeparator: { $0 == " " || $0 == "\t" }).first ?? "")
      }
      guard !url.isEmpty else { continue }
      let key = referenceKey(identifier)
      if defs[key] == nil { defs[key] = url }
    }
    return defs
  }

  private static func stripLeadingMarkers(_ line: String) -> String {
    var s = Substring(line)
    while let first = s.first,
      first == ">" || first == " " || first == "\t" || first == "-" || first == "*" || first == "+"
    {
      s = s.dropFirst()
    }
    return String(s)
  }

  // Read an inline destination starting at "(" — supports `<...>` and bare, with
  // balanced parentheses in bare form. Returns the url and the index of ")".
  private static func readInlineDestination(
    _ scalars: [Character], open: Int
  ) -> (String, Int)? {
    var j = open + 1
    // Skip leading whitespace.
    while j < scalars.count && (scalars[j] == " " || scalars[j] == "\t") { j += 1 }
    if j < scalars.count && scalars[j] == "<" {
      var k = j + 1
      var url = ""
      while k < scalars.count && scalars[k] != ">" && scalars[k] != "\n" {
        url.append(scalars[k])
        k += 1
      }
      guard k < scalars.count && scalars[k] == ">" else { return nil }
      // Find the closing ")".
      var m = k + 1
      while m < scalars.count && scalars[m] != ")" { m += 1 }
      guard m < scalars.count else { return nil }
      return (url, m)
    }
    var depth = 1
    var url = ""
    var k = j
    while k < scalars.count {
      let ch = scalars[k]
      if ch == "(" {
        depth += 1
      } else if ch == ")" {
        depth -= 1
        if depth == 0 { break }
      } else if ch == " " || ch == "\t" || ch == "\n" {
        // Whitespace ends the destination (title follows); find the ")".
        var m = k
        while m < scalars.count && scalars[m] != ")" { m += 1 }
        guard m < scalars.count else { return nil }
        return (url.trimmingCharacters(in: .whitespaces), m)
      }
      url.append(ch)
      k += 1
    }
    guard k < scalars.count && scalars[k] == ")" else { return nil }
    return (url.trimmingCharacters(in: .whitespaces), k)
  }

  // Match a `[` at `open` to its `]`, honouring nested brackets.
  private static func matchBracket(_ scalars: [Character], open: Int) -> Int? {
    var depth = 0
    var i = open
    while i < scalars.count {
      let ch = scalars[i]
      if ch == "\n" { return nil }
      if ch == "[" {
        depth += 1
      } else if ch == "]" {
        depth -= 1
        if depth == 0 { return i }
      }
      i += 1
    }
    return nil
  }

  private static func normalizeLabel(_ label: String) -> String {
    label.trimmingCharacters(in: .whitespaces)
  }

  private static func referenceKey(_ identifier: String) -> String {
    identifier.precomposedStringWithCanonicalMapping.lowercased()
  }

  // Fenced code blocks, then inline code spans.
  private static let codeRegexes: [NSRegularExpression] = [#"```[\s\S]*?```"#, "`[^`\\n]*`"]
    .compactMap { try? NSRegularExpression(pattern: $0) }

  // Blank fenced code blocks and inline code spans with equal-length spaces (UTF-16
  // length preserved, so offsets are stable), so links inside code don't match
  // (mirrors links.ts skipping code nodes). Shared by the link graph, the link editor
  // and the wikilink parser.
  static func maskCode(_ body: String) -> String {
    let masked = NSMutableString(string: body)
    let length = (body as NSString).length
    for regex in codeRegexes {
      for match in regex.matches(in: body, range: NSRange(location: 0, length: length)) {
        masked.replaceCharacters(
          in: match.range, with: String(repeating: " ", count: match.range.length))
      }
    }
    return masked as String
  }
}

// A note as fed into the graph: id, path, title, body are enough to resolve links.
struct LinkGraph {
  private let notes: [(id: String, path: String, title: String, body: String)]
  private let byId: [String: [String]]
  private let byTitle: [String: [String]]
  private let byPath: [String: String]
  private let pathById: [String: String]
  private let titleById: [String: String]
  private let linksById: [String: [ParsedLink]]

  init(_ notes: [(id: String, title: String, body: String)]) {
    self.init(notes.map { (id: $0.id, path: "\($0.id).md", title: $0.title, body: $0.body) })
  }

  init(_ notes: [(id: String, path: String, title: String, body: String)]) {
    self.notes = notes

    var byId: [String: [String]] = [:]
    var byTitle: [String: [String]] = [:]
    var byPath: [String: String] = [:]
    var pathById: [String: String] = [:]
    var titleById: [String: String] = [:]
    var linksById: [String: [ParsedLink]] = [:]

    for note in notes {
      byId[note.id, default: []].append(note.id)
      pathById[note.id] = note.path
      titleById[note.id] = note.title
      if !note.title.isEmpty {
        byTitle[Self.titleKey(note.title), default: []].append(note.id)
      }
      if let normalized = Self.normalizePath(note.path) {
        // First path wins for a normalised key (matches Map insertion semantics).
        if byPath[normalized] == nil { byPath[normalized] = note.id }
      }
      linksById[note.id] = LinkExtractor.extractLinks(from: note.body)
    }

    self.byId = byId
    self.byTitle = byTitle
    self.byPath = byPath
    self.pathById = pathById
    self.titleById = titleById
    self.linksById = linksById
  }

  // Forward links of a note, each tagged with its resolution state.
  func forwardLinks(of noteId: String) -> [ForwardLink] {
    let path = pathById[noteId] ?? "\(noteId).md"
    return (linksById[noteId] ?? []).map { link in
      ForwardLink(link: link, state: resolve(sourcePath: path, link))
    }
  }

  // Notes (excluding self) with ≥1 link resolving to this id, sorted title then id.
  func backlinks(of noteId: String) -> [Backlink] {
    var result: [Backlink] = []
    for note in notes where note.id != noteId {
      let links = linksById[note.id] ?? []
      let resolvesToTarget = links.contains { link in
        if case .resolved(let id) = resolve(sourcePath: note.path, link) {
          return id == noteId
        }
        return false
      }
      if resolvesToTarget {
        result.append(
          Backlink(
            id: note.id, path: note.path, title: note.title.isEmpty ? "Untitled" : note.title))
      }
    }
    return result.sorted { left, right in
      if left.title != right.title { return left.title < right.title }
      return left.id < right.id
    }
  }

  func resolve(sourcePath: String, _ link: ParsedLink) -> LinkState {
    switch link.kind {
    case .id:
      let candidates = byId[link.target] ?? []
      if candidates.count == 1 { return .resolved(candidates[0]) }
      if candidates.count > 1 { return .ambiguous(candidates) }
      return .broken
    case .wiki:
      let candidates = byTitle[Self.titleKey(link.target)] ?? []
      if candidates.count == 1 { return .resolved(candidates[0]) }
      if candidates.count > 1 { return .ambiguous(candidates) }
      return .broken
    case .path:
      guard let normalized = Self.normalizeLinkPath(sourcePath, link.target),
        let id = byPath[normalized]
      else { return .broken }
      return .resolved(id)
    }
  }

  // MARK: - Path + title normalisation (ports sqlite-index.ts helpers)

  static func titleKey(_ title: String) -> String {
    title.precomposedStringWithCanonicalMapping.lowercased()
  }

  static func normalizePath(_ path: String) -> String? {
    var output: [String] = []
    for segment in path.split(separator: "/", omittingEmptySubsequences: false) {
      let seg = String(segment)
      if seg.isEmpty || seg == "." { continue }
      if seg == ".." {
        if output.isEmpty { return nil }
        output.removeLast()
      } else {
        output.append(seg.precomposedStringWithCanonicalMapping)
      }
    }
    return output.joined(separator: "/")
  }

  static func normalizeLinkPath(_ sourcePath: String, _ target: String) -> String? {
    if target.hasPrefix("/") { return nil }
    let parent = sourcePath.split(separator: "/", omittingEmptySubsequences: false)
      .dropLast().joined(separator: "/")
    return normalizePath("\(parent)/\(target)")
  }
}
