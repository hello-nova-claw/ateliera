import Foundation

// Resolves a wikilink target to a note's vault PATH against the loaded summaries.
// Pure (no I/O) so it's testable; the caller turns the path into an editable note
// via VaultStore.beginEdit. `studio://note/<id>` targets match on StudioNote.id;
// everything else matches by title, case-insensitively, first path alphabetically.
enum WikilinkNavigator {
  static func resolvePath(target: String, in notes: [NoteSummary]) -> String? {
    if let id = studioNoteId(from: target) {
      return notes.first { $0.noteId == id }?.id
    }
    let lowered = target.trimmingCharacters(in: .whitespaces).lowercased()
    guard !lowered.isEmpty else { return nil }
    return notes.filter { $0.title.lowercased() == lowered }.map(\.id).sorted().first
  }

  private static let studioNoteLink = try? NSRegularExpression(
    pattern: #"^studio://note/([^/?#]+)$"#, options: [.caseInsensitive])

  static func studioNoteId(from target: String) -> String? {
    let trimmed = target.trimmingCharacters(in: .whitespaces)
    guard
      let regex = studioNoteLink,
      let match = regex.firstMatch(
        in: trimmed, range: NSRange(location: 0, length: (trimmed as NSString).length))
    else { return nil }
    return (trimmed as NSString).substring(with: match.range(at: 1))
  }
}
