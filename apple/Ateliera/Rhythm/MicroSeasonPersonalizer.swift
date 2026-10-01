import Foundation

// The coarse climate band for a latitude — the "where you are" an on-device model uses to
// retell the current micro-season. Derived from the absolute latitude; pure, no I/O.
enum ClimateBand: String, Equatable, CaseIterable {
  case tropical, subtropical, temperate, boreal, polar

  static func forLatitude(_ latitude: Double) -> ClimateBand {
    switch abs(latitude) {
    case ..<23.5: return .tropical
    case ..<35: return .subtropical
    case ..<55: return .temperate
    case ..<66.5: return .boreal
    default: return .polar
    }
  }

  var label: String { rawValue }
}

// Everything the personalizer needs to retell the current micro-season for a place. The
// deterministic term + gloss are passed as a scaffold so the output stays grounded in,
// and aligned to, the current window.
struct MicroSeasonRequest: Equatable {
  let placeName: String
  let climate: ClimateBand
  let hemisphere: Hemisphere
  let season: Season
  let date: String  // ISO yyyy-MM-dd
  let baseTerm: String
  let baseGloss: String
  let lunarSeason: LunarSeason
}

// Port: turns a request into a personalised micro-season, or nil when the on-device model
// is unavailable, declined, or errors — the caller then keeps the deterministic base. The
// FoundationModels adapter is the production conformer; tests inject a fake.
protocol MicroSeasonPersonalizer {
  func personalize(_ request: MicroSeasonRequest) async -> MicroSeason?
}

// A deterministic stand-in used only under ATELIERA_UITEST_AI, so the personalised path is
// exercisable in UI tests without the real on-device model.
struct FakeMicroSeasonPersonalizer: MicroSeasonPersonalizer {
  func personalize(_ request: MicroSeasonRequest) async -> MicroSeason? {
    MicroSeason(term: "Local turning", gloss: "a felt shift in \(request.placeName)")
  }
}
