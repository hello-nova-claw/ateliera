import Foundation

// Pure codec for .studio/config/wisdom-themes.json — byte-identical to the web app's
// wisdom-theme-repository.ts serialize/parse. No file I/O; a store layer calls these.
struct WisdomThemePreference: Identifiable, Equatable {
  var id: String
  var title: String
  var hidden: Bool
  var order: Int

  var asTheme: WisdomTheme { WisdomTheme(id: id, title: title) }
}

enum WisdomThemeConfig {
  static let path = ".studio/config/wisdom-themes.json"
  static let maxThemes = 40

  // MARK: - Serialize

  /// Byte-identical to `JSON.stringify({ version: 1, themes }, null, 2) + "\n"`,
  /// with each theme's keys in insertion order: id, title, hidden, order.
  static func serialize(_ themes: [WisdomThemePreference]) -> String {
    var out = "{\n  \"version\": 1,\n  \"themes\": ["
    if themes.isEmpty {
      out += "]\n}\n"
      return out
    }
    out += "\n"
    for (index, theme) in themes.enumerated() {
      out += "    {\n"
      out += "      \"id\": \(jsonString(theme.id)),\n"
      out += "      \"title\": \(jsonString(theme.title)),\n"
      out += "      \"hidden\": \(theme.hidden ? "true" : "false"),\n"
      out += "      \"order\": \(theme.order)\n"
      out += "    }"
      if index < themes.count - 1 { out += "," }
      out += "\n"
    }
    out += "  ]\n}\n"
    return out
  }

  // MARK: - Parse

  enum ParseResult: Equatable {
    case ok([WisdomThemePreference])
    case unsupported(Int)
    case repair
  }

  static func defaults() -> [WisdomThemePreference] {
    WisdomDomain.defaultThemes.enumerated().map { order, theme in
      WisdomThemePreference(id: theme.id, title: theme.title, hidden: false, order: order)
    }
  }

  static func parse(_ text: String) -> ParseResult {
    guard let data = text.data(using: .utf8) else { return .repair }
    // The web caps the config at 64 KiB before parsing.
    if data.count > 64 * 1024 { return .repair }
    let value: Any
    do {
      value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    } catch {
      return .repair
    }
    guard let obj = value as? [String: Any] else { return .repair }

    // A newer version we can't understand is surfaced distinctly (offer repair, not clobber).
    if let versionAny = obj["version"], let versionNum = intFromJSON(versionAny), versionNum > 1 {
      return .unsupported(versionNum)
    }
    guard Set(obj.keys) == ["themes", "version"] else { return .repair }
    guard let versionNum = intFromJSON(obj["version"] as Any), versionNum == 1 else { return .repair }
    guard let themesAny = obj["themes"] else { return .repair }
    do {
      return .ok(try normalize(themesAny))
    } catch {
      return .repair
    }
  }

  // MARK: - Safe theme ID (port of WisdomPage.tsx `slug`)

  /// NFKD-fold, strip diacritics, lowercase, collapse non-[a-z0-9] runs to '-', trim
  /// leading/trailing '-'. No length cap or fallback (the web slug has none); an empty
  /// result means the title has no usable characters. Dedupes against `existing` ids.
  static func safeThemeId(title: String, existing: [WisdomThemePreference]) -> String {
    let decomposed = title.decomposedStringWithCompatibilityMapping
    var folded = ""
    for scalar in decomposed.unicodeScalars where !(scalar.value >= 0x0300 && scalar.value <= 0x036F) {
      folded.unicodeScalars.append(scalar)
    }
    let lower = folded.lowercased()
    var slug = ""
    var inRun = false
    for ch in lower {
      if (ch.isASCII && ch.isLetter) || (ch.isASCII && ch.isNumber) {
        slug.append(ch)
        inRun = false
      } else if !inRun {
        slug.append("-")
        inRun = true
      }
    }
    while slug.hasPrefix("-") { slug.removeFirst() }
    while slug.hasSuffix("-") { slug.removeLast() }
    if slug.isEmpty { return "" }

    let ids = Set(existing.map(\.id))
    if !ids.contains(slug) { return slug }
    var suffix = 2
    while ids.contains("\(slug)-\(suffix)") { suffix += 1 }
    return "\(slug)-\(suffix)"
  }

  // MARK: - Private

  private static func normalize(_ value: Any) throws -> [WisdomThemePreference] {
    guard let arr = value as? [Any] else { throw ConfigError.invalid }
    if arr.isEmpty || arr.count > maxThemes { throw ConfigError.invalid }

    var ids = Set<String>()
    var titles = Set<String>()
    var orders = Set<Int>()
    var normalized: [WisdomThemePreference] = []

    for candidate in arr {
      guard let obj = candidate as? [String: Any], Set(obj.keys) == ["hidden", "id", "order", "title"]
      else { throw ConfigError.invalid }

      guard let id = obj["id"] as? String, id.count <= 64, isValidSlug(id) else { throw ConfigError.invalid }
      guard let rawTitle = obj["title"] as? String else { throw ConfigError.invalid }
      let title = rawTitle.trimmingCharacters(in: .whitespaces).precomposedStringWithCanonicalMapping
      if title.isEmpty || title.count > 100 { throw ConfigError.invalid }
      guard let hidden = obj["hidden"] as? Bool else { throw ConfigError.invalid }
      guard let order = intFromJSON(obj["order"] as Any), order >= 0, order < maxThemes else {
        throw ConfigError.invalid
      }

      let titleKey = title.lowercased()
      if ids.contains(id) || titles.contains(titleKey) || orders.contains(order) {
        throw ConfigError.invalid
      }
      ids.insert(id)
      titles.insert(titleKey)
      orders.insert(order)
      normalized.append(WisdomThemePreference(id: id, title: title, hidden: hidden, order: order))
    }
    return normalized.sorted { $0.order < $1.order }
  }

  private static func isValidSlug(_ s: String) -> Bool {
    guard !s.isEmpty else { return false }
    let segments = s.split(separator: "-", omittingEmptySubsequences: false)
    for segment in segments {
      if segment.isEmpty { return false }
      for ch in segment where !((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) { return false }
    }
    return true
  }

  private static func intFromJSON(_ value: Any) -> Int? {
    if let n = value as? Int { return n }
    if let n = value as? NSNumber {
      if n.doubleValue == Double(n.intValue) { return n.intValue }
    }
    return nil
  }

  private static func jsonString(_ s: String) -> String {
    var result = "\""
    for scalar in s.unicodeScalars {
      switch scalar.value {
      case 0x22: result += "\\\""
      case 0x5C: result += "\\\\"
      case 0x08: result += "\\b"
      case 0x0C: result += "\\f"
      case 0x0A: result += "\\n"
      case 0x0D: result += "\\r"
      case 0x09: result += "\\t"
      case 0x00..<0x20: result += String(format: "\\u%04x", scalar.value)
      default: result.unicodeScalars.append(scalar)
      }
    }
    result += "\""
    return result
  }

  private enum ConfigError: Error { case invalid }
}
