import Foundation

// The portable-vault export manifest + which vault paths an export includes. Byte-for-
// byte matching `portability.ts` / `export.ts` (manifest = `JSON.stringify(m, null, 2)`
// + trailing newline; key order fixed).
struct ManifestFile: Equatable {
  let path: String
  let sha256: String
  let size: Int
}

enum ExportDisposition: Equatable {
  case include  // shipped in the ZIP + listed in the manifest
  case cache  // listed in excludedCaches, not shipped
  case internalOnly  // silently skipped
  case blocked  // active/executable extension, refused
}

enum PortableManifest {
  static let format = "ateliera-vault"
  static let exportVersion = 1
  static let manifestPath = ".studio/export-manifest.json"

  // Active/executable extensions never exported (portability.ts).
  static let activeExtensions: Set<String> = [
    "app", "bat", "cmd", "command", "com", "cpl", "css", "dll", "dmg", "exe",
    "gadget", "hta", "htm", "html", "jar", "js", "jse", "jsx", "mjs", "msi",
    "pif", "ps1", "scf", "scr", "sh", "svg", "ts", "tsx", "vb", "vbe", "vbs",
    "wasm", "ws", "wsc", "wsf", "wsh",
  ]

  private static let includeExact: Set<String> = [".studio/settings.json", ".studio/config.json"]
  private static let includePrefixes = [
    ".studio/settings/", ".studio/config/", ".studio/views/", ".studio/seasons/",
    ".studio/backups/", ".studio/trash/",
  ]
  private static let cachePrefixes = [
    ".studio/index/", ".studio/cache/", ".studio/thumbnails/", ".studio/import-stage/",
    ".studio/import-backup/", ".studio/tmp/", ".studio/revisions/",
  ]

  /// Case-insensitive about `.studio/`, as `exportDisposition` is, so `.Studio/x` is
  /// never mistaken for a person's file on a volume that ignores case.
  static func disposition(_ path: String) -> ExportDisposition {
    // Checked first, so export never ships what import refuses, in `.studio/` too.
    if isActiveContent(path) { return .blocked }
    let path = path.lowercased()
    if path.hasPrefix(".studio/") {
      if includeExact.contains(path) || includePrefixes.contains(where: { path.hasPrefix($0) }) {
        return .include
      }
      if cachePrefixes.contains(where: { path.hasPrefix($0) }) { return .cache }
      return .internalOnly
    }
    return .include
  }

  private static func fileExtension(_ path: String) -> String? {
    let name = (path as NSString).lastPathComponent
    guard let dot = name.range(of: ".", options: .backwards) else { return nil }
    return String(name[name.index(after: dot.lowerBound)...]).lowercased()
  }

  /// Folders that are programs on a Mac, whatever the files inside them are called.
  static let bundleExtensions: Set<String> = ["app"]

  /// Whether `path` is active content: its file name has an active extension, as
  /// `assertNoActiveContent` checks, or a folder on the way is a bundle, so
  /// `Evil.app/Contents/MacOS/Evil` counts. Other folders with an active-looking name,
  /// such as `Ideas.js/`, are only folders. Export blocks and import refuses the same paths.
  static func isActiveContent(_ path: String) -> Bool {
    let segments = path.split(separator: "/").map(String.init)
    guard let name = segments.last else { return false }
    if let ext = fileExtension(name), activeExtensions.contains(ext) { return true }
    return segments.dropLast().contains { segment in
      fileExtension(segment).map { bundleExtensions.contains($0) } ?? false
    }
  }

