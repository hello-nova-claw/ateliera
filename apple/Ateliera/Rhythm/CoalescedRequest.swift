import Foundation

// One in-flight request that any number of callers can await. The first caller starts it;
// later callers join it; `finish` answers them all. A second caller used to replace the
// first one's continuation, which then waited forever and leaked.
@MainActor
final class CoalescedRequest<Value> {
  private var waiters: [CheckedContinuation<Value, Never>] = []

  /// How many callers are waiting for the request in flight.
  var waiting: Int { waiters.count }

  func value(start: () -> Void) async -> Value {
    await withCheckedContinuation { continuation in
      waiters.append(continuation)
      if waiters.count == 1 { start() }
    }
  }

  func finish(_ value: Value) {
    let answered = waiters
    waiters = []
    for waiter in answered { waiter.resume(returning: value) }
  }
}
