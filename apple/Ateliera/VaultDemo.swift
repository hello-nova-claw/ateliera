import Foundation

// Phase N1 proof: write a small fixture Studio into the app's Documents, then open
// and read it through the Rust vault core (Vault / readText / getRevision / list).
// This exercises the whole UniFFI pipeline; the real security-scoped iCloud picker
// replaces the fixture in a later phase.
struct VaultReadout {
  let text: String
  let hash: String
  let revision: String
  let entryCount: Int
}

struct VaultDemoError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

enum VaultDemo {
  static func run() -> Result<VaultReadout, VaultDemoError> {
    let fm = FileManager.default
    let note = """
      ---
      title: A quiet morning that worked
      card_type: reflection
      ---

      Fifteen minutes still counted.
      """
    do {
      let docs = try fm.url(
        for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let vault = docs.appendingPathComponent("DemoStudio", isDirectory: true)
      let room = vault.appendingPathComponent("Reflection Garden", isDirectory: true)
      try fm.createDirectory(at: room, withIntermediateDirectories: true)
      try note.data(using: .utf8)!
        .write(to: room.appendingPathComponent("a-quiet-morning.md"))
      try "1".data(using: .utf8)!
        .write(to: vault.appendingPathComponent(".studio-revision"))

      // Cross the FFI boundary into Rust.
      let handle = try Vault.open(path: vault.path)
      let read = try handle.readText(path: "Reflection Garden/a-quiet-morning.md")
      let revision = try handle.getRevision()
      let entries = try handle.list(prefix: nil)

      return .success(
        VaultReadout(
          text: read.text, hash: read.hash, revision: revision, entryCount: entries.count))
    } catch {
      return .failure(VaultDemoError(message: "\(error)"))
    }
  }
}
