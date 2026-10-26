import XCTest

@testable import Ateliera

// Identity, Landscape, Reflection and Season field guidance is content, bundled as
// Content/{identity,landscape,reflection,season}-guidance.json — the same files as
// apps/studio/src/content/.
final class RoomGuidanceContentTests: XCTestCase {
  func testIdentityGuidanceComesFromItsDataFile() throws {
    let library = try contentObject("identity-guidance")
    XCTAssertEqual(Set(library.keys), ["sections", "title"])
    let sections = try XCTUnwrap(library["sections"] as? [String: [String: String]])
    XCTAssertEqual(sections.count, IdentitySection.allCases.count)
    for section in IdentitySection.allCases {
      XCTAssertEqual(section.guidance.description, sections[section.rawValue]?["description"])
      XCTAssertEqual(section.guidance.example, sections[section.rawValue]?["example"])
    }
  }

  func testLandscapeGuidanceComesFromItsDataFile() throws {
    let library = try contentObject("landscape-guidance")
    XCTAssertEqual(Set(library.keys), ["newArea", "renameArea"])
    XCTAssertEqual(LandscapeGuidance.newArea.example, "e.g. Body & energy")
  }

  func testReflectionGuidanceComesFromItsDataFile() throws {
    let library = try contentObject("reflection-guidance")
    XCTAssertEqual(Set(library.keys), ["sentenceToKeep"])
    XCTAssertEqual(
      ReflectionGuidance.sentenceToKeep.example,
      "e.g. I do my clearest thinking in the first hour, before messages.")
  }

  func testSeasonGuidanceComesFromItsDataFile() throws {
    let library = try contentObject("season-guidance")
    XCTAssertEqual(Set(library.keys), ["fields", "priorities"])
    XCTAssertEqual((library["fields"] as? [String: Any])?.count, 16)
    XCTAssertEqual(SeasonGuidance.name.example, "e.g. Quiet foundations")
    XCTAssertEqual(
      SeasonGuidance.prioritiesDescription,
      "Up to three areas that deserve the clearest attention now.")
  }
}
