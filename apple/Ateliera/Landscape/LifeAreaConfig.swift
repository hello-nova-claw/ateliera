import Foundation

// Pure codec for .studio/config/landscape-areas.json.
// No file I/O — a separate store layer calls these functions.
// Byte-identical to the web app's life-area-repository.ts serialize/parse.
enum LifeAreaConfig {
  static let path = ".studio/config/landscape-areas.json"
  static let maxAreas = 32

  // MARK: - Serialize

  /// Produces byte-identical output to the web's:
  ///   JSON.stringify({ version: 1, areas }, null, 2) + "\n"
  /// Key order per area is: id, title, hidden, order (insertion order preserved by JS).
  static func serialize(_ areas: [LifeAreaPreference]) -> String {
    var out = "{\n  \"version\": 1,\n  \"areas\": ["
    if areas.isEmpty {
      out += "]\n}\n"
      return out
    }
    out += "\n"
    for (index, area) in areas.enumerated() {
      out += "    {\n"
      out += "      \"id\": \(jsonString(area.id)),\n"
      out += "      \"title\": \(jsonString(area.title)),\n"
      out += "      \"hidden\": \(area.hidden ? "true" : "false"),\n"
      out += "      \"order\": \(area.order)\n"
      out += "    }"
      if index < areas.count - 1 {
        out += ","
      }
      out += "\n"
    }
    out += "  ]\n}\n"
    return out
  }

  // MARK: - Parse result

  enum ParseResult: Equatable {
    case ok([LifeAreaPreference])
    case unsupported(Int)
    case repair
  }

  /// Parses the text content of landscape-areas.json.
  static func parse(_ text: String) -> ParseResult {
    guard let data = text.data(using: .utf8) else { return .repair }
    let value: Any
    do {
      value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    } catch {
      return .repair
    }

    // Must be an object with exactly keys {areas, version}.
    guard let obj = value as? [String: Any] else { return .repair }
    let keys = Set(obj.keys)
    guard keys == ["areas", "version"] else { return .repair }

    // Check version number.
    guard let versionAny = obj["version"] else { return .repair }
    // version must be a number; version > 1 → .unsupported
    guard let versionNum = intFromJSON(versionAny) else { return .repair }
    if versionNum > 1 {
      return .unsupported(versionNum)
    }
    guard versionNum == 1 else { return .repair }

    // Normalize areas.
    guard let areasAny = obj["areas"] else { return .repair }
    do {
      let normalized = try normalizeAreas(areasAny)
      return .ok(normalized)
    } catch {
      return .repair
    }
  }

  // MARK: - Defaults

  static func defaults() -> [LifeAreaPreference] {
    LifeAreaPreference.defaults
  }

  // MARK: - Safe area ID

  /// Port of safeAreaId from use-landscape.ts.
  /// Diacritic-fold + lowercase, replace runs of non-[a-z0-9] with '-',
  /// trim leading/trailing '-', empty → "area", cap 56 chars.
  /// If the base collides with an existing id, append -2, -3, … until free.
  static func safeAreaId(title: String, existing: [LifeAreaPreference]) -> String {
    // NFKD decomposition then strip combining diacritics (U+0300–U+036F).
    let decomposed = title.decomposedStringWithCompatibilityMapping
    var folded = ""
    for scalar in decomposed.unicodeScalars {
      if scalar.value >= 0x0300 && scalar.value <= 0x036F { continue }
      folded.unicodeScalars.append(scalar)
    }
    // Lowercase (locale en — Swift's lowercased() is locale-independent for ASCII).
    let lower = folded.lowercased()

    // Replace runs of non-[a-z0-9] with single '-'.
    var slug = ""
    var inRun = false
    for ch in lower {
      if ch.isLetter && ch.isASCII || ch.isNumber && ch.isASCII {
        slug.append(ch)
        inRun = false
      } else {
        if !inRun {
          slug.append("-")
          inRun = true
        }
      }
    }
    // Trim leading/trailing '-'.
    while slug.hasPrefix("-") { slug.removeFirst() }
    while slug.hasSuffix("-") { slug.removeLast() }

    // Cap at 56 chars.
    if slug.count > 56 {
      slug = String(slug.prefix(56))
      // Trim any trailing '-' created by truncation.
      while slug.hasSuffix("-") { slug.removeLast() }
    }

    // Fall back to "area" if empty.
    if slug.isEmpty { slug = "area" }

    // Collision resolution: append -2, -3, …
    let ids = Set(existing.map(\.id))
    if !ids.contains(slug) { return slug }
    var suffix = 2
    while ids.contains("\(slug)-\(suffix)") { suffix += 1 }
    return "\(slug)-\(suffix)"
  }

