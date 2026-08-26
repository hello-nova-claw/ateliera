import SwiftUI

// N0 fidelity screen: the Ateliera identity (eyebrow → serif hero → intro), a
// compact type-scale specimen, and the six meaning marks. This is the visual the
// simulator screenshot verifies against the design addendum — not a real room yet.
struct RootView: View {
  @State private var readout: Result<VaultReadout, VaultDemoError>?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        RoomHeading(
          eyebrow: "who I am, and who I am becoming",
          title: "Identity Studio",
          intro:
            "Notice who you already are and who you're practising becoming — and keep the small, ordinary evidence that it's changing."
        )

        Divider().overlay(Studio.line)

        vaultSection

        Divider().overlay(Studio.line)

        VStack(alignment: .leading, spacing: 18) {
          eyebrow("The type scale")
          specimen("Room title, one hero per room", StudioFont.roomTitle)
          specimen("Section heading", StudioFont.section)
          specimen("Card title", StudioFont.cardTitle)
          specimen("life by design", StudioFont.greeting)
          specimen("This is enough.", StudioFont.quote)
          specimen(
            "Body — a practice that survives ordinary Tuesdays becomes a life.",
            StudioFont.body
          )
          specimen("Secondary metadata and prompts", StudioFont.meta)
        }

        Divider().overlay(Studio.line)

        VStack(alignment: .leading, spacing: 12) {
          eyebrow("Meanings")
          HStack(spacing: 18) {
            meaning("Foundation", Studio.foundation)
            meaning("Vision", Studio.vision)
            meaning("Growth", Studio.growth)
          }
          HStack(spacing: 18) {
            meaning("Reflection", Studio.reflection)
            meaning("Celebration", Studio.celebration)
            meaning("Uncharted", Studio.uncharted)
          }
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(Studio.canvas)
    .task { readout = VaultDemo.run() }
  }

  @ViewBuilder private var vaultSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      eyebrow("Read via the Rust vault core")
      switch readout {
      case .success(let r):
        VStack(alignment: .leading, spacing: 8) {
          Text(r.text)
            .font(StudioFont.meta)
            .foregroundStyle(Studio.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
          HStack(spacing: 16) {
            tag("rev \(r.revision)")
            tag("\(r.entryCount) entries")
            tag("sha \(String(r.hash.prefix(10)))")
          }
        }
      case .failure(let error):
        Text(error.message).font(StudioFont.meta).foregroundStyle(Studio.celebration)
      case .none:
        Text("Reading…").font(StudioFont.meta).foregroundStyle(Studio.inkFaint)
      }
    }
  }

  private func tag(_ text: String) -> some View {
    Text(text)
      .font(StudioFont.eyebrow)
      .foregroundStyle(Studio.growth)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .overlay(
        RoundedRectangle(cornerRadius: 6).stroke(Studio.line, lineWidth: 1)
      )
  }

  private func eyebrow(_ text: String) -> some View {
    Text(text.uppercased())
      .font(StudioFont.eyebrow)
      .tracking(1.6)
      .foregroundStyle(Studio.inkMuted)
  }

  private func specimen(_ text: String, _ font: Font) -> some View {
    Text(text)
      .font(font)
      .foregroundStyle(Studio.inkStrong)
      .fixedSize(horizontal: false, vertical: true)
  }

  private func meaning(_ name: String, _ colour: Color) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "heart.fill")
        .font(.system(size: 12))
        .foregroundStyle(colour)
      Text(name).font(StudioFont.meta).foregroundStyle(Studio.inkMuted)
    }
  }
}

private struct RoomHeading: View {
  let eyebrow: String
  let title: String
  let intro: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(eyebrow)
        .font(StudioFont.greeting)
        .foregroundStyle(Studio.vision)
      Text(title)
        .font(StudioFont.roomTitle)
        .tracking(-0.5)
        .foregroundStyle(Studio.inkStrong)
      Text(intro)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(Studio.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

#Preview {
  RootView()
}
