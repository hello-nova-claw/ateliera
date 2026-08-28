import Foundation

// Editable links with source offsets, for the repair panel. This is the native
// counterpart of `link-edit.ts` `editableMarkdownLinks` + `rewriteMarkdownLink`,
// scoped to WIKI links (`[[target]]` / `[[target|label]]`) — the form Ateliera's own
// UI writes and the one the repair gate exercises. Markdown/reference-link repair
// (which needs a full mdast with offsets) is a documented follow-up; the link graph
// and backlinks already cover those forms for display.
//
// Offsets are UTF-16 (matching JS string indices) so a rewrite can splice by the
// same boundaries the web uses.

struct EditableLink: Equatable {
  let index: Int  // occurrence position, the repair "occurrence" handle
  let kind: LinkKind
  let target: String
  let label: String
  let start: Int  // UTF-16 offset into the body
  let end: Int
}

enum LinkEdit: Equatable {
  case remove
  case relink(kind: LinkKind, target: String)
}

enum LinkEditError: Error, Equatable {
  case invalidOccurrence
  case unsafeTarget
}

enum LinkEditor {
  private static let unsafeIdPattern = try? NSRegularExpression(
    pattern: "[\\x{0000}-\\x{001f}\\x{007f}-\\x{009f}/\\\\?#]")

  /// Wiki links in source order (code spans/fences skipped), each with its UTF-16
  /// start/end offsets and occurrence index. Mirrors `wikiLinks` in link-edit.ts.
  static func editableLinks(_ body: String) -> [EditableLink] {
    let masked = LinkExtractor.maskCode(body) as NSString
    let original = body as NSString
    let bracket: unichar = 0x5B  // "["
    let length = masked.length
    var found: [(kind: LinkKind, target: String, label: String, start: Int, end: Int)] = []
    var i = 0
    while i < length {
      guard masked.character(at: i) == bracket, i + 1 < length,
        masked.character(at: i + 1) == bracket
      else {
        i += 1
        continue
      }
      let searchStart = i + 2
      let closing = masked.range(
        of: "]]", options: [], range: NSRange(location: searchStart, length: length - searchStart))
      guard closing.location != NSNotFound else { break }
      let inside = original.substring(
        with: NSRange(location: searchStart, length: closing.location - searchStart))
      let (target, label) = wikiParts(inside)
      if !target.isEmpty {
        found.append((.wiki, target, label, i, closing.location + 2))
      }
      i = closing.location + 2
    }
    return found.sorted { $0.start < $1.start }.enumerated().map { index, link in
      EditableLink(
        index: index, kind: link.kind, target: link.target, label: link.label,
        start: link.start, end: link.end)
    }
  }

  private static func wikiParts(_ inside: String) -> (target: String, label: String) {
    if let bar = inside.firstIndex(of: "|") {
      let target = String(inside[inside.startIndex..<bar]).trimmingCharacters(in: .whitespaces)
      let rawLabel = String(inside[inside.index(after: bar)...]).trimmingCharacters(in: .whitespaces)
      return (target, rawLabel.isEmpty ? target : rawLabel)
    }
    let target = inside.trimmingCharacters(in: .whitespaces)
    return (target, target)
  }

  /// Rewrite the `occurrence`-th editable link — relink it (wiki/path/id) or remove
  /// it (unwrap to its label). Byte-for-byte parity with `rewriteMarkdownLink`.
  static func rewrite(_ body: String, occurrence: Int, _ edit: LinkEdit) throws -> String {
    guard occurrence >= 0 else { throw LinkEditError.invalidOccurrence }
    let links = editableLinks(body)
    guard occurrence < links.count else { throw LinkEditError.invalidOccurrence }
    let link = links[occurrence]
    let replacement = try replacement(for: link, edit)
    let ns = body as NSString
    return ns.substring(to: link.start) + replacement + ns.substring(from: link.end)
  }

  private static func replacement(for link: EditableLink, _ edit: LinkEdit) throws -> String {
    switch edit {
    case .remove:
      return link.label
    case .relink(.wiki, let rawTarget):
      let target = rawTarget.trimmingCharacters(in: .whitespaces)
      guard !target.isEmpty, !target.contains("]]"), !target.contains("\n"),
        !target.contains("\r")
      else { throw LinkEditError.unsafeTarget }
      return link.label == target ? "[[\(target)]]" : "[[\(target)|\(link.label)]]"
    case .relink(.id, let rawTarget):
      let id = try safeId(rawTarget)
      return "[\(escapedLabel(link.label))](studio://note/\(encodeURIComponent(id)))"
    case .relink(.path, let rawTarget):
      let path = try safePath(rawTarget)
      return "[\(escapedLabel(link.label))](\(path))"
    }
  }

  // MARK: - Safety guards (ported from link-edit.ts)

  private static func safeId(_ target: String) throws -> String {
    let unsafe =
      target.isEmpty || target.count > 128
      || target != target.trimmingCharacters(in: .whitespaces)
      || target != target.precomposedStringWithCanonicalMapping
      || matchesUnsafeId(target)
    if unsafe { throw LinkEditError.unsafeTarget }
    return target
  }

  private static func matchesUnsafeId(_ value: String) -> Bool {
    guard let regex = unsafeIdPattern else { return true }
    let range = NSRange(value.startIndex..., in: value)
    return regex.firstMatch(in: value, range: range) != nil
  }

  private static func safePath(_ target: String) throws -> String {
    let invalid =
      target.isEmpty || target.count > 1024
      || target != target.trimmingCharacters(in: .whitespaces)
      || target.hasPrefix("/") || target.contains("\\") || target.contains("\0")
      || target.contains(">") || isWindowsDrive(target)
      || !target.lowercased().hasSuffix(".md")
    if invalid { throw LinkEditError.unsafeTarget }
    var depth = 0
    for segment in target.split(separator: "/", omittingEmptySubsequences: false) {
      if segment.isEmpty || segment == "." { continue }
      if segment == ".." {
        if depth == 0 { throw LinkEditError.unsafeTarget }
        depth -= 1
      } else {
        depth += 1
      }
    }
    return target
  }

  private static func isWindowsDrive(_ value: String) -> Bool {
    guard value.count >= 2 else { return false }
    let chars = Array(value)
    return chars[0].isLetter && chars[1] == ":"
  }

  private static func escapedLabel(_ label: String) -> String {
    label.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "]", with: "\\]")
  }

  // JS encodeURIComponent: unreserved set A-Za-z0-9 and -_.!~*'()
  private static func encodeURIComponent(_ value: String) -> String {
    var allowed = CharacterSet(charactersIn: "-_.!~*'()")
    allowed.formUnion(.alphanumerics)
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
  }
}
