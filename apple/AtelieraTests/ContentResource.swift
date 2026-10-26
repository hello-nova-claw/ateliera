import Foundation
import XCTest

// Reads one of the app's bundled content files (Ateliera/Content/*.json) as plain JSON,
// so content tests check the data file itself rather than the code that decodes it.
func contentResource(_ name: String, file: StaticString = #filePath, line: UInt = #line)
  throws -> Any
{
  let url = try XCTUnwrap(
    Bundle.main.url(forResource: name, withExtension: "json"),
    "\(name).json is not bundled with the app", file: file, line: line)
  return try JSONSerialization.jsonObject(with: Data(contentsOf: url))
}

func contentObject(_ name: String, file: StaticString = #filePath, line: UInt = #line)
  throws -> [String: Any]
{
  try XCTUnwrap(
    try contentResource(name, file: file, line: line) as? [String: Any],
    "\(name).json is not a JSON object", file: file, line: line)
}
