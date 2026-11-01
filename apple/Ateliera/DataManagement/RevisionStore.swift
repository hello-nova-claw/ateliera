import Foundation

// Point-in-time snapshots of vault files under `.studio/backups/`, mirroring
// `revisions.ts`. A snapshot copies the current bytes of a set of paths into a dated
// folder plus a manifest, written atomically through the Rust batch. Restore writes
// the snapshot's files back to their original paths. Each snapshot prunes older ones
// via the `remove` FFI: one snapshot per day, nothing past a 30-day retention window.
//
// Anything synced or imported into the vault can write under `.studio/backups/`, so a
// manifest is trusted only when it passes the checks `revisions.ts` makes, and a prune
// removes only the copies a manifest's own folder holds, each with its recorded hash.
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

/// A restore worked out ahead of writing it, so the person can see which files it
/// replaces before saying yes.
struct RestorePlan: Equatable {
  struct File: Equatable {
    let originalPath: String
    let snapshotPath: String
    let copyHash: String
    let currentHash: String?
  }

  let snapshot: RevisionSnapshot
  let files: [File]
  /// The files a restore will write: those that differ from their copy.
  var changes: [File] { files.filter { $0.currentHash != $0.copyHash } }
  var paths: [String] { changes.map { $0.originalPath } }
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
  /// Returns nil if nothing could be read, the manifest would break the rules `list`
  /// checks (so it would never be listed or pruned), or the atomic write failed.
  @discardableResult
  func snapshot(reason: String, paths: [String], now: String, id: String) -> RevisionSnapshot? {
    let folder = Self.snapshotRoot(createdAt: now, id: id)

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
    guard let manifestData = try? JSONEncoder.revision.encode(manifest),
      let manifestText = String(data: manifestData, encoding: .utf8),
      Self.trustedManifest(manifestText, at: manifestPath) != nil
    else { return nil }
    writes.append(
      BatchWrite(path: manifestPath, bytes: manifestData, expectedHash: nil, expectedMissing: true))

    guard store.writeBatch(expectedRevision: store.currentRevision(), writes: writes) else {
      return nil
    }
    prune(now: now)
    return RevisionSnapshot(manifestPath: manifestPath, manifest: manifest)
  }

  /// Keep at most one snapshot per day and drop anything 30 days old or more, removing
  /// each dropped snapshot's copies and then its manifest. A manifest is marked
  /// `pruning` first, so a prune that stops part-way is finished by the next one.
  /// Returns false if a removal was refused; whatever was left stays recoverable.
  @discardableResult
  func prune(now: String, retentionDays: Int = 30) -> Bool {
    guard let nowDate = Self.date(fromCanonical: now) else { return false }
    let (pruning, complete) = verifiedSnapshots()
    for verified in pruning.sorted(by: { $0.snapshot.manifestPath < $1.snapshot.manifestPath }) {
      guard remove(verified, manifestHash: verified.manifestHash) else { return false }
    }

    var keptDays = Set<String>()
    let retention = TimeInterval(retentionDays) * 86_400
    for verified in complete.sorted(by: Self.newestFirst) {
      let createdAt = verified.snapshot.manifest.createdAt
      let day = String(createdAt.prefix(10))
      let expired =
        Self.date(fromCanonical: createdAt).map { nowDate.timeIntervalSince($0) >= retention }
        ?? false
      if !expired && keptDays.insert(day).inserted { continue }
      guard markAndRemove(verified) else { return false }
    }
    return true
  }

  /// The snapshots a prune may act on: those marked `pruning` (some copies may be gone)
  /// and those `complete` (every copy must be there).
  private func verifiedSnapshots() -> (pruning: [Verified], complete: [Verified]) {
    var pruning: [Verified] = []
    var complete: [Verified] = []
    for candidate in candidates() {
      switch candidate.snapshot.manifest.state {
      case "pruning":
        if let verified = verify(candidate, allowMissing: true) { pruning.append(verified) }
      case "complete":
        if let verified = verify(candidate, allowMissing: false) { complete.append(verified) }
      default:
        continue
      }
    }
    return (pruning, complete)
  }

