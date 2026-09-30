import SwiftUI

// The Foyer's Today's Gift card — the native mirror of `TodaysGift.tsx`. A calm
// eyebrow, the resurfaced note's title + excerpt, and (for a real card) a gentle
// "How did this land?" with three keyboard/VoiceOver-operable text actions. No
// streaks, counts, or overdue badges (PRD). The status line announces the grade
// result to assistive tech.
struct TodaysGiftView: View {
  @Environment(\.studioTheme) private var theme
  let store: GiftStore
  let onGrade: (Int) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("TODAY'S GIFT")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)

      switch store.gift {
      case .line(let title, let excerpt):
        Text(title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        if !excerpt.isEmpty {
          Text(excerpt).font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
        }
      case .card(let title, let excerpt, _, _, _, _):
        cardBody(title: title, excerpt: excerpt)
      }
    }
    .studioCard()
  }

  private func cardBody(title: String, excerpt: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      if !excerpt.isEmpty {
        Text(excerpt)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
      }
      gradeGroup
      statusLine
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("gift-card")
  }

  private var busy: Bool {
    if case .busy = store.keepState { return true }
    return false
  }

  private var gradeGroup: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("How did this land?")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
      VStack(alignment: .leading, spacing: 12) {
        action("Not now", id: "gift-grade-not-now", quality: 2)
        action("Keep", id: "gift-grade-keep", quality: 4)
        action("This landed deeply", id: "gift-grade-deeply", quality: 5)
      }
    }
    .padding(.top, 4)
  }

  private func action(_ label: String, id: String, quality: Int) -> some View {
    Button(label) { onGrade(quality) }
      .font(StudioFont.control)
      .foregroundStyle(busy ? theme.inkFaint : theme.link)
      .buttonStyle(.plain)
      .disabled(busy)
      .accessibilityIdentifier(id)
  }

  @ViewBuilder private var statusLine: some View {
    switch store.keepState {
    case .idle:
      EmptyView()
    case .busy:
      status("Saving…", colour: theme.inkFaint)
    case .success(let message):
      status(message, colour: theme.growth)
    case .error(let message):
      status(message, colour: theme.celebration)
    }
  }

  private func status(_ text: String, colour: Color) -> some View {
    Text(text)
      .font(StudioFont.meta).foregroundStyle(colour)
      .accessibilityIdentifier("gift-status")
      .accessibilityAddTraits(.updatesFrequently)
  }
}
