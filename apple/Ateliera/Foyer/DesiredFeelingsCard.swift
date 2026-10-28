import SwiftUI

// The Today card for "How I want to feel": the feelings a person is making room for,
// from the Identity board, as visible as Today's Gift and in the same shape. It only
// shows when the Foyer section is on and there is something to show; never an empty
// card or a prompt to add one.

// What the card resolves to — pure, so the gating and the cap are testable without a
// view. Up to three feelings in board order, blanks skipped.
enum DesiredFeelingsCardModel: Equatable {
  case feelings([IdentityCardModel])
  case hidden

  init(_ board: IdentityBoardModel, sectionVisible: Bool) {
    guard sectionVisible else {
      self = .hidden
      return
    }
    let feelings = (board.sections[.desiredFeelings] ?? [])
      .filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .prefix(3)
    self = feelings.isEmpty ? .hidden : .feelings(Array(feelings))
  }
}

struct DesiredFeelingsCard: View {
  @Environment(\.studioTheme) private var theme
  let model: DesiredFeelingsCardModel
  let onOpen: (String) -> Void

  var body: some View {
    if case .feelings(let feelings) = model {
      VStack(alignment: .leading, spacing: 12) {
        Text("HOW I WANT TO FEEL")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        VStack(alignment: .leading, spacing: 0) {
          ForEach(feelings) { feeling in
            Button {
              onOpen(feeling.path)
            } label: {
              VStack(alignment: .leading, spacing: 3) {
                Text(feeling.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
                if feeling.hasExplicitTitle, !feeling.excerpt.isEmpty {
                  Text(feeling.excerpt).font(StudioFont.meta).foregroundStyle(theme.inkMuted)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.vertical, 8).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(feeling.title)
            .accessibilityHint("Opens this feeling")
            if feeling.id != feelings.last?.id {
              Divider().overlay(theme.line)
            }
          }
        }
      }
      .studioCard()
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("feelings-card")
    }
  }
}
