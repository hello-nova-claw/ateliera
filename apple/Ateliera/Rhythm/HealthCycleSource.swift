import Foundation

#if os(iOS)
  import HealthKit
#endif

// Reads menstrual-flow days from HealthKit (with permission) and derives the
// `CycleProfile` the almanac needs. iOS-only: HealthKit isn't on macOS, so the
// whole thing compiles to an unavailable stub there. Never writes health data;
// read-only, on-device, and the almanac simply omits the cycle when there's no
// permission or no data — no pressure, no error surfaced.
@MainActor
final class HealthCycleSource {
  #if os(iOS)
    private let store = HKHealthStore()
  #endif

  var isAvailable: Bool {
    #if os(iOS)
      return HKHealthStore.isHealthDataAvailable()
    #else
      return false
    #endif
  }

  /// Request read access to menstrual flow, then derive the cycle basis. Returns
  /// nil when Health is unavailable, permission is refused, or nothing's logged.
  func loadCycle() async -> CycleProfile? {
    #if os(iOS)
      // UI tests run against a fixture and must not trip the Health permission
      // sheet, which would block automation. The ones that need a cycle on screen get an
      // invented one instead, so the cycle badge and its sheet can be checked.
      if UITestLaunch.isOn(.active) {
        return UITestLaunch.isOn(.cycle)
          ? CycleProfile(lastPeriodStart: "2026-03-10", avgLengthDays: 28) : nil
      }
      guard HKHealthStore.isHealthDataAvailable(),
        let type = HKObjectType.categoryType(forIdentifier: .menstrualFlow)
      else { return nil }
      do {
        try await store.requestAuthorization(toShare: [], read: [type])
      } catch {
        return nil
      }
      return CycleDeriver.derive(periodDays: await periodDays(type: type))
    #else
      return nil
    #endif
  }

  #if os(iOS)
    // Menstrual-flow days over the last ~400 days, excluding "none" (logged as no
    // flow), mapped to local `YYYY-MM-DD` strings for the deriver.
    private func periodDays(type: HKCategoryType) async -> [String] {
      let start = Calendar.current.date(byAdding: .day, value: -400, to: Date())
      let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: [])
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.timeZone = .current
      formatter.dateFormat = "yyyy-MM-dd"
      let none = HKCategoryValueMenstrualFlow.none.rawValue
      return await withCheckedContinuation { continuation in
        let query = HKSampleQuery(
          sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
          sortDescriptors: nil
        ) { _, samples, _ in
          let days = (samples as? [HKCategorySample] ?? [])
            .filter { $0.value != none }
            .map { formatter.string(from: $0.startDate) }
          continuation.resume(returning: days)
        }
        store.execute(query)
      }
    }
  #endif
}
