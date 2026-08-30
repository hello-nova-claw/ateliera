import SwiftUI

// A read-only render of the note body with its wikilinks tappable *inline*, right where
// they appear in the text. The body renders as Markdown; each `[[Target]]` / `[[Target|
// Alias]]` becomes its label carrying a `wikilink:` link, and a tap is routed back
// through `onWikilinkTap` via the environment's openURL action.
struct BodyPreviewView: View {
  let bodyText: String
  let onWikilinkTap: (String) -> Void
  @Environment(\.studioTheme) private var theme

  var body: some View {
    Text(attributed)
      .font(StudioFont.pageSubtitle)
      .foregroundStyle(theme.inkStrong)
      .tint(theme.link)
      .textSelection(.enabled)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .environment(
        \.openURL,
        OpenURLAction { url in
          guard let target = Self.wikilinkTarget(url) else { return .systemAction }
          onWikilinkTap(target)
          return .handled
        })
  }

  private static let wikilinkRegex = try? NSRegularExpression(
    pattern: #"\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]"#)

  // The body as an AttributedString: Markdown for the ordinary text, and each wikilink
  // label as an inline, tinted, tappable link.
  private var attributed: AttributedString {
    guard let regex = Self.wikilinkRegex else { return markdownChunk(bodyText) }
    let ns = bodyText as NSString
    var result = AttributedString()
    var cursor = 0
    for match in regex.matches(in: bodyText, range: NSRange(location: 0, length: ns.length)) {
      let pre = ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
      result += markdownChunk(pre)

      let target = ns.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespaces)
      let aliasRange = match.range(at: 2)
      let label =
        (aliasRange.location != NSNotFound ? ns.substring(with: aliasRange) : target)
        .trimmingCharacters(in: .whitespaces)
      var run = AttributedString(label)
      if let url = Self.wikilinkURL(target) { run.link = url }
      run.foregroundColor = theme.link
      run.underlineStyle = .single
      result += run

      cursor = match.range.location + match.range.length
    }
    result += markdownChunk(ns.substring(from: cursor))
    return result
  }

  private func markdownChunk(_ text: String) -> AttributedString {
    (try? AttributedString(
      markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
      ?? AttributedString(text)
  }

  // Encode/decode the wikilink target in a `wikilink://link?t=…` URL (query items keep
  // the case and characters intact, unlike a URL host).
  static func wikilinkURL(_ target: String) -> URL? {
    var components = URLComponents()
    components.scheme = "wikilink"
    components.host = "link"
    components.queryItems = [URLQueryItem(name: "t", value: target)]
    return components.url
  }

  static func wikilinkTarget(_ url: URL) -> String? {
    guard url.scheme == "wikilink",
      let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
    else { return nil }
    return items.first { $0.name == "t" }?.value
  }
}
