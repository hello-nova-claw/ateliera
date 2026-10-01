import Foundation
import Observation

// Where you live now — captured once from the device location (reverse-geocoded) and
// overridable in Settings. Used only to personalise the micro-season to your local
// climate; stored in the app's own UserDefaults (not the vault, not an App Group), never
// sent anywhere. Distinct from the optional birth place (which is for the natal chart).
struct HomePlace: Codable, Equatable {
  var name: String
  var latitude: Double
  var longitude: Double
  var timeZoneId: String?

  init(name: String, latitude: Double, longitude: Double, timeZoneId: String? = nil) {
    self.name = name
    self.latitude = latitude
    self.longitude = longitude
    self.timeZoneId = timeZoneId
  }

  init(_ resolved: ResolvedPlace) {
    self.init(
      name: resolved.name, latitude: resolved.latitude, longitude: resolved.longitude,
      timeZoneId: resolved.timeZoneId)
  }

  var climate: ClimateBand { ClimateBand.forLatitude(latitude) }
  var hemisphere: Hemisphere { latitude >= 0 ? .north : .south }
}

@Observable
final class HomePlaceStore {
  private static let key = "ateliera.homeplace"

  var place: HomePlace? {
    didSet { persist() }
  }

  init() {
    if let data = UserDefaults.standard.data(forKey: Self.key),
      let decoded = try? JSONDecoder().decode(HomePlace.self, from: data)
    {
      place = decoded
    }
  }

  func set(_ resolved: ResolvedPlace) { place = HomePlace(resolved) }
  func clear() { place = nil }

  private func persist() {
    if let place, let data = try? JSONEncoder().encode(place) {
      UserDefaults.standard.set(data, forKey: Self.key)
    } else {
      UserDefaults.standard.removeObject(forKey: Self.key)
    }
  }
}
