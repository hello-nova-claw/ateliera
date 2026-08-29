import CryptoKit
import Foundation

// Produce a portable ZIP backup of the vault, matching `export.ts`: list every file,
// classify by `PortableManifest.disposition`, collect SHA-256s, build the manifest,
// and pack the included files + manifest into a ZIP32 the web app can read.
enum VaultExporter {
  struct Plan {
    let files: [(path: String, bytes: Data)]
    let manifestFiles: [ManifestFile]
    let excludedCaches: [String]
  }

  static func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  static func plan(store: VaultStore) -> Plan {
    let paths = store.listAllPaths().sorted { $0.localizedCompare($1) == .orderedAscending }
    var included: [(path: String, bytes: Data)] = []
    var excludedCaches: [String] = []
    for path in paths {
      switch PortableManifest.disposition(path) {
      case .include:
        if let data = store.readFileBytes(path: path) { included.append((path, data)) }
      case .cache:
        excludedCaches.append(path)
      case .internalOnly, .blocked:
        continue
      }
    }
    let manifestFiles = included.map {
      ManifestFile(path: $0.path, sha256: sha256Hex($0.bytes), size: $0.bytes.count)
    }
    return Plan(files: included, manifestFiles: manifestFiles, excludedCaches: excludedCaches)
  }

  static func export(store: VaultStore, generatedAt: String) throws -> Data {
    let plan = plan(store: store)
    let manifest = PortableManifest.serialize(
      files: plan.manifestFiles, excludedCaches: plan.excludedCaches, generatedAt: generatedAt)
    var zipFiles = plan.files
    zipFiles.append((PortableManifest.manifestPath, Data(manifest.utf8)))
    return try Zip32.create(zipFiles)
  }
}
