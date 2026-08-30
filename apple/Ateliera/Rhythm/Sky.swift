import Foundation

// Sky events computed locally (no network, no data files) — the same Meeus approach the
// rest of the rhythm engine uses. Phase 1: the year's turning points, the equinoxes and
// solstices, as exact instants (Meeus, Astronomical Algorithms ch. 27, low-accuracy —
// within ~a minute for modern years, matching astronomia's `solstice.*`).
enum Sky {
  enum TurningPoint: String, CaseIterable {
    case marchEquinox, juneSolstice, septemberEquinox, decemberSolstice

    // The season (northern hemisphere) that *begins* at this turning point.
    var beginsSeason: Season {
      switch self {
      case .marchEquinox: return .spring
      case .juneSolstice: return .summer
      case .septemberEquinox: return .autumn
      case .decemberSolstice: return .winter
      }
    }

    var title: String {
      switch self {
      case .marchEquinox: return "March equinox"
      case .juneSolstice: return "June solstice"
      case .septemberEquinox: return "September equinox"
      case .decemberSolstice: return "December solstice"
      }
    }
  }

  private static func cosDeg(_ deg: Double) -> Double { cos(deg * .pi / 180) }

  // Meeus table 27.A — periodic terms (A, B°, C°) shared by all four points.
  private static let periodic: [(Double, Double, Double)] = [
    (485, 324.96, 1934.136), (203, 337.23, 32964.467), (199, 342.08, 20.186),
    (182, 27.85, 445267.112), (156, 73.14, 45036.886), (136, 171.52, 22518.443),
    (77, 222.54, 65928.934), (74, 296.72, 3034.906), (70, 243.58, 9037.513),
    (58, 119.81, 33718.147), (52, 297.17, 150.678), (50, 21.02, 2281.226),
    (45, 247.54, 29929.562), (44, 325.15, 31555.956), (29, 60.93, 4443.417),
    (18, 155.12, 67555.328), (17, 288.79, 4562.452), (16, 198.04, 62894.029),
    (14, 199.76, 31436.921), (12, 95.39, 14577.848), (12, 287.11, 31931.756),
    (12, 320.81, 34777.259), (9, 227.73, 1222.114), (8, 15.45, 16859.074),
  ]

  // The mean JDE0 of a turning point (Meeus 27.2/27.3, for years 1000–3000).
  private static func jde0(year: Int, point: TurningPoint) -> Double {
    let y = Double(year - 2000) / 1000
    let c: [Double]
    switch point {
    case .marchEquinox: c = [2_451_623.80984, 365_242.37404, 0.05169, -0.00411, -0.00057]
    case .juneSolstice: c = [2_451_716.56767, 365_241.62603, 0.00325, 0.00888, -0.00030]
    case .septemberEquinox: c = [2_451_810.21715, 365_242.01767, -0.11575, 0.00337, 0.00078]
    case .decemberSolstice: c = [2_451_900.05952, 365_242.74049, -0.06223, -0.00823, 0.00032]
    }
    return c[0] + c[1] * y + c[2] * y * y + c[3] * y * y * y + c[4] * y * y * y * y
  }

  /// UTC milliseconds of an equinox/solstice. (Meeus returns dynamical time; like
  /// astronomia's `solstice.*`, we express it directly as a JD — the ΔT offset is ~70s,
  /// negligible for a date/time read-out.)
  static func turningPointMs(year: Int, point: TurningPoint) -> Int64 {
    let base = jde0(year: year, point: point)
    let t = (base - 2_451_545.0) / 36525
    let w = 35999.373 * t - 2.47
    let lambda = 1 + 0.0334 * cosDeg(w) + 0.0007 * cosDeg(2 * w)
    var s = 0.0
    for (a, b, cc) in periodic { s += a * cosDeg(b + cc * t) }
    let jde = base + (0.00001 * s) / lambda
    return Int64(((jde - 2_440_587.5) * 86_400_000).rounded())
  }

  // The next equinox or solstice strictly after `ms`.
  static func nextTurningPoint(afterMs ms: Int64) -> (point: TurningPoint, ms: Int64) {
    let year = yearOf(ms)
    var candidates: [(TurningPoint, Int64)] = []
    for y in year...(year + 1) {
      for point in TurningPoint.allCases { candidates.append((point, turningPointMs(year: y, point: point))) }
    }
    candidates.sort { $0.1 < $1.1 }
    let next = candidates.first { $0.1 > ms } ?? candidates[0]
    return (next.0, next.1)
  }

  // MARK: - Astronomical season span

  // The astronomical season (northern name) that `dateMs` sits in, with the exact
  // instants it runs between — the surrounding solstice/equinox pair.
  static func astronomicalSeasonSpan(dateMs: Int64) -> (season: Season, start: Int64, end: Int64) {
    let year = yearOf(dateMs)
    // Candidate boundaries around this and the neighbouring years, in order.
    var points: [(ms: Int64, point: TurningPoint)] = []
    for y in (year - 1)...(year + 1) {
      for point in TurningPoint.allCases {
        points.append((turningPointMs(year: y, point: point), point))
      }
    }
    points.sort { $0.ms < $1.ms }
    // The span [start, end) containing dateMs; the season is the one that began at start.
    for index in 0..<(points.count - 1) where points[index].ms <= dateMs && dateMs < points[index + 1].ms {
      return (points[index].point.beginsSeason, points[index].ms, points[index + 1].ms)
    }
    // Fallback (shouldn't happen within the candidate window).
    return (.winter, points.first?.ms ?? dateMs, points.last?.ms ?? dateMs)
  }

  private static func yearOf(_ ms: Int64) -> Int {
    // Civil year from UTC millis (days-from-civil inverse, matching Rhythm.utcMillis).
    var days = Int(ms / 86_400_000)
    if ms < 0 && ms % 86_400_000 != 0 { days -= 1 }
    let z = days + 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
    let y = yoe + era * 400
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let month = mp < 10 ? mp + 3 : mp - 9
    return month <= 2 ? y + 1 : y
  }
}
