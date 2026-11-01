import XCTest

@testable import Ateliera

// Overlapping asks for the device's location (launch, then Settings' "Use my location")
// share one request, and every caller gets the answer: none is left waiting forever.
@MainActor
final class CoalescedRequestTests: XCTestCase {
  func testOverlappingCallersAllGetTheAnswerFromOneRequest() async {
    let request = CoalescedRequest<Int?>()
    var starts = 0
    async let first = request.value { starts += 1 }
    async let second = request.value { starts += 1 }
    // Let both callers reach the request before it finishes.
    while request.waiting < 2 { await Task.yield() }
    request.finish(42)

    let answers = await [first, second]
    XCTAssertEqual(answers, [42, 42])
    XCTAssertEqual(starts, 1)
    XCTAssertEqual(request.waiting, 0)
  }

  func testALaterCallerStartsAFreshRequest() async {
    let request = CoalescedRequest<Int?>()
    var starts = 0
    async let first = request.value { starts += 1 }
    while request.waiting < 1 { await Task.yield() }
    request.finish(nil)
    let firstAnswer = await first
    XCTAssertNil(firstAnswer)

    async let second = request.value { starts += 1 }
    while request.waiting < 1 { await Task.yield() }
    request.finish(7)
    let secondAnswer = await second
    XCTAssertEqual(secondAnswer, 7)
    XCTAssertEqual(starts, 2)
  }
}
