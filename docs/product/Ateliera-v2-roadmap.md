# Ateliera v2 — roadmap & Phase 0 groundwork

*Status: in progress. Started 2026-09-29. Source: two brand boards + testing notes from Anna,
consolidated. This is the working plan; the brand/concept rationale lives in the conversation
and in the `ateliera-v2-concept` memory.*

## The one idea underneath it

**Moments are dots. Meaning is the lines between them.** Capture a small moment → connect it to
your life (an area, and the dimensions of that area) → over time those connections form patterns,
chapters, and a portrait of who you're becoming. The logo *is* the constellation; **The
Constellation** view *shows* it; the **workshop** flow *draws the lines*.

## Decisions (locked)

- **Keep existing room names.** Adopt the boards' functionality/design, not the poetic renames.
  Two exceptions are genuinely new/repurposed surfaces, not renames: **Journal** (absorbs
  Inbox/quick-capture) and **The Constellation** (new).
- **Inbox / quick-capture folds into the Journal.**
- **The workshop's life-design stack is configurable** (per area), with a sensible default.
- Same discipline as the rest of the repo: TDD, golden-parity between native + web, atomic commits.

## Phase 0 — format audit (DONE): the substrate already exists

The single biggest finding: **the vault note format already carries almost everything v2 needs.**
`StudioNote` (native `apple/Ateliera/Note/StudioNote.swift`, golden-matched to
`@studio/content`) already has:

| v2 need | Already in the format |
|---|---|
| Journal: dated entries | `created` / `updated` |
| Journal: tags | `tags: [String]` |
| Journal: cover image | `display.cover: String?` (+ `attachments`) |
| Anchor a seed to a life area | `lifeAreas: [String]` |
| The workshop's **dimensions** | `landscapeAnchor` + `LandscapeAnchor` enum: **vision · identityValuesFeelings · decisions · practices · structureStrategy** — exactly the requested stack |
| Season membership (chapters) | `seasons: [String]` |
| Connections / "lines" for the Constellation | `sourceNoteIds`, shared `lifeAreas`/`landscapeAnchor`/`tags`/`seasons` |
| Anything unforeseen | `extraFrontmatter` round-trips unknown keys |

And the **projection + capture substrate is already built**: `LandscapeStore` stores notes as
`lifeArea × anchor` cells with `addCard(lifeArea:anchor:…)` / `move` / `reorder`, and
`CaptureDestination` already has a `landscape(lifeArea:, anchor:, horizon:)` route. So the
workshop (Phase 3) is a guided **flow over existing plumbing**, and the Constellation (Phase 7)
is a **projection over existing links** — neither needs new data plumbing.

### The only format deltas v2 introduces (all optional, backward-compatible)

1. **New entry types for the exemptions:** a `memory` card type (new) and confirming
   `dream`/`possibility` maps to the existing `uncharted` type. These stay *light* — never
   workshopped.
2. **Workshop-session linkage (optional):** when one seed expands into cards across several
   anchors, link them back to the seed. **Reuse `sourceNoteIds`** (seed = source) rather than a
   new key. No schema change.
3. **Configurable dimensions:** per-area stack config extends the existing life-area config
   (cf. `LifeAreaConfig`, `.studio/config/*`), **not** note frontmatter.
4. **Possibility containers (Phase 9):** a Possibility can graduate into its own container keyed by
   a measurable title, holding typed child artifacts — `future-self-letter`, `eft-script`,
   `meditation` — alongside its reverse-workshop cards. New types **ride `extraFrontmatter`** so the
   web app tolerates them with no schema change; the seed links its children via `sourceNoteIds`.

Net: Phase 0 requires **no breaking format change**. Later phases add optional frontmatter/config
only, and every existing note keeps working.

## Phases (revised in light of the audit)

Legend: ⭐ = signature payoff. Critical path: **0 → 2 → 3 → 4 → 7**. Phases 1/5/6/8 slot around it;
Phase 9 extends Phase 3 (needs the workshop + the shipped reverse workshop first).

- **Phase 0 — Groundwork.** ✅ This document. Format is ready; deltas are small + optional.
- **Phase 1 — Brand & atmosphere** *(parallel, independent).* Constellation-A logo + light/dark
  app icons; the **Ivory · Sand · Clay · Olive · Ink · Dusk** palette as a theme; icon set
  (seasons/moon/rhythms/reflection/growth); slower-voice microcopy ("Come in slowly").
- **Phase 2 — The Journal.** Fold Inbox/quick-capture into a dated-entry space with tags + cover.
  Existing `created`/`tags`/`display.cover` back it; keep the room id, surface it as "Journal".
- **Phase 3 — The workshop** ⭐. Adding a *developmental* entry anchors it to a life area
  (pick/create), then walks the stack (Vision → Identity/Values/Feelings → Decisions → Practices
  → Structure & Strategy) one calm, **skippable, resumable** prompt at a time, writing cards into
  the anchored area via the existing `LandscapeStore`. **Memories + dreams/possibilities exempt.**
- **Phase 4 — Life Landscape as the spine (+ Identity reshape).** Landscape shows what each seed
  contributed; Identity Studio adopts its board sections (Already true · Practising now · Values ·
  How I want to feel), wired to the same model.
- **Phase 5 — Configurable stack.** Per-area reorder/rename/add/remove/disable of the dimensions;
  current set is the default.
- **Phase 6 — Seasons as chapters.** Grow the single Current Season into a timeline of all
  chapters (each with its wisdom), keeping the current-season focus on top.
- **Phase 7 — The Constellation** ⭐. Moments-over-time visualization: dots = entries, lines = the
  meaning-connections; the "moments · rooms · you" summary. A projection over existing links.
- **Phase 8 — Archive & browse polish.** The filterable "what you've learned" pattern
  (Notes / Images / Reflections) applied across Journal / Reflection / Wisdom — a shared browse
  layer, no redundant room.
- **Phase 9 — Possibility → manifestation container** ⭐ *(extends Phase 3; builds on the shipped
  reverse workshop).* A Possibility is first **refined from vague to measurable** — "$20M", not
  "incredibly wealthy" — a concrete, nameable Big Thing. That statement becomes the **title and
  root of its own container**, holding everything oriented toward making it real: the
  working-backwards plan (the shipped 90 → 60 → 30d → this week → today reverse workshop) **plus**
  a growing set of manifestation artifacts, each its own guided sub-flow — future-self letters, EFT
  tapping scripts, guided meditations (room for more). Each Possibility graduates from a single
  Uncharted note into a small manifestation workspace. Reuses `WorkshopView.Mode.possibility` /
  `ReverseWorkshopPlan` for the spine and the `GuidedThreadView` rail for the artifacts; the
  refine-to-measurable prompt is the new front door. AI-authored scripts/audio stay **optional and
  gated** (Inner Studio, AI scopes); the core writes-your-own and works offline.

## Notes for building

- Phase 3 is highest-risk/reward — prototype the flow (even static screens) before wiring.
- Every phase: TDD (colocated tests, golden parity vs `@studio/*`), atomic one-line commits,
  authored solely by Anna (no AI attribution).
