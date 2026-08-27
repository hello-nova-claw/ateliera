import CoreLocation
import Foundation

// Derives the almanac's hemisphere from the device's location — the only thing
// the rhythm engine needs from "where you are" (northern vs southern flips the
// felt season and shifts the micro-seasons). One-shot, when-in-use, and the last
// answer is persisted so the almanac is correct immediately on the next launch
// and still works if permission is later declined. No location → no change.
@MainActor
final class LocationHemisphere: NSObject, CLLocationManagerDelegate {
  private static let key = "ateliera.hemisphere"
  private let manager = CLLocationManager()
  private var continuation: CheckedContinuation<Hemisphere?, Never>?

  /// The last hemisphere we resolved, if any — safe to read synchronously at
  /// launch so the first render isn't wrong while a fresh fix is pending.
  static var persisted: Hemisphere? {
    UserDefaults.standard.string(forKey: key).flatMap(Hemisphere.init(rawValue:))
  }

  /// Request a one-shot location and map its latitude to a hemisphere, persisting
  /// it. Returns nil when Location is unavailable or declined (the caller keeps
  /// the persisted/default hemisphere).
  func resolve() async -> Hemisphere? {
    // UI tests must not trip the Location permission sheet.
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST"] == "1" { return nil }
    let status = manager.authorizationStatus
    guard status != .denied && status != .restricted else { return nil }
    return await withCheckedContinuation { continuation in
      self.continuation = continuation
      manager.delegate = self
      if status == .notDetermined {
        manager.requestWhenInUseAuthorization()  // resolves via the auth callback
      } else {
        manager.requestLocation()
      }
    }
  }

  private func finish(_ hemisphere: Hemisphere?) {
    if let hemisphere {
      UserDefaults.standard.set(hemisphere.rawValue, forKey: Self.key)
    }
    continuation?.resume(returning: hemisphere)
    continuation = nil
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      switch manager.authorizationStatus {
      case .authorizedWhenInUse, .authorizedAlways:
        manager.requestLocation()
      case .denied, .restricted:
        finish(nil)
      default:
        break  // still .notDetermined — wait for the user's choice
      }
    }
  }

  nonisolated func locationManager(
    _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
  ) {
    let latitude = locations.last?.coordinate.latitude
    Task { @MainActor in
      finish(latitude.map { $0 >= 0 ? .north : .south })
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in finish(nil) }
  }
}
