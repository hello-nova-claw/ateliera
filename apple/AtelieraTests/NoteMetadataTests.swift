import XCTest

@testable import Ateliera

// The typed vocabulary must match @studio/domain's raw values exactly, since
// those strings are what gets written to (and read from) the shared vault.
final class NoteMetadataTests: XCTestCase {
  func testSemanticTypeRawValuesMatchWebSchema() {
    XCTAssertEqual(
      SemanticType.allCases.map(\.rawValue),
      ["foundations", "vision", "growth", "reflection", "celebration", "uncharted"])
  }

  func testNoteStatusRawValuesMatchWebSchema() {
    XCTAssertEqual(
      NoteStatus.allCases.map(\.rawValue),
      ["draft", "active", "resting", "archived", "trashed"])
  }

  func testLandscapeAnchorRawValuesMatchWebSchema() {
    XCTAssertEqual(
      LandscapeAnchor.allCases.map(\.rawValue),
      ["vision", "identity-values-feelings", "decisions", "practices", "structure-strategy"])
  }

  func testSensitivityAndAiAccessMatchWebSchema() {
    XCTAssertEqual(Sensitivity.allCases.map(\.rawValue), ["private", "sensitive"])
    XCTAssertEqual(AiAccess.allCases.map(\.rawValue), ["never", "ask", "selected", "scoped"])
  }

  func testDefaultLifeAreaIdsMatchDomainPackage() {
    XCTAssertEqual(
      NoteMetadata.defaultLifeAreas.map(\.id),
      [
        "family", "home", "health-wellbeing", "work-business", "money", "creativity",
        "relationships-community", "adventure", "spirituality", "learning",
      ])
  }
}
