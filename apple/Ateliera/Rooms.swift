import Foundation

// A room is a view onto the vault filtered by a note's `rooms` frontmatter. The
// Foyer (the home screen) isn't in this list — it's the orientation surface and
// the way into these rooms.
struct Room: Identifiable, Hashable {
  // Most rooms are simply "everything in this vault room". The Inbox and the Journal
  // are two views onto the *same* vault room (`inbox`), split by status: unfiled
  // drafts triage in the Inbox, kept entries live in the Journal. This keeps the
  // vault format one room key (compatible with the web app) while giving the two
  // distinct surfaces.
  enum StatusScope { case any, draft, active }

  let id: String  // the room's UI identity (route + visibility key)
  let title: String
  let eyebrow: String
  let intro: String
  let vaultKey: String  // the room key stored in a note's `rooms`
  let statusScope: StatusScope

  init(
    id: String, title: String, eyebrow: String, intro: String,
    vaultKey: String? = nil, statusScope: StatusScope = .any
  ) {
    self.id = id
    self.title = title
    self.eyebrow = eyebrow
    self.intro = intro
    self.vaultKey = vaultKey ?? id
    self.statusScope = statusScope
  }

  /// Whether a note belongs to this room's view: it lists the room's vault key and,
  /// for the Inbox/Journal split, its status matches the scope. `active` means "kept"
  /// — anything that isn't still a draft.
  func matches(rooms: [String], status: String) -> Bool {
    guard rooms.contains(vaultKey) else { return false }
    switch statusScope {
    case .any: return true
    case .draft: return status == "draft"
    case .active: return status != "draft"
    }
  }

  /// The vault folder a capture for `roomKey` is written into (the room's title,
  /// or the Journal for anything unrecognised). The web app reads notes by their
  /// `rooms` frontmatter regardless of folder; this just keeps paths readable.
  static func folderName(for roomKey: String) -> String {
    all.first { $0.vaultKey == roomKey }?.title ?? "Journal"
  }

  static let all: [Room] = [
    Room(
      id: "reflection-garden", title: "Reflection Garden",
      eyebrow: "notice what is changing",
      intro: "Gather what you're learning and celebrating, so the Studio remembers with you."),
    // The Inbox and the Journal are two views onto the same `inbox` vault room. Quick
    // capture lands here as a draft (the Inbox); keeping or filing a note promotes it
    // (out of the Inbox, into the Journal or another room). The room key stays `inbox`
    // so notes written by earlier versions (and by the web app) still belong here.
    Room(
      id: "inbox", title: "Inbox",
      eyebrow: "to sort",
      intro: "Quick captures waiting to find their place.",
      vaultKey: "inbox", statusScope: .draft),
    Room(
      id: "journal", title: "Journal",
      eyebrow: "thoughts & observations",
      intro: "Dated entries — the small moments, caught as they happen.",
      vaultKey: "inbox", statusScope: .active),
    Room(
      id: "wisdom-garden", title: "Wisdom Garden",
      eyebrow: "what you want to keep",
      intro: "Lessons, lines, and truths worth returning to."),
    Room(
      id: "landscape", title: "Life Landscape",
      eyebrow: "the shape of a life",
      intro: "Your life areas across vision, identity, decisions, practices, and structure."),
    Room(
      id: "identity-studio", title: "Identity Studio",
      eyebrow: "who you are becoming",
      intro: "What's already true, what you're practicing, and the shifts along the way."),
    Room(
      id: "uncharted", title: "Uncharted",
      eyebrow: "leave room for possibility",
      intro: "Keep possibilities that don't need a plan yet."),
    Room(
      id: "current-season", title: "Current Season",
      eyebrow: "a humane present focus",
      intro: "Name what matters now as a gentle chapter."),
    // Constellation (v2 Phase 7, first-cut spike): a read-only view of moments as
    // dots and their real relationships as lines. It has no vault room of its own —
    // it reads across every room — so its `vaultKey` is a sentinel no note carries,
    // keeping the Foyer room-count badge empty for it.
    Room(
      id: "constellation", title: "Constellation",
      eyebrow: "small moments, bigger patterns",
      intro: "Your moments as dots, and the meaning between them as lines.",
      vaultKey: "__constellation__"),
  ]
}
