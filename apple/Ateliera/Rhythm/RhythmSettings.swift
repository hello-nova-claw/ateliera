import CoreLocation
import Observation
import SwiftUI

// The birth details a natal chart needs, saved on-device. Time and location are
// optional; the chart honestly degrades (date → sun, + time → moon, + location →
// rising) rather than guessing.
struct BirthData: Codable, Equatable {
  var date: String  // YYYY-MM-DD, wall-clock at the birthplace
  var time: String?  // HH:MM at the birthplace, when known
  var latitude: Double?
  var longitude: Double?
  var placeName: String?  // display label for the birthplace
  var timeZoneId: String?  // IANA zone of the birthplace, for the time→UTC step
}

@Observable
final class RhythmProfileStore {
  private static let key = "ateliera.birthdata"
  var birth: BirthData? {
    didSet { persist() }
  }

  init() {
    if let data = UserDefaults.standard.data(forKey: Self.key),
      let decoded = try? JSONDecoder().decode(BirthData.self, from: data)
    {
      birth = decoded
    }
  }

  private func persist() {
    if let birth, let data = try? JSONEncoder().encode(birth) {
      UserDefaults.standard.set(data, forKey: Self.key)
    } else {
      UserDefaults.standard.removeObject(forKey: Self.key)
    }
  }

  var chart: NatalChart? {
    birth.map(Self.chart(from:))
  }

  // A birth time is wall-clock at the birthplace; convert date+time in the
  // birthplace's zone (falling back to the device's) to UTC for the engine.
  // Without a time, the date passes straight through (sun only), matching the web.
  static func chart(from birth: BirthData) -> NatalChart {
    let zone = birth.timeZoneId.flatMap(TimeZone.init(identifier:)) ?? .current
    guard let time = birth.time,
      let instant = localInstant(date: birth.date, time: time, zone: zone)
    else {
      return Natal.compute(
        birthDate: birth.date, birthTimeUTC: nil, birthLat: birth.latitude,
        birthLon: birth.longitude)
    }
    let utc = DateFormatter()
    utc.locale = Locale(identifier: "en_US_POSIX")
    utc.timeZone = TimeZone(identifier: "UTC")
    utc.dateFormat = "yyyy-MM-dd"
    let dateUTC = utc.string(from: instant)
    utc.dateFormat = "HH:mm"
    let timeUTC = utc.string(from: instant)
    return Natal.compute(
      birthDate: dateUTC, birthTimeUTC: timeUTC, birthLat: birth.latitude,
      birthLon: birth.longitude)
  }

  private static func localInstant(date: String, time: String, zone: TimeZone) -> Date? {
    let d = date.split(separator: "-").compactMap { Int($0) }
    let t = time.split(separator: ":").compactMap { Int($0) }
    guard d.count == 3, t.count == 2 else { return nil }
    var components = DateComponents()
    components.year = d[0]
    components.month = d[1]
    components.day = d[2]
    components.hour = t[0]
    components.minute = t[1]
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return calendar.date(from: components)
  }
}

// "Your rhythm" — enter birth details and see the natal chart (with honest
// degradation), plus a note on where the almanac's hemisphere comes from.
struct RhythmSettingsView: View {
  let store: RhythmProfileStore
  @Binding var isPresented: Bool
  @State private var location = LocationHemisphere()

  @State private var date: Date
  @State private var knowsTime: Bool
  @State private var time: Date
  @State private var coordinate: CLLocationCoordinate2D?
  @State private var placeName: String?
  @State private var timeZoneId: String?
  @State private var query = ""
  @State private var locating = false
  @State private var searching = false

  init(store: RhythmProfileStore, isPresented: Binding<Bool>) {
    self.store = store
    _isPresented = isPresented
    let birth = store.birth
    _date = State(initialValue: Self.date(from: birth?.date) ?? Date(timeIntervalSince1970: 0))
    _knowsTime = State(initialValue: birth?.time != nil)
    _time = State(initialValue: Self.time(from: birth?.time) ?? Date(timeIntervalSince1970: 0))
    _coordinate = State(
      initialValue: birth?.latitude != nil && birth?.longitude != nil
        ? CLLocationCoordinate2D(latitude: birth!.latitude!, longitude: birth!.longitude!) : nil)
    _placeName = State(initialValue: birth?.placeName)
    _timeZoneId = State(initialValue: birth?.timeZoneId)
  }

  private var draft: BirthData {
    BirthData(
      date: Self.iso(date), time: knowsTime ? Self.hhmm(time) : nil,
      latitude: coordinate?.latitude, longitude: coordinate?.longitude,
      placeName: placeName, timeZoneId: timeZoneId)
  }

  private func apply(_ place: ResolvedPlace) {
    coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
    placeName = place.name
    timeZoneId = place.timeZoneId
  }

  private func runSearch() {
    let text = query
    Task {
      searching = true
      if let place = await PlaceGeocoder.search(text) {
        apply(place)
        query = ""
      }
      searching = false
    }
  }

  private var chart: NatalChart {
    RhythmProfileStore.chart(from: draft)
  }

