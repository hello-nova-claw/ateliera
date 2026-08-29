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

  static func disposition(_ path: String) -> ExportDisposition {
    if path.hasPrefix(".studio/") {
      if includeExact.contains(path) || includePrefixes.contains(where: { path.hasPrefix($0) }) {
        return .include
      }
      if cachePrefixes.contains(where: { path.hasPrefix($0) }) { return .cache }
      return .internalOnly
    }
    if let ext = fileExtension(path), activeExtensions.contains(ext) { return .blocked }
    return .include
  }

  private static func fileExtension(_ path: String) -> String? {
    let name = (path as NSString).lastPathComponent
    guard let dot = name.range(of: ".", options: .backwards) else { return nil }
    return String(name[name.index(after: dot.lowerBound)...]).lowercased()
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