  /// Mark a snapshot's manifest `pruning`, expecting it as it was verified, then remove it.
  private func markAndRemove(_ verified: Verified) -> Bool {
    var marked = verified.snapshot.manifest
    marked.state = "pruning"
    guard let data = try? JSONEncoder.revision.encode(marked),
      let text = String(data: data, encoding: .utf8),
      let markedHash = store.writeRawFile(
        path: verified.snapshot.manifestPath, text: text, expectedHash: verified.manifestHash,
        createNew: false)
    else { return false }
    return remove(verified, manifestHash: markedHash)
  }

  /// Every complete snapshot in the vault whose manifest passes the checks, newest first.
  func list() -> [RevisionSnapshot] {
    candidates().map { $0.snapshot }.filter { $0.manifest.state == "complete" }
      .sorted(by: Self.newestFirst)
  }

  /// Every manifest under the backups folder that parses and follows the rules, with
  /// the hash of the manifest file as it was read.
  private func candidates() -> [(snapshot: RevisionSnapshot, hash: String)] {
    (store.listFiles(under: Self.backupsRoot) ?? [])
      .filter { file in
        file.path.hasSuffix("/manifest.json")
          && (file.size.map { $0 <= UInt64(Self.maxManifestBytes) } ?? true)
      }
      .compactMap { file in
        guard let raw = store.readRawFile(path: file.path),
          let manifest = Self.trustedManifest(raw.text, at: file.path)
        else { return nil }
        return (RevisionSnapshot(manifestPath: file.path, manifest: manifest), raw.hash)
      }
  }

  private static func newestFirst(_ left: RevisionSnapshot, _ right: RevisionSnapshot) -> Bool {
    if left.manifest.createdAt != right.manifest.createdAt {
      return left.manifest.createdAt > right.manifest.createdAt
    }
    return left.manifestPath < right.manifestPath
  }

  private static func newestFirst(_ left: Verified, _ right: Verified) -> Bool {
    newestFirst(left.snapshot, right.snapshot)
  }

  /// A snapshot whose folder holds only its manifest and its copies, each copy with the
  /// hash the manifest recorded. `copies` lists the ones present.
  private struct Verified {
    let snapshot: RevisionSnapshot
    let manifestHash: String
    let copies: [(path: String, hash: String)]
    let expectedPaths: Set<String>
  }

  private func verify(
    _ candidate: (snapshot: RevisionSnapshot, hash: String), allowMissing: Bool
  ) -> Verified? {
    let manifest = candidate.snapshot.manifest
    let root = Self.snapshotRoot(createdAt: manifest.createdAt, id: manifest.id)
    guard let entries = store.listFiles(under: root) else { return nil }
    let expectedPaths = Set(["\(root)/manifest.json"] + manifest.files.map { $0.snapshotPath })
    let sizes = Dictionary(
      entries.map { ($0.path, $0.size) }, uniquingKeysWith: { first, _ in first })
    // Only the manifest and its copies, and with `allowMissing` false, all of them.
    guard sizes.keys.contains("\(root)/manifest.json"),
      sizes.keys.allSatisfy({ expectedPaths.contains($0) }),
      allowMissing || sizes.count == expectedPaths.count
    else { return nil }
    let present = manifest.files.filter { sizes[$0.snapshotPath] != nil }
    let listedSizes = present.compactMap { sizes[$0.snapshotPath] ?? nil }
    guard Self.withinLimits(listedSizes), let copies = hashedCopies(present) else { return nil }
    return Verified(
      snapshot: candidate.snapshot, manifestHash: candidate.hash, copies: copies,
      expectedPaths: expectedPaths)
  }

  /// Whether sizes fit the per-file and total limits, checked before anything is read.
  private static func withinLimits(_ sizes: [UInt64]) -> Bool {
    var total: UInt64 = 0
    for size in sizes {
      total += size
      guard size <= UInt64(maxFileBytes), total <= UInt64(maxTotalBytes) else { return false }
    }
    return true
  }

