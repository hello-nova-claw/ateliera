# P4 — Search parity: facets, match reasons, backlinks, link repair

Build-ready implementation spec. Design-only; the only file this phase's design
writes is this document. Native app = `apple/Ateliera`.

Goal (roadmap §P4): replace the basic substring ranker with the web's search model
over a native, rebuildable (disposable-per-invariant) **in-memory** index:
FTS-like ranking + facets + snippet highlights + match reasons; a **link graph**
(`[[wikilinks]]`, markdown links, `studio://note/ID`) for backlinks/forward-links;
and a **broken-link repair** panel.

---

## 1. Scope — the web features to reach (cited)

The web index is a *disposable projection* (schema `packages/index/src/schema.ts`),
so we are **not** bound to byte/row parity with SQLite. We are bound to **behaviour
parity** of the pure, deterministic algorithms it computes. Match those exactly:

1. **Link extraction** — `packages/content/src/links.ts` `extractLinks`
   (`ParsedLink{kind:'wiki'|'path'|'id', target, label}`): wiki `[[t]]`/`[[t|label]]`
   in text nodes (skips code/inlineCode/html); markdown `[label](url)` and reference
   links resolved through definitions; `studio://note/<id>` → `id`; relative `*.md`
   → `path`; absolute/scheme/`//` targets dropped; `#fragment` stripped;
   `decodeURIComponent` on the target; **de-dup by `kind:target.toLowerCase()`**
   preserving first-seen order.
2. **Editable links (with offsets)** — `packages/content/src/link-edit.ts`
   `editableMarkdownLinks` (`EditableMarkdownLink{index,kind,target,label,start,end}`):
   same classification but **not de-duped**, ordered by `start`, `index` = position.
   This is the list forward-links / repair occurrences index into. Note the two extra
   wiki forms it recognises beyond `links.ts`: bare `[[t]]` in text (via `wikiLinks`)
   **and** bracketed `[[wiki]]` that GFM parses as a `linkReference` (`collectBracketedWiki`).
3. **Link resolution / graph** — `packages/index/src/sqlite-index.ts`
   `resolveLinks` + `backlinks`/`forwardLinks`, mirrored authoritatively by
   `packages/application/src/search-service.ts` `createResolver`/`inspectionFromDocuments`:
   - `id` link → resolved iff exactly one note has that id; >1 ids ⇒ `ambiguous`.
   - `wiki` link → match by **title**, NFC + `toLocaleLowerCase('en')`; 1 ⇒ resolved,
     >1 ⇒ ambiguous, 0 ⇒ broken.
   - `path` link → resolve against source note's folder, normalise `.`/`..`
     (return null / broken if it escapes root or is absolute), match by note path
     (NFC-normalised); 1 ⇒ resolved, >1 ⇒ ambiguous.
   - **backlinks(id)** = canonical notes (excluding self) that have ≥1 link resolving
     to `id`; sorted by `title` then `id` (`localeCompare('en')`), title fallback
     `'Untitled'`.
   - **forwardLinks** = this note's `editableMarkdownLinks` each tagged
     resolved/broken/ambiguous.
4. **Search ranking + hit shape** — `sqlite-index.ts` `search` + `index-port.ts`
   `SearchHit`: token match (see §3 tokeniser), keyword hits ranked, snippet window
   with highlight ranges, `matchReason{field,strategy,text,distance?}`, optional
   `matchContext{field:'tags'|'source',text}`, plus a **fuzzy** fallback (Damerau-
   Levenshtein over title/tag words) when there are zero keyword hits.
5. **Facets** — `sqlite-index.ts` `facets` + `index-port.ts` `SearchFacets`: seven
   groups (rooms, semanticTypes, lifeAreas, seasons, statuses, tags, cardTypes),
   each `{value,count}[]`; a facet is computed against the query + *all other*
   filters (not its own), currently-selected values are always present (count 0 if
   absent), sorted `count desc, value asc`.
