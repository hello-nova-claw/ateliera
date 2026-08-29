import Foundation

// Autosaved draft recovery, ported from `draft-recovery.ts`. As you edit a note the
// draft is written to `UserDefaults` (which survives an app crash / force-quit on
// iOS); on reopening, if the stored note still matches the hash the draft was based
// on, the unsaved draft is offered for restore. Keyed per vault + note path.
struct DraftRecord: Codable, Equatable {
  let studioId: String
  let path: String
  let title: String?
  let body: String
  let expectedHash: String
  let updatedAt: String
}

enum DraftState: Equatable {
  case none
  case recoverable(DraftRecord)
  case stale(DraftRecord)
}

struct DraftRecovery {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  private func key(studioId: String, path: String) -> String {
    "studio:draft-recovery:\(encode(studioId)):\(encode(path))"
  }

  private func encode(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? value
  }

  func write(_ record: DraftRecord) {
    guard let data = try? JSONEncoder().encode(record) else { return }
    defaults.set(data, forKey: key(studioId: record.studioId, path: record.path))
  }

  func read(studioId: String, path: String) -> DraftRecord? {
    guard let data = defaults.data(forKey: key(studioId: studioId, path: path)) else { return nil }
    return try? JSONDecoder().decode(DraftRecord.self, from: data)
  }

  // The draft is recoverable when the stored note still matches the hash it was
  // based on; otherwise the note moved on and the draft is stale.
  func readForDurable(studioId: String, path: String, durableHash: String) -> DraftState {
    guard let record = read(studioId: studioId, path: path) else { return .none }
    return record.expectedHash == durableHash ? .recoverable(record) : .stale(record)
  }

  func remove(studioId: String, path: String) {
    defaults.removeObject(forKey: key(studioId: studioId, path: path))
  }
}
