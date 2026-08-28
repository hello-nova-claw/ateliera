import Foundation

// Pure codec for .studio/views/<key>.json (view order / noteIds).
// No file I/O — a separate store layer calls these functions.
// Byte-identical to the web app's view-state.ts serialize/parse.
enum ViewState {
  // MARK: - Path

  /// Returns `.studio/views/<percentEncoded(viewKey)>.json`, matching JS encodeURIComponent.
  /// Returns nil for empty/whitespace-only keys.
  static func path(_ viewKey: String) -> String? {
    guard !viewKey.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    // encodeURIComponent leaves unescaped: A-Za-z0-9 - _ . ! ~ * ' ( )
    // Everything else (including ':') is percent-encoded.
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    guard let encoded = viewKey.addingPercentEncoding(withAllowedCharacters: allowed) else {
      return nil
    }
    return ".studio/views/\(encoded).json"
  }

  // MARK: - Serialize

  /// Byte-identical to: JSON.stringify({ version: 1, noteIds: [...new Set(noteIds)] }, null, 2) + "\n"
  static func serialize(_ noteIds: [String]) -> String {
    let deduped = dedupe(noteIds)
    var out = "{\n  \"version\": 1,\n  \"noteIds\": ["
    if deduped.isEmpty {
      out += "]\n}\n"
      return out
    }
    out += "\n"
    for (index, id) in deduped.enumerated() {
      out += "    \(jsonString(id))"
      if index < deduped.count - 1 {
        out += ","
      }
      out += "\n"
    }
    out += "  ]\n}\n"
    return out
  }

  // MARK: - Parse

  /// Port of parseOrder: returns deduplicated noteIds array, or [] on any error.
  static func parse(_ text: String) -> [String] {
    guard let data = text.data(using: .utf8) else { return [] }
    guard let value = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
      return []
    }
    guard let obj = value as? [String: Any],
          let versionAny = obj["version"],
          let version = versionAny as? NSNumber, version.intValue == 1,
          let noteIdsAny = obj["noteIds"],
          let noteIds = noteIdsAny as? [Any],
          noteIds.allSatisfy({ $0 is String })
    else {
      return []
    }
    let ids = noteIds.compactMap { $0 as? String }
    return dedupe(ids)
  }

  // MARK: - Private helpers

  private static func dedupe(_ ids: [String]) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for id in ids {
      if seen.insert(id).inserted {
        result.append(id)
      }
    }
    return result
  }

  /// JSON-encode a string (same escaping as LifeAreaConfig.jsonString).
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
}