6. **Repair queue + repair actions** — `search-service.ts` `repairQueue`,
   `repairMetadata`, `repairLink`; UI `apps/studio/src/features/search/RepairPanel.tsx`.
   Two item kinds: `metadata` (parse errors / duplicate id) and `broken-link`
   (broken or ambiguous). Repair a link via `rewriteMarkdownLink`
   (`link-edit.ts`): relink to wiki/path/id, or remove (unwrap to label).
7. **Search UI** — `SearchPage.tsx` (facet rail labels: Rooms / **Meaning** /
   Life areas / Seasons / Status / Tags / **Card type**; match-reason line
   `"<field>"` or `"<field> · close spelling"`; snippet with highlights; match
   context "Tag · …" / "Source · …").

Out of scope for P4 (later phases): revision/conflict-merge UI in repair (P8),
media, structured capture.

---

## 2. Native design — files to ADD / MODIFY

Reuse: the existing `StudioNote` model + `NoteParser` (already parses every field —
`apple/Ateliera/Note/NoteParser.swift`), `VaultStore` (vault I/O + `reload()`),
and the note-edit/write path (`saveEdit`, atomic `expectedHash` writes). **No Rust
changes** (in-memory index; the FTS5-in-Rust escape hatch stays unbuilt).

### ADD — `apple/Ateliera/Search/`

- **`LinkExtractor.swift`** — pure. Port `extractLinks` (de-duped `ParsedLink`) and
  `editableMarkdownLinks` (ordered, with `start`/`end` UTF-8/`String.Index` offsets,
  `index`). Types:
  ```swift
  enum LinkKind: String { case wiki, path, id }
  struct ParsedLink: Equatable { let kind: LinkKind; let target: String; let label: String }
  struct EditableLink: Equatable {
    let index: Int; let kind: LinkKind; let target: String; let label: String
    let start: Int; let end: Int   // UTF-16 offsets into the body, matching TS String indices
  }
  enum LinkExtractor {
    static func links(_ body: String) -> [ParsedLink]
    static func editableLinks(_ body: String) -> [EditableLink]
  }
  ```
  Implement a small Markdown-inline scanner (do **not** add an mdast dep): strip
  fenced/indented code and inline-code spans and `<html>`; find `[label](url)`,
  reference links + `[id]: url` definitions, `[[wiki]]`/`[[t|label]]`. Offsets must
  index into the raw body so repair can splice. Classify targets with the shared
  helper (`studio://note/` prefix → id; scheme/`//`/absolute drop; `*.md` → path;
  else, for markdown links, drop). This is golden-tested (§4) — treat the TS output
  as the contract, not the mdast internals.

- **`LinkGraph.swift`** — pure, rebuildable. Given `[IndexedNote]` (id, path, title,
  body) builds `byId`, `byTitle` (NFC+lowercased), `byPath` (normalised). API:
  ```swift
  enum LinkState: Equatable { case resolved(String); case broken; case ambiguous([String]) }
  struct ForwardLink: Equatable { let link: EditableLink; let state: LinkState }
  struct Backlink: Equatable { let id: String; let path: String; let title: String }
  struct LinkGraph {
    init(_ notes: [IndexedNote])
    func forwardLinks(of id: String) -> [ForwardLink]
    func backlinks(of id: String) -> [Backlink]        // sorted title, id
    func resolve(sourcePath: String, _ link: EditableLink) -> LinkState
  }
  ```
  Port path normalisation (`normalizePath`/`targetPath`) and the resolve rules from
  `search-service.ts` `createResolver` (the authoritative version — it defines the
  ambiguous cases the SQLite index also honours). Title fallback `Untitled`.

