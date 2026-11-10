import Foundation

// A thread-safe in-memory ring buffer of recent vault operations, ported from
// `diagnostics.ts`. Errors and successful writes are recorded so a support view can
// show what the Studio has been doing. Capped at 10,000 entries; oldest drop first.
struct DiagnosticEntry: Equatable, Identifiable {
  let id = UUID()
  let operation: String
  let occurredAt: String
  let outcome: String  // "success" | "failure" | "conflict"
  let durationMs: Int?
  let errorCode: String?
  let fileId: String?
  let fileHash: String?

  static func == (lhs: DiagnosticEntry, rhs: DiagnosticEntry) -> Bool {
    lhs.operation == rhs.operation && lhs.occurredAt == rhs.occurredAt
      && lhs.outcome == rhs.outcome && lhs.durationMs == rhs.durationMs
      && lhs.errorCode == rhs.errorCode && lhs.fileId == rhs.fileId && lhs.fileHash == rhs.fileHash
  }
}

final class DiagnosticsRecorder {
  static let maxEntries = 10_000

  private let lock = NSLock()
  private var buffer: [DiagnosticEntry] = []

  func record(_ entry: DiagnosticEntry) {
    lock.lock()
    defer { lock.unlock() }
    buffer.append(entry)
    if buffer.count > Self.maxEntries {
      buffer.removeFirst(buffer.count - Self.maxEntries)
    }
  }

  func record(
    operation: String, outcome: String, errorCode: String? = nil, fileId: String? = nil,
    now: String = NoteFactory.utcTimestamp()
  ) {
    record(
      DiagnosticEntry(
        operation: operation, occurredAt: now, outcome: outcome, durationMs: nil,
        errorCode: errorCode, fileId: fileId, fileHash: nil))
  }

  // The recent entries, newest first.
  var entries: [DiagnosticEntry] {
    lock.lock()
    defer { lock.unlock() }
    return buffer.reversed()
  }

  var count: Int {
    lock.lock()
    defer { lock.unlock() }
    return buffer.count
  }

  func clear() {
    lock.lock()
    defer { lock.unlock() }
    buffer.removeAll()
  }
}
