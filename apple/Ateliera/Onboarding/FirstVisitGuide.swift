import SwiftUI

// The five-step first-visit tour, shown as a calm modal. Move forward through the
// rooms or leave at any time; there's no spotlight and nothing is blocked.
struct FirstVisitGuide: View {
  @Environment(\.studioTheme) private var theme
  let onFinish: () -> Void

  @State private var index = 0

  private var step: TourStep { TourStep.allCases[index] }
  private var isLast: Bool { index == TourStep.allCases.count - 1 }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 18) {
        Text("A gentle tour")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        Text("Step \(index + 1) of \(TourStep.allCases.count)")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
        Text(step.title)
          .font(StudioFont.roomTitle).tracking(-0.5).foregroundStyle(theme.inkStrong)
          .accessibilityIdentifier("tour-title")
        Text(step.body)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
        Spacer()
        HStack {
          Button("Leave tour") { onFinish() }
            .font(StudioFont.control).foregroundStyle(theme.inkMuted)
            .accessibilityIdentifier("tour-leave")
          Spacer()
          Button(isLast ? "Step inside" : "Next room") {
            if isLast { onFinish() } else { index += 1 }
          }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("tour-next")
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(theme.canvas)
    }
    .interactiveDismissDisabled()
  }
}
