import SwiftUI

// A calm follow-up prompt in a guided thread.
struct ThreadPrompt {
  let eyebrow: String
  let prompt: String
  let placeholder: String
}

// The guided threads that deepen a just-captured entry a prompt at a time. Reflection
// gently looks back (what you noticed, what it means) in place of a blank page; Gratitude
// turns a win into a small celebration (who helped, what it means); Possibilities lets a
// future you're reaching toward breathe (what draws you, the smallest hint) without
// asking for a plan. Each kind also carries its own OPENING prompt + capture destination,
// so a room can offer one inviting entry point — the opener is captured as a real note,
// then the follow-up steps append to that same note's body (one entry that grows) rather
// than scattering fragments.
enum GuidedThreadKind: Hashable {
  case reflection, gratitude, possibilities

  var title: String {
    switch self {
    case .reflection: return "Reflect"
    case .gratitude: return "Celebrate"
    case .possibilities: return "Possibilities"
    }
  }

  // The single inviting prompt a room leads with. Answering it captures the seed note.
  var opening: ThreadPrompt {
    switch self {
    case .reflection:
      return ThreadPrompt(
        eyebrow: "reflection", prompt: "What's on your mind as you look back?",
        placeholder: "One thing from today or lately — no need to tidy it.")
    case .gratitude:
      return ThreadPrompt(
        eyebrow: "celebration", prompt: "What's one thing that went well?",
        placeholder: "A win, a small mercy, something you're grateful for.")
    case .possibilities:
      return ThreadPrompt(
        eyebrow: "possibility", prompt: "What if…?",
        placeholder: "A possibility you want to keep — no plan attached.")
    }
  }

  // Where answering the opener writes the seed note.
  var destination: CaptureDestination {
    switch self {
    case .reflection:
      return .reflectionEntry
    case .gratitude:
      return .celebration
    case .possibilities:
      return .uncharted(beyond: false)
    }
  }

  var steps: [ThreadPrompt] {
    switch self {
    case .reflection:
      return [
        ThreadPrompt(
          eyebrow: "reflection", prompt: "What did you notice or learn in it?",
          placeholder: "A pattern, a feeling, a small realisation."),
        ThreadPrompt(
          eyebrow: "reflection", prompt: "What does it tell you about what matters to you?",
          placeholder: "The thread from this to who you're becoming."),
      ]
    case .gratitude:
      return [
        ThreadPrompt(
          eyebrow: "gratitude", prompt: "Who or what helped make it happen?",
          placeholder: "A person, a circumstance, a small mercy."),
        ThreadPrompt(
          eyebrow: "gratitude", prompt: "What does this tell you about the life you're building?",
          placeholder: "The thread from this moment to who you're becoming."),
      ]
    case .possibilities:
      return [
        ThreadPrompt(
          eyebrow: "possibility", prompt: "What draws you to it?",
          placeholder: "The feeling underneath — no plan needed."),
        ThreadPrompt(
          eyebrow: "possibility", prompt: "What's the smallest hint of it you could notice or try?",
          placeholder: "A tiny nudge, if any. It can stay a question."),
      ]
    }
  }

  var closingTitle: String {
    switch self {
    case .reflection: return "Noticed."
    case .gratitude: return "Kept."
    case .possibilities: return "Left as a possibility."
    }
  }

  var closingBody: String {
    switch self {
    case .reflection: return "This is on your Reflection Garden."
    case .gratitude: return "This is on your Reflection Garden."
    case .possibilities: return "It's in Uncharted — no plan attached."
    }
  }
}

// Walks a seed note through a kind's follow-up prompts, appending each answer to its
// body. Skippable and resumable; leaving keeps whatever's been written. Reuses
// `ThreadStepView` so every guided thread feels the same.
struct GuidedThreadView: View {
  // A just-captured entry to deepen with its follow-up prompts — used to drive the
  // thread sheet from a room's guided entry point.
  struct Seed: Identifiable {
    let id = UUID()
    let path: String
    let text: String
  }

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
