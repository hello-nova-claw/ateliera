import Foundation

// Parse a store-only ZIP32 (as produced by `Zip32.create` / the web `createZip32`)
// into its entries, validating magic, method, CRC-32, safe entry paths and that no path
// appears twice, as `parseZip32` does. Only the stored (uncompressed) method is
// supported — the export format never compresses.
//
// It enforces the web's `ZIP32_LIMITS` before and while it reads, and indexes the
// archive's own bytes rather than copying them, so an import holds little more than the
// archive and its entries.
enum Zip32Reader {
  enum ReaderError: Error { case invalid, unsupported, checksumFailed, tooLarge }

  struct Limits {
    var maxArchiveBytes = Zip32.maxArchiveBytes
    var maxEntryBytes = Zip32.maxEntryBytes
    var maxTotalBytes = Zip32.maxArchiveBytes

    static let standard = Limits()
  }

  static func parse(_ data: Data, limits: Limits = .standard) throws -> [(
    path: String, bytes: Data
  )] {
    guard data.count <= limits.maxArchiveBytes else { throw ReaderError.tooLarge }
    let bytes = Bytes(data: data)
    var files: [(path: String, bytes: Data)] = []
    var seen = Set<String>()
    var total = 0
    var offset = 0
    while offset + 4 <= bytes.count {
      let signature = bytes.u32(offset)
      // The central directory and its end record follow the last entry.
      if signature == 0x0201_4B50 || signature == 0x0605_4B50 { break }
      guard signature == 0x0403_4B50 else { throw ReaderError.invalid }
      let entry = try localEntry(in: bytes, at: offset, limits: limits)
      total += entry.content.count
      guard total <= limits.maxTotalBytes else { throw ReaderError.tooLarge }
      guard validEntryPath(entry.name), seen.insert(entry.name).inserted else {
        throw ReaderError.invalid
      }
      files.append((entry.name, entry.content))
      offset = entry.end
      if files.count > Zip32.maxEntryCount { throw ReaderError.invalid }
    }
    return files
  }

  /// Little-endian reads into the archive's own bytes, whatever index its `Data` starts at.
  private struct Bytes {
    let data: Data
    var count: Int { data.count }

    func u16(_ offset: Int) -> Int {
      let base = data.startIndex + offset
      return Int(data[base]) | (Int(data[base + 1]) << 8)
    }

    func u32(_ offset: Int) -> UInt32 {
      let base = data.startIndex + offset
      return UInt32(data[base]) | (UInt32(data[base + 1]) << 8) | (UInt32(data[base + 2]) << 16)
        | (UInt32(data[base + 3]) << 24)
    }

    func slice(_ offset: Int, _ length: Int) -> Data {
      data[(data.startIndex + offset)..<(data.startIndex + offset + length)]
    }
  }

  private struct LocalEntry {
    let name: String
    let content: Data
    let end: Int
  }

  /// The stored entry whose local header starts at `offset`, checked for its method,
  /// bounds, size limit, UTF-8 name and CRC-32.
  private static func localEntry(in bytes: Bytes, at offset: Int, limits: Limits) throws
    -> LocalEntry
  {
    guard offset + 30 <= bytes.count else { throw ReaderError.invalid }
    guard bytes.u16(offset + 8) == 0 else { throw ReaderError.unsupported }
    let size = Int(bytes.u32(offset + 18))
    guard size <= limits.maxEntryBytes else { throw ReaderError.tooLarge }
    let nameLength = bytes.u16(offset + 26)
    let dataStart = offset + 30 + nameLength + bytes.u16(offset + 28)
    guard dataStart + size <= bytes.count else { throw ReaderError.invalid }
    // Invalid UTF-8 is refused, as the web's fatal decoder refuses it.
    guard let name = String(bytes: bytes.slice(offset + 30, nameLength), encoding: .utf8) else {
      throw ReaderError.invalid
    }
    let content = Data(bytes.slice(dataStart, size))
    guard Zip32.crc32(content) == bytes.u32(offset + 14) else { throw ReaderError.checksumFailed }
    return LocalEntry(name: name, content: content, end: dataStart + size)
  }

  // Matches `validateEntryPath` in zip32.ts: relative, no traversal, no drive/scheme.
  static func validEntryPath(_ path: String) -> Bool {
    if path.isEmpty || path.contains("\0") || path.contains("\\") || path.hasPrefix("/")
      || path.hasSuffix("/") || path.range(of: "^[A-Za-z]:", options: .regularExpression) != nil
    {
      return false
    }
    for segment in path.components(separatedBy: "/") {
      if segment.isEmpty || segment == "." || segment == ".." { return false }
      if segment.lowercased().hasPrefix(".studio-") { return false }
    }
    return true
  }
}
