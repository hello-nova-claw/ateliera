import SwiftUI

// Phase 3 — the workshop. A captured seed expands into the Life Landscape: first anchor
// it to an area of life, then walk the life-design dimensions one calm, skippable prompt
// at a time. Anchoring links the seed's `lifeAreas`; each answered dimension writes a real
// Landscape card through the same tested capture path (LandscapeStore.addCard). Fully
// resumable — close anytime and whatever you've written already persists.
struct WorkshopView: View {
  // How the thread is framed. `.becoming` starts from a "becoming" statement and weaves
  // it into every prompt (the guided life-planning flow); `.develop` keeps the plain,
  // golden-matched prompts for developing an ordinary captured note.
  enum Mode { case becoming, develop }

  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let seedPath: String
  let seedText: String
  let mode: Mode
  let onClose: () -> Void

  @State private var landscape: LandscapeStore
  @State private var step = 0  // 0 = anchor · 1…count = dimensions · count+1 = closing
  @State private var chosenAreaId: String?
  @State private var chosenAreaTitle: String?
  @State private var newAreaText = ""
  @State private var draft = ""
  @State private var added = 0
  @State private var seedId: String?  // resolved from the seed note, to link cards back to it
  @State private var supersede: Supersede?  // an area's existing becoming, offered for retiring

  // The becoming already active in the chosen area — offered for retiring so each area
  // keeps one in play at a time (keeping both stays possible).
  private struct Supersede: Identifiable {
    let id = UUID()
    let path: String
    let title: String
  }

  init(
    store: VaultStore, seedPath: String, seedText: String, mode: Mode = .develop,
    onClose: @escaping () -> Void
  ) {
    self.store = store
    self.seedPath = seedPath
    self.seedText = seedText
    self.mode = mode
    self.onClose = onClose
    _landscape = State(initialValue: LandscapeStore(store: store))
  }

