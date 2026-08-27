import Foundation

// On-device natal chart, ported from `@studio/rhythm`'s natal-chart.ts. The web
// uses the `astronomia` library; the product surface is the zodiac SIGN (a 30°
// bucket), so this reproduces the same Meeus algorithms astronomia implements —
// solar longitude (ch. 25), lunar longitude (ch. 47, principal terms), and the
// ascendant from apparent sidereal time (ch. 12) — to sign-level parity
// (golden-tested against the TS engine). Honest degradation, never fabrication:
//   no date → empty · date → sun · +time → moon · +location → rising.
struct NatalChart: Equatable {
  let sun: String
  let moon: String  // "" when the birth time is unknown
  let rising: String?
  let placements: [String: String]

  static let empty = NatalChart(sun: "", moon: "", rising: nil, placements: [:])
}

enum Natal {
  private static let zodiac = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ]

  private static func norm360(_ deg: Double) -> Double {
    (deg.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
  }
  private static func sinDeg(_ deg: Double) -> Double { sin(deg * .pi / 180) }
  private static func cosDeg(_ deg: Double) -> Double { cos(deg * .pi / 180) }
  private static func sign(fromLongitude deg: Double) -> String {
    zodiac[Int((norm360(deg) / 30).rounded(.down)) % 12]
  }

  /// `birthDate` = `YYYY-MM-DD`; `birthTimeUTC` = `HH:MM` in UTC (or nil).
  static func compute(
    birthDate: String, birthTimeUTC: String?, birthLat: Double?, birthLon: Double?
  ) -> NatalChart {
    guard let date = parseDate(birthDate) else { return NatalChart.empty }
    let hasTime = birthTimeUTC.map(isTime) ?? false
    let time = hasTime ? parseTime(birthTimeUTC!)! : (hour: 0, minute: 0)

    let dayFraction = Double(time.hour * 3600 + time.minute * 60) / 86400
    let jd = gregorianToJD(
      year: date.year, month: date.month, day: Double(date.day) + dayFraction)
    let t = (jd - 2_451_545.0) / 36525

    let sun = sign(fromLongitude: sunLongitude(t: t))
    var placements = ["sun": sun]
    var moon = ""
    var rising: String?

    if hasTime {
      moon = sign(fromLongitude: moonLongitude(t: t))
      placements["moon"] = moon
      if let lat = birthLat, let lon = birthLon {
        rising = sign(fromLongitude: ascendant(jd: jd, t: t, latitude: lat, longitude: lon))
        placements["rising"] = rising
      }
    }
    return NatalChart(sun: sun, moon: moon, rising: rising, placements: placements)
  }

  // MARK: Sun — Meeus ch. 25 (low accuracy, as astronomia's apparentLongitude)

  private static func sunLongitude(t: Double) -> Double {
    let l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t
    let m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t
    let c =
      (1.914602 - 0.004817 * t - 0.000014 * t * t) * sinDeg(m)
      + (0.019993 - 0.000101 * t) * sinDeg(2 * m) + 0.000289 * sinDeg(3 * m)
    let omega = 125.04 - 1934.136 * t
    return l0 + c - 0.00569 - 0.00478 * sinDeg(omega)
  }

  // MARK: Moon — Meeus ch. 47 (principal longitude terms of table 47.A)

  // (D, M, M', F, coefficient in 1e-6 deg); terms with |coeff| >= 2000.
  private static let moonTerms: [(Int, Int, Int, Int, Double)] = [
    (0, 0, 1, 0, 6_288_774), (2, 0, -1, 0, 1_274_027), (2, 0, 0, 0, 658_314),
    (0, 0, 2, 0, 213_618), (0, 1, 0, 0, -185_116), (0, 0, 0, 2, -114_332),
    (2, 0, -2, 0, 58793), (2, -1, -1, 0, 57066), (2, 0, 1, 0, 53322),
    (2, -1, 0, 0, 45758), (0, 1, -1, 0, -40923), (1, 0, 0, 0, -34720),
    (0, 1, 1, 0, -30383), (2, 0, 0, -2, 15327), (0, 0, 1, 2, -12528),
    (0, 0, 1, -2, 10980), (4, 0, -1, 0, 10675), (0, 0, 3, 0, 10034),
    (4, 0, -2, 0, 8548), (2, 1, -1, 0, -7888), (2, 1, 0, 0, -6766),
    (1, 0, -1, 0, -5163), (1, 1, 0, 0, 4987), (2, -1, 1, 0, 4036),
    (2, 0, 2, 0, 3994), (4, 0, 0, 0, 3861), (2, 0, -3, 0, 3665),
    (0, 1, -2, 0, -2689), (2, 0, -1, 2, -2602), (2, -1, -2, 0, 2390),
    (1, 0, 1, 0, -2348), (2, -2, 0, 0, 2236), (0, 1, 2, 0, -2120),
    (0, 2, 0, 0, -2069), (2, -2, -1, 0, 2048),
  ]

  private static func moonLongitude(t: Double) -> Double {
    let lp =
      218.3164477 + 481267.88123421 * t - 0.0015786 * t * t + t * t * t / 538841
      - t * t * t * t / 65_194_000
    let d =
      297.8501921 + 445267.1114034 * t - 0.0018819 * t * t + t * t * t / 545868
      - t * t * t * t / 113_065_000
    let m = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + t * t * t / 24_490_000
    let mp =
      134.9633964 + 477198.8675055 * t + 0.0087414 * t * t + t * t * t / 69699
      - t * t * t * t / 14_712_000
    let f =
      93.2720950 + 483202.0175233 * t - 0.0036539 * t * t - t * t * t / 3_526_000
      + t * t * t * t / 863_310_000
    let a1 = 119.75 + 131.849 * t
    let a2 = 53.09 + 479264.290 * t
    let e = 1 - 0.002516 * t - 0.0000074 * t * t

    var sum = 0.0
    for (cd, cm, cmp, cf, coeff) in moonTerms {
      let argument = Double(cd) * d + Double(cm) * m + Double(cmp) * mp + Double(cf) * f
      sum += coeff * pow(e, Double(abs(cm))) * sinDeg(argument)
    }
    sum += 3958 * sinDeg(a1) + 1962 * sinDeg(lp - f) + 318 * sinDeg(a2)
    return lp + sum / 1_000_000
  }

  // MARK: Ascendant — apparent sidereal time (Meeus ch. 12) + the rising formula

  private static func ascendant(jd: Double, t: Double, latitude: Double, longitude: Double)
    -> Double
  {
    let eps = 23.4392911 - 0.013004167 * t
    let gmst =
      280.46061837 + 360.98564736629 * (jd - 2_451_545.0) + 0.000387933 * t * t
      - t * t * t / 38_710_000
    // Equation of the equinoxes (principal nutation terms), arcseconds → degrees.
    let omega = 125.04452 - 1934.136261 * t
    let ls = 280.4665 + 36000.7698 * t
    let lm = 218.3165 + 481267.8813 * t
    let dPsi =
      -17.20 * sinDeg(omega) - 1.32 * sinDeg(2 * ls) - 0.23 * sinDeg(2 * lm)
      + 0.21 * sinDeg(2 * omega)
    let gast = gmst + (dPsi * cosDeg(eps)) / 3600
    let lstHours = norm360(gast) / 15 + longitude / 15
    let ramc = norm360(lstHours * 15) * .pi / 180
    let phi = latitude * .pi / 180
    let epsRad = eps * .pi / 180
    let asc = atan2(-cos(ramc), sin(ramc) * cos(epsRad) + tan(phi) * sin(epsRad))
    return asc * 180 / .pi
  }

  // MARK: Parsing

  private static func parseDate(_ value: String) -> (year: Int, month: Int, day: Int)? {
    guard value.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil,
      let year = Int(value.prefix(4)), let month = Int(value.dropFirst(5).prefix(2)),
      let day = Int(value.dropFirst(8).prefix(2))
    else { return nil }
    return (year, month, day)
  }

  private static func isTime(_ value: String) -> Bool {
    value.range(of: "^\\d{2}:\\d{2}$", options: .regularExpression) != nil
  }

  private static func parseTime(_ value: String) -> (hour: Int, minute: Int)? {
    guard isTime(value), let hour = Int(value.prefix(2)), let minute = Int(value.dropFirst(3))
    else { return nil }
    return (hour, minute)
  }

  // Meeus 7.1, Gregorian calendar; `day` may be fractional.
  private static func gregorianToJD(year: Int, month: Int, day: Double) -> Double {
    var y = Double(year)
    var m = Double(month)
    if m <= 2 {
      y -= 1
      m += 12
    }
    let a = (y / 100).rounded(.down)
    let b = 2 - a + (a / 4).rounded(.down)
    return (365.25 * (y + 4716)).rounded(.down) + (30.6001 * (m + 1)).rounded(.down) + day + b
      - 1524.5
  }
}
