import Foundation

// The app's written content (micro-seasons, prompts, guidance, invitations, tour copy)
// lives apart from the code, as JSON resources under Ateliera/Content/. Each library is
// decoded once, on first use, by the type that shows it. Several files are shared
// verbatim with the web app's `content/` folders.
enum ContentLibrary {
  // The bundle this file is compiled into — the app, or the widget extension, which
  // carries its own copy of the content it needs (the micro-seasons).
  private final class BundleToken {}
  private static let bundle = Bundle(for: BundleToken.self)

  static func load<T: Decodable>(_ name: String, as type: T.Type = T.self) -> T {
    guard let url = bundle.url(forResource: name, withExtension: "json") else {
      fatalError("Content resource \(name).json is missing from the bundle.")
    }
    do {
      return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    } catch {
      fatalError("Content resource \(name).json could not be read: \(error)")
    }
  }
}

extension String {
  // Fills `{name}` placeholders in a content template in a single pass, so a value that
  // itself contains braces (a person's own words) is never re-read as a placeholder.
  // An unknown placeholder is left as written.
  func filled(_ values: [String: String]) -> String {
    var out = ""
    var rest = self[...]
    while let open = rest.firstIndex(of: "{") {
      let afterOpen = rest.index(after: open)
      guard let close = rest[afterOpen...].firstIndex(of: "}") else { break }
      out += rest[..<open]
      let key = String(rest[afterOpen..<close])
      if let value = values[key] {
        out += value
      } else {
        out += rest[open...close]
      }
      rest = rest[rest.index(after: close)...]
    }
    out += rest
    return out
  }
}
