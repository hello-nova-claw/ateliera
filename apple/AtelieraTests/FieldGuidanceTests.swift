import XCTest

@testable import Ateliera

// Field guidance copy is ported verbatim from the web `field-guidance.ts` files.
// These assert a representative sample stays byte-identical, guarding against typos
// and drift between the platforms.
final class FieldGuidanceTests: XCTestCase {
  func testIdentityGuidanceMatchesWeb() {
    XCTAssertEqual(
      IdentitySection.desiredFeelings.guidance,
      FieldGuidance(
        description: "A feeling you want more room for in ordinary days.",
        example: "e.g. Unhurried."))
    XCTAssertEqual(
      IdentitySection.alreadyTrue.guidance.example, "e.g. I rest before I'm depleted, not after.")
    XCTAssertEqual(
      Identity.titleGuidance.description, "Optional. A handful of words to find this by later.")
  }

  func testWisdomGuidanceMatchesWeb() {
    XCTAssertEqual(
      WisdomGuidance.idea.example, "e.g. You don't rise to your goals; you fall to your systems.")
    XCTAssertEqual(
      WisdomGuidance.makeItMine.description,
      "Your own take — what you've observed, how it fits your life.")
  }

  func testSeasonGuidanceMatchesWeb() {
    XCTAssertEqual(
      SeasonGuidance.name.description, "A short name for this chapter — evocative, not a deadline.")
    XCTAssertEqual(SeasonGuidance.feelings.example, "e.g. steady · spacious · warm")
    XCTAssertEqual(
      SeasonGuidance.prioritiesDescription,
      "Up to three areas that deserve the clearest attention now.")
  }

  func testReflectionAndLandscapeGuidanceMatchWeb() {
    XCTAssertEqual(
      ReflectionGuidance.sentenceToKeep.example,
      "e.g. I do my clearest thinking in the first hour, before messages.")
    XCTAssertEqual(
      LandscapeGuidance.newArea.description,
      "A part of your life you want to tend. Five to ten keeps the Landscape spacious.")
  }
}
