# The Almara seam — folding the rhythm engine into Ateliera

**Status:** Approved design, not yet started
**Date:** 18 August 2026
**Author:** Anna McPhee (with Claude)

## 1. Purpose and scope

Almara (internally "the Almanac," at `~/Sites/almara`) is a separate personal
app fusing natal chart, moon phase, menstrual cycle, and season into a
resurfacing engine that hands the user one well-chosen thing each visit. Its
own product brief already names the wedge: "nobody cleanly fuses personal
cycle + moon + local season + astrology into one orientation surface that
learns." Rather than maintaining Almara as a second app, the agreed direction
is to fold its rhythm engine into Ateliera as a new capability feeding the
Foyer and Current Season room — Ateliera becomes the house, Almara becomes
its weather.

**In scope:** the Gift model (what a resurfaced item becomes in Ateliera),
routing a kept Gift into a real card, the rhythm profile's home in Settings,
the resurfacing candidate pool sourced from Ateliera's own vault, and Foyer
placement.

**Out of scope:** the natal-chart/moon/cycle/timezone computation itself —
that's already done (see §2). Also out of scope: any change to iOS/iPadOS
work (`2026-08-17-ios-ipad-design.md`) — this seam is designed to be
platform-agnostic and slots into either shell unchanged.

**Supersedes:** an earlier draft of this design assumed a cheaper "ambient
astrology" Gift computed from `RhythmContext` alone, deferring real
vault-backed resurfacing to a theoretical Phase 2. Tracing Almara's actual
`reflections-assembly.ts` disproved that assumption — Almara has no such
ambient Gift. A Gift is always either a real resurfaced vault entry or a
single hardcoded fallback sentence. This spec designs the real thing in one
pass, since Ateliera's existing `packages/index` infrastructure makes that a
modest addition rather than the ground-up build Almara required.

## 2. What already exists

`packages/rhythm` was extracted from Almara's `src/domain` into Ateliera's
monorepo on branch `feat/rhythm-extraction` (5 commits, not yet merged to
`main`). It is pure computation — no vault access, no platform APIs:

```ts
computeRhythmContext(profile: RhythmProfile, date: string): RhythmContext
selectResurface(cards: ResurfaceCard[], ctx: RhythmContext, today: string): ResurfaceCard | null
```

`RhythmProfile` is deliberately narrow — `{ location: { hemisphere }, cycle?:
{ lastPeriodStart, avgLengthDays }, natal: { placements } }` — no vault path,
no identity, no storage handle, so the package stays portable. Natal chart
computation (raw birth date/time/timezone/location → placements) and local-
to-UTC timezone conversion are separate pure functions in the same package,
run once at profile-save time, not on every rhythm computation.

`selectResurface` takes its candidate pool as a plain argument — it does not
know how to read a vault. That responsibility belongs entirely to the host
app, which is exactly the seam this spec designs. Verified independently:
typecheck, lint, and the full workspace test suite (105 files, 1,394 tests
including 60/60 in `packages/rhythm`) all pass on that branch.

## 3. The Gift model

Matching Almara's actual model (`app/reflections-assembly.ts`), not the
ambient ideas floated earlier: a Gift is one of two things.

1. **A real resurfaced card** — the highest-ranked due `ResurfaceCard` from
   the candidate pool, per `selectResurface`. Its `kind` is one of `evidence`
   / `reframe` / `wish` / `dream`.
2. **A calm static fallback** — shown when nothing is due or the pool is
   empty. Almara's own fallback text ("A quiet place to begin.") is a
   reasonable default; final copy is Anna's call at implementation time, not
   fixed by this spec.

`RhythmContext` (season, moon, cycle, natal placements) is used only to rank
which *kind* of due card to prefer (`preferredKinds` in the extracted
package) — it never generates original text. This is intentional and
preserved as-is: the rhythm engine orients, it doesn't author.

## 4. The resurfacing candidate pool

New work, since Ateliera has no equivalent to Almara's `buildResurfacePool`
yet. `packages/index`'s `SearchFilters` already supports querying by `rooms`,
`statuses`, and date range — this is a query against existing infrastructure,
not a new query engine.

**New frontmatter fields**, added to `recognizedFrontmatterKeys` and
`frontmatterSchema` in `packages/content/src/frontmatter-schema.ts` (same
mechanism used for `source_notes` earlier this project):

- `resurface_kind`: `'evidence' | 'reframe' | 'wish' | 'dream'` (optional —
  absent means the card never participates in resurfacing)
- `resurface_due`: ISO `YYYY-MM-DD` (optional)
- `resurface_interval_days`: number (optional)

A card only enters the pool if `resurface_kind` is set. **`resurface_kind` is
opt-in, never assigned automatically.** Cards in Reflection Garden and
Uncharted get a "mark for resurfacing" action in the card editor (choosing
`evidence` / `reframe` / `wish` for Reflection Garden entries, `dream` for
Uncharted) that sets the field; nothing is classified or enrolled by default.
This matches Ateliera's existing ethos of deliberate, user-initiated action
over automatic pattern-matching (the same reasoning behind Wisdom's manual
theme assignment), and it's a materially smaller v1 than building an
auto-classification heuristic: no new logic to infer resurfacing-worthiness,
just one new field and one new editor action reusing the existing card-editor
metadata pattern (`packages/ui/src/CardEditor`).

