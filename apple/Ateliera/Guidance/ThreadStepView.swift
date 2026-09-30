import SwiftUI

// One calm step of a guided thread: a progress trail, a small eyebrow, the prompt,
// a skippable editor, and Skip / Next (or Finish). Extracted from the Workshop so the
// gratitude and dream threads can reuse the same one-prompt-at-a-time shape. Keeps the
// existing `workshop-*` accessibility identifiers so current tests keep passing.
struct ThreadStepView: View {
  @Environment(\.studioTheme) private var theme
  let eyebrow: String
  let prompt: String
  let placeholder: String
  @Binding var draft: String
  let stepIndex: Int  // 0-based position in the thread
  let stepCount: Int
  let isLast: Bool
  let onSkip: () -> Void
  let onNext: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      ConstellationProgress(total: stepCount, done: stepIndex)
      Text(eyebrow.uppercased()).font(StudioFont.eyebrow).tracking(1.6)
        .foregroundStyle(theme.inkFaint)
      Text(prompt)
        .font(StudioFont.section).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      ZStack(alignment: .topLeading) {
        if draft.isEmpty {
          Text(placeholder)
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
            .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
        }
        TextEditor(text: $draft)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
          .scrollContentBackground(.hidden).frame(minHeight: 130)
          .accessibilityIdentifier("workshop-editor")
      }
      .padding(12)
      .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
      HStack {
        Button("Skip", action: onSkip)
          .font(StudioFont.control).foregroundStyle(theme.inkMuted)
          .accessibilityIdentifier("workshop-skip")
        Spacer()
        Button(isLast ? "Finish" : "Next", action: onNext)
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("workshop-next")
      }
      Text("Take what's useful, leave the rest. You can always come back.")
        .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
    }
  }
}