  private let dimensions = LandscapeAnchor.ordered

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          if step == 0 {
            anchorStep
          } else if step <= dimensions.count {
            dimensionStep(dimensions[step - 1])
          } else {
            closingStep
          }
        }
        .padding(28).frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .task {
        landscape.loadConfig()
        landscape.refresh()
        // Resolve the seed's id once, so every card the thread writes can point back to it.
        seedId = store.beginEdit(path: seedPath)?.note.id
      }
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text(mode == .becoming ? "Become" : "Workshop")
            .font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button(step == 0 ? "Not now" : "Save & leave") { onClose() }
            .foregroundStyle(theme.link)
            .accessibilityIdentifier("workshop-leave")
        }
      }
      .confirmationDialog(
        "Already becoming here",
        isPresented: Binding(
          get: { supersede != nil },
          set: { if !$0 { supersede = nil; advanceFromAnchor() } }),
        presenting: supersede
      ) { existing in
        ForEach(BecomingRetireReason.allCases) { reason in
          Button(reason.label) {
            _ = store.retireBecoming(path: existing.path, reason: reason.rawValue)
          }
        }
        Button("Keep both active") {}
        Button("Cancel", role: .cancel) {}
      } message: { existing in
        Text(
          "You're already becoming “\(existing.title)” in \(chosenAreaTitle ?? "this area"). Retire it, or keep both?"
        )
      }
    }
  }

  // MARK: - Anchor the seed to a life area

  private var anchorStep: some View {
    VStack(alignment: .leading, spacing: 22) {
      eyebrow("you wrote")
      Text("“\(seedText)”")
        .font(StudioFont.quote).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      VStack(alignment: .leading, spacing: 6) {
        Text("Where does this belong?").font(StudioFont.section).foregroundStyle(theme.inkStrong)
        Text("Anchor it to an area of your life, so it has a place to grow.")
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
      }
      VStack(alignment: .leading, spacing: 10) {
        ForEach(landscape.areas) { area in
          areaRow(area.title) { choose(id: area.id, title: area.title) }
        }
      }
      HStack(spacing: 8) {
        TextField("New area…", text: $newAreaText)
          .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
          .accessibilityIdentifier("workshop-new-area-field")
        Button("Add") { addAndChooseArea() }
          .font(StudioFont.control).foregroundStyle(theme.link)
          .disabled(newAreaText.trimmingCharacters(in: .whitespaces).isEmpty)
          .accessibilityIdentifier("workshop-add-area")
      }
      .padding(14)
      .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
    }
  }

  private func areaRow(_ title: String, _ tap: @escaping () -> Void) -> some View {
    Button(action: tap) {
      HStack {
        Text(title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
        Spacer()
        Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
      }
      .padding(.vertical, 14).padding(.horizontal, 16)
      .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
      .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("workshop-area-\(title)")
  }

  private func choose(id: String, title: String) {
    chosenAreaId = id
    chosenAreaTitle = title
    linkSeed(toAreaId: id)
    // In becoming mode, if this area already holds an active becoming, offer to retire it
    // (one per area at a time) before walking the thread; otherwise go straight in.
    if mode == .becoming, let existing = existingBecoming(inArea: id) {
      supersede = existing
    } else {
      advanceFromAnchor()
    }
  }

  private func advanceFromAnchor() {
    guard step == 0 else { return }
    withAnimation(.easeInOut(duration: 0.25)) { step = 1 }
  }

  private func existingBecoming(inArea id: String) -> Supersede? {
    let excluding = seedId ?? store.beginEdit(path: seedPath)?.note.id
    guard let other = store.activeBecomings(inArea: id, excludingId: excluding).first else {
      return nil
    }
    return Supersede(path: other.path, title: other.title)
  }

  private func addAndChooseArea() {
    let title = newAreaText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, landscape.addArea(title: title) else { return }
    landscape.refresh()
    guard let area = landscape.areas.first(where: { $0.title == title }) else { return }
    newAreaText = ""
    choose(id: area.id, title: area.title)
  }

  // Append the chosen area to the seed note's lifeAreas (once), through the write rail.
  private func linkSeed(toAreaId id: String) {
    guard let editable = store.beginEdit(path: seedPath) else { return }
    var note = editable.note
    guard !note.lifeAreas.contains(id) else { return }
    note.lifeAreas.append(id)
    _ = store.saveEdit(editable, updatedNote: note)
  }

  // MARK: - Walk the dimensions

  private func dimensionStep(_ anchor: LandscapeAnchor) -> some View {
    ThreadStepView(
      eyebrow: "\(chosenAreaTitle ?? "") · \(anchor.label)",
      prompt: mode == .becoming ? anchor.prompt(seed: seedText) : anchor.prompt,
      placeholder: "Write what comes — or skip it.",
      draft: $draft,
      stepIndex: step - 1,
      stepCount: dimensions.count,
      isLast: step == dimensions.count,
      onSkip: { advance(write: false, anchor: anchor) },
      onNext: { advance(write: true, anchor: anchor) })
  }

  private func advance(write: Bool, anchor: LandscapeAnchor) {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    // The answer is the card's content: it becomes the title so the Landscape shows it.
    // In becoming mode the card links back to the seed statement via `source_notes`.
    if write, !text.isEmpty, let areaId = chosenAreaId,
      landscape.addCard(
        lifeArea: areaId, anchor: anchor, horizon: nil, title: text, body: text,
        sourceNoteId: seedId)
    {
      added += 1
    }
    draft = ""
    withAnimation(.easeInOut(duration: 0.25)) { step += 1 }
  }

  // MARK: - Closing

  private var closingStep: some View {
    VStack(alignment: .leading, spacing: 20) {
      eyebrow("taking shape")
      Text("Your \(chosenAreaTitle ?? "landscape") is a little clearer.")
        .font(StudioFont.roomTitle).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      Text(
        added == 0
          ? "Whenever you're ready, you can return and keep shaping it."
          : "You added \(added) \(added == 1 ? "note" : "notes") across the dimensions — they now live on your Life Landscape."
      )
      .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
      .fixedSize(horizontal: false, vertical: true)
      ConstellationProgress(total: dimensions.count, done: dimensions.count)
      Button("Done") { onClose() }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .padding(.top, 6).accessibilityIdentifier("workshop-done")
    }
  }

  private func eyebrow(_ t: String) -> some View {
    Text(t.uppercased()).font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
  }
}

// The constellation motif as a progress trail: dots joined by faint lines, filled as you
// move through the dimensions.
struct ConstellationProgress: View {
  @Environment(\.studioTheme) private var theme
  let total: Int
  let done: Int

  var body: some View {
    HStack(spacing: 10) {
      ForEach(0..<total, id: \.self) { i in
        Circle()
          .fill(i < done ? theme.link : theme.line)
          .frame(width: i < done ? 9 : 7, height: i < done ? 9 : 7)
        if i < total - 1 {
          Rectangle().fill(theme.line).frame(width: 16, height: 1)
        }
      }
    }
    .accessibilityHidden(true)
  }
}