  // The zone the birth time is read in, with its offset at the birth date, so a
  // wrong or unresolved zone is visible rather than a silent device-zone guess.
  private var zoneDisplay: String {
    let reference = zoneReferenceInstant()
    if let id = timeZoneId, let zone = TimeZone(identifier: id) {
      return "\(id) · \(Self.offsetLabel(zone.secondsFromGMT(for: reference)))"
    }
    return "Zone not found — using this device (\(Self.offsetLabel(TimeZone.current.secondsFromGMT(for: reference)))). Search the place again."
  }

  private func zoneReferenceInstant() -> Date {
    let zone = timeZoneId.flatMap(TimeZone.init(identifier:)) ?? .current
    let d = Self.iso(date).split(separator: "-").compactMap { Int($0) }
    let t = knowsTime ? Self.hhmm(time).split(separator: ":").compactMap { Int($0) } : [12, 0]
    guard d.count == 3 else { return Date() }
    var components = DateComponents()
    components.year = d[0]
    components.month = d[1]
    components.day = d[2]
    components.hour = t.first ?? 12
    components.minute = t.count > 1 ? t[1] : 0
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return calendar.date(from: components) ?? Date()
  }

  private static func offsetLabel(_ seconds: Int) -> String {
    let sign = seconds >= 0 ? "+" : "-"
    let magnitude = abs(seconds)
    let hours = magnitude / 3600
    let minutes = (magnitude % 3600) / 60
    return minutes == 0
      ? "UTC\(sign)\(hours)" : "UTC\(sign)\(hours):\(String(format: "%02d", minutes))"
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          chartCard

          field("Birth date") {
            DatePicker("", selection: $date, displayedComponents: .date)
              .labelsHidden()
          }
          field("Birth time") {
            VStack(alignment: .leading, spacing: 8) {
              Toggle("I know my birth time", isOn: $knowsTime)
                .font(StudioFont.control).foregroundStyle(Studio.inkStrong)
              if knowsTime {
                DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                  .labelsHidden()
                Text("Read in your birthplace's time zone once you set a place. Adds your moon sign.")
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
          }
          field("Birth place") {
            VStack(alignment: .leading, spacing: 8) {
              if let placeName {
                Text(placeName)
                  .font(StudioFont.control).foregroundStyle(Studio.inkStrong)
                Text(zoneDisplay)
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
              } else if let coordinate {
                Text(PlaceGeocoder.coordinateLabel(coordinate.latitude, coordinate.longitude))
                  .font(StudioFont.control).foregroundStyle(Studio.inkStrong)
                Text(zoneDisplay)
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
              } else {
                Text("Where you were born — adds your rising sign, and sets the zone for your birth time.")
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
                  .fixedSize(horizontal: false, vertical: true)
              }
              HStack(spacing: 8) {
                TextField("Search a place", text: $query)
                  .textFieldStyle(.roundedBorder)
                  .font(StudioFont.control)
                  .onSubmit(runSearch)
                Button(searching ? "…" : "Find", action: runSearch)
                  .disabled(searching || query.trimmingCharacters(in: .whitespaces).isEmpty)
                  .font(StudioFont.control).foregroundStyle(Studio.link)
              }
              HStack(spacing: 16) {
                Button(locating ? "Locating…" : "Use my location") {
                  Task {
                    locating = true
                    if let coordinate = await location.resolveCoordinate() {
                      apply(await PlaceGeocoder.reverse(
                        latitude: coordinate.latitude, longitude: coordinate.longitude))
                    }
                    locating = false
                  }
                }
                .disabled(locating)
                if coordinate != nil {
                  Button("Clear") {
                    coordinate = nil
                    placeName = nil
                    timeZoneId = nil
                  }
                  .foregroundStyle(Studio.inkMuted)
                }
              }
              .font(StudioFont.control)
              .foregroundStyle(Studio.link)
            }
          }
        }
        .padding(24)
      }
      .background(Studio.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Your rhythm").font(StudioFont.control).foregroundStyle(Studio.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { isPresented = false }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            store.birth = draft
            isPresented = false
          }
        }
      }
    }
  }

  private var chartCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Your chart")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(Studio.inkFaint)
      HStack(alignment: .top, spacing: 28) {
        placement("Sun", chart.sun)
        placement("Moon", chart.moon.isEmpty ? "—" : chart.moon)
        placement("Rising", chart.rising ?? "—")
      }
      Text(hint)
        .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var hint: String {
    if !knowsTime { return "Add your birth time for the moon, and a place for the rising sign." }
    if coordinate == nil { return "Add your birth place for the rising sign." }
    return "Sun, moon, and rising — computed on your device."
  }

  private func placement(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(Studio.inkFaint)
      Text(value).font(StudioFont.cardTitle).foregroundStyle(Studio.inkStrong)
    }
  }

  private func field(_ label: String, @ViewBuilder _ content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(Studio.inkFaint)
      content()
      Divider().overlay(Studio.line)
    }
  }

  private static func iso(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
  }
  private static func hhmm(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "HH:mm"
    return f.string(from: date)
  }
  private static func date(from iso: String?) -> Date? {
    guard let iso else { return nil }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.date(from: iso)
  }
  private static func time(from hhmm: String?) -> Date? {
    guard let hhmm else { return nil }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "HH:mm"
    return f.date(from: hhmm)
  }
}