  private static let windowsReserved = try? NSRegularExpression(
    pattern: #"^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)"#, options: .caseInsensitive)

  /// A path every platform can hold, as `validatePortablePath` checks it: NFC, at most
  /// 1,024 characters, relative, no backslash, drive letter or control character, and
  /// no segment that is empty, `.` or `..`, over 255 characters, ends in a dot or a
  /// space, is a Windows device name, or starts with `.studio-`.
  static func isPortablePath(_ path: String) -> Bool {
    let normalized = path.precomposedStringWithCanonicalMapping
    // Swift's == ignores normalisation, so compare the scalars.
    guard Array(normalized.unicodeScalars) == Array(path.unicodeScalars),
      !path.isEmpty, path.utf16.count <= 1_024, !path.contains("\\"), !path.hasPrefix("/"),
      !path.hasSuffix("/"), path.range(of: "^[A-Za-z]:", options: .regularExpression) == nil,
      !path.unicodeScalars.contains(where: { $0.value <= 0x1F || $0.value == 0x7F })
    else { return false }
    return path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { part in
      let segment = String(part)
      let range = NSRange(segment.startIndex..., in: segment)
      return !segment.isEmpty && segment.utf16.count <= 255 && segment != "." && segment != ".."
        && !segment.hasSuffix(".") && !segment.hasSuffix(" ")
        && windowsReserved?.firstMatch(in: segment, range: range) == nil
        && !segment.lowercased().hasPrefix(".studio-")
    }
  }

  /// The export manifest's file list and excluded caches, or nil unless it is exactly
  /// the shape `validPortableManifest` accepts: the six keys and no others, this format
  /// and version, schema versions 1, a `toISOString` timestamp, and for each file a
  /// path, a lower-case SHA-256 and a size of at most 64 MiB.
  static func parse(_ data: Data) -> (files: [ManifestFile], excludedCaches: [String])? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      Set(object.keys)
        == ["excludedCaches", "exportVersion", "files", "format", "generatedAt", "schemaVersions"],
      object["format"] as? String == format, isInteger(object["exportVersion"], exportVersion),
      let generatedAt = object["generatedAt"] as? String, isCanonicalTimestamp(generatedAt),
      let schemas = object["schemaVersions"] as? [String: Any],
      Set(schemas.keys) == ["note", "settings"], isInteger(schemas["note"], 1),
      isInteger(schemas["settings"], 1),
      let caches = object["excludedCaches"] as? [String], caches.count <= 9_999,
      let rawFiles = object["files"] as? [[String: Any]], rawFiles.count <= 9_999
    else { return nil }
    var files: [ManifestFile] = []
    for raw in rawFiles {
      guard Set(raw.keys) == ["path", "sha256", "size"], let path = raw["path"] as? String,
        let hash = raw["sha256"] as? String, isSHA256(hash),
        let number = raw["size"] as? NSNumber, isInteger(number, nil),
        number.intValue >= 0, number.intValue <= 64 * 1_024 * 1_024
      else { return nil }
      files.append(ManifestFile(path: path, sha256: hash, size: number.intValue))
    }
    return (files, caches)
  }

  /// A JSON number that is a whole number (and, given `value`, that one), not a bool.
  private static func isInteger(_ any: Any?, _ value: Int?) -> Bool {
    guard let number = any as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.rounded() == number.doubleValue,
      abs(number.doubleValue) <= 9_007_199_254_740_991
    else { return false }
    return value.map { number.intValue == $0 } ?? true
  }

  private static func isSHA256(_ value: String) -> Bool {
    value.utf8.count == 64
      && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }

  /// Written exactly as JavaScript's `toISOString` writes it.
  private static func isCanonicalTimestamp(_ value: String) -> Bool {
    guard
      value.range(
        of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#, options: .regularExpression) != nil
    else { return false }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value).map { formatter.string(from: $0) == value } ?? false
  }

  // NFC + lowercase, for case/normalisation-insensitive path comparison on import.
  static func portablePathKey(_ path: String) -> String {
    path.precomposedStringWithCanonicalMapping.lowercased()
  }

  // Serialize a manifest byte-identically to `JSON.stringify(manifest, null, 2) + "\n"`.
  static func serialize(files: [ManifestFile], excludedCaches: [String], generatedAt: String)
    -> String
  {
    var out = "{\n"
    out += "  \"format\": \(jsonString(format)),\n"
    out += "  \"exportVersion\": \(exportVersion),\n"
    out += "  \"schemaVersions\": {\n    \"note\": 1,\n    \"settings\": 1\n  },\n"
    out += "  \"generatedAt\": \(jsonString(generatedAt)),\n"
    if files.isEmpty {
      out += "  \"files\": [],\n"
    } else {
      out += "  \"files\": [\n"
      for (index, file) in files.enumerated() {
        out += "    {\n"
        out += "      \"path\": \(jsonString(file.path)),\n"
        out += "      \"sha256\": \(jsonString(file.sha256)),\n"
        out += "      \"size\": \(file.size)\n"
        out += index < files.count - 1 ? "    },\n" : "    }\n"
      }
      out += "  ],\n"
    }
    if excludedCaches.isEmpty {
      out += "  \"excludedCaches\": []\n"
    } else {
      out += "  \"excludedCaches\": [\n"
      for (index, cache) in excludedCaches.enumerated() {
        out += "    \(jsonString(cache))"
        out += index < excludedCaches.count - 1 ? ",\n" : "\n"
      }
      out += "  ]\n"
    }
    out += "}\n"
    return out
  }

  // Minimal JSON string encoder (quote + escape) matching JSON.stringify for strings.
  private static func jsonString(_ value: String) -> String {
    var out = "\""
    for scalar in value.unicodeScalars {
      switch scalar {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if scalar.value < 0x20 {
          out += String(format: "\\u%04x", scalar.value)
        } else {
          out.unicodeScalars.append(scalar)
        }
      }
    }
    out += "\""
    return out
  }
}
