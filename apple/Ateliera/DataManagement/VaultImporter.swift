import Foundation

// Import a portable ZIP backup: parse it, classify each entry as a create or an
// overwrite against the current vault, and apply the writes atomically through the
// Rust batch (guarded by the vault revision, so a concurrent change is rejected).
// Overwrites can be resolved per-item — kept (replaced) or skipped — mirroring the
// `conflicts` map in `import.ts`.
//
// A backup is untrusted input that lands in a folder the system may sync, so `prepare`
// makes the checks `prepareVaultImport` makes before anything is planned: a valid
// manifest that lists every entry with its size and SHA-256, portable NFC paths with no
// active content, nothing reserved, and no two paths that differ only in case.
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
    var created = 0
    var replaced = 0
    var skipped = 0
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

/// Why a backup was refused. Each case has a calm sentence to show the person.
enum ImportError: Error, Equatable {
  case invalidArchive
  case unsupportedArchive
  case checksumFailed
  case tooLarge
  case invalidManifest
  case outsideManifest
  case activeContent(path: String)
  case unsafePath(path: String)
  case pathCollision(path: String)

  init(_ error: Zip32Reader.ReaderError) {
    switch error {
    case .invalid: self = .invalidArchive
    case .unsupported: self = .unsupportedArchive
    case .checksumFailed: self = .checksumFailed
    }
  }

  var message: String {
    switch self {
    case .invalidArchive:
      return String(
        localized: "This ZIP is damaged or isn't a Studio backup. Nothing was imported.",
        comment: "Import refused: the ZIP can't be read")
    case .unsupportedArchive:
      return String(
        localized:
          "This ZIP is compressed in a way the Studio can't read. Export it again from the Studio.",
        comment: "Import refused: the ZIP uses compression or encryption")
    case .checksumFailed:
      return String(
        localized:
          "A file in this backup doesn't match its checksum, so it may be damaged. Nothing was imported.",
        comment: "Import refused: a file's SHA-256 or size differs from the manifest")
    case .tooLarge:
      return String(
        localized:
          "This backup is over the import limit of 512 MB, or 64 MB a file. Nothing was imported.",
        comment: "Import refused: over the size limits")
    case .invalidManifest:
      return String(
        localized:
          "This doesn't look like a Studio backup: its list of files is missing or unreadable. Nothing was imported.",
        comment: "Import refused: the export manifest is missing or invalid")
    case .outsideManifest:
      return String(
        localized:
          "This backup holds files its list doesn't mention, so it may have been changed. Nothing was imported.",
        comment: "Import refused: the ZIP has entries the manifest doesn't list")
    case .activeContent(let path):
      return String(
        localized:
          "\(path) could run as a program, so the Studio doesn't import it. Nothing was imported.",
        comment: "Import refused: an executable or active file. The placeholder is its path.")
    case .unsafePath(let path):
      return String(
        localized:
          "This backup holds a file at a path the Studio can't use safely: \(path). Nothing was imported.",
        comment: "Import refused: a reserved or non-portable path. The placeholder is the path.")
    case .pathCollision(let path):
      return String(
        localized:
          "\(path) differs from another name only in upper and lower case. Nothing was imported.",
        comment:
          "Import refused: two names, in the backup or the Studio, differ only in case. The placeholder is the path."
      )
    }
  }
}

enum VaultImporter {
  static let maxEntryBytes = 64 * 1_024 * 1_024
  static let maxTotalBytes = 512 * 1_024 * 1_024
  static let maxUserFiles = 9_999

  static func prepare(archive: Data, store: VaultStore) throws -> ImportPlan {
    let entries: [(path: String, bytes: Data)]
    do {
      entries = try Zip32Reader.parse(archive)
    } catch let error as Zip32Reader.ReaderError {
      throw ImportError(error)
    }
    // The reader has already refused a name that appears twice.
    let byPath = Dictionary(
      entries.map { ($0.path, $0.bytes) }, uniquingKeysWith: { first, _ in first })
    guard let manifestBytes = byPath[PortableManifest.manifestPath],
      let manifest = PortableManifest.parse(manifestBytes)
    else { throw ImportError.invalidManifest }
    let incoming = try listedFiles(manifest.files, in: byPath, manifestBytes: manifestBytes.count)
    guard byPath.count == incoming.count + 1 else { throw ImportError.outsideManifest }
    try checkExcludedCaches(manifest.excludedCaches, against: incoming.map { $0.path })
    return ImportPlan(
      items: try plannedItems(incoming, store: store), targetRevision: store.currentRevision())
  }

