import XCTest

@testable import Ateliera

// What the built app declares in its Info.plist, checked on the bundle the tests run in,
// so an App Store requirement can't quietly fall out of project.yml.
final class AppInfoTests: XCTestCase {
  // The raw Info.plist: on an iPhone the bundle API hides the iPad-only (`~ipad`) keys.
  private func appInfo(_ key: String) throws -> Any? {
    let url = Bundle(for: VaultStore.self).bundleURL.appendingPathComponent("Info.plist")
    let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil)
    return (plist as? [String: Any])?[key]
  }

  func testIPadSupportsAllFourOrientationsForMultitasking() throws {
    // iPad multitasking (Split View, Slide Over) needs every orientation, or App Store
    // Connect rejects the upload (ITMS-90474).
    #if os(iOS)
      let orientations = try XCTUnwrap(
        try appInfo("UISupportedInterfaceOrientations~ipad") as? [String])
      XCTAssertEqual(
        Set(orientations),
        [
          "UIInterfaceOrientationPortrait", "UIInterfaceOrientationPortraitUpsideDown",
          "UIInterfaceOrientationLandscapeLeft", "UIInterfaceOrientationLandscapeRight",
        ])
    #endif
  }
}
