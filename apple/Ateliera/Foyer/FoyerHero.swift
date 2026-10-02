import SwiftUI

// The Foyer hero. The app wordmark recedes to a quiet rail (an eyebrow), and the first
// meaningful thing you read is who you are becoming — your current becoming statement.
// When no becoming is in play yet it degrades to a calm invitation to begin one; never a
// blank or a nag.

// What the hero resolves to — pure, so the selection + empty-state logic is testable
// without a view. A becoming hero carries the statement, an optional excerpt, and the
// note path to open; otherwise it invites you to begin one.
enum FoyerHeroModel: Equatable {
  // `hasExplicitTitle` false means the statement IS the note's text (not a separate
  // title), so the excerpt would just repeat it and is dropped.
  case becoming(statement: String, excerpt: String, path: String, hasExplicitTitle: Bool)
  case invite

  init(_ board: IdentityBoardModel) {
    // Prefer the promoted "currently becoming" (a practicing-now card, or a legacy
    // Foyer-pinned identity card); else the newest active becoming (one per life area,
    // already newest-first from the projector). A blank statement is no hero.
    if let card = board.currentlyBecoming,
      !card.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      self = .becoming(
        statement: card.title, excerpt: card.excerpt, path: card.path,
        hasExplicitTitle: card.hasExplicitTitle)
      return
    }
    if let first = board.activeBecomings.first(where: {
      !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }) {
      self = .becoming(
        statement: first.title, excerpt: first.excerpt, path: first.path,
        hasExplicitTitle: first.hasExplicitTitle)
      return
    }
    self = .invite
  }
}

// The rendered hero: a receded wordmark rail, then the becoming as the page's hero (or a
// calm invitation when there isn't one yet).
struct FoyerHero: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let greeting: String
  let onOpen: (String) -> Void
  let onBegin: () -> Void

  // Honour the "becoming" Foyer-section preference: switched off, the hero steps back to
  // the quiet welcome rather than surfacing the statement.
  private var model: FoyerHeroModel {
    guard Preferences.isFoyerSectionVisible("becoming", store.preferences) else { return .invite }
    return FoyerHeroModel(store.foyerIdentity())
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      wordmarkRail
      switch model {
      case .becoming(let statement, let excerpt, let path, let hasExplicitTitle):
        becomingHero(
          statement: statement, excerpt: hasExplicitTitle ? excerpt : "", path: path)
      case .invite:
        inviteHero
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // The app identity, quietly: the constellation mark beside the name in tracked caps,
  // with the profile avatar. No longer the centrepiece — just the rail you came in by.
  private var wordmarkRail: some View {
    HStack(spacing: 10) {
      ConstellationMark(size: 18, color: theme.inkFaint)
      Text("ATELIERA")
        .font(StudioFont.interface(11, weight: .medium))
        .tracking(3)
        .foregroundStyle(theme.inkSoft)
      Spacer(minLength: 0)
      ProfileAvatar(store: store, size: 40)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Ateliera")
    .accessibilityAddTraits(.isHeader)
  }

  // The hero: "you are becoming" over the statement itself, large and high-contrast, in
  // the display serif. Tapping it opens the becoming. The greeting sits beneath as a
  // quiet welcome, never competing with the statement.
  private func becomingHero(statement: String, excerpt: String, path: String) -> some View {
    Button { onOpen(path) } label: {
      VStack(alignment: .leading, spacing: 8) {
        Text("YOU ARE BECOMING")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.vision)
        Text(statement)
          .font(StudioFont.display(38))
          .tracking(-0.4)
          .foregroundStyle(theme.inkStrong)
          .fixedSize(horizontal: false, vertical: true)
        if !excerpt.isEmpty {
          Text(excerpt)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
        }
        Text(greeting)
          .font(StudioFont.greeting).foregroundStyle(theme.script)
          .padding(.top, 2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      excerpt.isEmpty
        ? "You are becoming \(statement)." : "You are becoming \(statement). \(excerpt)")
    .accessibilityHint("Opens this becoming")
    .accessibilityIdentifier("foyer-hero-becoming")
  }

  // No becoming yet: a warm welcome and a calm, optional invitation to name one. Not a
  // task, not a prompt that returns — just an open door.
  private var inviteHero: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(greeting)
        .font(StudioFont.greeting).foregroundStyle(theme.script)
      Text("Who are you becoming?")
        .font(StudioFont.display(38))
        .tracking(-0.4)
        .foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      Text("When you're ready, name the person you're growing into. It can be a few words.")
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      Button(action: onBegin) {
        HStack(spacing: 6) {
          Text("Begin a becoming").font(StudioFont.control)
          Image(systemName: "arrow.right").font(.system(size: 11))
        }
        .foregroundStyle(theme.link)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .padding(.top, 2)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("Begin a becoming")
      .accessibilityAddTraits(.isButton)
      .accessibilityHint("Name the person you're growing into")
      .accessibilityIdentifier("foyer-hero-begin")
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
