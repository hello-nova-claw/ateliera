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
            Text(hasAvatar ? "Change photo" : "Add a photo")
              .font(StudioFont.meta).foregroundStyle(theme.link)
              .frame(minHeight: 44)
              .contentShape(Rectangle())
          }
          .accessibilityIdentifier("profile-photo-picker")
          if hasAvatar {
            Button {
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
      Task {
        if let data = try? await item.loadTransferable(type: Data.self) {
          _ = store.setProfileAvatar(data: data)
        }
        avatarItem = nil
      }
    }
  }
}

// The small sheet behind Today's avatar: just the profile, nothing else.
struct ProfileSheet: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onClose: () -> Void
  @State private var name: String = ""

  private func commitName() {
    if name != (store.profileName ?? "") { _ = store.setProfileName(name) }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("PROFILE")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.bottom, 12)
          ProfileEditor(store: store, name: $name, onCommitName: commitName)
          if let error = store.error {
            Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
              .padding(.top, 12)
              .accessibilityIdentifier("profile-error")
          }
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
            commitName()
            onClose()
          }
          .font(StudioFont.control)
        }
      }
    }
    .presentationDetents([.medium, .large])
  }
}
