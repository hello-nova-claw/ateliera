import SwiftUI

// Shown when a save loses a race (the note changed on another device between opening
// and saving). Rather than silently drop the edit, it shows the draft beside the
// stored version and offers three calm choices.
struct ConflictMergeView: View {
  @Environment(\.studioTheme) private var theme
  let conflict: ConflictState
  let onKeepStored: () -> Void
  let onOverwrite: () -> Void
  let onSaveAsNew: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          Text("This note changed somewhere else while you were editing. Choose how to keep your work.")
            .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)

          version("Your draft", text: conflict.draft.body, tint: theme.growth)
          version("Currently stored", text: storedBody, tint: theme.inkMuted)

          VStack(spacing: 10) {
            action("Keep the stored version", role: .secondary, id: "conflict-keep-stored", onKeepStored)
            action("Overwrite with my draft", role: .primary, id: "conflict-overwrite", onOverwrite)
            action("Save my draft as a new note", role: .secondary, id: "conflict-save-new", onSaveAsNew)
          }
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Both were edited").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
      }
    }
  }

  // Strip the stored note's frontmatter for a readable body comparison.
  private var storedBody: String {
    VaultStore.plainBody(conflict.storedText)
  }

  private func version(_ label: String, text: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label.uppercased()).font(StudioFont.eyebrow).tracking(1.2).foregroundStyle(tint)
      Text(text.isEmpty ? "—" : text)
        .font(StudioFont.body).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(theme.sunken))
    }
  }

  private enum ActionRole { case primary, secondary }

  private func action(_ label: String, role: ActionRole, id: String, _ tap: @escaping () -> Void)
    -> some View
  {
    Button(action: tap) {
      Text(label)
        .font(StudioFont.control)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
          RoundedRectangle(cornerRadius: 10)
            .fill(role == .primary ? theme.accentSoft : theme.sunken))
        .foregroundStyle(role == .primary ? theme.link : theme.inkStrong)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier(id)
  }
}
