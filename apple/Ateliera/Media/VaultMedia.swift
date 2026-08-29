import Foundation

// Cover-image media rules, ported from `packages/application/src/cover-media.ts`:
// resolve a vault-relative cover reference against a note's folder (rejecting
// traversal / schemes / absolute paths / `.studio*` segments), map extension to
// MIME, sniff magic bytes for the supported formats, and cap size at 16 MB.
enum MediaError: Error, Equatable {
  case pathUnsafe
  case formatUnsupported
  case tooLarge
  case magicMismatch
  case vaultUnavailable
}

enum VaultMedia {
  static let maxBytes = 16 * 1024 * 1024

  static let mimeByExtension: [String: String] = [
    ".avif": "image/avif", ".gif": "image/gif", ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ]

  static let extensionByMime: [String: String] = [
    "image/avif": "avif", "image/gif": "gif", "image/jpeg": "jpg",
    "image/png": "png", "image/webp": "webp",
  ]

  /// Resolve `reference` against the note's folder; nil when unsafe. Mirrors
  /// `normalizeCoverPath` byte-for-byte (single `..` may stay in-root; a `..` past
  /// the root, an absolute path, a URI scheme, a `\`/`?`/`#`, or a `.studio*`
  /// segment are all rejected).
  static func normalizeCoverPath(notePath: String, reference: String) -> String? {
    if reference.isEmpty || reference.contains("\0") || reference.contains("\\")
      || reference.contains("?") || reference.contains("#") || reference.hasPrefix("/")
      || reference.range(of: "^[A-Za-z]:", options: .regularExpression) != nil
      || reference.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) != nil
    {
      return nil
    }
    let noteSegments = notePath.components(separatedBy: "/")
    if noteSegments.contains("") { return nil }
    var resolved = Array(noteSegments.dropLast())
    for segment in reference.components(separatedBy: "/") {
      if segment.isEmpty { return nil }
      if segment == "." { continue }
      if segment == ".." {
        if resolved.isEmpty { return nil }
        resolved.removeLast()
        continue
      }
      let lower = segment.lowercased()
      if lower == ".studio" || lower.hasPrefix(".studio-") { return nil }
      resolved.append(segment)
    }
    return resolved.isEmpty ? nil : resolved.joined(separator: "/")
  }

  static func mimeForExtension(_ path: String) -> String? {
    let filename = (path as NSString).lastPathComponent
    guard let dot = filename.range(of: ".", options: .backwards) else { return nil }
    return mimeByExtension[String(filename[dot.lowerBound...]).lowercased()]
  }

  /// The MIME type sniffed from magic bytes, or nil if unsupported.
  static func sniff(_ data: Data) -> String? {
    let b = [UInt8](data)
    func eq(_ offset: Int, _ expected: [UInt8]) -> Bool {
      offset + expected.count <= b.count && Array(b[offset..<offset + expected.count]) == expected
    }
    func ascii(_ offset: Int, _ value: String) -> Bool { eq(offset, Array(value.utf8)) }

    if eq(0, [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
    if eq(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return "image/png" }
    if ascii(0, "GIF87a") || ascii(0, "GIF89a") { return "image/gif" }
    if ascii(0, "RIFF") && ascii(8, "WEBP") { return "image/webp" }
    if ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis")) { return "image/avif" }
    return nil
  }
}
