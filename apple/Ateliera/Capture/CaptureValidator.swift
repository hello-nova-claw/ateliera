import Foundation

// Pre-write validation for classified capture, mirroring `studio-service.ts`
// capture(). The typed `CaptureDestination` makes conflicting destinations
// unrepresentable, so the remaining checks are: a non-empty body, a decision
// horizon only on the Decisions anchor, an http(s) wisdom source URL, and a
// theme cap.
enum CaptureValidationError: Error, Equatable {
  case emptyBody
  case decisionHorizonOutsideDecisionsAnchor
  case wisdomSourceURLScheme(String)
  case wisdomTooManyThemes
}

enum CaptureValidator {
  static let maxThemes = 40

  static func validate(body: String, destination: CaptureDestination) throws {
    if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      throw CaptureValidationError.emptyBody
    }
    switch destination {
    case .landscape(_, let anchor, let horizon):
      if horizon != nil && anchor != .decisions {
        throw CaptureValidationError.decisionHorizonOutsideDecisionsAnchor
      }
    case .wisdom(_, let themes, let source, _):
      if Set(themes).count > maxThemes { throw CaptureValidationError.wisdomTooManyThemes }
      if let url = source?.url, !url.isEmpty {
        let lower = url.lowercased()
        if !lower.hasPrefix("http://") && !lower.hasPrefix("https://") {
          throw CaptureValidationError.wisdomSourceURLScheme(url)
        }
      }
    default:
      break
    }
  }
}
