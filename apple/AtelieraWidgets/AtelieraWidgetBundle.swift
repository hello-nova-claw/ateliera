import SwiftUI
import WidgetKit

// The app's widgets. Just the rhythm almanac for now.
@main
struct AtelieraWidgetBundle: WidgetBundle {
  var body: some Widget {
    RhythmWidget()
  }
}