- **`SearchIndex.swift`** — pure, in-memory, rebuildable (the disposable projection).
  Holds indexed docs + the `LinkGraph`. API mirrors `IndexPort`/search-service:
  ```swift
  struct IndexedNote { let id, path, hash, title, body: String
    let cardType, semanticType, status, created, updated: String
    let rooms, lifeAreas, seasons, tags: [String]
    let source: NoteSource?; let links: [ParsedLink]; let searchText: String }
  struct HighlightRange: Equatable { let start: Int; let end: Int }
  enum MatchStrategy: String { case keyword, fuzzyTitle = "fuzzy-title", fuzzyTag = "fuzzy-tag" }
  enum MatchField: String { case title, body, tags, source }
  struct MatchReason: Equatable { let field: MatchField; let strategy: MatchStrategy; let text: String; let distance: Int? }
  struct SearchHit: Identifiable {
    let id, path, title, snippet: String; let highlightRanges: [HighlightRange]
    let score: Double; let semanticType, cardType, status, updated: String
    let matchReason: MatchReason; let matchContext: (field: String, text: String)? }
  struct SearchFilters { var rooms, semanticTypes, lifeAreas, seasons, statuses, tags, cardTypes: [String]
    var dateFrom, dateTo: String? }        // all default []
  struct FacetValue: Equatable { let value: String; let count: Int }
  struct SearchFacets { let rooms, semanticTypes, lifeAreas, seasons, statuses, tags, cardTypes: [FacetValue] }
  final class SearchIndex {
    func rebuild(_ notes: [IndexedNote])
    func search(_ query: String, filters: SearchFilters = .init()) -> [SearchHit]
    func facets(_ query: String, filters: SearchFilters = .init()) -> SearchFacets
    func backlinks(_ id: String) -> [Backlink]
    func forwardLinks(_ id: String) -> [ForwardLink]
  }
  ```
  Ranking need not reproduce bm25 numerically (the score is not an interop contract),
  but MUST reproduce the **observable** contract: which notes match, the ordering
  *rule* (rank then `updated desc` then `id asc`), the tokeniser, snippet window &
  highlight ranges, the `matchReason.field`/`strategy` selection, `matchContext`,
  the default `status != trashed` filter, and the fuzzy fallback + its ordering.
  Cap results at 200. See §3 for the exact algorithms to port.

- **`RepairQueue.swift`** — pure. Port `scanVault → repairQueue`:
  ```swift
  enum RepairItem { case metadata(MetadataRepair); case brokenLink(BrokenLinkRepair) }
  ```
  duplicate-id detection (first path canonical), broken/ambiguous link collection,
  the sort (`path`, then `kind`, then occurrence with metadata = -1). Metadata parse
  errors reuse whatever `NoteParser` surfaces (see §5 dependency).

### ADD — SwiftUI (thin, over the pure core)

- **`Search/SearchView.swift`** *(replaces the inline `SearchView` currently in
  `RootView.swift`)* — query field + a facet rail (7 groups, chips with counts,
  toggle to add/remove filters, keyboard-operable), result rows showing title,
  highlighted snippet, meaning/card-type/status chips, and the match-reason line
  ("Title" / "Title · close spelling" / "Tag · …"). Tapping a row opens the note
  (existing edit sheet). Facet labels: Rooms / Meaning / Life areas / Seasons /
  Status / Tags / Card type.
- **`Search/BacklinksView.swift`** — a "Linked from" / "Links to" section usable
  from the note editor sheet: backlinks list + forward links with broken/ambiguous
  badges; tapping a resolved link navigates.
- **`Search/RepairView.swift`** — the repair panel: metadata cards (edit id/title/
  card_type/meaning/status/created/updated/rooms/life_areas/seasons/tags → re-save
  via write path) and broken-link cards (relink to wiki/path/id, or remove) calling
  `VaultStore.repairLink`. WCAG 2.2 AA; no drag-drop here so no keyboard-alt needed.

### MODIFY

