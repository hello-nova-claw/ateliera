import Foundation

// Note identity + filename conventions, ported from `@studio/content`'s
// filenames.ts so a natively captured note is named and located exactly like a
// web-captured one (Crockford base-32 ULID-ish id, slugified filename). The file
// CONTENT is the interop contract (StudioNote.serialize); these keep the paths and
// ids consistent too.
enum NoteFactory {
  private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

  /// A 26-char id: 10 base-32 digits of the millisecond timestamp + 16 base-32
  /// digits from random bytes. Matches `createNoteId`.
  static func createNoteId(millis: Int64, randomBytes: [UInt8]) -> String {
    var time = millis
    var prefix = ""
    for _ in 0..<10 {
      let index = Int(((time % 32) + 32) % 32)
      prefix = String(alphabet[index]) + prefix
      time /= 32
    }
    var suffix = ""
    for byte in randomBytes { suffix += String(alphabet[Int(byte) % 32]) }
    return prefix + suffix
  }

  static func createNoteId(now: Date = AppClock.now()) -> String {
    let millis = Int64((now.timeIntervalSince1970 * 1000).rounded(.down))
    var bytes = [UInt8](repeating: 0, count: 16)
    for index in bytes.indices { bytes[index] = UInt8.random(in: 0...255) }
    return createNoteId(millis: millis, randomBytes: bytes)
  }

  /// An ISO-8601 timestamp with fractional seconds and a `Z` offset, matching
  /// JavaScript's `new Date().toISOString()` shape (the frontmatter schema wants
  /// an offset datetime).
  static func isoTimestamp(_ now: Date = AppClock.now()) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: now)
  }

  /// Lowercase, strip diacritics, collapse non-`[a-z0-9]` runs to single dashes,
  /// trim edge dashes, cap at 64 chars; empty falls back to `note`. Matches the
  /// `slugify` in filenames.ts.
  static func slugify(_ value: String) -> String {
    let stripped = String(
      value.decomposedStringWithCompatibilityMapping.unicodeScalars.filter {
        !(0x0300...0x036f ~= $0.value)
      })
    var out = ""
    var pendingDash = false
    for character in stripped.lowercased() {
      if character.isASCII && (character.isLetter || character.isNumber) {
        out.append(character)
        pendingDash = false
      } else if !pendingDash {
        out.append("-")
        pendingDash = true
      }
    }
    while out.hasPrefix("-") { out.removeFirst() }
    while out.hasSuffix("-") { out.removeLast() }
    let sliced = String(out.prefix(64))
    return sliced.isEmpty ? "note" : sliced
  }

  /// `<YYYY-MM-DD>--<slug>--<last6-of-id>.md`, matching `suggestFilename`.
  static func suggestFilename(created: String, title: String?, cardType: String, id: String)
    -> String
  {
    let date = datePrefix(created)
    let slug = slugify(title ?? cardType)
    let idPart = String(id.suffix(6)).lowercased()
    return "\(date)--\(slug)--\(idPart).md"
  }

  private static func datePrefix(_ created: String) -> String {
    let prefix = String(created.prefix(10))
    let isValidShape =
      prefix.count == 10
      && prefix.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil
    return isValidShape ? prefix : "1970-01-01"
  }
}

extension StudioNote {
  /// The default note a quick capture produces (the web app's unclassified
  /// "Inbox" capture): a draft `capture` card in the `inbox` room. Body is stored
  /// verbatim (the caller trims); title is only set when non-empty.
  static func capture(
    title: String?, body: String, id: String, created: String, room: String = "inbox"
  ) -> StudioNote {
    let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
    return StudioNote(
      schemaVersion: 1,
      id: id,
      title: (trimmedTitle?.isEmpty ?? true) ? nil : trimmedTitle,
      cardType: "capture",
      semanticType: "reflection",
      status: "draft",
      rooms: [room],
      lifeAreas: [],
      landscapeAnchor: nil,
      seasons: [],
      tags: [],
      created: created,
      updated: created,
      source: nil,
      sourceNoteIds: nil,
      resurfaceKind: nil,
      resurfaceDue: nil,
      resurfaceIntervalDays: nil,
      attachments: [],
      display: NoteDisplay(cover: nil, featured: false),
      privacy: NotePrivacy(sensitivity: "private", aiAccess: "ask"),
      extraFrontmatter: [],
      body: body,
      lineEnding: "\n")
  }
}
