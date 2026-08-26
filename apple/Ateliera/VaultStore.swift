import Foundation
import Observation

// The note summaries a room shows, read from the vault through the Rust core.
struct NoteSummary: Identifiable {
  let id: String
  let title: String
  let snippet: String
  let meaning: String
}

// Opens a Studio vault (a user-picked, security-scoped iCloud folder — or a seeded
// fixture for the demo) via the reused Rust core, and lists its notes. Persists an
// iOS security-scoped bookmark so relaunch re-opens without re-picking.
@Observable
final class VaultStore {
  var notes: [NoteSummary] = []
  var vaultName: String = ""
  var error: String?

  @ObservationIgnored private var vault: Vault?
  @ObservationIgnored private let bookmarkKey = "ateliera.vault.bookmark"

  init() {
    if !openFromPersistedBookmark() {
      openFixture()
    }
  }

  /// Called from `.fileImporter` when the user picks a folder.
  func open(url: URL) {
    let accessing = url.startAccessingSecurityScopedResource()
    do {
      let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
      UserDefaults.standard.set(data, forKey: bookmarkKey)
      try openVault(at: url)
    } catch {
      if accessing { url.stopAccessingSecurityScopedResource() }
      self.error = "\(error)"
    }
  }

  private func openFromPersistedBookmark() -> Bool {
    guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return false }
    var stale = false
    guard
      let url = try? URL(
        resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
    else { return false }
    _ = url.startAccessingSecurityScopedResource()  // held for the session
    do {
      try openVault(at: url)
      return true
    } catch {
      return false
    }
  }

  private func openVault(at url: URL) throws {
    let handle = try Vault.open(path: url.path)
    self.vault = handle
    self.vaultName = url.lastPathComponent
    try reload()
  }

  func reload() throws {
    guard let vault else { return }
    let entries = try vault.list(prefix: nil)
    var summaries: [NoteSummary] = []
    for entry in entries where !entry.isDirectory && entry.path.hasSuffix(".md") {
      let read = try vault.readText(path: entry.path)
      summaries.append(Self.parse(path: entry.path, text: read.text))
    }
    self.notes = summaries.sorted { $0.title < $1.title }
  }

  // Minimal frontmatter read for the list — Phase N2 does the real round-trip.
  static func parse(path: String, text: String) -> NoteSummary {
    var title = (path as NSString).lastPathComponent.replacingOccurrences(of: ".md", with: "")
    var meaning = "reflection"
    var body: [String] = []
    var section = 0  // 0 before frontmatter, 1 inside, 2 after
    for line in text.components(separatedBy: "\n") {
      if line == "---" {
        section = section == 0 ? 1 : (section == 1 ? 2 : section)
        continue
      }
      if section == 1 {
        if line.hasPrefix("title:") {
          title = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("card_type:") {
          meaning = String(line.dropFirst(10)).trimmingCharacters(in: .whitespaces)
        }
      } else if !line.trimmingCharacters(in: .whitespaces).isEmpty {
        body.append(line)
      }
    }
    return NoteSummary(id: path, title: title, snippet: body.first ?? "", meaning: meaning)
  }

  // Seed a small Reflection Garden so the room has content in the simulator.
  private func openFixture() {
    let fm = FileManager.default
    let notes: [(String, String, String)] = [
      ("a-quiet-morning", "A quiet morning that worked", "celebration"),
      ("returned-without-failure", "I returned without making it a failure", "reflection"),
      ("the-slower-answer", "I chose the slower answer", "reflection"),
    ]
    do {
      let docs = try fm.url(
        for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let vault = docs.appendingPathComponent("DemoStudio", isDirectory: true)
      let room = vault.appendingPathComponent("Reflection Garden", isDirectory: true)
      try fm.createDirectory(at: room, withIntermediateDirectories: true)
      for (slug, title, meaning) in notes {
        let body = "\n\(title). Fifteen minutes still counted.\n"
        let md = "---\ntitle: \(title)\ncard_type: \(meaning)\n---\n\(body)"
        try md.data(using: .utf8)!.write(to: room.appendingPathComponent("\(slug).md"))
      }
      try "1".data(using: .utf8)!
        .write(to: vault.appendingPathComponent(".studio-revision"))
      try openVault(at: vault)
    } catch {
      self.error = "\(error)"
    }
  }
}