- **`apple/Ateliera/VaultStore.swift`**
  - In `reload()`: build `[IndexedNote]` (parse each note fully via `NoteParser`,
    compute `searchText` = plain-text of body, `links` = `LinkExtractor.links`) and
    call `index.rebuild(...)`. Keep the current `NoteSummary` list for rooms/recent.
  - Replace `func search(_:)` to delegate to `SearchIndex.search`; add
    `facets(_:filters:)`, `backlinks(path:)`/`forwardLinks(path:)` (by resolving the
    note id from path), `repairQueue()`.
  - Add `repairLink(path:expectedHash:occurrence:edit:)` and (thin) `repairMetadata`
    — reuse the existing atomic `expectedHash` write + `reload()`; port
    `rewriteMarkdownLink` semantics into a `LinkExtractor.rewrite(body:occurrence:edit:)`.
  - The index is disposable: rebuilt wholesale on every `reload()`. No persistence.
- **`apple/Ateliera/RootView.swift`** — remove the inline `SearchView`; present the
  new `Search/SearchView`. Add a Repair entry (e.g. under Settings or Foyer). Wire a
  "Links" affordance in the note editor sheet to `BacklinksView`.
- **`apple/Ateliera/Search/NoteSearch.swift`** — **delete** (superseded). Its test
  `NoteSearchTests.swift` is replaced by `SearchIndexTests` (§4).
- **`apple/project.yml`** — new files are picked up by `xcodegen generate` (glob);
  no manual membership. (Listed for the implementer, not edited here.)

---

## 3. Algorithms to port exactly (from `sqlite-index.ts`)

- **Tokeniser** (`tokens`): `query.match(/[\p{L}\p{N}_-]+/gu)`, fold each
  (`foldForMatch` = NFD, `toLocaleLowerCase('en')`, strip combining marks `\p{M}`),
  drop empties, **unique**. Empty query with a non-empty trimmed string ⇒ zero hits.
  Swift: `String.unicodeScalars` with `Unicode` letter/number + `_`/`-`; NFD via
  `decomposedStringWithCanonicalMapping`, drop `.nonspacingMark`.
- **Matching**: a note matches iff every token is a **prefix** of some token in
  title/body/tags/source (SQLite does `"tok"*` prefix + AND). searchText must be the
  same plain-text used in `note_fts.body` — port `markdownToPlainText`
  (`links.ts`: concatenate text/inlineCode/code values + image alt, collapse
  whitespace). Golden this too (§4).
- **Snippet** (`makeSnippet`): source = `"<title>. <body>"` whitespace-collapsed;
  first highlight start `f`; window `[max(0,f-60), +180]`; ellipses when clipped;
  `highlightRanges` = grapheme-accurate fold-mapped matches (`rangesFor`/`mappedFold`),
  sorted by `start,end`. Port `mappedFold` with `Intl.Segmenter` grapheme semantics →
  Swift `String` grapheme clusters (`value.enumerated()` over `Character`s, mapping
  folded-offset → cluster range). Offsets are **UTF-16** to match TS string indices.
- **matchReason.field / matchContext** (search): if snippet has highlights ⇒
  field = title if any token prefix-hits folded title else body, strategy `keyword`.
  If no snippet highlight: if a tag folded-contains a token ⇒ context `tags`; else if
  source-text folded-contains ⇒ context `source`; field follows context; text =
  joined tokens.
- **Fuzzy fallback** (`fuzzySearch`): only when zero keyword hits and no token < 3
  chars. Damerau-Levenshtein (port `damerauLevenshtein`) over title words then tag
  words; max distance 1 for token ≤5 else 2; a hit needs *all* tokens to fuzzy-match
  the same field (title first, else tags); rationale = max-distance word (ties by
  `localeCompare('en')`), excluded if distance 0; strategy `fuzzy-title`/`fuzzy-tag`.
  Ordering: prefer title matches; then distance asc, field asc, `updated` desc,
  `id` asc. Port `closestFuzzyWord`.
