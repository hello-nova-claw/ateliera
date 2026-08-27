import CoreLocation
import Observation
import SwiftUI

// The birth details a natal chart needs, saved on-device. Time and location are
// optional; the chart honestly degrades (date → sun, + time → moon, + location →
// rising) rather than guessing.
struct BirthData: Codable, Equatable {
  var date: String  // YYYY-MM-DD, local wall-clock
  var time: String?  // HH:MM local, when known
  var latitude: Double?
  var longitude: Double?
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

  // A birth time is entered as local wall-clock; convert date+time in the device's
  // current zone to UTC for the engine. Without a time, the date passes straight
  // through (sun only), matching the web.
  static func chart(from birth: BirthData) -> NatalChart {
    guard let time = birth.time,
      let instant = localInstant(date: birth.date, time: time)
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

  private static func localInstant(date: String, time: String) -> Date? {
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
    calendar.timeZone = .current
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
  @State private var locating = false

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
  }

  private var draft: BirthData {
    BirthData(
      date: Self.iso(date), time: knowsTime ? Self.hhmm(time) : nil,
      latitude: coordinate?.latitude, longitude: coordinate?.longitude)
  }

  private var chart: NatalChart {
    RhythmProfileStore.chart(from: draft)
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
                Text("Interpreted in this device's time zone. Adds your moon sign.")
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
              }
            }
          }
          field("Birth place") {
            VStack(alignment: .leading, spacing: 8) {
              if let coordinate {
                Text(Self.coordinateLabel(coordinate))
                  .font(StudioFont.control).foregroundStyle(Studio.inkStrong)
              } else {
                Text("Not set — adds your rising sign when you know your time.")
                  .font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
              }
              HStack(spacing: 16) {
                Button(locating ? "Locating…" : "Use my location") {
                  Task {
                    locating = true
                    coordinate = await location.resolveCoordinate() ?? coordinate
                    locating = false
                  }
                }
                .disabled(locating)
                if coordinate != nil {
                  Button("Clear") { coordinate = nil }
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
  private static func coordinateLabel(_ c: CLLocationCoordinate2D) -> String {
    let lat = String(format: "%.2f°%@", abs(c.latitude), c.latitude >= 0 ? "N" : "S")
    let lon = String(format: "%.2f°%@", abs(c.longitude), c.longitude >= 0 ? "E" : "W")
    return "\(lat), \(lon)"
  }
}
