// One finding of an accessibility audit pass that the baseline doesn't list, reduced to
// what the test needs to decide whether it fails. No XCTest here: AtelieraTests compiles
// this file too, so AuditTriage's rules have unit tests that need no simulator.
struct AuditFinding: Equatable {
  /// The audit type's name in the baseline, such as `hitRegion`.
  let type: String
  let screen: String
  /// The element's identifier, else its label, else `-` when it had neither.
  let element: String
  /// The audit's own one-line description of the problem.
  let description: String
  /// Whether the element could still be found once the pass had finished.
  let onScreen: Bool

  /// Whether both would print the same baseline line and name the same element.
  func isSameFinding(as other: AuditFinding) -> Bool {
    type == other.type && screen == other.screen && element == other.element
  }
}

// Decides which findings of one audited position fail the test.
//
// The audit's own Dynamic Type pass re-lays the screen out while it runs, and an element
// that exists only mid-layout can be reported and then vanish before the test can name
// it: that is a finding like `Hit area is too small (-)` that never names an element and
// isn't there on the next run. Such a finding gets one more chance. The position is
// audited again once the screen has settled, and the finding fails only if it recurs.
// A finding whose element is still on screen fails at once.
enum AuditTriage {
  /// True when at least one finding's element could not be found after the pass.
  static func needsSecondPass(_ findings: [AuditFinding]) -> Bool {
    findings.contains { !$0.onScreen }
  }

  /// The findings to fail for: every first-pass finding still on screen, then every
  /// second-pass finding that is on screen or repeats a first-pass one. Each distinct
  /// finding is listed once. Pass an empty second pass when none was needed.
  static func confirmed(first: [AuditFinding], second: [AuditFinding]) -> [AuditFinding] {
    var confirmed: [AuditFinding] = []
    func add(_ finding: AuditFinding) {
      if !confirmed.contains(where: { $0.isSameFinding(as: finding) }) {
        confirmed.append(finding)
      }
    }
    for finding in first where finding.onScreen { add(finding) }
    for finding in second
    where finding.onScreen || first.contains(where: { $0.isSameFinding(as: finding) }) {
      add(finding)
    }
    return confirmed
  }
}
