import XCTest

@testable import Ateliera

// P9: the first-visit tour steps + seen-persistence.
final class OnboardingTests: XCTestCase {
  func testTourStepOrder() {
    XCTAssertEqual(
      TourStep.allCases.map { $0.rawValue },
      ["foyer", "landscape", "season", "uncharted", "reflection"])
  }

  func testEveryStepHasCopy() {
    for step in TourStep.allCases {
      XCTAssertFalse(step.title.isEmpty)
      XCTAssertFalse(step.body.isEmpty)
    }
  }

  func testSeenPersistsPerVault() {
    let defaults = UserDefaults(suiteName: "tour-\(UUID().uuidString)")!
    let store = OnboardingStore(defaults: defaults)
    XCTAssertFalse(store.hasSeenTour(studioId: "vault-1"))
    store.markTourSeen(studioId: "vault-1")
    XCTAssertTrue(store.hasSeenTour(studioId: "vault-1"))
    // A different vault hasn't seen it.
    XCTAssertFalse(store.hasSeenTour(studioId: "vault-2"))
  }
}