  /// Each copy's path and hash, or nil if one can't be read, is over the limits, or no
  /// longer has the hash its manifest recorded.
  private func hashedCopies(_ files: [RevisionFile]) -> [(path: String, hash: String)]? {
    var total = 0
    var copies: [(path: String, hash: String)] = []
    for file in files {
      guard let bytes = store.readFileBytes(path: file.snapshotPath),
        bytes.count <= Self.maxFileBytes
      else { return nil }
      total += bytes.count
      let hash = VaultExporter.sha256Hex(bytes)
      guard total <= Self.maxTotalBytes, hash == file.hash else { return nil }
      copies.append((file.snapshotPath, hash))
    }
    return copies
  }

  /// Remove a verified snapshot: its copies, deepest first, then its manifest. Stops if
  /// a file appeared in the folder since it was verified.
  private func remove(_ verified: Verified, manifestHash: String) -> Bool {
    let root = (verified.snapshot.manifestPath as NSString).deletingLastPathComponent
    func onlyExpectedFiles() -> Bool {
      guard let entries = store.listFiles(under: root) else { return false }
      return entries.allSatisfy { verified.expectedPaths.contains($0.path) }
    }
    guard onlyExpectedFiles() else { return false }
    let deepestFirst = verified.copies.sorted {
      $0.path.count != $1.path.count ? $0.path.count > $1.path.count : $0.path < $1.path
    }
    for copy in deepestFirst {
      guard store.removeFile(path: copy.path, expectedHash: copy.hash) else { return false }
    }
    guard onlyExpectedFiles() else { return false }
    return store.removeFile(path: verified.snapshot.manifestPath, expectedHash: manifestHash)
  }

  /// What restoring `snapshot` would write, read from the vault now rather than from
  /// the listed copy: nil unless its manifest and copies still pass the checks. Each
  /// file carries the hash it has now (nil if it's gone), so a restore that finds it
  /// changed since refuses rather than overwriting.
  func planRestore(_ snapshot: RevisionSnapshot) -> RestorePlan? {
    guard
      let candidate = candidates().first(where: {
        $0.snapshot.manifestPath == snapshot.manifestPath
          && $0.snapshot.manifest.state == "complete"
      }),
      let verified = verify(candidate, allowMissing: false)
    else { return nil }
    var files: [RestorePlan.File] = []
    for file in verified.snapshot.manifest.files {
      let current: String?
      if let bytes = store.readFileBytes(path: file.originalPath) {
        current = VaultExporter.sha256Hex(bytes)
      } else if store.fileExists(path: file.originalPath) == false {
        current = nil
      } else {
        // There but unreadable: planning it as missing would only fail at the write.
        return nil
      }
      files.append(
        RestorePlan.File(
          originalPath: file.originalPath, snapshotPath: file.snapshotPath, copyHash: file.hash,
          currentHash: current))
    }
    return RestorePlan(snapshot: verified.snapshot, files: files)
  }

  /// Write a plan's changed copies back to their original paths in one atomic batch.
  /// The snapshot is checked again first, manifest and every copy, and must still say
  /// what the plan said; each write expects the file as the plan found it, so nothing
  /// is written if any of them changed.
  @discardableResult
  func restore(_ plan: RestorePlan) -> Bool {
    func copies(_ files: [RestorePlan.File]) -> [String] {
      files.map { "\($0.originalPath)\u{0}\($0.snapshotPath)\u{0}\($0.copyHash)" }
    }
    guard let fresh = planRestore(plan.snapshot), copies(fresh.files) == copies(plan.files)
    else { return false }
    var writes: [BatchWrite] = []
    for file in plan.changes {
      guard let bytes = store.readFileBytes(path: file.snapshotPath),
        VaultExporter.sha256Hex(bytes) == file.copyHash
      else { return false }
      writes.append(
        BatchWrite(
          path: file.originalPath, bytes: bytes, expectedHash: file.currentHash,
          expectedMissing: file.currentHash == nil))
    }
    guard !writes.isEmpty else { return true }
    return store.writeBatch(expectedRevision: store.currentRevision(), writes: writes)
  }

  /// Plan and restore in one go.
  @discardableResult
  func restore(_ snapshot: RevisionSnapshot) -> Bool {
    guard let plan = planRestore(snapshot) else { return false }
    return restore(plan)
  }
}

