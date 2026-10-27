import XCTest

// Accessibility problems the audit already knows about, each tied to an open issue.
// A broad entry covers a whole audit type while its issue is open; every other entry
// names one element, by identifier or (when it has none) by the start of its label.
// When an issue closes, delete its entries, and the audit then enforces the fix.
enum KnownAccessibilityIssues {
  struct Entry {
    let issue: Int
    let type: XCUIAccessibilityAuditType
    var screen: String?
    var identifier: String?
    var label: String?
  }

  static let entries: [Entry] = [
    // Text colours fail WCAG AA contrast in every theme: #74, #75, #85.
    Entry(issue: 74, type: .contrast),
    // Dynamic Type scales on the wrong curves; fixed sizes and truncation: #79, #80.
    Entry(issue: 79, type: .dynamicType),
    Entry(issue: 80, type: .textClipped),
    // Targets under 44pt: #78.
    Entry(issue: 78, type: .hitRegion, identifier: "foyer-hero-begin"),
    Entry(issue: 78, type: .hitRegion, identifier: "invitation-card"),
    Entry(issue: 78, type: .hitRegion, identifier: "today-panel-toggle"),
    Entry(issue: 78, type: .hitRegion, identifier: "profile-photo-picker"),
    Entry(issue: 78, type: .hitRegion, screen: "rhythm", label: "Use my location"),
    // Text editors with no accessible label: #78.
    Entry(issue: 78, type: .sufficientElementDescription, identifier: "guided-opening-editor"),
    Entry(issue: 78, type: .sufficientElementDescription, identifier: "uncharted-editor"),
    Entry(issue: 78, type: .sufficientElementDescription, identifier: "season-feelings-field"),
    Entry(issue: 78, type: .sufficientElementDescription, identifier: "classified-body"),
    // Decorative images with empty or symbol labels that VoiceOver still reads: #83.
    Entry(issue: 83, type: .sufficientElementDescription, identifier: "sun.max"),
    Entry(issue: 83, type: .sufficientElementDescription, identifier: "constellation-empty"),
    Entry(issue: 83, type: .sufficientElementDescription, identifier: "profile-avatar"),
    // Text the audit can't reach on the Rhythm sheet in Arabic: #168.
    Entry(issue: 168, type: .elementDetection, screen: "rhythm"),
  ]

  static func isKnown(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Bool {
    entries.contains { entry in
      guard entry.type == issue.auditType else { return false }
      if let name = entry.screen, name != screen { return false }
      if let identifier = entry.identifier, issue.element?.identifier != identifier {
        return false
      }
      if let label = entry.label, issue.element?.label.hasPrefix(label) != true { return false }
      return true
    }
  }
}
