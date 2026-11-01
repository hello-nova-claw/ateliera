import SwiftUI

// Edits every metadata field on a note in place (via a binding). It does NOT
// write — the caller (the edit sheet) owns the atomic save through
// VaultStore.saveEdit(_:updatedNote:). Raw strings match the web schema, so any
// change round-trips byte-identically.
struct MetadataEditorView: View {
  @Binding var note: StudioNote
  @Environment(\.studioTheme) private var theme

  var body: some View {
    Form {
      Section("Type & Status") {
        cardTypePicker
        rawPicker(
          "Meaning", selection: $note.semanticType, options: SemanticType.allCases.map(\.rawValue))
        rawPicker("Status", selection: $note.status, options: NoteStatus.allCases.map(\.rawValue))
      }

      Section("Organisation") {
        multiSelect(
          "Rooms", options: Room.all.map { ($0.id, $0.title) }, selection: $note.rooms)
        LabeledContent("Tags") {
          CommaListField(placeholder: "comma, separated", items: $note.tags)
            .accessibilityIdentifier("metadata-tags")
        }
        multiSelect(
          "Life areas", options: NoteMetadata.defaultLifeAreas.map { ($0.id, $0.label) },
          selection: $note.lifeAreas)
        LabeledContent("Seasons") {
          CommaListField(placeholder: "2026-winter, …", items: $note.seasons)
            .accessibilityIdentifier("metadata-seasons")
        }
      }

      Section("Landscape") {
        Picker("Anchor", selection: anchorBinding) {
          Text("None").tag("")
          ForEach(LandscapeAnchor.allCases, id: \.rawValue) { anchor in
            Text(Self.humanize(anchor.rawValue)).tag(anchor.rawValue)
          }
        }
      }

      Section("Source") {
        sourceField("Title", \.title)
        sourceField("Creator", \.creator)
        sourceField("URL", \.url)
      }

      Section("Privacy") {
        rawPicker(
          "Sensitivity", selection: $note.privacy.sensitivity,
          options: Sensitivity.allCases.map(\.rawValue))
        rawPicker(
          "AI access", selection: $note.privacy.aiAccess, options: AiAccess.allCases.map(\.rawValue)
        )
      }

      Section("Display") {
        Toggle("Featured", isOn: $note.display.featured)
        LabeledContent("Cover") {
          TextField(
            "media/…",
            text: Binding(
              get: { note.display.cover ?? "" },
              set: { note.display.cover = $0.isEmpty ? nil : $0 })
          ).multilineTextAlignment(.trailing)
        }
      }
    }
    .navigationTitle("Details")
  }

  // MARK: Controls

  private var cardTypePicker: some View {
    // Known kinds + the current value if it's custom.
    let options =
      NoteMetadata.knownCardTypes.contains(note.cardType)
      ? NoteMetadata.knownCardTypes : NoteMetadata.knownCardTypes + [note.cardType]
    return rawPicker("Card type", selection: $note.cardType, options: options)
  }

  private func rawPicker(_ label: String, selection: Binding<String>, options: [String])
    -> some View
  {
    Picker(label, selection: selection) {
      ForEach(options, id: \.self) { Text(Self.humanize($0)).tag($0) }
    }
  }

  private var anchorBinding: Binding<String> {
    Binding(
      get: { note.landscapeAnchor ?? "" }, set: { note.landscapeAnchor = $0.isEmpty ? nil : $0 })
  }

  // Rooms/life-areas: toggle membership; options not in the list are preserved.
  private func multiSelect(
    _ label: String, options: [(id: String, label: String)], selection: Binding<[String]>
  ) -> some View {
    DisclosureGroup(
      "\(label) (\(selection.wrappedValue.count))"
    ) {
      ForEach(options, id: \.id) { option in
        Button {
          if let index = selection.wrappedValue.firstIndex(of: option.id) {
            selection.wrappedValue.remove(at: index)
          } else {
            selection.wrappedValue.append(option.id)
          }
        } label: {
          HStack {
            Text(option.label).foregroundStyle(theme.inkStrong)
            Spacer()
            if selection.wrappedValue.contains(option.id) {
              Image(systemName: "checkmark").foregroundStyle(theme.link)
            }
          }
        }
      }
    }
  }

  private func sourceField(_ label: String, _ keyPath: WritableKeyPath<NoteSource, String?>)
    -> some View
  {
    LabeledContent(label) {
      TextField(
        "optional",
        text: Binding(
          get: { note.source?[keyPath: keyPath] ?? "" },
          set: { newValue in
            var source = note.source ?? NoteSource(title: nil, creator: nil, url: nil)
            source[keyPath: keyPath] = newValue.isEmpty ? nil : newValue
            note.source =
              (source.title == nil && source.creator == nil && source.url == nil) ? nil : source
          })
      ).multilineTextAlignment(.trailing)
    }
  }

  static func humanize(_ raw: String) -> String {
    let spaced = raw.replacingOccurrences(of: "-", with: " ")
    guard let first = spaced.first else { return spaced }
    return first.uppercased() + spaced.dropFirst()
  }
}

// The text of a comma-separated list field. The typed text is kept as it is, so "calm,"
// stays on screen while the list already reads ["calm"]; the text is only replaced when
// the list changes from somewhere else.
struct CommaListText: Equatable {
  private(set) var text: String

  init(items: [String]) {
    text = items.joined(separator: ", ")
  }

  static func parse(_ text: String) -> [String] {
    text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
  }

  /// Takes what was typed and returns the list it now spells.
  mutating func edit(_ typed: String) -> [String] {
    text = typed
    return Self.parse(typed)
  }

  /// Follows the list when it changes elsewhere, ignoring the echo of its own edit.
  mutating func sync(_ items: [String]) {
    guard Self.parse(text) != items else { return }
    text = items.joined(separator: ", ")
  }
}

// A text field for a list of short values, typed comma-separated.
private struct CommaListField: View {
  let placeholder: String
  @Binding var items: [String]
  @State private var field: CommaListText

  init(placeholder: String, items: Binding<[String]>) {
    self.placeholder = placeholder
    _items = items
    _field = State(initialValue: CommaListText(items: items.wrappedValue))
  }

  var body: some View {
    TextField(
      placeholder,
      text: Binding(
        get: { field.text },
        set: { typed in
          let parsed = field.edit(typed)
          if parsed != items { items = parsed }
        })
    )
    .multilineTextAlignment(.trailing)
    .onChange(of: items) { _, newItems in field.sync(newItems) }
  }
}
