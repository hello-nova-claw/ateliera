import Foundation

// Point-in-time snapshots of vault files under `.studio/backups/`, mirroring
// `revisions.ts`. A snapshot copies the current bytes of a set of paths into a dated
// folder plus a manifest, written atomically through the Rust batch. Restore writes
// the snapshot's files back to their original paths. Each snapshot prunes older ones
// via the `remove` FFI: one snapshot per day, nothing past a 30-day retention window.
struct RevisionFile: Codable, Equatable {
  let originalPath: String
  let snapshotPath: String
  let hash: String
}

struct RevisionManifest: Codable, Equatable {
  var version: Int
  var id: String
  var reason: String
  var createdAt: String
  var state: String
  var files: [RevisionFile]
}

struct RevisionSnapshot: Identifiable, Equatable {
  let manifestPath: String
  let manifest: RevisionManifest
  var id: String { manifest.id }
}

enum RevisionReason {
  static let conflictResolution = "conflict-resolution"
  static let seasonClose = "season-close"
  static let migration = "migration"
  static let multiFileRename = "multi-file-rename"
}

struct RevisionStore {
  static let backupsRoot = ".studio/backups"

  let store: VaultStore

  /// Snapshot the current bytes of `paths` into a dated backup folder + manifest.
  /// Returns nil if nothing could be read or the atomic write failed.
  @discardableResult
  func snapshot(reason: String, paths: [String], now: String, id: String) -> RevisionSnapshot? {
    let day = String(now.prefix(10))  // YYYY-MM-DD
    let stamp = now.replacingOccurrences(of: ":", with: "-").replacingOccurrences(of: ".", with: "-")
    let folder = "\(Self.backupsRoot)/\(day)/\(stamp)--\(id)"

    var files: [RevisionFile] = []
    var writes: [BatchWrite] = []
    for path in paths {
      guard let bytes = store.readFileBytes(path: path) else { continue }
      let snapshotPath = "\(folder)/files/\(path)"
      files.append(
        RevisionFile(
          originalPath: path, snapshotPath: snapshotPath, hash: VaultExporter.sha256Hex(bytes)))
      writes.append(
        BatchWrite(path: snapshotPath, bytes: bytes, expectedHash: nil, expectedMissing: true))
    }
    guard !files.isEmpty else { return nil }

    let manifest = RevisionManifest(
      version: 1, id: id, reason: reason, createdAt: now, state: "complete", files: files)
    let manifestPath = "\(folder)/manifest.json"
    guard let manifestData = try? JSONEncoder.revision.encode(manifest) else { return nil }
    writes.append(
      BatchWrite(path: manifestPath, bytes: manifestData, expectedHash: nil, expectedMissing: true))

    guard store.writeBatch(expectedRevision: store.currentRevision(), writes: writes) else {
      return nil
    }
    prune(now: now)
    return RevisionSnapshot(manifestPath: manifestPath, manifest: manifest)
  }

  /// Keep at most one snapshot per day and drop anything older than the retention
  /// window (30 days), removing each dropped snapshot's files + manifest.
  func prune(now: String, retentionDays: Int = 30) {
    let cutoffDay = String(Resurfacing.addDaysISO(String(now.prefix(10)), -retentionDays).prefix(10))
    var keptDays = Set<String>()
    var toRemove: [RevisionSnapshot] = []
    for snapshot in list() {  // newest first
      let day = String(snapshot.manifest.createdAt.prefix(10))
      if day < cutoffDay {
        toRemove.append(snapshot)
      } else if keptDays.contains(day) {
        toRemove.append(snapshot)
      } else {
        keptDays.insert(day)
      }
    }
    for snapshot in toRemove {
      for file in snapshot.manifest.files { store.removeFile(path: file.snapshotPath) }
      store.removeFile(path: snapshot.manifestPath)
    }
  }

  /// Every snapshot in the vault, newest first.
  func list() -> [RevisionSnapshot] {
    store.listAllPaths()
      .filter { $0.hasPrefix("\(Self.backupsRoot)/") && $0.hasSuffix("/manifest.json") }
      .compactMap { path -> RevisionSnapshot? in
        guard let raw = store.readRawFile(path: path),
          let data = raw.text.data(using: .utf8),
          let manifest = try? JSONDecoder().decode(RevisionManifest.self, from: data)
        else { return nil }
        return RevisionSnapshot(manifestPath: path, manifest: manifest)
      }
      .sorted { $0.manifest.createdAt > $1.manifest.createdAt }
  }

  /// Restore a snapshot: write each snapshotted file back to its original path.
  @discardableResult
  func restore(_ snapshot: RevisionSnapshot) -> Bool {
    var writes: [BatchWrite] = []
    for file in snapshot.manifest.files {
      guard let bytes = store.readFileBytes(path: file.snapshotPath) else { continue }
      writes.append(
        BatchWrite(path: file.originalPath, bytes: bytes, expectedHash: nil, expectedMissing: false))
    }
    guard !writes.isEmpty else { return false }
    return store.writeBatch(expectedRevision: store.currentRevision(), writes: writes)
  }
}

extension JSONEncoder {
  // Stable key order for revision manifests.
  static var revision: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .prettyPrinted]
    return encoder
  }
}
