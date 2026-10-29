import PhotosUI
import SwiftUI

// The profile block, shared by the Settings screen and the profile sheet opened from
// Today's avatar: the picture, the name, and the photo actions. One implementation so
// the two never drift. The owner holds the name and decides when to commit it.
struct ProfileEditor: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  @Binding var name: String
  let onCommitName: () -> Void
  @State private var avatarItem: PhotosPickerItem?
  @State private var importTask: Task<Void, Never>?

  private var hasAvatar: Bool { store.hasProfileAvatar }

  var body: some View {
    HStack(spacing: 14) {
      ProfileAvatar(store: store, size: 60)
      VStack(alignment: .leading, spacing: 4) {
        TextField("Your name", text: $name)
          .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
          .textInputAutocapitalization(.words)
          .submitLabel(.done)
          .onSubmit(onCommitName)
          .accessibilityIdentifier("profile-name-field")
        // Text actions, but with a full 44pt row to tap.
        HStack(spacing: 16) {
          PhotosPicker(selection: $avatarItem, matching: .images) {
            Group {
              if hasAvatar {
                Text("Change photo")
              } else {
                Text("Add a photo")
              }
            }
            .font(StudioFont.meta).foregroundStyle(theme.link)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
          }
          .accessibilityIdentifier("profile-photo-picker")
          if hasAvatar {
            Button {
              // A picture still being imported must not land after the removal.
              importTask?.cancel()
              avatarItem = nil
              _ = store.removeProfileAvatar()
            } label: {
              Text("Remove photo")
                .font(StudioFont.meta).foregroundStyle(theme.link)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("profile-photo-remove")
          }
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 6)
    .onChange(of: avatarItem) { _, item in
      guard let item else { return }
      importTask?.cancel()
      importTask = Task {
        let data = try? await item.loadTransferable(type: Data.self)
        guard !Task.isCancelled else { return }
        if let data { _ = store.setProfileAvatar(data: data) }
        avatarItem = nil
      }
    }
  }
}

// What went wrong with the last profile write, shown wherever the editor is.
struct ProfileErrorLine: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore

  var body: some View {
    if let error = store.error {
      Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
        .padding(.top, 12)
        .accessibilityIdentifier("profile-error")
    }
  }
}

// The small sheet behind Today's avatar: just the profile, nothing else.
struct ProfileSheet: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onClose: () -> Void
  @State private var name: String = ""

  @discardableResult
  private func commitName() -> Bool {
    guard name != (store.profileName ?? "") else { return true }
    return store.setProfileName(name)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("PROFILE")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.bottom, 12)
          ProfileEditor(store: store, name: $name, onCommitName: { commitName() })
          ProfileErrorLine(store: store)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .onAppear { name = store.profileName ?? "" }
      .navigationTitle("Profile")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Profile").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") {
            // A failed save keeps the sheet open with the error shown, so nothing typed is lost.
            if commitName() { onClose() }
          }
          .font(StudioFont.control)
        }
      }
    }
    .presentationDetents([.medium, .large])
  }
}
