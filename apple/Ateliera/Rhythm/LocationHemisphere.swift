import CoreLocation
import Foundation

// Derives the almanac's hemisphere from the device's location — the only thing
// the rhythm engine needs from "where you are" (northern vs southern flips the
// felt season and shifts the micro-seasons). One-shot, when-in-use, and the last
// answer is persisted so the almanac is correct immediately on the next launch
// and still works if permission is later declined. No location → no change.
@MainActor
final class LocationHemisphere: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  // Launch and Settings can both ask at once; they share one fix.
  private let request = CoalescedRequest<CLLocationCoordinate2D?>()

  /// The last hemisphere we resolved, if any — safe to read synchronously at
  /// launch so the first render isn't wrong while a fresh fix is pending. Stored
  /// in the app's own `UserDefaults` (no App Group), so the widget — a separate
  /// process — can't read it and falls back to the device region instead. Usable
  /// off the main actor (e.g. from an intent).
  nonisolated static var persisted: Hemisphere? {
    SharedStore.hemisphere
  }

  /// One-shot device coordinate, or nil when Location is unavailable/declined.
  func resolveCoordinate() async -> CLLocationCoordinate2D? {
    // UI tests must not trip the Location permission sheet.
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST"] == "1" { return nil }
    let status = manager.authorizationStatus
    guard status != .denied && status != .restricted else { return nil }
    return await request.value {
      manager.delegate = self
      if status == .notDetermined {
        manager.requestWhenInUseAuthorization()  // resolves via the auth callback
      } else {
        manager.requestLocation()
      }
    }
  }

  /// Resolve the hemisphere from a fresh fix and persist it for the next launch.
  func resolve() async -> Hemisphere? {
    guard let coordinate = await resolveCoordinate() else { return nil }
    let hemisphere: Hemisphere = coordinate.latitude >= 0 ? .north : .south
    SharedStore.hemisphere = hemisphere
    return hemisphere
  }

  /// One-shot device location resolved to a reverse-geocoded place (name + lat/lon/zone),
  /// persisting the hemisphere along the way. Seeds the home place used to personalise the
  /// micro-season to your local climate — same permission, no extra prompt. Nil when
  /// Location is unavailable/declined, so the almanac quietly stays deterministic.
  func resolveHome() async -> ResolvedPlace? {
    guard let coordinate = await resolveCoordinate() else { return nil }
    SharedStore.hemisphere = coordinate.latitude >= 0 ? .north : .south
    return await PlaceGeocoder.reverse(
      latitude: coordinate.latitude, longitude: coordinate.longitude)
  }

  private func finish(_ coordinate: CLLocationCoordinate2D?) {
    request.finish(coordinate)
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
    let coordinate = locations.last?.coordinate
    Task { @MainActor in finish(coordinate) }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in finish(nil) }
  }
}
