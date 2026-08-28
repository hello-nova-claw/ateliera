import SwiftUI

// Edits every metadata field on a note in place (via a binding). It does NOT
// write — the caller (the edit sheet) owns the atomic save through
// VaultStore.saveEdit(_:updatedNote:). Raw strings match the web schema, so any
// change round-trips byte-identically.
struct MetadataEditorView: View {
  @Binding var note: StudioNote

  var body: some View {
    Form {
      Section("Type & Status") {
        cardTypePicker
        rawPicker("Meaning", selection: $note.semanticType, options: SemanticType.allCases.map(\.rawValue))
        rawPicker("Status", selection: $note.status, options: NoteStatus.allCases.map(\.rawValue))
      }

      Section("Organisation") {
        multiSelect(
          "Rooms", options: Room.all.map { ($0.id, $0.title) }, selection: $note.rooms)
        LabeledContent("Tags") {
          TextField("comma, separated", text: listBinding($note.tags))
            .multilineTextAlignment(.trailing)
        }
        multiSelect(
          "Life areas", options: NoteMetadata.defaultLifeAreas.map { ($0.id, $0.label) },
          selection: $note.lifeAreas)
        LabeledContent("Seasons") {
          TextField("2026-winter, …", text: listBinding($note.seasons))
            .multilineTextAlignment(.trailing)
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
        rawPicker("Sensitivity", selection: $note.privacy.sensitivity, options: Sensitivity.allCases.map(\.rawValue))
        rawPicker("AI access", selection: $note.privacy.aiAccess, options: AiAccess.allCases.map(\.rawValue))
      }

      Section("Display") {
        Toggle("Featured", isOn: $note.display.featured)
        LabeledContent("Cover") {
          TextField(
            "media/…", text: Binding(get: { note.display.cover ?? "" },
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
    let options = NoteMetadata.knownCardTypes.contains(note.cardType)
      ? NoteMetadata.knownCardTypes : NoteMetadata.knownCardTypes + [note.cardType]
    return rawPicker("Card type", selection: $note.cardType, options: options)
  }

  private func rawPicker(_ label: String, selection: Binding<String>, options: [String]) -> some View {
    Picker(label, selection: selection) {
      ForEach(options, id: \.self) { Text(Self.humanize($0)).tag($0) }
    }
  }

  private var anchorBinding: Binding<String> {
    Binding(get: { note.landscapeAnchor ?? "" }, set: { note.landscapeAnchor = $0.isEmpty ? nil : $0 })
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
            Text(option.label).foregroundStyle(Studio.inkStrong)
            Spacer()
            if selection.wrappedValue.contains(option.id) {
              Image(systemName: "checkmark").foregroundStyle(Studio.link)
            }
          }
        }
      }
    }
  }

  private func sourceField(_ label: String, _ keyPath: WritableKeyPath<NoteSource, String?>) -> some View {
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

  // Comma-separated editing for a string array.
  private func listBinding(_ array: Binding<[String]>) -> Binding<String> {
    Binding(
      get: { array.wrappedValue.joined(separator: ", ") },
      set: { text in
        array.wrappedValue =
          text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
          .filter { !$0.isEmpty }
      })
  }

  static func humanize(_ raw: String) -> String {
    let spaced = raw.replacingOccurrences(of: "-", with: " ")
    guard let first = spaced.first else { return spaced }
    return first.uppercased() + spaced.dropFirst()
  }
}
