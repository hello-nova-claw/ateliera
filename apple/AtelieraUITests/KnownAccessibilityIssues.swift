import XCTest

// Accessibility findings the audit already knows about, each tied to an open issue.
// One line per screen and audit type: `<issue> <audit type> <screen>`. CI's audit names
// different elements from run to run, so a line covers that type of finding anywhere on
// that screen. A finding that isn't listed fails, naming its element. Fix a new finding
// rather than listing it. When an issue closes, delete its lines.
enum KnownAccessibilityIssues {
  static let baseline = """
    74 contrast badge-cycle
    74 contrast badge-moon
    74 contrast badge-season
    74 contrast browse
    74 contrast capture
    74 contrast find
    74 contrast rhythm
    74 contrast room-constellation
    74 contrast room-current-season
    74 contrast room-identity-studio
    74 contrast room-inbox
    74 contrast room-journal
    74 contrast room-landscape
    74 contrast room-reflection-garden
    74 contrast room-uncharted
    74 contrast room-wisdom-garden
    74 contrast settings
    74 contrast sky-ahead
    74 contrast today
    74 contrast today-panel
    78 hitRegion rhythm
    78 hitRegion room-current-season
    78 hitRegion room-identity-studio
    78 hitRegion room-landscape
    78 hitRegion room-reflection-garden
    78 hitRegion room-uncharted
    78 hitRegion room-wisdom-garden
    78 hitRegion settings
    78 hitRegion today
    78 hitRegion today-panel
    78 sufficientElementDescription capture
    78 sufficientElementDescription room-current-season
    78 sufficientElementDescription room-reflection-garden
    78 sufficientElementDescription room-uncharted
    79 dynamicType badge-cycle
    79 dynamicType badge-moon
    79 dynamicType badge-season
    79 dynamicType browse
    79 dynamicType capture
    79 dynamicType find
    79 dynamicType rhythm
    79 dynamicType room-current-season
    79 dynamicType room-identity-studio
    79 dynamicType room-journal
    79 dynamicType room-landscape
    79 dynamicType room-reflection-garden
    79 dynamicType room-uncharted
    79 dynamicType room-wisdom-garden
    79 dynamicType settings
    79 dynamicType sky-ahead
    79 dynamicType today
    79 dynamicType today-panel
    80 textClipped badge-cycle
    80 textClipped badge-moon
    80 textClipped badge-season
    80 textClipped capture
    80 textClipped find
    80 textClipped rhythm
    80 textClipped room-constellation
    80 textClipped room-current-season
    80 textClipped room-identity-studio
    80 textClipped room-inbox
    80 textClipped room-journal
    80 textClipped room-landscape
    80 textClipped room-reflection-garden
    80 textClipped room-uncharted
    80 textClipped room-wisdom-garden
    80 textClipped settings
    80 textClipped sky-ahead
    80 textClipped today
    80 textClipped today-panel
    83 sufficientElementDescription room-constellation
    83 sufficientElementDescription settings
    83 sufficientElementDescription today
    83 sufficientElementDescription today-panel
    168 elementDetection rhythm
    168 elementDetection room-current-season
    168 elementDetection room-reflection-garden
    168 elementDetection room-uncharted
    168 elementDetection room-wisdom-garden
    168 elementDetection settings
    168 elementDetection sky-ahead
    168 elementDetection today
    168 elementDetection today-panel
    """

  // Screens the audit can't finish in one variant, each tied to an open issue. They're
  // skipped in that variant only. When the issue closes, delete its line.
  static let unauditable = """
    178 right to left sky-ahead
    """

  static func isUnauditable(_ screen: String, in variant: String) -> Bool {
    unauditable.split(separator: "\n").contains { line in
      let parts = line.split(separator: " ", maxSplits: 1)
      return parts.count == 2 && parts[1] == "\(variant) \(screen)"
    }
  }

  struct Finding: Equatable {
    let type: String
    let screen: String
    let element: String
  }

  static let known: [(type: String, screen: String)] = baseline.split(separator: "\n").map { line in
    let parts = line.split(separator: " ").map(String.init)
    return (parts[1], parts[2])
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
    known.contains { $0.type == finding.type && $0.screen == finding.screen }
  }

  static let typeNames: [(type: XCUIAccessibilityAuditType, name: String)] = [
    (.contrast, "contrast"),
    (.elementDetection, "elementDetection"),
    (.hitRegion, "hitRegion"),
    (.sufficientElementDescription, "sufficientElementDescription"),
    (.dynamicType, "dynamicType"),
    (.textClipped, "textClipped"),
    (.trait, "trait"),
  ]

  static func typeName(_ type: XCUIAccessibilityAuditType) -> String {
    typeNames.first { $0.type == type }?.name ?? "type\(type.rawValue)"
  }

  /// The audit types behind a set of baseline names; a name no type has is left out.
  static func auditTypes(named names: Set<String>) -> XCUIAccessibilityAuditType {
    typeNames.filter { names.contains($0.name) }.reduce(into: []) { $0.insert($1.type) }
  }
}
