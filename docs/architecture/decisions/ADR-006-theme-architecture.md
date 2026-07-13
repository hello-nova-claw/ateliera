# ADR-006: Token override themes preserve semantic identity

**Status:** Accepted
**Date:** 13 July 2026

## Context

The final design handoff defines seven complete visual themes: four light and three dark. The same semantic concepts—Foundations, Vision, Growth, Reflection, Celebration, and Uncharted—must remain recognizable across every theme. Product behavior and component structure must not fork by theme.

## Decision

Use one canonical semantic token contract. Chamomile defines the complete default token set. Every other theme is a typed override map applied to the application root through `data-theme` and CSS custom properties. Components consume semantic tokens only; they do not import theme-specific values or branch on a theme name.

The existing Task 2 application names are canonical: `--studio-color-foundation`, `--studio-color-vision`, `--studio-color-growth`, `--studio-color-reflection`, `--studio-color-celebration`, and `--studio-color-uncharted`. The prototype's short names map into these properties; they do not create a parallel token family. The complete mapping is in the final visual addendum.

Each theme declares `light` or `dark` mode so the shell can set `color-scheme`, browser chrome, and accessibility expectations. Theme selection is a local user preference and is independent of content. An absent, invalid, or incomplete preference falls back to Chamomile. Missing override values also fall back to Chamomile.

Semantic hue identity is invariant. A theme may retune luminance, saturation, and warmth for contrast, but it may not remap a meaning to another semantic hue. Text or icons always accompany semantic color.

Inner Studio is a post-MVP low-stimulation experience with its own controlled dusk palette. It does not mutate the saved global theme.

## Consequences

- A theme is replaceable presentation data, not domain state.
- All seven themes require automated contrast, forced-colors, reduced-motion, and screenshot coverage.
- Theme transitions use shared motion tokens and become instant when reduced motion is requested.
- New themes require a complete contrast review; a swatch alone is insufficient.
- User content and Markdown remain unchanged when a theme changes.

## Rejected alternatives

- Separate stylesheets or component variants per theme: too much behavioral and visual drift.
- Automatically remapping semantic meanings for aesthetics: breaks learned visual language.
- Storing theme on notes: incorrectly couples presentation to durable content.