Mapping a matched `IndexEntry`/`SearchHit` to a `ResurfaceCard` is a small,
pure function: `sourcePath` from the entry's path, `kind`/`dueDate`/
`intervalDays` straight from the new frontmatter fields.

## 5. Routing a kept Gift

Reuses the existing `capturePlacements` table in
`packages/application/src/capture-metadata.ts` verbatim — no new capture
machinery, two new entries:

| `ResurfaceCard.kind` | `Gift.kind` shown | Destination placement |
|---|---|---|
| `dream` | `dream` | `uncharted` (existing) |
| `evidence` / `reframe` / `wish` | `resurfaced` | `reflection` (existing) |

The calm static fallback has no "keep" action — there's nothing to keep.

## 6. Rhythm profile in Settings

New Settings section, following the same atomic `.studio` configuration-file
pattern already used for Wisdom theme preferences (not a markdown card — this
is structured config, not prose). Stores:

- Raw birth inputs (date, local time, timezone, birthplace, lat/lon) — kept
  so the natal chart can be recomputed if corrected, matching Almara's own
  documented reason for retaining raw inputs.
- The computed `natal.placements` cache, so day-to-day rhythm computation
  doesn't recompute the chart on every load.
- `location.hemisphere` and the optional `cycle` basis
  (`lastPeriodStart`, `avgLengthDays`).

Recomputation (raw inputs → placements) runs once, on save, using the
extracted package's natal-chart and timezone functions — not on every app
open.

## 7. Foyer placement

A new `TodaysGift` component, positioned second in `FoyerPage.tsx`'s render
order — after `Becoming`, before `SeasonPreview` (verified against the actual
current order: Becoming → SeasonPreview → Principles → Feelings → ReturnCard
→ Legend). This respects Ateliera's existing priority (identity first) while
still giving the Gift near-top prominence.

The internal name for Almara's ambient season concept (distinct from
Ateliera's user-authored Current Season room) is **"the year-wheel"** — used
in code/types for the rhythm engine's seasonal input, never surfaced as a
room label or anywhere it could be confused with Current Season.

## 8. Data flow

```
Settings (rhythm profile, atomic config)
   -> natal-chart.ts / timezone.ts (once, on save)      -> placements cached in profile
Foyer load
   -> profile (from Settings) + today's date
   -> computeRhythmContext(profile, date)                -> RhythmContext ("the year-wheel", moon, cycle, placements)
   -> packages/index query (rooms: [reflection-garden, uncharted], resurface_kind present)
   -> map results to ResurfaceCard[]
   -> selectResurface(cards, context, today)              -> due card, or null
   -> Gift = due card mapped to {kind, payload}, or calm fallback
   -> TodaysGift renders in Foyer, second slot
   -> "Keep" action -> capturePlacementMetadata(placement) -> existing card-creation flow
```

## 9. Error handling

Consistent with Ateliera's existing calm empty/loading/stale/offline/error
pattern:

| State | Handling |
|---|---|
| No rhythm profile set yet | Foyer shows no Gift slot at all (not an error state) until Settings has a profile saved |
| Index query fails | Falls back to the calm static Gift, same as an empty pool — resurfacing is a nice-to-have layer, never a hard dependency for Foyer to render |
| Natal chart computation fails (e.g. unresolvable timezone) | Settings shows the specific failure inline at save time; `rising` stays `null` rather than fabricated, matching the extracted package's existing invariant |

## 10. Testing

- **Pure logic**: already covered — `packages/rhythm`'s own 60 tests.
- **New pool-building function**: unit tests mapping `SearchFilters` results
  to `ResurfaceCard[]`, including the "no `resurface_kind` present" exclusion
  case.
- **Integration**: a Foyer test asserting the right Gift kind renders for a
  given mocked `RhythmContext` + pool, and that "Keep" produces a card in the
  correct room via the existing capture-placement test pattern.
- **Settings**: unit tests for the atomic config round-trip (save raw inputs
  → compute placements → reload → placements match without recomputation).

## 11. Rollout

Single integration, not phased — per §1, the earlier ambient/real split
didn't hold up. Suggested build order (informs the implementation plan, not
fixed here):

1. Merge `feat/rhythm-extraction` (already done, already green).
2. New frontmatter fields + pool-building query against `packages/index`.
3. Rhythm profile Settings section (atomic config, natal chart computation
   on save).
4. `TodaysGift` Foyer component wired to `computeRhythmContext` +
   `selectResurface` + the pool.
5. "Keep" action wired through existing `capturePlacements`.

This does not block or get blocked by the iOS/iPadOS work — build order
between the two is Anna's call, not fixed by either spec.