  // MARK: - Private helpers

  /// JSON-encode a string (handles characters that need escaping).
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
      case 0x00..<0x20:
        result += String(format: "\\u%04x", scalar.value)
      default:
        result.unicodeScalars.append(scalar)
      }
    }
    result += "\""
    return result
  }

  /// Extract an Int from a JSON-parsed value (NSNumber from JSONSerialization).
  private static func intFromJSON(_ value: Any) -> Int? {
    if let n = value as? Int { return n }
    if let n = value as? NSNumber {
      // Make sure it's actually integral (not a float like 1.5).
      let d = n.doubleValue
      let i = n.intValue
      if d == Double(i) { return i }
    }
    return nil
  }

  // MARK: - normalizeAreas (port of the TS function)

  private static func normalizeAreas(_ value: Any) throws -> [LifeAreaPreference] {
    guard let arr = value as? [Any] else {
      throw LifeAreaConfigError.invalid("areas must be an array")
    }
    if arr.isEmpty || arr.count > maxAreas {
      throw LifeAreaConfigError.invalid("Life area state must contain between 1 and \(maxAreas) areas.")
    }

    var ids = Set<String>()
    var titles = Set<String>()
    var orders = Set<Int>()
    var normalized: [LifeAreaPreference] = []

    for candidate in arr {
      guard let obj = candidate as? [String: Any] else {
        throw LifeAreaConfigError.invalid("Life area state contains an invalid record.")
      }
      // Must have EXACTLY keys {hidden, id, order, title} (sorted alphabetically == what we check).
      let actualKeys = Set(obj.keys)
      guard actualKeys == ["hidden", "id", "order", "title"] else {
        throw LifeAreaConfigError.invalid("Life area state contains an invalid record.")
      }

      guard let idAny = obj["id"], let id = idAny as? String else {
        throw LifeAreaConfigError.invalid("Life area IDs must be lowercase slugs of at most 64 characters.")
      }
      if id.count > 64 || !isValidSlug(id) {
        throw LifeAreaConfigError.invalid("Life area IDs must be lowercase slugs of at most 64 characters.")
      }

      guard let titleAny = obj["title"], let rawTitle = titleAny as? String else {
        throw LifeAreaConfigError.invalid("Life area titles must contain between 1 and 100 characters.")
      }
      let normalizedTitle = rawTitle.trimmingCharacters(in: .whitespaces)
        .precomposedStringWithCanonicalMapping  // NFC
      let graphemeCount = normalizedTitle.count  // Swift String.count == Unicode extended grapheme clusters
      if normalizedTitle.isEmpty || graphemeCount > 100 {
        throw LifeAreaConfigError.invalid("Life area titles must contain between 1 and 100 characters.")
      }

      guard let hiddenAny = obj["hidden"], let hidden = hiddenAny as? Bool else {
        throw LifeAreaConfigError.invalid("Life area visibility must be true or false.")
      }

      guard let orderAny = obj["order"], let order = intFromJSON(orderAny) else {
        throw LifeAreaConfigError.invalid("Life area order must be an integer between 0 and \(maxAreas - 1).")
      }
      if order < 0 || order >= maxAreas {
        throw LifeAreaConfigError.invalid("Life area order must be an integer between 0 and \(maxAreas - 1).")
      }

      let titleKey = normalizedTitle.lowercased()
      if ids.contains(id) {
        throw LifeAreaConfigError.invalid("Life area ID \"\(id)\" is duplicated.")
      }
      if titles.contains(titleKey) {
        throw LifeAreaConfigError.invalid("Life area title \"\(normalizedTitle)\" is duplicated.")
      }
      if orders.contains(order) {
        throw LifeAreaConfigError.invalid("Life area order \(order) is duplicated.")
      }
      ids.insert(id)
      titles.insert(titleKey)
      orders.insert(order)
      normalized.append(LifeAreaPreference(id: id, title: normalizedTitle, hidden: hidden, order: order))
    }

    return normalized.sorted { $0.order < $1.order }
  }

  /// Matches ^[a-z0-9]+(?:-[a-z0-9]+)*$
  private static func isValidSlug(_ s: String) -> Bool {
    guard !s.isEmpty else { return false }
    // Split by '-' and check each segment is non-empty and [a-z0-9]+.
    let segments = s.split(separator: "-", omittingEmptySubsequences: false)
    for segment in segments {
      if segment.isEmpty { return false }
      for ch in segment {
        guard (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") else { return false }
      }
    }
    return true
  }
}

private enum LifeAreaConfigError: Error {
  case invalid(String)
}