- **Facets** (`facets`): per group, recompute selection with that group's filter
  removed; `noteFacet` for semanticTypes/statuses/cardTypes, `listFacet` for
  rooms/lifeAreas/seasons/tags; when the query is fuzzy-only (no exact matches),
  aggregate over fuzzy hit ids; always inject selected values with count 0; sort
  `count desc, value asc`.

---

## 4. Data / format + GOLDEN values

No new frontmatter — every field is already parsed by `NoteParser` and round-tripped
by `StudioNote` (P1/N2). Facet vocab is fixed by domain enums:
`semanticTypes = [foundations, vision, growth, reflection, celebration, uncharted]`
(`packages/domain/src/semantic-type.ts`); `noteStatuses = [draft, active, resting,
archived, trashed]` (`packages/domain/src/note.ts`); rooms/lifeAreas/seasons/tags/
cardTypes are open vocab from note frontmatter.

**Golden-parity is the gate** (these are shared pure algorithms). Capture ground truth
with a throwaway vitest, following the existing pattern (`NoteFixturesTests.swift`,
`NatalChartTests.swift` were seeded this way):

1. Write `packages/content/src/__p4golden__.test.ts` (throwaway) that, over a fixed
   corpus of ~8–12 notes (cover: wiki hit/miss/ambiguous, `studio://note/id`, relative
   `.md` path incl. `../`, code-fence-with-a-fake-link, `[[t|label]]`, bracketed
   `[[wiki]]` linkReference, dup-target de-dup), emits JSON of:
   - `extractLinks(body)` and `editableMarkdownLinks(body)` (with offsets) per note,
   - `markdownToPlainText(body)` per note,
   - and, using an in-memory SqliteIndex over the corpus: `search(q)` (hits: id,
     snippet, highlightRanges, matchReason, matchContext, order) for ~6 queries
     (exact, prefix, multi-token, fuzzy-title, fuzzy-tag, no-match), `facets(q)` for
     2 queries+filters, `backlinks(id)`, `forwardLinks(id)`.
   `console.log(JSON.stringify(...))`; run `pnpm --filter @studio/content exec vitest
   run __p4golden__` (and a tiny script over `@studio/index` for the index outputs),
   paste values into the Swift tests, then delete the throwaway.
2. Swift golden tests assert `LinkExtractor`, `LinkGraph`, `SearchIndex`, and the
   plain-text extractor reproduce those captured values byte/field-for-field
   (highlight ranges, snippet strings, orderings, facet counts, resolution states).

Score numbers are NOT part of the golden set (bm25 is not an interop contract); assert
**ordering and membership**, not `score`.

---

## 5. TDD plan

Write each failing test first. Unit (XCTest, `apple/AtelieraTests/`):

- `LinkExtractorTests` — golden: `links()` de-dup/kinds/order; `editableLinks()`
  offsets + both wiki forms + code-skipping; `rewrite()` relink(wiki/path/id)/remove
  matches `rewriteMarkdownLink` (safe-id/safe-path guards throw like TS).
- `PlainTextTests` — golden: `markdownToPlainText` parity for the corpus.
- `LinkGraphTests` — golden: resolved/broken/ambiguous per rule; path `..` escape ⇒
  broken; backlinks set + sort; title fallback `Untitled`; excludes self.
- `SearchIndexTests` (replaces `NoteSearchTests`) — golden: tokeniser, prefix match,
  multi-token AND, snippet window + highlight ranges, matchReason/matchContext,
  `status != trashed` default, explicit status filter, fuzzy-title & fuzzy-tag
  fallback + ordering, 200 cap, empty-but-nonblank ⇒ [].
- `FacetsTests` — golden: 7 groups, per-group filter exclusion, selected-value
  injection (count 0), sort order; fuzzy-only aggregation.
- `RepairQueueTests` — duplicate-id metadata item; broken + ambiguous link items;
  sort order; occurrence index lines up with `editableLinks`.
