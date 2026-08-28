import SwiftUI

// A read-only render of the note body with its wikilinks made tappable. Per the
// P1 plan this uses the reliable approach: the body renders as Markdown with the
// `[[…]]` syntax replaced by labels, and each unique wikilink appears as a tappable
// pill beneath it (an inline overlay is deferred to P4, when the link graph can
// validate every target).
struct BodyPreviewView: View {
  let bodyText: String
  let onWikilinkTap: (String) -> Void
  @Environment(\.studioTheme) private var theme

  private var links: [ParsedWikilink] { WikilinkParser.parse(bodyText) }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(rendered)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(theme.inkStrong)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)

      if !links.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text("LINKS")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
          ForEach(links, id: \.target) { link in
            Button { onWikilinkTap(link.target) } label: {
              Label(link.label, systemImage: "link")
                .font(StudioFont.control).foregroundStyle(theme.link)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("wikilink-\(link.target)")
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // Markdown-rendered body with wikilink syntax swapped for its label text.
  private var rendered: AttributedString {
    let withLabels = Self.replacingWikilinks(bodyText)
    if let markdown = try? AttributedString(
      markdown: withLabels,
      options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
    {
      return markdown
    }
    return AttributedString(withLabels)
  }

  // Replace every `[[Target]]` / `[[Target|Alias]]` with its display label.
  static func replacingWikilinks(_ body: String) -> String {
    guard
      let regex = try? NSRegularExpression(
        pattern: #"\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]"#)
    else { return body }
    let ns = body as NSString
    var result = ""
    var cursor = 0
    for match in regex.matches(in: body, range: NSRange(location: 0, length: ns.length)) {
      result += ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
      let aliasRange = match.range(at: 2)
      let label =
        aliasRange.location != NSNotFound
        ? ns.substring(with: aliasRange) : ns.substring(with: match.range(at: 1))
      result += label.trimmingCharacters(in: .whitespaces)
      cursor = match.range.location + match.range.length
    }
    result += ns.substring(from: cursor)
    return result
  }
}
