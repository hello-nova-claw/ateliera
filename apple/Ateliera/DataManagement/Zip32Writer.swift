import Foundation

// A minimal store-only (no compression) ZIP32 writer, byte-for-byte matching
// `createZip32` in `zip32.ts` so the web app can read a native export. Little-endian
// throughout; CRC-32 is IEEE (reflected polynomial 0xEDB88320).
enum Zip32 {
  static let maxEntryBytes = 64 * 1024 * 1024
  static let maxArchiveBytes = 512 * 1024 * 1024
  static let maxEntryCount = 10_000

  enum Zip32Error: Error { case tooLarge }

  static func crc32(_ bytes: Data) -> UInt32 {
    var crc: UInt32 = 0xFFFF_FFFF
    for byte in bytes {
      crc ^= UInt32(byte)
      for _ in 0..<8 {
        let mask: UInt32 = (crc & 1) != 0 ? 0xFFFF_FFFF : 0
        crc = (crc >> 1) ^ (0xEDB8_8320 & mask)
      }
    }
    return crc ^ 0xFFFF_FFFF
  }

  private static func le16(_ value: Int) -> [UInt8] {
    [UInt8(value & 0xFF), UInt8((value >> 8) & 0xFF)]
  }

  private static func le32(_ value: UInt32) -> [UInt8] {
    [
      UInt8(value & 0xFF), UInt8((value >> 8) & 0xFF),
      UInt8((value >> 16) & 0xFF), UInt8((value >> 24) & 0xFF),
    ]
  }

  static func create(_ files: [(path: String, bytes: Data)]) throws -> Data {
    if files.count > maxEntryCount { throw Zip32Error.tooLarge }
    var local = Data()
    var central = Data()
    var offset = 0
    for (path, bytes) in files {
      let name = Array(path.utf8)
      if name.count > 0xFFFF || bytes.count > maxEntryBytes { throw Zip32Error.tooLarge }
      let checksum = crc32(bytes)
      let size = UInt32(bytes.count)

      var localHeader = [UInt8]()
      localHeader += le32(0x0403_4B50) + le16(20) + le16(0x0800) + le16(0) + le16(0) + le16(0)
      localHeader += le32(checksum) + le32(size) + le32(size) + le16(name.count) + le16(0) + name
      local.append(contentsOf: localHeader)
      local.append(bytes)
      let localLength = localHeader.count + bytes.count

      var centralHeader = [UInt8]()
      centralHeader += le32(0x0201_4B50) + le16(20) + le16(20) + le16(0x0800) + le16(0) + le16(0)
        + le16(0)
      centralHeader += le32(checksum) + le32(size) + le32(size) + le16(name.count) + le16(0)
        + le16(0) + le16(0) + le16(0) + le32(0) + le32(UInt32(offset)) + name
      central.append(contentsOf: centralHeader)

      offset += localLength
    }

    var archive = local
    archive.append(central)
    var eocd = [UInt8]()
    eocd += le32(0x0605_4B50) + le16(0) + le16(0) + le16(files.count) + le16(files.count)
    eocd += le32(UInt32(central.count)) + le32(UInt32(offset)) + le16(0)
    archive.append(contentsOf: eocd)

    if archive.count > maxArchiveBytes { throw Zip32Error.tooLarge }
    return archive
  }
}
