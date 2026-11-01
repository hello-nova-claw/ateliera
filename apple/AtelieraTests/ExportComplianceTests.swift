import XCTest

@testable import Ateliera

// Ateliera hashes files (SHA-256) but encrypts nothing, so both the app and its widget
// declare no non-exempt encryption, and TestFlight uploads skip the export-compliance
// question.
final class ExportComplianceTests: XCTestCase {
  private let appBundle = Bundle(for: VaultStore.self)

  func testTheAppDeclaresNoNonExemptEncryption() {
    XCTAssertEqual(
      appBundle.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)
  }

  func testTheWidgetDeclaresNoNonExemptEncryption() throws {
    #if os(iOS)
      let widget = try XCTUnwrap(
        appBundle.builtInPlugInsURL?.appendingPathComponent("AtelieraWidgets.appex"))
      let info = try XCTUnwrap(Bundle(url: widget)?.infoDictionary)
      XCTAssertEqual(info["ITSAppUsesNonExemptEncryption"] as? Bool, false)
    #endif
  }
}
