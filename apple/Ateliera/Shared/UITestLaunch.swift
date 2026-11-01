import Foundation

// The UI tests' launch switches: a fresh vault with seeded fixtures, a pinned clock and
// zone, an invented cycle, a fake on-device model. They work in debug builds only. A
// release build reads none of them and carries none of their names.
enum UITestLaunch {
  enum Flag {
    case active, fakeModel, gift, roomFixtures, foyer, constellation, cycle
  }

  enum Setting {
    case now, timeZone
  }

  static func isOn(
    _ flag: Flag, environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> Bool {
    #if DEBUG
      return environment[flag.key] == "1"
    #else
      return false
    #endif
  }

  /// A pinned value, read only when the UI tests launched the app.
  static func value(
    _ setting: Setting, environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> String? {
    #if DEBUG
      guard isOn(.active, environment: environment) else { return nil }
      return environment[setting.key]
    #else
      return nil
    #endif
  }
}

#if DEBUG
  extension UITestLaunch.Flag {
    fileprivate var key: String {
      switch self {
      case .active: return "ATELIERA_UITEST"
      case .fakeModel: return "ATELIERA_UITEST_AI"
      case .gift: return "ATELIERA_UITEST_GIFT"
      case .roomFixtures: return "ATELIERA_UITEST_P5"
      case .foyer: return "ATELIERA_UITEST_FOYER"
      case .constellation: return "ATELIERA_UITEST_CONSTELLATION"
      case .cycle: return "ATELIERA_UITEST_CYCLE"
      }
    }
  }

  extension UITestLaunch.Setting {
    fileprivate var key: String {
      switch self {
      case .now: return "ATELIERA_UITEST_NOW"
      case .timeZone: return "ATELIERA_UITEST_TIME_ZONE"
      }
    }
  }
#endif
