import Foundation

// Persisted rhythm inputs, plus an offline fallback for the hemisphere.
//
// The app resolves hemisphere from the device's location and stores it here; the
// widget runs in a separate process (no shared container, to avoid an App Group
// entitlement), so it can't read that value — it falls back to the device's
// region, which is offline and correct for most places (e.g. AU → southern).
enum SharedStore {
  private static let hemisphereKey = "ateliera.hemisphere"

  static var hemisphere: Hemisphere? {
    get { UserDefaults.standard.string(forKey: hemisphereKey).flatMap(Hemisphere.init(rawValue:)) }
    set { UserDefaults.standard.set(newValue?.rawValue, forKey: hemisphereKey) }
  }

  /// The best hemisphere available without a location fix: the stored one, else
  /// the device region's, else northern.
  static var bestHemisphere: Hemisphere {
    hemisphere ?? RegionHemisphere.current
  }
}

// A coarse hemisphere from the device's region — used when there's no location
// fix (the widget, or the app before permission). Predominantly-southern
// countries map to south; everything else north. Close enough for felt season.
enum RegionHemisphere {
  private static let southern: Set<String> = [
    "AU", "NZ", "ZA", "AR", "CL", "UY", "PY", "BO", "PE", "BR", "EC",
    "AO", "MZ", "ZM", "ZW", "BW", "NA", "MG", "MW", "LS", "SZ", "TZ",
    "FJ", "PG", "SB", "VU", "WS", "TO", "TL",
  ]

  static func hemisphere(forRegion region: String) -> Hemisphere {
    southern.contains(region.uppercased()) ? .south : .north
  }

  static var current: Hemisphere {
    hemisphere(forRegion: Locale.current.region?.identifier ?? "")
  }
}
