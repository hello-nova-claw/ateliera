import Foundation

struct ParsedWikilink: Equatable {
  let target: String  // trimmed raw target
  let label: String  // display label (= target when no alias)
  let range: Range<String.Index>  // the [[...]] span in the source body
}

// Extracts `[[Target]]` / `[[Target|Alias]]` wikilinks from a note body,
// matching @studio/content/src/links.ts: the same regex, code spans + fenced
// blocks skipped, empty targets dropped, and de-duplicated by lower-cased target
// (first occurrence wins), preserving source order.
enum WikilinkParser {
  // Same as WIKI_LINK in links.ts.
  private static let regex = try? NSRegularExpression(
    pattern: #"\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]"#)

  static func parse(_ body: String) -> [ParsedWikilink] {
    // Same length and layout as body, with code regions blanked.
    let masked = LinkExtractor.maskCode(body)
    guard let regex else { return [] }
    let ns = masked as NSString
    var results: [ParsedWikilink] = []
    var seen = Set<String>()
    for match in regex.matches(in: masked, range: NSRange(location: 0, length: ns.length)) {
      let target = ns.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespaces)
      guard !target.isEmpty else { continue }
      let key = target.lowercased()
      guard !seen.contains(key) else { continue }
      seen.insert(key)
      let aliasRange = match.range(at: 2)
      let alias =
        aliasRange.location != NSNotFound
        ? ns.substring(with: aliasRange).trimmingCharacters(in: .whitespaces) : ""
      guard let range = Range(match.range, in: body) else { continue }
      results.append(
        ParsedWikilink(target: target, label: alias.isEmpty ? target : alias, range: range))
    }
    return results
  }
}