- `RepairWriteTests` — repairLink relink & remove re-serialize byte-identically and
  write atomically with `expectedHash`; stale hash ⇒ surfaced conflict (reuse the
  existing conflict path); index rebuilds after.

UI (XCUITest, `apple/AtelieraUITests/`):

- `SearchUITests` — type a query → results; toggle a facet chip → result set narrows
  and chip count/selection reflects; a11y identifiers on field + chips; keyboard focus
  order.
- `BacklinksUITests` — open a note that is linked-to → backlinks list shows the source;
  tapping navigates.
- `RepairUITests` — a vault with one broken wiki link → Repair shows the item →
  relink to a valid title → item clears and the link resolves.

Gate (roadmap): faceted search matches the web's result *shape*; backlinks list is
correct; a broken link can be repaired. All green via the standard recipe
(`./AtelieraVaultCore/build.sh` only if Rust changed — it isn't — then `xcodegen
generate && xcodebuild test`).

---

## 6. Dependencies + shared contracts

- **P1 (note depth)** — hard dependency for the *rich* result chips and repair
  metadata form (semantic type/status/tags/life-areas editing) and for `[[wikilink]]`
  tap-navigation. **Mitigation:** `NoteParser` already parses every field today, so
  P4's index/graph/search can be built and fully golden-tested **without** P1; only
  the metadata-repair *form* and link-tap navigation need P1's editing API. Sequence
  P4's pure core first (slice below), fold the metadata-edit form in once P1 lands.
- **Shared note-metadata editing API** (P1): `RepairView` metadata card and any
  facet-driven status change reuse P1's "edit any frontmatter field → atomic write".
  Until then, `repairLink` (body-only rewrite) works standalone on the existing
  `saveEdit`/write path.
- **Reused now:** `StudioNote` + `NoteParser` (all fields), `VaultStore` vault I/O +
  atomic `expectedHash` write + `reload()`, `NoteFactory` timestamps. **Rhythm
  engine:** not needed by P4 (search is rhythm-independent). **Rust core:** unchanged.
- **Shared algorithm contracts (golden):** `@studio/content` `links.ts` /
  `link-edit.ts` / `markdownToPlainText`; `@studio/index` `sqlite-index.ts` search/
  facets/resolve; `@studio/application` `search-service.ts` resolver + repairQueue.

---

## 7. Risks + smallest first vertical slice

**Risks**

- *Offset semantics* — TS string offsets are UTF-16; Swift `String` is grapheme-based.
  Repair splicing and highlight ranges must convert consistently (work in
  `String.UTF16View` offsets end-to-end; golden the offsets). Highest-risk item.
- *Inline Markdown scanner without mdast* — reference-link definitions, code-span
  skipping, and the bracketed-`[[wiki]]` linkReference case are fiddly. Keep the
  corpus adversarial; the TS golden is the arbiter. If the scanner proves too leaky,
  fallback: port only the subset the corpus exercises and expand as real notes surface
  (index is disposable, so under-linking is recoverable, never data loss).
- *Snippet/fuzzy fidelity* — grapheme fold-mapping and Damerau-Levenshtein tie-breaks
  are exact-match traps; golden every branch.
- *Perf* — in-memory rebuild on every `reload()` is O(notes); fine for personal
  vaults. Escape hatch stays FTS5-in-Rust (`rusqlite`) if it ever isn't.

**Smallest first vertical slice** (proves the spine end-to-end, ships value alone):

1. `LinkExtractor.links` + `.editableLinks` with golden tests (offsets included).
2. `LinkGraph` (resolve + backlinks + forwardLinks) golden-tested.
3. `VaultStore.reload()` builds `[IndexedNote]` + a `LinkGraph`; add
   `backlinks(path:)`/`forwardLinks(path:)`.
4. `BacklinksView` in the note editor sheet + `BacklinksUITests`.

That slice delivers the backlinks gate with no dependence on P1 and no new search UI,
then search ranking/facets and the repair panel layer on top.
