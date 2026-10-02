import Foundation

// Structured capture destinations — the Swift mirror of `capture-metadata.ts` +
// `studio-service.ts` capture(). Reuses the P5/P6 domain enums (LandscapeAnchor,
// DecisionHorizon, IdentitySection) and WisdomDomain, and resolves each destination
// to the exact frontmatter + folder the web writes.

enum FoyerSlot: String, CaseIterable {
  case becoming = "foyer-becoming"
  case feeling = "foyer-feeling"
  case principle = "foyer-principle"

  var cardType: String {
    switch self {
    case .becoming: return "identity"
    case .feeling: return "feeling"
    case .principle: return "principle"
    }
  }
  var semanticType: String {
    switch self {
    case .becoming, .principle: return "foundations"
    case .feeling: return "vision"
    }
  }
}

enum CaptureDestination {
  case quickCapture
  case foyer(FoyerSlot)
  case landscape(lifeArea: String, anchor: LandscapeAnchor, horizon: DecisionHorizon?)
  case identity(IdentitySection)
  case wisdom(kind: String, themes: [String], source: NoteSource?, sourceNoteIds: [String]?)
  case uncharted(beyond: Bool)
  case celebration
  case reflectionEntry
}

// The frontmatter + folder a destination produces.
struct CaptureMetadata {
  var cardType: String
  var semanticType: String
  var rooms: [String]
  var status: String
  var lifeAreas: [String] = []
  var landscapeAnchor: String?
  var tags: [String] = []
  var source: NoteSource?
  var sourceNoteIds: [String]?
  var extraFrontmatter: [(String, YamlNode)] = []
  var featured: Bool = false
  var folder: String
}

extension CaptureDestination {
  var metadata: CaptureMetadata {
    switch self {
    case .quickCapture:
      return CaptureMetadata(
        cardType: "capture", semanticType: "reflection", rooms: ["inbox"], status: "draft",
        landscapeAnchor: nil, source: nil, sourceNoteIds: nil, folder: "Inbox")

    case .foyer(let slot):
      return CaptureMetadata(
        cardType: slot.cardType, semanticType: slot.semanticType,
        rooms: ["foyer", "identity-studio"], status: "active", landscapeAnchor: nil, source: nil,
        sourceNoteIds: nil, featured: true, folder: "Foyer")

    case .landscape(let lifeArea, let anchor, let horizon):
      var extra: [(String, YamlNode)] = []
      if anchor == .decisions, let horizon {
        extra.append(("decision_horizon", .scalar(horizon.rawValue)))
      }
      return CaptureMetadata(
        cardType: anchor.cardType, semanticType: anchor.semanticType, rooms: ["life-landscape"],
        status: "active", lifeAreas: [lifeArea], landscapeAnchor: anchor.rawValue, source: nil,
        sourceNoteIds: nil, extraFrontmatter: extra,
        folder: "Life Landscape/\(CaptureDestination.portableLifeAreaFolder(lifeArea))")

    case .identity(let section):
      return CaptureMetadata(
        cardType: section.cardType, semanticType: section.semanticType, rooms: ["identity-studio"],
        status: "active", landscapeAnchor: nil, source: nil, sourceNoteIds: nil,
        folder: "Identity Studio")

    case .wisdom(let kind, let themes, let source, let sourceNoteIds):
      return CaptureMetadata(
        cardType: kind, semanticType: WisdomDomain.semanticType(forKind: kind),
        rooms: ["wisdom-garden"], status: "active", landscapeAnchor: nil,
        tags: Self.dedupe(themes), source: source, sourceNoteIds: sourceNoteIds,
        folder: "Wisdom Garden")

    case .uncharted(let beyond):
      let extra: [(String, YamlNode)] = beyond ? [("beyond_gate", .bool(true))] : []
      return CaptureMetadata(
        cardType: "possibility", semanticType: "uncharted", rooms: ["uncharted"], status: "active",
        landscapeAnchor: nil, source: nil, sourceNoteIds: nil, extraFrontmatter: extra,
        folder: "Uncharted")

    case .celebration:
      return CaptureMetadata(
        cardType: "celebration", semanticType: "celebration", rooms: ["reflection-garden"],
        status: "active", landscapeAnchor: nil, source: nil, sourceNoteIds: nil,
        folder: "Reflection Garden")

    case .reflectionEntry:
      return CaptureMetadata(
        cardType: "reflection", semanticType: "reflection", rooms: ["reflection-garden"],
        status: "active", landscapeAnchor: nil, source: nil, sourceNoteIds: nil,
        folder: "Reflection Garden")
    }
  }

  private static func dedupe(_ values: [String]) -> [String] {
    var seen = Set<String>()
    return values.filter { seen.insert($0).inserted }
  }

  // Port of `portableLifeAreaFolder` in studio-service.ts. NFC-normalise, replace
  // control chars + `<>:"/\|?*` with `-`, collapse repeats, trim ` .-`, cap at 64
  // scalars, fall back to "Area" (also for Win32 reserved names).
  static func portableLifeAreaFolder(_ lifeArea: String) -> String {
    let mapped = lifeArea.precomposedStringWithCanonicalMapping.unicodeScalars.map {
      scalar -> Character in
      (scalar.value < 32 || scalar.value == 127) ? "-" : Character(scalar)
    }
    var cleaned = String(mapped)
    cleaned = cleaned.replacingOccurrences(
      of: "[<>:\"/\\\\|?*]", with: "-", options: .regularExpression)
    cleaned = cleaned.replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
    cleaned = cleaned.replacingOccurrences(
      of: "^[ .-]+|[ .-]+$", with: "", options: .regularExpression)
    let segment = String(cleaned.unicodeScalars.prefix(64).map(Character.init))
    let reserved = "^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$"
    if segment.isEmpty
      || segment.range(of: reserved, options: [.regularExpression, .caseInsensitive]) != nil
    {
      return "Area"
    }
    return segment
  }
}
