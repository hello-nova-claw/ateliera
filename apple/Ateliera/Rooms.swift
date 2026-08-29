import Foundation

// A room is a view onto the vault filtered by a note's `rooms` frontmatter. The
// Foyer (the home screen) isn't in this list — it's the orientation surface and
// the way into these rooms.
struct Room: Identifiable, Hashable {
  let id: String  // the room key stored in a note's `rooms`
  let title: String
  let eyebrow: String
  let intro: String

  /// The vault folder a capture for `roomKey` is written into (the room's title,
  /// or "Inbox" for anything unrecognised). The web app reads notes by their
  /// `rooms` frontmatter regardless of folder; this just keeps paths readable.
  static func folderName(for roomKey: String) -> String {
    all.first { $0.id == roomKey }?.title ?? "Inbox"
  }

  static let all: [Room] = [
    Room(
      id: "reflection-garden", title: "Reflection Garden",
      eyebrow: "notice what is changing",
      intro: "Gather what you're learning and celebrating, so the Studio remembers with you."),
    Room(
      id: "inbox", title: "Inbox",
      eyebrow: "caught, not yet placed",
      intro: "Quick captures, waiting here until they find their room."),
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
  ]
}
