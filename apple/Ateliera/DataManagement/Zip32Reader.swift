import Foundation

// Parse a store-only ZIP32 (as produced by `Zip32.create` / the web `createZip32`)
// into its entries, validating magic, method, CRC-32, and safe entry paths. Only the
// stored (uncompressed) method is supported — the export format never compresses.
enum Zip32Reader {
  enum ReaderError: Error { case invalid, unsupported, checksumFailed }

  static func parse(_ data: Data) throws -> [(path: String, bytes: Data)] {
    let bytes = [UInt8](data)
    func u16(_ offset: Int) -> Int { Int(bytes[offset]) | (Int(bytes[offset + 1]) << 8) }
    func u32(_ offset: Int) -> UInt32 {
      UInt32(bytes[offset]) | (UInt32(bytes[offset + 1]) << 8) | (UInt32(bytes[offset + 2]) << 16)
        | (UInt32(bytes[offset + 3]) << 24)
    }

    var files: [(path: String, bytes: Data)] = []
    var i = 0
    while i + 4 <= bytes.count {
      let signature = u32(i)
      if signature == 0x0403_4B50 {
        guard i + 30 <= bytes.count else { throw ReaderError.invalid }
        let method = u16(i + 8)
        let crcStored = u32(i + 14)
        let compSize = Int(u32(i + 18))
        let nameLen = u16(i + 26)
        let extraLen = u16(i + 28)
        let nameStart = i + 30
        let dataStart = nameStart + nameLen + extraLen
        guard method == 0 else { throw ReaderError.unsupported }
        guard dataStart + compSize <= bytes.count else { throw ReaderError.invalid }
        let name = String(decoding: bytes[nameStart..<nameStart + nameLen], as: UTF8.self)
        let content = Data(bytes[dataStart..<dataStart + compSize])
        guard Zip32.crc32(content) == crcStored else { throw ReaderError.checksumFailed }
        guard validEntryPath(name) else { throw ReaderError.invalid }
        files.append((name, content))
        i = dataStart + compSize
        if files.count > Zip32.maxEntryCount { throw ReaderError.invalid }
      } else if signature == 0x0201_4B50 || signature == 0x0605_4B50 {
        break  // central directory / end of central directory
      } else {
        throw ReaderError.invalid
      }
    }
    return files
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
