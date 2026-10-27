import XCTest

// Accessibility findings the audit already knows about, each tied to an open issue.
// One line per finding: `<issue> <audit type> <screen> <element>`, where the element is
// its identifier, or the start of its label when it has none, or `-` when the audit
// names no element. A finding that isn't listed fails with the line that would list it.
// Fix a new finding rather than listing it. When an issue closes, delete its lines.
enum KnownAccessibilityIssues {
  static let baseline = """
    74 contrast browse Constellation
    74 contrast browse Identity Studio
    74 contrast browse Inbox
    74 contrast browse ROOMS
    74 contrast browse Reflection Garden
    74 contrast browse your studio
    74 contrast capture You'll be guided from here — an ordinary
    74 contrast capture classified-keep
    74 contrast capture e.g. I'm becoming someone who rests befo
    74 contrast find Find a note by its title or words inside
    74 contrast rhythm Add your birth time for the moon, and a
    74 contrast rhythm BIRTH DATE
    74 contrast rhythm BIRTH PLACE
    74 contrast rhythm BIRTH TIME
    74 contrast rhythm Cancel
    74 contrast rhythm Capricorn
    74 contrast rhythm Find
    74 contrast rhythm Find Find
    74 contrast rhythm I know my birth time
    74 contrast rhythm MOON
    74 contrast rhythm RISING
    74 contrast rhythm SUN
    74 contrast rhythm Save
    74 contrast rhythm Use my location
    74 contrast rhythm Use my location Use my location
    74 contrast rhythm Where you were born — adds your rising s
    74 contrast rhythm Your chart
    74 contrast rhythm Your rhythm
    74 contrast rhythm —
    74 contrast room-constellation constellation-empty
    74 contrast room-constellation small moments, bigger patterns
    74 contrast room-current-season How you want it to feel — one per line (
    74 contrast room-current-season One line is plenty — a gentle focus for
    74 contrast room-current-season THE SEASON YOU'RE IN
    74 contrast room-current-season The Even Light
    74 contrast room-current-season What matters this season?
    74 contrast room-current-season YOUR INTENTION
    74 contrast room-current-season season-computed-title
    74 contrast room-identity-studio -
    74 contrast room-identity-studio WHO YOU ARE BECOMING
    74 contrast room-inbox Inbox zero — nothing to sort.
    74 contrast room-inbox to sort
    74 contrast room-journal -
    74 contrast room-journal Add to Journal
    74 contrast room-journal Dated entries — the small moments, caugh
    74 contrast room-journal Nothing here yet.
    74 contrast room-journal thoughts & observations
    74 contrast room-landscape -
    74 contrast room-landscape STRUCTURE & STRATEGY
    74 contrast room-landscape THE SHAPE OF A LIFE
    74 contrast room-landscape What time, environment, help, boundary,
    74 contrast room-landscape area-family
    74 contrast room-landscape area-health-wellbeing
    74 contrast room-landscape area-home
    74 contrast room-landscape area-work-business
    74 contrast room-reflection-garden NOTICE WHAT IS CHANGING
    74 contrast room-reflection-garden Nothing here yet.
    74 contrast room-reflection-garden REFLECTION
    74 contrast room-reflection-garden What's on your mind as you look back?
    74 contrast room-reflection-garden guided-opening-begin
    74 contrast room-uncharted -
    74 contrast room-uncharted LEAVE ROOM FOR POSSIBILITY
    74 contrast room-wisdom-garden 0
    74 contrast room-wisdom-garden Nothing kept here yet.
    74 contrast room-wisdom-garden WHAT YOU WANT TO KEEP
    74 contrast room-wisdom-garden lld 0
    74 contrast settings Becoming
    74 contrast settings Chamomile
    74 contrast settings Current Season
    74 contrast settings Done
    74 contrast settings FOYER
    74 contrast settings Home
    74 contrast settings How I want to feel
    74 contrast settings Identity Studio
    74 contrast settings Inbox
    74 contrast settings Journal
    74 contrast settings MAINTENANCE
    74 contrast settings PROFILE
    74 contrast settings Personalise micro-seasons · on-device
    74 contrast settings RHYTHM
    74 contrast settings ROOMS
    74 contrast settings Reveal rooms as you're ready for them.
    74 contrast settings STUDIO
    74 contrast settings Seasons
    74 contrast settings THEME
    74 contrast settings Uncharted
    74 contrast settings Wisdom Garden
    74 contrast settings home-place-locate
    74 contrast settings home-place-name
    74 contrast settings theme-deep-ocean
    74 contrast settings theme-fig-leaf
    74 contrast settings theme-forest
    74 contrast settings theme-sunset
    74 contrast settings uitest-35A67C72-B2F0-48B5-8F64-30C1BFAC3
    74 contrast settings uitest-<uuid>
    74 contrast sky-ahead @ · @ April 10 · in 21 days
    74 contrast sky-ahead @ · @ April 17 · in 28 days
    74 contrast sky-ahead @ · @ April 2 · in 13 days
    74 contrast sky-ahead @ · @ April 20 · in 31 days
    74 contrast sky-ahead @ · @ April 23 · in 34 days
    74 contrast sky-ahead @ · @ April 24 · in 35 days
    74 contrast sky-ahead @ · @ April 4 · in 15 days
    74 contrast sky-ahead @ · @ April 8 · in 19 days
    74 contrast sky-ahead @ · @ July 14 · in 116 days
    74 contrast sky-ahead @ · @ July 5 · in 107 days
    74 contrast sky-ahead @ · @ July 7 · in 109 days
    74 contrast sky-ahead @ · @ June 15 · in 87 days
    74 contrast sky-ahead @ · @ June 21 · in 93 days
    74 contrast sky-ahead @ · @ June 29 · in 101 days
    74 contrast sky-ahead @ · @ June 5 · in 77 days
    74 contrast sky-ahead @ · @ June 7 · in 79 days
    74 contrast sky-ahead @ · @ June 8 · in 80 days
    74 contrast sky-ahead @ · @ March 20 · today
    74 contrast sky-ahead @ · @ March 23 · in 3 days
    74 contrast sky-ahead @ · @ March 25 · in 5 days
    74 contrast sky-ahead @ · @ May 1 · in 42 days
    74 contrast sky-ahead @ · @ May 16 · in 57 days
    74 contrast sky-ahead @ · @ May 21 · in 62 days
    74 contrast sky-ahead @ · @ May 22 · in 63 days
    74 contrast sky-ahead @ · @ May 23 · in 64 days
    74 contrast sky-ahead @ · @ May 31 · in 72 days
    74 contrast sky-ahead @ · @ May 5 · in 46 days
    74 contrast sky-ahead @ · @ May 7 · in 48 days
    74 contrast sky-ahead @ · @ May 9 · in 50 days
    74 contrast sky-ahead Add your birth date in Your rhythm to tu
    74 contrast sky-ahead April 10 · in 21 days
    74 contrast sky-ahead April 17 · in 28 days
    74 contrast sky-ahead April 2 · in 13 days
    74 contrast sky-ahead April 20 · in 31 days
    74 contrast sky-ahead April 24 · in 35 days
    74 contrast sky-ahead April 4 · in 15 days
    74 contrast sky-ahead April 8 · in 19 days
    74 contrast sky-ahead Astrology
    74 contrast sky-ahead Clear and Green
    74 contrast sky-ahead Done
    74 contrast sky-ahead First quarter
    74 contrast sky-ahead Full moon
    74 contrast sky-ahead July 14 · in 116 days
    74 contrast sky-ahead July 7 · in 109 days
    74 contrast sky-ahead June 15 · in 87 days
    74 contrast sky-ahead June 21 · in 93 days
    74 contrast sky-ahead June 29 · in 101 days
    74 contrast sky-ahead June 5 · in 77 days
    74 contrast sky-ahead June 8 · in 80 days
    74 contrast sky-ahead LAYERS LAYERS
    74 contrast sky-ahead March 20 · today
    74 contrast sky-ahead March 23 · in 3 days
    74 contrast sky-ahead March 25 · in 5 days
    74 contrast sky-ahead March equinox
    74 contrast sky-ahead May 1 · in 42 days
    74 contrast sky-ahead May 16 · in 57 days
    74 contrast sky-ahead May 21 · in 62 days
    74 contrast sky-ahead May 23 · in 64 days
    74 contrast sky-ahead May 31 · in 72 days
    74 contrast sky-ahead May 5 · in 46 days
    74 contrast sky-ahead May 9 · in 50 days
    74 contrast sky-ahead Moon phases
    74 contrast sky-ahead Sky ahead
    74 contrast sky-ahead The Gathering Light
    74 contrast sky-ahead The Long Light
    74 contrast sky-ahead The Long Night
    74 contrast sky-ahead The turning points, moons, and seasons o
    74 contrast sky-ahead balance again, tipping toward the dark
    74 contrast sky-ahead fullness at its height — what has grown
    74 contrast sky-ahead next lunation
    74 contrast sky-ahead spring begins
    74 contrast sky-ahead the dark, a seed — a time to set an inte
    74 contrast sky-ahead the long days building toward their peak
    74 contrast sky-ahead the longest day, fullness at its height
    74 contrast sky-ahead the longest night, the seed of returning
    74 contrast sky-ahead waxing — building momentum
    74 contrast sky-ahead what's coming
    74 contrast today An opening day — a good time to name wha
    74 contrast today First Dew
    74 contrast today Summer · New
    74 contrast today The Even Light
    74 contrast today Today's rhythm
    74 contrast today When you're ready, name the person you'r
    74 contrast today Who are you becoming?
    74 contrast today cool mornings, dew on the grass
    74 contrast today day and night in balance, tipping bright
    74 contrast today good morning
    74 contrast today invitation-card
    74 contrast today-panel An opening day — a good time to name wha
    74 contrast today-panel First Dew
    74 contrast today-panel Summer · 99% through
    74 contrast today-panel Summer · New
    74 contrast today-panel The Even Light
    74 contrast today-panel Today's rhythm
    74 contrast today-panel Winter · 99% through
    74 contrast today-panel Winter · New
    74 contrast today-panel almanac-lunar-season
    74 contrast today-panel almanac-lunation
    74 contrast today-panel almanac-other-season
    74 contrast today-panel almanac-turning-point
    74 contrast today-panel cool mornings, dew on the grass
    74 contrast today-panel day and night in balance, tipping bright
    74 contrast today-panel invitation-card
    74 contrast today-panel sky-ahead-button
    78 hitRegion rhythm Use my location
    78 hitRegion room-identity-studio -
    78 hitRegion room-reflection-garden -
    78 hitRegion room-wisdom-garden -
    78 hitRegion settings home-place-locate
    78 hitRegion settings profile-photo-picker
    78 hitRegion today foyer-hero-begin
    78 hitRegion today invitation-card
    78 hitRegion today today-panel-toggle
    78 hitRegion today-panel invitation-card
    78 hitRegion today-panel rhythm-button
    78 hitRegion today-panel sky-ahead-button
    78 hitRegion today-panel today-panel-toggle
    78 sufficientElementDescription capture classified-body
    78 sufficientElementDescription room-current-season season-feelings-field
    78 sufficientElementDescription room-reflection-garden guided-opening-editor
    78 sufficientElementDescription room-uncharted uncharted-editor
    79 dynamicType browse ROOMS
    79 dynamicType capture Cancel
    79 dynamicType capture Name a becoming
    79 dynamicType capture classified-keep
    79 dynamicType find Search
    79 dynamicType rhythm BIRTH DATE
    79 dynamicType rhythm BIRTH PLACE
    79 dynamicType rhythm BIRTH TIME
    79 dynamicType rhythm Cancel
    79 dynamicType rhythm MOON
    79 dynamicType rhythm RISING
    79 dynamicType rhythm SUN
    79 dynamicType rhythm Save
    79 dynamicType rhythm Your chart
    79 dynamicType rhythm Your rhythm
    79 dynamicType room-current-season THE SEASON YOU'RE IN
    79 dynamicType room-current-season YOUR INTENTION
    79 dynamicType room-identity-studio -
    79 dynamicType room-identity-studio WHO YOU ARE BECOMING
    79 dynamicType room-journal -
    79 dynamicType room-journal Nothing here yet.
    79 dynamicType room-landscape STRUCTURE & STRATEGY
    79 dynamicType room-landscape THE SHAPE OF A LIFE
    79 dynamicType room-landscape What time, environment, help, boundary,
    79 dynamicType room-landscape area-family
    79 dynamicType room-landscape area-health-wellbeing
    79 dynamicType room-landscape area-home
    79 dynamicType room-landscape area-work-business
    79 dynamicType room-reflection-garden NOTICE WHAT IS CHANGING
    79 dynamicType room-reflection-garden Nothing here yet.
    79 dynamicType room-reflection-garden REFLECTION
    79 dynamicType room-uncharted LEAVE ROOM FOR POSSIBILITY
    79 dynamicType room-wisdom-garden 0
    79 dynamicType room-wisdom-garden WHAT YOU WANT TO KEEP
    79 dynamicType room-wisdom-garden add-idea-button
    79 dynamicType room-wisdom-garden lld 0
    79 dynamicType settings Done
    79 dynamicType settings FOYER
    79 dynamicType settings MAINTENANCE
    79 dynamicType settings PROFILE
    79 dynamicType settings RHYTHM
    79 dynamicType settings ROOMS
    79 dynamicType settings STUDIO
    79 dynamicType settings Settings
    79 dynamicType settings THEME
    79 dynamicType sky-ahead Done
    79 dynamicType sky-ahead LAYERS
    79 dynamicType sky-ahead next lunation
    79 dynamicType today ATELIERA
    79 dynamicType today Today's rhythm
    79 dynamicType today invitation-card
    79 dynamicType today-panel Today's rhythm
    79 dynamicType today-panel invitation-card
    80 textClipped capture Name a becoming
    80 textClipped find search-field
    80 textClipped rhythm -
    80 textClipped rhythm Your rhythm Your rhythm
    80 textClipped room-constellation Constellation
    80 textClipped room-constellation constellation-empty
    80 textClipped room-constellation small moments, bigger patterns
    80 textClipped room-current-season The Even Light
    80 textClipped room-current-season season-intention-field
    80 textClipped room-identity-studio -
    80 textClipped room-identity-studio Identity Studio
    80 textClipped room-identity-studio WHO YOU ARE BECOMING
    80 textClipped room-inbox Capture
    80 textClipped room-journal Add to @ Add to Journal
    80 textClipped room-journal Add to Journal
    80 textClipped room-landscape Life Landscape Life Landscape
    80 textClipped room-reflection-garden NOTICE WHAT IS CHANGING NOTICE WHAT IS C
    80 textClipped room-reflection-garden Nothing here yet. Nothing here yet.
    80 textClipped room-reflection-garden One thing from today or lately — no need
    80 textClipped room-reflection-garden Reflection Garden
    80 textClipped room-uncharted Keep possibilities that don't need a pla
    80 textClipped room-uncharted LEAVE ROOM FOR POSSIBILITY
    80 textClipped room-uncharted Leave this beyond the gate
    80 textClipped room-uncharted Uncharted
    80 textClipped room-uncharted What if…? What if…?
    80 textClipped room-uncharted uncharted-keep
    80 textClipped room-wisdom-garden Wisdom Garden
    80 textClipped settings profile-name-field
    80 textClipped sky-ahead The Cooling Dew
    80 textClipped sky-ahead The Deep Quiet
    80 textClipped sky-ahead The Deep Snow
    80 textClipped sky-ahead The Even Dark
    80 textClipped sky-ahead The Feeding Rains
    80 textClipped sky-ahead The Filling
    80 textClipped sky-ahead The Gathering Light
    80 textClipped sky-ahead The Long Light
    80 textClipped sky-ahead The Long Night
    80 textClipped sky-ahead The Slow Heat
    80 textClipped sky-ahead The Warming
    80 textClipped sky-ahead The Withdrawing
    80 textClipped sky-ahead The turning points, moons, and seasons o
    80 textClipped today The Even Light
    80 textClipped today-panel The Even Light
    83 sufficientElementDescription room-constellation constellation-empty
    83 sufficientElementDescription settings profile-avatar
    83 sufficientElementDescription today snowflake
    83 sufficientElementDescription today sun.max
    83 sufficientElementDescription today-panel snowflake
    83 sufficientElementDescription today-panel sun.max
    168 elementDetection rhythm -
    168 elementDetection room-reflection-garden -
    168 elementDetection settings -
    168 elementDetection sky-ahead -
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
    // Each UI test run makes a vault folder with a new UUID in its name.
    let stable = name.replacingOccurrences(
      of: "[0-9A-Fa-f]{8}-[0-9A-Fa-f-]+", with: "<uuid>", options: .regularExpression)
    return Finding(type: typeName(issue.auditType), screen: screen, element: stable)
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
