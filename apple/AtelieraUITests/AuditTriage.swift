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
  /// The audit's longer description, kept for a finding that can't name its element.
  let detail: String

  init(
    type: String, screen: String, element: String, description: String, onScreen: Bool,
    detail: String = ""
  ) {
    self.type = type
    self.screen = screen
    self.element = element
    self.description = description
    self.onScreen = onScreen
    self.detail = detail
  }

  /// Whether both would print the same baseline line and name the same element. For
  /// elements with no name this is as fine as it gets: a vanished element has no identity
  /// to carry across passes. The key is only consulted for a second-pass finding whose
  /// element has vanished too, since one still on screen fails on its own.
  func isSameFinding(as other: AuditFinding) -> Bool {
    type == other.type && screen == other.screen && element == other.element
  }
}

// Decides which findings of one audited position fail the test, whatever their type.
//
// The audit's own Dynamic Type pass re-lays the screen out while it runs. SwiftUI then
// rebuilds the rows, so an element the audit flagged mid-layout is gone before the test
// can name it: a finding like `Hit area is too small (-)` or `Potentially inaccessible
// text (-)` that names no element and isn't there on the next run. Such a finding gets
// one more chance. Once the screen has settled, the position is audited again for the
// types that vanished only, which leaves the Dynamic Type pass out unless a Dynamic Type
// finding is what needs confirming, and the finding fails only if it recurs. A finding
// whose element is still on screen fails at once, named or not.
enum AuditTriage {
  /// True when at least one finding's element could not be found after the pass.
  static func needsSecondPass(_ findings: [AuditFinding]) -> Bool {
    findings.contains { !$0.onScreen }
  }

  /// The audit types the second pass runs: those of the findings that vanished.
  static func secondPassTypes(_ findings: [AuditFinding]) -> Set<String> {
    Set(findings.filter { !$0.onScreen }.map(\.type))
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
