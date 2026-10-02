import SwiftUI

// The richer Foyer surface: the feelings you're making room for and the principles you
// steer by — fed from the Identity Studio and gated by the Foyer-section preferences.
// (Who you're becoming is now the Foyer hero, not a card here — see FoyerHero.) Each
// section only appears when it has content and is switched on.
struct FoyerRichView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void

  private var board: IdentityBoardModel { store.foyerIdentity() }
  private var prefs: StoredStudioPreferences { store.preferences }

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      if Preferences.isFoyerSectionVisible("feelings", prefs) {
        cardsSection(
          "How I want to feel", cards: Array((board.sections[.desiredFeelings] ?? []).prefix(3)))
      }
      if Preferences.isFoyerSectionVisible("principles", prefs) {
        cardsSection(
          "Principles", cards: Array((board.sections[.valuesPrinciples] ?? []).prefix(3)))
      }
    }
  }

  @ViewBuilder
  private func cardsSection(_ title: String, cards: [IdentityCardModel]) -> some View {
    if !cards.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(title.uppercased())
          .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
        ForEach(cards) { card in
          Button { onOpen(card.path) } label: {
            VStack(alignment: .leading, spacing: 3) {
              Text(card.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              if !card.excerpt.isEmpty {
                Text(card.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                  .lineLimit(2).fixedSize(horizontal: false, vertical: true)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          Divider().overlay(theme.line)
        }
      }
    }
  }
}
