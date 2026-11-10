// Replaces each shot in <head dir> that looks the same as main's copy with main's file, so
// the byte comparison in bin/screenshots.mjs counts it as unchanged. Blurred materials and
// JPEG encoding shift a few levels between identical runs; a real change moves a pixel by
// more than the tolerance.
//
// Usage (macOS): swift bin/match-shots.swift <main dir> <head dir>
import CoreGraphics
import Foundation
import ImageIO

let tolerance = 24

func pixels(_ url: URL) -> (width: Int, height: Int, bytes: [UInt8])? {
  guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else { return nil }
  let width = image.width
  let height = image.height
  var bytes = [UInt8](repeating: 0, count: width * height * 4)
  guard
    let context = CGContext(
      data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { return nil }
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return (width, height, bytes)
}

func looksTheSame(_ first: URL, _ second: URL) -> Bool {
  guard let one = pixels(first), let two = pixels(second),
    one.width == two.width, one.height == two.height
  else { return false }
  for index in 0..<one.bytes.count
  where abs(Int(one.bytes[index]) - Int(two.bytes[index])) > tolerance {
    return false
  }
  return true
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  print("Usage: swift bin/match-shots.swift <main dir> <head dir>")
  exit(2)
}
let main = URL(fileURLWithPath: arguments[1])
let head = URL(fileURLWithPath: arguments[2])
let files = (try? FileManager.default.contentsOfDirectory(atPath: head.path)) ?? []
var matched = 0
for name in files {
  let ours = head.appendingPathComponent(name)
  let theirs = main.appendingPathComponent(name)
  guard FileManager.default.fileExists(atPath: theirs.path),
    !FileManager.default.contentsEqual(atPath: ours.path, andPath: theirs.path),
    looksTheSame(ours, theirs)
  else { continue }
  _ = try? FileManager.default.removeItem(at: ours)
  try FileManager.default.copyItem(at: theirs, to: ours)
  matched += 1
}
print("Matched \(matched) shots to main's.")
