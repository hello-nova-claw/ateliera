import XCTest

@testable import Ateliera

// The Identity and Landscape prompt libraries are content: Content/identity-prompts.json
// and Content/landscape-prompts.json (the same files as packages/domain/src/content/),
// plus the native-only seeded Landscape prompts in Content/landscape-seeded-prompts.json.
final class PromptsContentTests: XCTestCase {
  func testIdentityPromptsComeFromTheirDataFile() throws {
    let library = try XCTUnwrap(try contentResource("identity-prompts") as? [String: String])
    XCTAssertEqual(library.count, 7)
    for section in IdentitySection.allCases { XCTAssertEqual(section.prompt, library[section.rawValue]) }
    XCTAssertEqual(IdentitySection.alreadyTrue.prompt, "What already feels quietly and honestly true?")
  }

  func testLandscapePromptsComeFromTheirDataFile() throws {
    let library = try XCTUnwrap(try contentResource("landscape-prompts") as? [String: String])
    XCTAssertEqual(library.count, 5)
    for anchor in LandscapeAnchor.allCases { XCTAssertEqual(anchor.prompt, library[anchor.rawValue]) }
  }

  func testSeededLandscapePromptsComeFromTheirDataFile() throws {
    let library = try XCTUnwrap(
      try contentResource("landscape-seeded-prompts") as? [String: String])
    XCTAssertEqual(Set(library.keys), Set(LandscapeAnchor.allCases.map(\.rawValue)))
    XCTAssertEqual(
      LandscapeAnchor.vision.prompt(seed: "rested"),
      "If “rested” were already true, what would an ordinary Tuesday look like?")
    XCTAssertEqual(LandscapeAnchor.practices.prompt(seed: " "), LandscapeAnchor.practices.prompt)
  }
}
