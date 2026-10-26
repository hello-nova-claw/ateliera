import SwiftUI

// A calm follow-up prompt in a guided thread.
struct ThreadPrompt: Decodable {
  let eyebrow: String
  let prompt: String
  let placeholder: String
}

// The guided threads' wording is content: Content/guided-threads.json.
struct GuidedThreadCopy: Decodable {
  struct Thread: Decodable {
    struct Closing: Decodable {
      let title: String
      let body: String
    }

    let opening: ThreadPrompt
    let steps: [ThreadPrompt]
    let closing: Closing
  }

  struct WorkForward: Decodable {
    let prompt: String
    let body: String
  }

  let reflection: Thread
  let gratitude: Thread
  let possibilities: Thread
  let workForward: WorkForward
  let stepFooter: String

  static let library: GuidedThreadCopy = ContentLibrary.load("guided-threads")
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

  private var copy: GuidedThreadCopy.Thread {
    switch self {
    case .reflection: return GuidedThreadCopy.library.reflection
    case .gratitude: return GuidedThreadCopy.library.gratitude
    case .possibilities: return GuidedThreadCopy.library.possibilities
    }
  }

  // The single inviting prompt a room leads with. Answering it captures the seed note.
  var opening: ThreadPrompt { copy.opening }

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

  var steps: [ThreadPrompt] { copy.steps }

  var closingTitle: String { copy.closing.title }

  var closingBody: String { copy.closing.body }
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
  // For a Possibility, the closing step offers to work it forward into a reverse,
  // backwards-in-time Landscape thread. Optional and always skippable — leaving it in
  // Uncharted (the plain "Done") stays the default.
  var onWorkshopForward: (() -> Void)? = nil

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
      if let onWorkshopForward {
        // A gentle fork: leave the Possibility in Uncharted, or work it forward into a
        // backwards-in-time Landscape thread. Neither is urged over the other.
        VStack(alignment: .leading, spacing: 12) {
          Text(GuidedThreadCopy.library.workForward.prompt)
            .font(StudioFont.section).foregroundStyle(theme.inkStrong)
            .fixedSize(horizontal: false, vertical: true)
          Text(GuidedThreadCopy.library.workForward.body)
            .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
          HStack(spacing: 20) {
            Button("Leave it here") { onClose() }
              .font(StudioFont.control).foregroundStyle(theme.inkMuted)
              .accessibilityIdentifier("possibility-leave")
            Button("Work it forward") { onWorkshopForward() }
              .font(StudioFont.control).foregroundStyle(theme.link)
              .accessibilityIdentifier("possibility-forward")
          }
        }
        .padding(.top, 6)
      } else {
        Button("Done") { onClose() }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .padding(.top, 6).accessibilityIdentifier("guided-done")
      }
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
