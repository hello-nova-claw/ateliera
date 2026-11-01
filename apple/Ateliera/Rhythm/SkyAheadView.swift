import SwiftUI

// "Sky ahead" — a calm, scannable timeline of the computed sky events to come: the next
// turning points (equinoxes & solstices), the upcoming moon phases (with the next lunation
// led), the micro-season shifts, and — when a natal profile exists and the layer is on —
// the solar return. Nearest-first, each with its date and a quiet "in N days". Per-layer
// toggles let the person quiet families they don't want; the astrology layer stays gated
// behind a birth date. All computed locally from the Sky engine — offline, no AI.
struct SkyAheadView: View {
  let nowMs: Int64
  // The person's local calendar day and zone, so events are dated where they live.
  let today: String
  let timeZone: TimeZone
  let hemisphere: Hemisphere
  let birthDate: String?
  // The persisted layer set and a way to save a change; the host owns persistence
  // (per-vault, like the invitation dismissals).
  let layers: SkyLayers
  let onLayersChange: (SkyLayers) -> Void

  @Environment(\.studioTheme) private var theme
  @State private var working: SkyLayers

  init(
    nowMs: Int64, today: String, timeZone: TimeZone = AppClock.timeZone(),
    hemisphere: Hemisphere, birthDate: String?, layers: SkyLayers,
    onLayersChange: @escaping (SkyLayers) -> Void
  ) {
    self.nowMs = nowMs
    self.today = today
    self.timeZone = timeZone
    self.hemisphere = hemisphere
    self.birthDate = birthDate
    self.layers = layers
    self.onLayersChange = onLayersChange
    _working = State(initialValue: layers)
  }

  private var events: [SkyEvent] {
    SkyAhead.events(
      nowMs: nowMs, today: today, timeZone: timeZone, hemisphere: hemisphere, layers: working,
      birthDate: birthDate)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        RoomHeading(
          eyebrow: "what's coming",
          title: "Sky ahead",
          intro:
            "The turning points, moons, and seasons on their way — computed from the sky, nearest first."
        )

        layerToggles

        if events.isEmpty {
          Text(
            working.isEmpty
              ? "Every layer is quiet. Turn one on above to see what's ahead."
              : "Nothing on the horizon in the layers you've chosen."
          )
          .font(StudioFont.quote)
          .foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("sky-ahead-empty")
        } else {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(events) { event in
              eventRow(event)
              if event.id != events.last?.id {
                Divider().overlay(theme.line)
              }
            }
          }
          .accessibilityIdentifier("sky-ahead-list")
        }
      }
      .padding(28)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(theme.canvas)
    .navigationTitle("Sky ahead")
    .navigationBarTitleDisplayMode(.inline)
  }

  // MARK: - Layer toggles

  private var layerToggles: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("LAYERS")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        .padding(.bottom, 8)
      ForEach(toggleableLayers, id: \.layer.rawValue) { item in
        toggleRow(item.layer, label: item.label, gatedOff: item.gatedOff)
        if item.layer != toggleableLayers.last?.layer {
          Divider().overlay(theme.line)
        }
      }
    }
    .padding(16)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.surface))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(theme.line, lineWidth: 1))
  }

  private struct ToggleItem {
    let layer: SkyLayers
    let label: String
    let gatedOff: Bool
  }

  private var toggleableLayers: [ToggleItem] {
    [
      ToggleItem(layer: .turningPoints, label: "Turning points", gatedOff: false),
      ToggleItem(layer: .moonPhases, label: "Moon phases", gatedOff: false),
      ToggleItem(layer: .microSeasons, label: "Micro-seasons", gatedOff: false),
      // The astrological layer only has meaning with a natal profile; without one it's
      // disabled with a quiet note rather than hidden, so the gating is legible.
      ToggleItem(layer: .astrology, label: "Astrology", gatedOff: birthDate == nil),
    ]
  }

  private func toggleRow(_ layer: SkyLayers, label: String, gatedOff: Bool) -> some View {
    let isOn = Binding<Bool>(
      get: { working.contains(layer) },
      set: { on in
        if on { working.insert(layer) } else { working.remove(layer) }
        onLayersChange(working)
      })
    return Toggle(isOn: isOn) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label).font(StudioFont.control).foregroundStyle(theme.inkStrong)
        if gatedOff {
          Text("Add your birth date in Your rhythm to turn this on.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    .tint(theme.link)
    .disabled(gatedOff)
    .padding(.vertical, 10)
    .accessibilityIdentifier("sky-layer-\(layer.identifier)")
  }

  // MARK: - Event row

  private func eventRow(_ event: SkyEvent) -> some View {
    HStack(alignment: .top, spacing: 14) {
      ZStack {
        Circle().strokeBorder(theme.lineStrong, lineWidth: 1).frame(width: 34, height: 34)
        Image(systemName: glyph(event.family)).font(.system(size: 14))
          .foregroundStyle(theme.inkMuted)
      }
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(event.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
          if event.isNextLunation {
            Text("next lunation")
              .font(StudioFont.eyebrow).tracking(1.0).foregroundStyle(theme.inkFaint)
          }
        }
        Text(event.detail).font(StudioFont.quote).foregroundStyle(theme.inkMuted)
          .fixedSize(horizontal: false, vertical: true)
        Text("\(prettyDate(event)) · \(whenText(event))")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 16)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(event.title). \(event.detail). \(prettyDate(event)), \(whenText(event)).")
  }

  private func glyph(_ family: SkyEvent.Family) -> String {
    switch family {
    case .turningPoints: return "sun.horizon"
    case .moonPhases: return "moon"
    case .microSeasons: return "leaf"
    case .cycle: return "drop"
    case .astrology: return "sparkles"
    }
  }

  // "in N days" — only forward (the list is always ahead of now). Today/tomorrow read warmly.
  private func whenText(_ event: SkyEvent) -> String {
    let days = SkyAhead.daysAway(event, today: today, timeZone: timeZone)
    switch days {
    case 0: return "today"
    case 1: return "tomorrow"
    default: return "in \(days) days"
    }
  }

  // The event's day where the person lives.
  private func prettyDate(_ event: SkyEvent) -> String {
    let day = SkyAhead.localDay(of: event, timeZone: timeZone)
    let civil = Sky.civil(fromMs: Rhythm.dayMillis(date: day))
    let months = [
      "January", "February", "March", "April", "May", "June", "July", "August", "September",
      "October", "November", "December",
    ]
    return "\(months[civil.month - 1]) \(civil.day)"
  }
}

extension SkyLayers {
  // A stable identifier for accessibility/test ids (the rawValue bit → a name).
  fileprivate var identifier: String {
    switch self {
    case .turningPoints: return "turning-points"
    case .moonPhases: return "moon-phases"
    case .microSeasons: return "micro-seasons"
    case .cycle: return "cycle"
    case .astrology: return "astrology"
    default: return "layer-\(rawValue)"
    }
  }
}
