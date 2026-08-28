import XCTest

@testable import Ateliera

final class LifeAreaConfigTests: XCTestCase {

  // MARK: - Serialize golden bytes

  func testSerializeGoldenTwoAreas() {
    let areas = [
      LifeAreaPreference(id: "family", title: "Family", hidden: false, order: 0),
      LifeAreaPreference(id: "home", title: "Home", hidden: false, order: 1),
    ]
    let expected =
      "{\n  \"version\": 1,\n  \"areas\": [\n    {\n      \"id\": \"family\",\n      \"title\": \"Family\",\n      \"hidden\": false,\n      \"order\": 0\n    },\n    {\n      \"id\": \"home\",\n      \"title\": \"Home\",\n      \"hidden\": false,\n      \"order\": 1\n    }\n  ]\n}\n"
    XCTAssertEqual(LifeAreaConfig.serialize(areas), expected)
  }

  // MARK: - Round-trip defaults

  func testRoundTripDefaults() {
    let defaults = LifeAreaConfig.defaults()
    let serialized = LifeAreaConfig.serialize(defaults)
    let result = LifeAreaConfig.parse(serialized)
    guard case .ok(let parsed) = result else {
      XCTFail("Expected .ok, got \(result)")
      return
    }
    XCTAssertEqual(parsed, defaults)
  }

  // MARK: - Version > 1

  func testVersionTwoReturnsUnsupported() {
    let json = "{\"version\":2,\"areas\":[]}"
    let result = LifeAreaConfig.parse(json)
    XCTAssertEqual(result, .unsupported(2))
  }

  // MARK: - Malformed JSON

  func testMalformedJsonReturnsRepair() {
    let result = LifeAreaConfig.parse("not json {{{")
    XCTAssertEqual(result, .repair)
  }

  // MARK: - Slug generation

  func testSlugBodyAndEnergy() {
    let slug = LifeAreaConfig.safeAreaId(title: "Body & energy", existing: [])
    XCTAssertEqual(slug, "body-energy")
  }

  func testSlugFamilyCollision() {
    // "family" is in defaults, so it should produce "family-2".
    let slug = LifeAreaConfig.safeAreaId(title: "Family", existing: LifeAreaConfig.defaults())
    XCTAssertEqual(slug, "family-2")
  }

  // MARK: - Too many areas

  func testThirtyThreeAreasReturnsRepair() {
    // Build a JSON with 33 areas — one over the max of 32.
    var areasJson: [String] = []
    for i in 0..<33 {
      areasJson.append("""
        {"id":"area\(i)","title":"Area \(i)","hidden":false,"order":\(i)}
        """)
    }
    let json = "{\"version\":1,\"areas\":[\(areasJson.joined(separator: ","))]}"
    let result = LifeAreaConfig.parse(json)
    XCTAssertEqual(result, .repair)
  }

  // MARK: - Duplicate id

  func testDuplicateIdReturnsRepair() {
    let json = """
      {"version":1,"areas":[
        {"id":"family","title":"Family","hidden":false,"order":0},
        {"id":"family","title":"Home","hidden":false,"order":1}
      ]}
      """
    let result = LifeAreaConfig.parse(json)
    XCTAssertEqual(result, .repair)
  }

  // MARK: - Duplicate order

  func testDuplicateOrderReturnsRepair() {
    let json = """
      {"version":1,"areas":[
        {"id":"family","title":"Family","hidden":false,"order":0},
        {"id":"home","title":"Home","hidden":false,"order":0}
      ]}
      """
    let result = LifeAreaConfig.parse(json)
    XCTAssertEqual(result, .repair)
  }

  // MARK: - Duplicate title case-insensitive

  func testDuplicateTitleCaseInsensitiveReturnsRepair() {
    let json = """
      {"version":1,"areas":[
        {"id":"family","title":"Family","hidden":false,"order":0},
        {"id":"home","title":"FAMILY","hidden":false,"order":1}
      ]}
      """
    let result = LifeAreaConfig.parse(json)
    XCTAssertEqual(result, .repair)
  }
}
