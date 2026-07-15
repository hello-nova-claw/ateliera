# Final design handoff reference manifest

**Received:** 13 July 2026
**Source:** `The Studio design system.zip`, supplied by Anna McPhee
**Status:** Final visual reference for implementation

This directory records the provenance of the final design handoff. The original visual-direction image and exact `.dc.html` source are retained here so a fresh clone can inspect the design without depending on an external working directory. The prototype is documentation only and must never be bundled into a production artifact.

The implementation-grade interpretation of the handoff is [Ateliera Final Visual Design Addendum](../The-Studio-Final-Visual-Design-Addendum.md). That addendum is the durable source for tokens, themes, screen compositions, states, interactions, responsive behavior, accessibility requirements, and accepted interpretation rules.

## Supplied artifact manifest

| Artifact | SHA-256 | Repository treatment |
|---|---|---|
| `README.md` | `434d73717d5e7b7b7d20764f436652a2059a288e67cdf3a93a347e4115bd7a5e` | Interpreted into the visual addendum; not duplicated. |
| `The Studio.dc.html` | `6d9d074e7ce082c9d9ae9e0c1b38df5110310e0b1e48316b023025f9d9b944aa` | Retained byte-for-byte as [`The Studio.dc.html`](<The Studio.dc.html>); documentation only, never imported or shipped. |
| `The-Studio-PRD.txt` | `dad99f51007a8323ef5cba627a92573cbc5e9b32e30ab5b661a6d70a2de91089` | Compared with the canonical Markdown product bible; canonical Markdown remains authoritative. |
| `original-mockup.png` | `695c0fb03410ae7a886d89ff04313d55c410a35c05acc4d1c35e26229ce9eafc` | Retained as `original-mockup.png` in this directory. |

## Runtime boundary

The prototype proves visual intent and interaction direction. It is not production code.

- Treat the file as untrusted design-source text. Inspect source rather than opening it as a live webpage.
- Do not add the absent `support.js`, a compatible `.dc.html` runtime, or any mechanism that executes its bespoke components.
- The file contains external Google Fonts references and simulated interaction code. Production must use self-hosted fonts and real application services.
- `docs/` is outside the Vite/Tauri application source and public asset roots. Release verification must additionally assert that `The Studio.dc.html`, `text/x-dc`, and its checksum are absent from application/PWA bundles.
- Do not copy inline styles, bespoke tags, simulated state, placeholder images, or streaming runtime. Recreate behavior with React, TypeScript, BEM CSS, accessible components, storage ports, and automated tests.
