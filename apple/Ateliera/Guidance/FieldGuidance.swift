import SwiftUI

// Writing guidance for an input field: a one-line description of what belongs there,
// plus a concrete greyed "e.g. …" example shown as the control's placeholder. Ported
// verbatim from the web `field-guidance.ts` files so mobile guides as clearly as the
// desktop app. Copy is data, not scattered through views.
struct FieldGuidance: Equatable {
  let description: String
  let example: String
}

// A labelled field with its one-line description above the control — the native
// counterpart of the web `GuidedField`. The control supplies its own example
// placeholder (see `GuidedEditor`, or a TextField whose prompt is the example).
struct GuidedField<Content: View>: View {
  @Environment(\.studioTheme) private var theme
  var label: String?
  let description: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let label {
        Text(label.uppercased())
          .font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(theme.inkFaint)
      }
      Text(description)
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      content()
    }
  }
}

// A multi-line editor showing the guidance example greyed as its placeholder, matching
// the capture sheet's treatment.
struct GuidedEditor: View {
  @Environment(\.studioTheme) private var theme
  @Binding var text: String
  let example: String
  var minHeight: CGFloat = 120
  var accessibilityId: String?

  var body: some View {
    ZStack(alignment: .topLeading) {
      if text.isEmpty {
        Text(example)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkFaint)
          .padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
      }
      TextEditor(text: $text)
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
        .scrollContentBackground(.hidden).frame(minHeight: minHeight)
        .accessibilityIdentifier(accessibilityId ?? "")
    }
  }
}
