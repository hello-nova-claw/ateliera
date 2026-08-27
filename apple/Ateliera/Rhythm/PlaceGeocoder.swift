import CoreLocation

// Resolve a birthplace — by name (search) or by coordinate (reverse) — to its
// coordinate and IANA time zone, so a natal chart uses the birthplace's zone
// rather than the device's. Uses CoreLocation's geocoder (online, best-effort);
// setting a birthplace is a rare, optional step, and failure degrades quietly.
struct ResolvedPlace: Equatable {
  let name: String
  let latitude: Double
  let longitude: Double
  let timeZoneId: String?
}

enum PlaceGeocoder {
  static func search(_ query: String) async -> ResolvedPlace? {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    guard let placemarks = try? await CLGeocoder().geocodeAddressString(trimmed),
      let placemark = placemarks.first, let location = placemark.location
    else { return nil }
    let resolved = place(from: placemark, coordinate: location.coordinate)
    // Forward geocoding doesn't always include the time zone; without it the chart
    // would silently fall back to the device zone. Reverse-geocode the point to
    // fill it in — the birthplace zone is essential for the rising sign.
    guard resolved.timeZoneId == nil else { return resolved }
    let byPoint = await reverse(latitude: resolved.latitude, longitude: resolved.longitude)
    return ResolvedPlace(
      name: resolved.name, latitude: resolved.latitude, longitude: resolved.longitude,
      timeZoneId: byPoint.timeZoneId)
  }

  static func reverse(latitude: Double, longitude: Double) async -> ResolvedPlace {
    let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    guard
      let placemarks = try? await CLGeocoder().reverseGeocodeLocation(
        CLLocation(latitude: latitude, longitude: longitude)),
      let placemark = placemarks.first
    else {
      return ResolvedPlace(
        name: coordinateLabel(latitude, longitude), latitude: latitude, longitude: longitude,
        timeZoneId: nil)
    }
    return place(from: placemark, coordinate: coordinate)
  }

  private static func place(from placemark: CLPlacemark, coordinate: CLLocationCoordinate2D)
    -> ResolvedPlace
  {
    let parts = [placemark.locality, placemark.administrativeArea, placemark.country]
      .compactMap { $0 }
    let name =
      parts.isEmpty
      ? coordinateLabel(coordinate.latitude, coordinate.longitude)
      : Array(parts.prefix(2)).joined(separator: ", ")
    return ResolvedPlace(
      name: name, latitude: coordinate.latitude, longitude: coordinate.longitude,
      timeZoneId: placemark.timeZone?.identifier)
  }

  static func coordinateLabel(_ latitude: Double, _ longitude: Double) -> String {
    let lat = String(format: "%.2f°%@", abs(latitude), latitude >= 0 ? "N" : "S")
    let lon = String(format: "%.2f°%@", abs(longitude), longitude >= 0 ? "E" : "W")
    return "\(lat), \(lon)"
  }
}
