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

  var body: String {
    switch self {
    case .foyer:
      return "Your calm front room — today's rhythm, a gift to reflect on, and the way into every other room. Start here."
    case .landscape:
      return "The shape of a life across its areas: vision, identity, decisions, practices, and the structures that hold them."
    case .season:
      return "Name what matters now as a gentle chapter. A season is a humane present focus, not a deadline."
    case .uncharted:
      return "Keep possibilities that don't need a plan yet. Leave room for what if — near, or beyond the gate."
    case .reflection:
      return "Notice what is changing. Gather reflections and celebrations so the Studio remembers with you."
    }
  }
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