// The manifest rules, ported from `revisions.ts` so both apps trust the same snapshots.
extension RevisionStore {
  static let maxFiles = 9_999
  static let maxFileBytes = 64 * 1_024 * 1_024
  static let maxTotalBytes = 512 * 1_024 * 1_024
  static let maxManifestBytes = 2 * 1_024 * 1_024
  static let reasons: Set<String> = [
    RevisionReason.migration, RevisionReason.multiFileRename,
    RevisionReason.conflictResolution, RevisionReason.seasonClose,
  ]
  static let states: Set<String> = ["writing", "complete", "incomplete", "pruning"]

  /// The folder a snapshot lives in: `.studio/backups/<day>/<timestamp>--<id>`, with the
  /// timestamp's colons and first dot turned to dashes and the id escaped as
  /// `encodeURIComponent` does.
  static func snapshotRoot(createdAt: String, id: String) -> String {
    let day = String(createdAt.prefix(10))
    var stamp = createdAt.replacingOccurrences(of: ":", with: "-")
    if let dot = stamp.firstIndex(of: ".") { stamp.replaceSubrange(dot...dot, with: "-") }
    let unreserved = CharacterSet(
      charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
    let escaped = id.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
    return "\(backupsRoot)/\(day)/\(stamp)--\(escaped)"
  }

  /// The manifest at `path` if it is within the size limit and follows every rule. The
  /// same check decides what `snapshot` may write and what `list` and `prune` trust.
  static func trustedManifest(_ text: String, at path: String, maxBytes: Int = maxManifestBytes)
    -> RevisionManifest?
  {
    guard text.utf8.count <= maxBytes else { return nil }
    return parseManifest(text, at: path)
  }

  /// The manifest at `path`, or nil unless it follows every rule: a known version,
  /// reason and state, a timestamp written as `toISOString` writes it, a path that
  /// matches its own folder, and copies that sit in that folder under `files/`, one per
  /// safe original path, each with a lower-case SHA-256.
  static func parseManifest(_ text: String, at path: String) -> RevisionManifest? {
    guard let data = text.data(using: .utf8),
      let manifest = try? JSONDecoder().decode(RevisionManifest.self, from: data),
      manifest.version == 1, !manifest.id.isEmpty, reasons.contains(manifest.reason),
      date(fromCanonical: manifest.createdAt) != nil, states.contains(manifest.state),
      manifest.files.count <= maxFiles
    else { return nil }
    let root = snapshotRoot(createdAt: manifest.createdAt, id: manifest.id)
    // Swift's == ignores Unicode normalisation; these must be the same bytes.
    guard sameBytes(path, "\(root)/manifest.json") else { return nil }
    var originals = Set<String>()
    var copies = Set<String>()
    for file in manifest.files {
      guard isSafeUserPath(file.originalPath),
        sameBytes(file.snapshotPath, "\(root)/files/\(file.originalPath)"),
        isSHA256(file.hash),
        originals.insert(file.originalPath).inserted,
        copies.insert(file.snapshotPath).inserted
      else { return nil }
    }
    return manifest
  }

  /// A relative path to a person's file: no empty, `.` or `..` segment, nothing under
  /// `.studio` or a `.studio-` folder (in any case), no backslash, NUL or drive letter.
  static func isSafeUserPath(_ path: String) -> Bool {
    guard !path.isEmpty, !path.contains("\0"), !path.hasPrefix("/"), !path.hasSuffix("/"),
      !path.contains("\\"), path.range(of: "^[A-Za-z]:", options: .regularExpression) == nil
    else { return false }
    return path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { segment in
      let folded = segment.lowercased()
      return !segment.isEmpty && segment != "." && segment != ".."
        && folded != ".studio" && !folded.hasPrefix(".studio-")
    }
  }

  private static func sameBytes(_ left: String, _ right: String) -> Bool {
    left.utf8.elementsEqual(right.utf8)
  }

  private static func isSHA256(_ value: String) -> Bool {
    value.utf8.count == 64
      && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }

  /// The date of a timestamp written exactly as JavaScript's `toISOString` writes one
  /// (`2026-08-29T10:00:00.000Z`), or nil for any other spelling.
  static func date(fromCanonical value: String) -> Date? {
    guard
      value.range(
        of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#, options: .regularExpression) != nil
    else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: value), formatter.string(from: date) == value else {
      return nil
    }
    return date
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
