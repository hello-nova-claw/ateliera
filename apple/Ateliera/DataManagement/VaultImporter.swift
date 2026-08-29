import Foundation

// Import a portable ZIP backup: parse it, classify each entry as a create or an
// overwrite against the current vault, and apply the writes atomically through the
// Rust batch (guarded by the vault revision, so a concurrent change is rejected).
// Overwrites can be resolved per-item — kept (replaced) or skipped — mirroring the
// `conflicts` map in `import.ts`.
enum ImportAction: String, Equatable {
  case create
  case overwrite
  case skip
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

  /// The action actually taken for an item once per-item resolutions are applied.
  /// Only overwrites are resolvable; a create is always a create.
  func resolvedAction(for item: ImportItem, resolutions: [String: ImportAction]) -> ImportAction {
    guard item.action == .overwrite else { return item.action }
    return resolutions[item.path] == .skip ? .skip : .overwrite
  }

  /// How the plan shakes out under a set of resolutions, for the preview summary.
  func counts(resolutions: [String: ImportAction]) -> (created: Int, replaced: Int, skipped: Int) {
    var created = 0, replaced = 0, skipped = 0
    for item in items {
      switch resolvedAction(for: item, resolutions: resolutions) {
      case .create: created += 1
      case .overwrite: replaced += 1
      case .skip: skipped += 1
      }
    }
    return (created, replaced, skipped)
  }
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
  static func apply(
    plan: ImportPlan, resolutions: [String: ImportAction] = [:], store: VaultStore
  ) -> Bool {
    let writes = plan.items.compactMap { item -> BatchWrite? in
      switch plan.resolvedAction(for: item, resolutions: resolutions) {
      case .skip: return nil
      case .create:
        return BatchWrite(path: item.path, bytes: item.bytes, expectedHash: nil, expectedMissing: true)
      case .overwrite:
        return BatchWrite(path: item.path, bytes: item.bytes, expectedHash: nil, expectedMissing: false)
      }
    }
    guard !writes.isEmpty else { return true }
    return store.writeBatch(expectedRevision: plan.targetRevision, writes: writes)
  }
}
