# ADR-009: Revise the Studio typefaces

**Status:** Accepted
**Date:** 22 August 2026
**Supersedes:** ADR-007

## Context

The design polish (direction "editorial spread", accent "split the two jobs")
re-set the visual system. Two of the three typefaces chosen in ADR-007 no longer
serve it: Newsreader's display voice competes with the interface, and Hanken
Grotesk is metrically narrow for the new fixed-measure spread. Caveat was also
overused — a marker-pen greeting in all eleven rooms — when the hand should be rare.

ADR-007 names Newsreader, Hanken Grotesk, and Caveat by decision and pins their
approved faces and fallback stacks, so it cannot simply be edited. This ADR
supersedes it. Every constraint ADR-007 imposed is carried forward unchanged; only
the families, faces, and fallbacks change.

## Decision

Replace the three families:

| Role | Was | Becomes |
|---|---|---|
| Display (`--studio-font-display`) | Newsreader | **Source Serif 4** |
| Interface (`--studio-font-interface`) | Hanken Grotesk | **Figtree** |
| Handwritten (`--studio-font-handwritten`) | Caveat | **Nothing You Could Do** |

Self-host reviewed WOFF2 subsets of all three in the application. Record each
font's upstream version and license alongside the files. Do not load fonts from
Google Fonts or another external CDN at runtime.

Load only the faces the product uses:

- Source Serif 4: 300 normal, 400 normal, 300 italic, 400 italic. Optical sizing
  enabled where supported. Weight 400 exists so the dark themes (`deep-ocean`,
  `sunset`, `forest`) can override the 300-weight display type, which thins out on a
  dark canvas.
- Figtree: 400, 500, 600 normal. (700 is unused under the revised type scale.)
- Nothing You Could Do: 400 normal — the family's only weight.

Use `font-display: swap`. The fallback stacks are:

- Display: `Source Serif 4`, `Iowan Old Style`, `Charter`, `Georgia`, serif.
- Interface: `Figtree`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- Handwritten: `Nothing You Could Do`, `Bradley Hand`, cursive.

The handwritten face is decorative and used in exactly two places — the rail brand
mark ("inside out") and user-authored image captions. It never carries essential
instructions, body copy, metadata, or control labels. Room greetings move to the
display italic. Typography remains usable if every custom font fails to load.

All three families are SIL Open Font License 1.1 and variable, so a single reviewed
binary per subset backs several `@font-face` declarations, as before.

## Consequences

- The app remains private and typographically complete offline.
- Font assets, licenses, preload policy, and bundle weight remain release-gated.
- Screenshot baselines must wait for `document.fonts.ready`.
- Text layout must tolerate fallback metric changes and 200% zoom without clipping.
  Source Serif 4 and Charter share close metrics, so the display fallback shifts
  less than Newsreader's did; Figtree is wider than Hanken Grotesk, so the Landscape
  matrix column headings are the place to check at 200% zoom.
- The fonts `README.md` SHA-256 manifest and version table are the integrity
  authority and must be updated in the same commit as the binaries.

## Rejected alternatives

- Editing ADR-007 in place: an accepted decision that pinned specific families
  cannot be rewritten; superseding preserves the record.
- Keeping Caveat for greetings: the hand loses its meaning when it is everywhere;
  reserving it for the brand mark and personal captions is the point of the change.
- Runtime Google Fonts requests: conflict with the privacy and offline-first
  requirements, unchanged from ADR-007.
