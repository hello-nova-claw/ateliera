import Foundation

// Import a portable ZIP backup: parse it, classify each entry as a create or an
// overwrite against the current vault, and apply the writes atomically through the
// Rust batch (guarded by the vault revision, so a concurrent change is rejected).
// Per-item conflict resolution UI is a follow-up; this applies the whole archive.
enum ImportAction: String, Equatable {
  case create
  case overwrite
}

struct ImportItem: Identifiable, Equatable {
  let id = UUID()
  let path: String
  let action: ImportAction
  let bytes: Data

  static func == (lhs: ImportItem, rhs: ImportItem) -> Bool {
    lhs.path == rhs.path && lhs.action == rhs.action && lhs.bytes == rhs.bytes
  }
}

struct ImportPlan {
  let items: [ImportItem]
  let targetRevision: String
  let manifestPresent: Bool

  var createCount: Int { items.filter { $0.action == .create }.count }
  var overwriteCount: Int { items.filter { $0.action == .overwrite }.count }
}

enum VaultImporter {
  static func prepare(archive: Data, store: VaultStore) throws -> ImportPlan {
    let files = try Zip32Reader.parse(archive)
    let existing = Set(store.listAllPaths())
    var items: [ImportItem] = []
    var manifestPresent = false
    for (path, bytes) in files {
      if path == PortableManifest.manifestPath {
        manifestPresent = true
        continue
      }
      let action: ImportAction = existing.contains(path) ? .overwrite : .create
      items.append(ImportItem(path: path, action: action, bytes: bytes))
    }
    return ImportPlan(
      items: items, targetRevision: store.currentRevision(), manifestPresent: manifestPresent)
  }

  @discardableResult
  static func apply(plan: ImportPlan, store: VaultStore) -> Bool {
    let writes = plan.items.map { item in
      BatchWrite(
        path: item.path, bytes: item.bytes, expectedHash: nil,
        expectedMissing: item.action == .create)
    }
    guard !writes.isEmpty else { return true }
    return store.writeBatch(expectedRevision: plan.targetRevision, writes: writes)
  }
}
