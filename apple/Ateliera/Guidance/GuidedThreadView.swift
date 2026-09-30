import SwiftUI

// A calm follow-up prompt in a guided thread.
struct ThreadPrompt {
  let eyebrow: String
  let prompt: String
  let placeholder: String
}

// The guided threads that deepen a just-captured entry a prompt at a time. Gratitude
// turns a win into a small reflection (who helped, what it means); Dream lets a
// possibility breathe (what draws you, the smallest hint) without asking for a plan.
// Each answered step appends to the seed note's body — one entry that grows — so the
// vault keeps a single, richer note rather than scattered fragments.
enum GuidedThreadKind {
  case gratitude, dream

  var title: String {
    switch self {
    case .gratitude: return "Celebrate"
    case .dream: return "Dream"
    }
  }

  var steps: [ThreadPrompt] {
    switch self {
    case .gratitude:
      return [
        ThreadPrompt(
          eyebrow: "gratitude", prompt: "Who or what helped make it happen?",
          placeholder: "A person, a circumstance, a small mercy."),
        ThreadPrompt(
          eyebrow: "gratitude", prompt: "What does this tell you about the life you're building?",
          placeholder: "The thread from this moment to who you're becoming."),
      ]
    case .dream:
      return [
        ThreadPrompt(
          eyebrow: "dream", prompt: "What draws you to it?",
          placeholder: "The feeling underneath — no plan needed."),
        ThreadPrompt(
          eyebrow: "dream", prompt: "What's the smallest hint of it you could notice or try?",
          placeholder: "A tiny nudge, if any. It can stay a question."),
      ]
    }
  }

  var closingTitle: String {
    switch self {
    case .gratitude: return "Kept."
    case .dream: return "Left as a possibility."
    }
  }

  var closingBody: String {
    switch self {
    case .gratitude: return "This is on your Reflection Garden."
    case .dream: return "It's in Uncharted — no plan attached."
    }
  }
}

// Walks a seed note through a kind's follow-up prompts, appending each answer to its
// body. Skippable and resumable; leaving keeps whatever's been written. Reuses
// `ThreadStepView` so every guided thread feels the same.
struct GuidedThreadView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let seedPath: String
  let seedText: String
  let kind: GuidedThreadKind
  let onClose: () -> Void

  @State private var step = 0  // 0..<steps.count prompts, then a closing card
  @State private var draft = ""
  @State private var added = 0

  private var steps: [ThreadPrompt] { kind.steps }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          if step < steps.count {
            if step == 0 { seedQuote }
            let prompt = steps[step]
            ThreadStepView(
              eyebrow: prompt.eyebrow, prompt: prompt.prompt, placeholder: prompt.placeholder,
              draft: $draft, stepIndex: step, stepCount: steps.count,
              isLast: step == steps.count - 1,
              onSkip: { advance(write: false) }, onNext: { advance(write: true) })
          } else {
            closingStep
          }
        }
        .padding(28).frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text(kind.title).font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button(step == 0 ? "Not now" : "Save & leave") { onClose() }
            .foregroundStyle(theme.link)
            .accessibilityIdentifier("guided-leave")
        }
      }
    }
  }

  private var seedQuote: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("you wrote").font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text("“\(seedText)”")
        .font(StudioFont.quote).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var closingStep: some View {
    VStack(alignment: .leading, spacing: 20) {
      Text("taking shape").font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
      Text(kind.closingTitle)
        .font(StudioFont.roomTitle).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      Text(kind.closingBody)
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      Button("Done") { onClose() }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .padding(.top, 6).accessibilityIdentifier("guided-done")
    }
  }

  private func advance(write: Bool) {
    if write {
      _ = store.appendGuidedAnswer(path: seedPath, heading: steps[step].prompt, answer: draft)
    }
    draft = ""
    withAnimation(.easeInOut(duration: 0.25)) { step += 1 }
  }
}
