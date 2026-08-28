import Foundation

// Small bits of state shared between the app and its widget, via an App Group so
// both processes see the same values. Currently just the resolved hemisphere, so
// the widget's almanac matches the app's. Falls back to standard defaults when the
// group container isn't available (e.g. an unsigned simulator build).
enum SharedStore {
  static let appGroup = "group.au.com.annamcphee.ateliera.native"
  private static let hemisphereKey = "ateliera.hemisphere"

  private static var defaults: UserDefaults {
    UserDefaults(suiteName: appGroup) ?? .standard
  }

  static var hemisphere: Hemisphere? {
    get { defaults.string(forKey: hemisphereKey).flatMap(Hemisphere.init(rawValue:)) }
    set { defaults.set(newValue?.rawValue, forKey: hemisphereKey) }
  }
}
