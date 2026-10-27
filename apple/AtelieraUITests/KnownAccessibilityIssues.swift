import XCTest

// Accessibility findings the audit already knows about, each tied to an open issue.
// One line per finding: `<issue> <audit type> <screen> <element>`, where the element is
// its identifier, or the start of its label when it has none, or `-` when the audit
// names no element. A finding that isn't listed fails with the line that would list it.
// Fix a new finding rather than listing it. When an issue closes, delete its lines.
enum KnownAccessibilityIssues {
  static let baseline = """
    78 hitRegion today foyer-hero-begin
    78 hitRegion today-panel invitation-card
    78 hitRegion today-panel today-panel-toggle
    78 hitRegion settings profile-photo-picker
    78 hitRegion rhythm Use my location
    78 sufficientElementDescription room-reflection-garden guided-opening-editor
    78 sufficientElementDescription room-uncharted uncharted-editor
    78 sufficientElementDescription room-current-season season-feelings-field
    78 sufficientElementDescription capture classified-body
    83 sufficientElementDescription today-panel sun.max
    83 sufficientElementDescription room-constellation constellation-empty
    83 sufficientElementDescription settings profile-avatar
    168 elementDetection rhythm -
    """

  struct Finding: Equatable {
    let type: String
    let screen: String
    let element: String
  }

  static let known: [Finding] = baseline.split(separator: "\n").map { line in
    let parts = line.split(separator: " ", maxSplits: 3).map(String.init)
    return Finding(type: parts[1], screen: parts[2], element: parts[3])
  }

  static func finding(_ issue: XCUIAccessibilityAuditIssue, on screen: String) -> Finding {
    let element = issue.element
    let name: String
    if let identifier = element?.identifier, !identifier.isEmpty {
      name = identifier
    } else if let label = element?.label, !label.isEmpty {
      name = String(label.prefix(40))
    } else {
      name = "-"
    }
    return Finding(type: typeName(issue.auditType), screen: screen, element: name)
  }

  static func isKnown(_ finding: Finding) -> Bool {
    // Doubled strings repeat a label, so a recorded label matches the start of it.
    known.contains {
      $0.type == finding.type && $0.screen == finding.screen
        && ($0.element == finding.element || finding.element.hasPrefix($0.element + " "))
    }
  }

  static func typeName(_ type: XCUIAccessibilityAuditType) -> String {
    switch type {
    case .contrast: "contrast"
    case .elementDetection: "elementDetection"
    case .hitRegion: "hitRegion"
    case .sufficientElementDescription: "sufficientElementDescription"
    case .dynamicType: "dynamicType"
    case .textClipped: "textClipped"
    case .trait: "trait"
    default: "type\(type.rawValue)"
    }
  }
}
