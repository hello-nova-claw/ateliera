# Ateliera design system (@studio/ui)

Ateliera is a calm, offline-first "studio for designing a life." The visual
language is warm, editorial, and quiet: serif display type, generous space, soft
paper-like surfaces, no urgency or gamification. Build designs that feel unhurried.

## Required wrapper — nothing is styled without it

Every colour in this system is defined on a `.studio-app` root element. **Wrap
your whole design in it, or all components render colourless:**

```jsx
<div className="studio-app" data-theme="chamomile">
  {/* your design */}
</div>
```

`data-theme` selects the palette. Omit it (or use `chamomile`) for the warm
default. The seven themes: `chamomile` (default), `fig-leaf`, `sunrise`,
`wisteria`, `deep-ocean`, `sunset`, `forest`. Light/dark follows the OS.

## Styling idiom — CSS custom properties + BEM

Components are styled internally; you don't pass style props (except plain
`className`/`children` where the API allows). Style your own layout glue with the
design tokens — always `var(--studio-*)`, never hard-coded colours or pixels:

- **Colour:** `--studio-color-canvas` (page), `--studio-color-surface`,
  `--studio-color-sunken`, `--studio-color-ink` / `-ink-strong` / `-ink-muted` /
  `-ink-soft` / `-ink-faint`, `--studio-color-line` / `-line-strong`,
  `--studio-color-link`, `--studio-color-focus`.
- **Meaning colours** (one per life-area meaning): `--studio-color-foundation`,
  `--studio-color-vision`, `--studio-color-growth`, `--studio-color-reflection`,
  `--studio-color-celebration`, `--studio-color-uncharted` (+ matching
  `--studio-stock-*` / `--studio-stock-*-edge` tints for card backgrounds).
- **Type:** `--studio-type-room-title` (the one hero per room),
  `--studio-type-section`, `--studio-type-card-title`, `--studio-type-greeting`,
  `--studio-type-quote`, `--studio-type-page-subtitle`, `--studio-type-body`,
  `--studio-type-meta`, `--studio-type-control`, `--studio-type-label`,
  `--studio-type-eyebrow`, `--studio-type-signature` (each a full `font`
  shorthand). Font families: `--studio-font-display` (Source Serif 4 serif),
  `--studio-font-interface` (Figtree), `--studio-font-handwritten` (Nothing You
  Could Do — the accent hand, used only for the brand mark and image captions).
- **Space:** `--studio-space-1` … `-24`. **Radius:** `--studio-radius-note`,
  `-card`, `-sheet`, `-control`.

Use semantic BEM class names for your own elements (e.g. `class="reflection-list"`),
not utility classes — this system has no utility-class vocabulary.

## Components

Four verified components, all from `@studio/ui`: **Card** (a note card with a
semantic meaning, title, excerpt, optional actions), **SemanticMark** (the
meaning marker — `type` is one of the six meanings above, `labelMode`
`"visible"`/`"hidden"`), **CardEditor** (the markdown note editor with
save/conflict/recovery states), **Inspector** (an overlay panel with metadata,
backlinks, and repair states). Read each component's `.d.ts` for its exact props
and `.prompt.md` for usage before composing it.

## Where the truth lives

- `styles.css` — import once; it pulls in every token, font, and component style.
- `components/<group>/<Name>/<Name>.d.ts` — the exact prop contract.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage notes.

## Minimal example

```jsx
<div className="studio-app" data-theme="chamomile">
  <main style={{ display: 'grid', gap: 'var(--studio-space-5)', padding: 'var(--studio-space-8)' }}>
    <Card
      semanticType="reflection"
      title="What I learned"
      excerpt="Small, attentive steps become visible evidence over time."
      actions={<button>Open reflection</button>}
    />
    <SemanticMark type="growth" labelMode="visible" />
  </main>
</div>
```
