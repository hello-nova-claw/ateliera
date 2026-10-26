import Foundation

// The first-visit tour: five gentle steps introducing the Studio's rooms. Optional,
// resumable, and never spotlight-overlaid. Whether it has been seen is stored per
// vault so a returning Studio isn't greeted again.
enum TourStep: String, CaseIterable {
  case foyer
  case landscape
  case season
  case uncharted
  case reflection

  var title: String {
    switch self {
    case .foyer: return "The Foyer"
    case .landscape: return "Life Landscape"
    case .season: return "Current Season"
    case .uncharted: return "Uncharted"
    case .reflection: return "Reflection Garden"
    }
  }

  // The room descriptions are content: Content/tour-steps.json.
  private static let bodies: [String: String] = ContentLibrary.load("tour-steps")

  var body: String { Self.bodies[rawValue] ?? "" }
}

struct OnboardingStore {
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  private func key(_ studioId: String) -> String {
    "studio:tour-seen:\(studioId.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? studioId)"
  }

  func hasSeenTour(studioId: String) -> Bool {
    defaults.bool(forKey: key(studioId))
  }

  func markTourSeen(studioId: String) {
    defaults.set(true, forKey: key(studioId))
  }
}
