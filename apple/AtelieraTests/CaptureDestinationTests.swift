import XCTest

@testable import Ateliera

// P7 (classified capture): destination metadata + portableLifeAreaFolder + validation.
final class CaptureDestinationTests: XCTestCase {
  func testPortableLifeAreaFolderGolden() {
    let cases: [(String, String)] = [
      ("family", "family"),
      ("Work & Money", "Work & Money"),
      ("CON", "Area"),
      ("", "Area"),
      ("Health/Wellbeing", "Health-Wellbeing"),
      ("a<b\tc", "a-b-c"),
      ("  ..trim-me--  ", "trim-me"),
      (String(repeating: "x", count: 70), String(repeating: "x", count: 64)),
    ]
    for (input, expected) in cases {
      XCTAssertEqual(
        CaptureDestination.portableLifeAreaFolder(input), expected, "for \(input.debugDescription)")
    }
  }

  func testFoyerMetadata() {
    let meta = CaptureDestination.foyer(.becoming).metadata
    XCTAssertEqual(meta.cardType, "identity")
    XCTAssertEqual(meta.semanticType, "foundations")
    XCTAssertEqual(meta.rooms, ["foyer", "identity-studio"])
    XCTAssertEqual(meta.status, "active")
    XCTAssertTrue(meta.featured)
    XCTAssertEqual(meta.folder, "Foyer")

    XCTAssertEqual(CaptureDestination.foyer(.feeling).metadata.cardType, "feeling")
    XCTAssertEqual(CaptureDestination.foyer(.feeling).metadata.semanticType, "vision")
  }

  func testLandscapeMetadataAndHorizon() {
    let meta = CaptureDestination.landscape(lifeArea: "family", anchor: .decisions, horizon: .d60)
      .metadata
    XCTAssertEqual(meta.cardType, "decisions")
    XCTAssertEqual(meta.semanticType, "growth")
    XCTAssertEqual(meta.rooms, ["life-landscape"])
    XCTAssertEqual(meta.lifeAreas, ["family"])
    XCTAssertEqual(meta.landscapeAnchor, "decisions")
    XCTAssertEqual(meta.folder, "Life Landscape/family")
    XCTAssertTrue(meta.extraFrontmatter.contains { $0.0 == "decision_horizon" })

    // A non-decisions anchor drops the horizon.
    let vision = CaptureDestination.landscape(lifeArea: "family", anchor: .vision, horizon: .d30)
      .metadata
    XCTAssertTrue(vision.extraFrontmatter.isEmpty)
    XCTAssertEqual(vision.semanticType, "vision")
  }

  func testIdentityMetadata() {
    let meta = CaptureDestination.identity(.alreadyTrue).metadata
    XCTAssertEqual(meta.cardType, "identity-truth")
    XCTAssertEqual(meta.semanticType, "foundations")
    XCTAssertEqual(meta.rooms, ["identity-studio"])
    XCTAssertEqual(meta.folder, "Identity Studio")
  }

  func testWisdomMetadataDedupesThemes() {
    let meta = CaptureDestination.wisdom(
      kind: "question", themes: ["rest", "rest", "identity"],
      source: NoteSource(title: nil, creator: "M", url: "https://x.com"), sourceNoteIds: ["abc"]
    ).metadata
    XCTAssertEqual(meta.cardType, "question")
    XCTAssertEqual(meta.semanticType, "uncharted")
    XCTAssertEqual(meta.rooms, ["wisdom-garden"])
    XCTAssertEqual(meta.tags, ["rest", "identity"])  // de-duped, order preserved
    XCTAssertEqual(meta.sourceNoteIds, ["abc"])
    XCTAssertEqual(meta.folder, "Wisdom Garden")
  }

  func testUnchartedBeyondMetadata() {
    let near = CaptureDestination.uncharted(beyond: false).metadata
    XCTAssertTrue(near.extraFrontmatter.isEmpty)
    let beyond = CaptureDestination.uncharted(beyond: true).metadata
    XCTAssertTrue(beyond.extraFrontmatter.contains { $0.0 == "beyond_gate" })
    XCTAssertEqual(beyond.cardType, "possibility")
    XCTAssertEqual(beyond.semanticType, "uncharted")
  }

  // MARK: - Validation

  func testValidatorRejectsEmptyBody() {
    XCTAssertThrowsError(try CaptureValidator.validate(body: "  ", destination: .quickCapture)) {
      XCTAssertEqual($0 as? CaptureValidationError, .emptyBody)
    }
  }

  func testValidatorRejectsHorizonOutsideDecisions() {
    XCTAssertThrowsError(
      try CaptureValidator.validate(
        body: "x", destination: .landscape(lifeArea: "f", anchor: .vision, horizon: .d30))
    ) { XCTAssertEqual($0 as? CaptureValidationError, .decisionHorizonOutsideDecisionsAnchor) }
  }

  func testValidatorRejectsNonHttpWisdomSource() {
    XCTAssertThrowsError(
      try CaptureValidator.validate(
        body: "x",
        destination: .wisdom(
          kind: "quote", themes: [], source: NoteSource(title: nil, creator: nil, url: "ftp://x"),
          sourceNoteIds: nil))
    ) {
      if case .wisdomSourceURLScheme = ($0 as? CaptureValidationError) {} else {
        XCTFail("wrong error \($0)")
      }
    }
  }

  func testValidatorAcceptsHttpsWisdomSource() {
    XCTAssertNoThrow(
      try CaptureValidator.validate(
        body: "x",
        destination: .wisdom(
          kind: "quote", themes: ["a"], source: NoteSource(title: nil, creator: nil, url: "https://x.com"),
          sourceNoteIds: nil)))
  }

  func testValidatorRejectsTooManyThemes() {
    let themes = (0..<41).map { "t\($0)" }
    XCTAssertThrowsError(
      try CaptureValidator.validate(
        body: "x", destination: .wisdom(kind: "insight", themes: themes, source: nil, sourceNoteIds: nil))
    ) { XCTAssertEqual($0 as? CaptureValidationError, .wisdomTooManyThemes) }
  }
}
