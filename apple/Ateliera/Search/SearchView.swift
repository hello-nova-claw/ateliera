import SwiftUI

// Faceted search over the disposable P4 index: a query field, a facet rail (Rooms /
// Meaning / Life areas / Seasons / Status / Tags / Card type — chips with counts
// that toggle filters), and result rows with a highlighted snippet and a match
// reason ("Title" / "Title · close spelling" / "Tag · …"). Tapping a row opens the
// note. Keyboard/VoiceOver operable throughout.
struct SearchView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let onOpen: (String) -> Void  // note path
  let onClose: () -> Void

  @State private var query = ""
  @State private var filters = SearchFilters()
  @FocusState private var focused: Bool

  private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var hasFilters: Bool { Self.dimensions.contains { !filters[keyPath: $0.selection].isEmpty } }
  private var showResults: Bool { !trimmed.isEmpty || hasFilters }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 0) {
        searchField
        let facets = store.facets(query, filters: filters)
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            facetRail(facets)
            if showResults {
              resultsList
            } else {
              hint("Find a note by its title or words inside it — or filter below.")
            }
          }
        }
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Search").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { onClose() }
        }
      }
    }
    .onAppear { focused = true }
  }

  private var searchField: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").foregroundStyle(theme.inkFaint)
      TextField("Search your notes", text: $query)
        .font(StudioFont.control).foregroundStyle(theme.inkStrong)
        .focused($focused).submitLabel(.search)
        .accessibilityIdentifier("search-field")
    }
    .padding(14)
    .overlay(alignment: .bottom) { Divider().overlay(theme.line) }
  }

  // MARK: - Results

  private var resultsList: some View {
    let hits = store.searchHits(query, filters: filters)
    return VStack(alignment: .leading, spacing: 0) {
      if hits.isEmpty {
        hint("Nothing found\(trimmed.isEmpty ? "" : " for “\(trimmed)”").")
      } else {
        ForEach(hits) { hit in
          Button { onOpen(hit.path) } label: { resultRow(hit) }
            .buttonStyle(.plain)
            .accessibilityIdentifier("search-result")
          Divider().overlay(theme.line)
        }
      }
    }
    .padding(.horizontal, 20)
  }

  private func resultRow(_ hit: SearchHit) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(hit.title.isEmpty ? "Untitled" : hit.title)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      if !hit.snippet.isEmpty {
        snippetText(hit.snippet, hit.highlightRanges)
          .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
          .lineLimit(3).fixedSize(horizontal: false, vertical: true)
      }
      Text(matchReasonLine(hit))
        .font(StudioFont.eyebrow).tracking(0.6).foregroundStyle(theme.inkFaint)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 14)
  }

  // The web's match-reason line: the field, "· close spelling" for a fuzzy hit, or a
  // "Tag · …" / "Source · …" context when the match wasn't in title/body text.
  private func matchReasonLine(_ hit: SearchHit) -> String {
    if let context = hit.matchContext {
      let label = context.field == .tags ? "Tag" : "Source"
      return "\(label) · \(context.text)"
    }
    let field = hit.matchReason.field.rawValue.capitalized
    switch hit.matchReason.strategy {
    case .keyword: return field
    case .fuzzyTitle, .fuzzyTag: return "\(field) · close spelling"
    }
  }

  // Build a Text with the highlight ranges (UTF-16 offsets into the snippet) bolded.
  private func snippetText(_ snippet: String, _ ranges: [HighlightRange]) -> Text {
    let u16 = snippet.utf16
    let total = u16.count
    func slice(_ from: Int, _ to: Int) -> String {
      guard from < to,
        let a = u16.index(u16.startIndex, offsetBy: from, limitedBy: u16.endIndex),
        let b = u16.index(u16.startIndex, offsetBy: to, limitedBy: u16.endIndex),
        let sa = a.samePosition(in: snippet), let sb = b.samePosition(in: snippet)
      else { return "" }
      return String(snippet[sa..<sb])
    }
    var result = Text("")
    var cursor = 0
    for r in ranges.sorted(by: { $0.start < $1.start }) where r.start >= cursor {
      let plain = slice(cursor, r.start)
      if !plain.isEmpty { result = result + Text(plain) }
      let hi = slice(r.start, min(r.end, total))
      if !hi.isEmpty { result = result + Text(hi).bold() }
      cursor = min(r.end, total)
    }
    let tail = slice(cursor, total)
    if !tail.isEmpty { result = result + Text(tail) }
    return result
  }

  // MARK: - Facets

  private func facetRail(_ facets: SearchFacets) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(Self.dimensions, id: \.label) { dim in
        let values = dim.values(facets)
        if !values.isEmpty {
          VStack(alignment: .leading, spacing: 6) {
            Text(dim.label.uppercased())
              .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.inkFaint)
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 8) {
                ForEach(values, id: \.value) { fv in
                  chip(fv, selected: filters[keyPath: dim.selection].contains(fv.value)) {
                    toggle(dim.selection, fv.value)
                  }
                }
              }
            }
          }
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
  }

  private func chip(_ fv: FacetValue, selected: Bool, _ tap: @escaping () -> Void) -> some View {
    Button(action: tap) {
      HStack(spacing: 5) {
        Text(fv.value).font(StudioFont.control)
        Text("\(fv.count)").font(StudioFont.eyebrow).foregroundStyle(theme.inkFaint)
      }
      .padding(.horizontal, 11).padding(.vertical, 6)
      .background(
        Capsule().fill(selected ? theme.accentSoft : theme.sunken))
      .overlay(Capsule().strokeBorder(selected ? theme.link : theme.line, lineWidth: 1))
      .foregroundStyle(selected ? theme.link : theme.inkMuted)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("facet-\(fv.value)")
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }

  private func toggle(_ keyPath: WritableKeyPath<SearchFilters, [String]>, _ value: String) {
    if let idx = filters[keyPath: keyPath].firstIndex(of: value) {
      filters[keyPath: keyPath].remove(at: idx)
    } else {
      filters[keyPath: keyPath].append(value)
    }
  }

  private func hint(_ text: String) -> some View {
    Text(text)
      .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
      .padding(.vertical, 20).padding(.horizontal, 20)
  }

  // The seven facet dimensions, each pairing a facet-values reader with the matching
  // filter selection to toggle.
  private struct Dimension {
    let label: String
    let values: (SearchFacets) -> [FacetValue]
    let selection: WritableKeyPath<SearchFilters, [String]>
  }

  private static let dimensions: [Dimension] = [
    Dimension(label: "Rooms", values: { $0.rooms }, selection: \.rooms),
    Dimension(label: "Meaning", values: { $0.semanticTypes }, selection: \.semanticTypes),
    Dimension(label: "Life areas", values: { $0.lifeAreas }, selection: \.lifeAreas),
    Dimension(label: "Seasons", values: { $0.seasons }, selection: \.seasons),
    Dimension(label: "Status", values: { $0.statuses }, selection: \.statuses),
    Dimension(label: "Tags", values: { $0.tags }, selection: \.tags),
    Dimension(label: "Card type", values: { $0.cardTypes }, selection: \.cardTypes),
  ]
}