  /// The manifest's files with their bytes from the archive, each checked as
  /// `prepareVaultImport` checks it.
  private static func listedFiles(
    _ descriptors: [ManifestFile], in byPath: [String: Data], manifestBytes: Int
  ) throws -> [(path: String, bytes: Data)] {
    guard descriptors.count <= maxUserFiles else { throw ImportError.tooLarge }
    var seen = Set<String>()
    var total = manifestBytes
    var incoming: [(path: String, bytes: Data)] = []
    for descriptor in descriptors {
      let path = descriptor.path
      guard PortableManifest.isPortablePath(path) else { throw ImportError.unsafePath(path: path) }
      guard !PortableManifest.isActiveContent(path) else {
        throw ImportError.activeContent(path: path)
      }
      guard path != PortableManifest.manifestPath,
        PortableManifest.disposition(path) == .include
      else { throw ImportError.unsafePath(path: path) }
      guard seen.insert(PortableManifest.portablePathKey(path)).inserted else {
        throw ImportError.pathCollision(path: path)
      }
      total += descriptor.size
      guard descriptor.size <= maxEntryBytes, total <= maxTotalBytes else {
        throw ImportError.tooLarge
      }
      guard let bytes = byPath[path], bytes.count == descriptor.size,
        VaultExporter.sha256Hex(bytes) == descriptor.sha256
      else { throw ImportError.checksumFailed }
      incoming.append((path, bytes))
    }
    return incoming
  }

  /// Each excluded cache must be a portable cache path that collides with nothing.
  private static func checkExcludedCaches(_ caches: [String], against files: [String]) throws {
    var keys = Set(files.map(PortableManifest.portablePathKey))
    for path in caches {
      guard PortableManifest.isPortablePath(path), PortableManifest.disposition(path) == .cache,
        keys.insert(PortableManifest.portablePathKey(path)).inserted
      else { throw ImportError.invalidManifest }
    }
  }

  /// A create or an overwrite for each file. A file already in the vault under another
  /// spelling of the same name would be a second file on a case-sensitive volume and the
  /// same file on most others, so that refuses the import.
  private static func plannedItems(
    _ incoming: [(path: String, bytes: Data)], store: VaultStore
  ) throws -> [ImportItem] {
    var existing: [String: String] = [:]
    for path in store.listAllPaths() where PortableManifest.disposition(path) == .include {
      existing[PortableManifest.portablePathKey(path)] = path
    }
    return try incoming.map { path, bytes in
      let action: ImportAction
      switch existing[PortableManifest.portablePathKey(path)] {
      case nil: action = .create
      case let match? where match.utf8.elementsEqual(path.utf8): action = .overwrite
      case .some: throw ImportError.pathCollision(path: path)
      }
      return ImportItem(path: path, action: action, bytes: bytes)
    }
  }

  @discardableResult
  static func apply(
    plan: ImportPlan, resolutions: [String: ImportAction] = [:], store: VaultStore
  ) -> Bool {
    let writes = plan.items.compactMap { item -> BatchWrite? in
      switch plan.resolvedAction(for: item, resolutions: resolutions) {
      case .skip: return nil
      case .create:
        return BatchWrite(
          path: item.path, bytes: item.bytes, expectedHash: nil, expectedMissing: true)
      case .overwrite:
        return BatchWrite(
          path: item.path, bytes: item.bytes, expectedHash: nil, expectedMissing: false)
      }
    }
    guard !writes.isEmpty else { return true }
    return store.writeBatch(expectedRevision: plan.targetRevision, writes: writes)
  }
}
