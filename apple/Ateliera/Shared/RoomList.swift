import SwiftUI

// Shared list chrome for the rooms, so "tap a row to open · swipe-left for actions"
// looks and feels the same everywhere. Rooms use a plain `List` (native swipe actions
// need one) styled down to Ateliera's calm surface — no default background or separators.
extension View {
  /// Plain, calm list chrome over the studio canvas.
  func studioRoomList(_ canvas: Color) -> some View {
    self
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(canvas)
  }

  /// A separator-less, clear row with the room's standard horizontal insets.
  func studioRoomRow(
    _ insets: EdgeInsets = EdgeInsets(top: 4, leading: 24, bottom: 4, trailing: 24)
  ) -> some View {
    self
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
      .listRowInsets(insets)
  }
}
