# ADR-007: Self-host the licensed Studio typefaces

**Status:** Superseded by ADR-009
**Date:** 13 July 2026

> **Superseded by [ADR-009](./ADR-009-revise-studio-typefaces.md) (22 August 2026).**
> The self-hosting policy, preload rules, `font-display: swap`, release-gating, and
> `document.fonts.ready` baseline requirement all carry forward unchanged. Only the
> three families and their approved faces/fallbacks changed: Newsreader → Source
> Serif 4, Hanken Grotesk → Figtree, Caveat → Nothing You Could Do.

## Context

The final handoff replaces the earlier conceptual Canela/Avenir direction with legally free typefaces: Newsreader for editorial display, Hanken Grotesk for interface and body text, and Caveat for rare handwritten accents. Ateliera must work offline, avoid leaking usage through third-party font requests, and remain visually stable across desktop and PWA installations.

## Decision

Self-host reviewed WOFF2 subsets of Newsreader, Hanken Grotesk, and Caveat in the application. Record each font's source version and license alongside the files. Do not load fonts from Google Fonts or another external CDN at runtime.

Load only the faces used by the product:

- Newsreader: 400 normal, 400 italic, and 500 normal; optical sizing enabled where supported.
- Hanken Grotesk: 400, 500, 600, and 700 normal.
- Caveat: 500 and 600 normal.

Use `font-display: swap`. The fallback stacks are:

- Display: `Newsreader`, `Iowan Old Style`, `Baskerville`, `Georgia`, serif.
- Interface: `Hanken Grotesk`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- Handwritten: `Caveat`, `Bradley Hand`, cursive.

Caveat is decorative only and never carries essential instructions, body copy, metadata, or control labels. Typography remains usable if every custom font fails to load.

## Consequences

- The app remains private and typographically complete offline.
- Font assets, licenses, preload policy, and bundle weight become release-gated.
- Screenshot baselines must wait for `document.fonts.ready`.
- Text layout must tolerate fallback metric changes and 200% zoom without clipping.

## Rejected alternatives

- Canela and Avenir Next: not currently licensed for app/web redistribution.
- Runtime Google Fonts requests: conflict with privacy and offline-first requirements.
- System fonts only: durable fallback, but not faithful to the final editorial direction.
