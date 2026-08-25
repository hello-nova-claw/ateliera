# Ateliera Native Apple App (Mac + iPhone + iPad) Build Plan

**Status:** Plan ready for review

**Date:** 25 August 2026

**Scope:** One native SwiftUI app across Mac, iPhone, and iPad — in Ateliera's own
styling, feeling genuinely native — operating on the same user-owned iCloud Markdown
vault as the existing web/desktop app. The web/PWA stays for non-Apple platforms. The
vault format, not shared code, is the contract between them.

**Decision authority:** `docs/architecture/decisions/ADR-012-native-apple-app.md`
(supersedes ADR-011, the Tauri-iOS approach).

**Product authority:** `docs/product/The-Studio-PRD-Design-Bible.md`

**Visual authority:** `docs/design/The-Studio-Final-Visual-Design-Addendum.md` + `tokens.css`

**Working agreement:** `AGENTS.md` adapted for Swift — TDD, small atomic commits, no
gamification, WCAG/accessibility (Dynamic Type, VoiceOver), Markdown/media authoritative.

> Ateliera looks like ours; the platform supplies the feel. The files are the truth, so
> the native app and the web app open the same Studio.

---

## 1. Executive decision

The webview era gave us three platforms from one codebase and got us far. But the product
now wants a *native* Apple experience — the feel, and the ecosystem (HealthKit, Handoff,
Widgets, Files, iCloud) — and a webview can't deliver either well. The unlock is that
**Ateliera's source of truth is the vault, not the code**: a native app shares the
*Studio* (the iCloud Markdown folder), not a line of UI.

So we build **one SwiftUI app for the whole Apple ecosystem**, reusing the one piece that
must stay authoritative — the Rust vault — and treating the Markdown file format as the
interop contract with the untouched web/PWA app.

Three load-bearing choices (from ADR-012):
1. **SwiftUI multiplatform** — Mac + iPhone + iPad from ~one view layer; eventually replaces
   the Tauri desktop app with a native Mac app.
2. **Rust vault core via UniFFI** — reuse `vault.rs` (already compiles for iOS), don't
   reimplement the dangerous part.
3. **Swift-native domain for the MVP**, with the **file format as the contract** and a
   documented escape hatch to a shared Rust core if the two domains drift.

---

## 2. Goals and non-goals

**Goals**
- A native SwiftUI app on Mac + iPhone + iPad, in Ateliera's custom identity, feeling native.
- Reads/writes the same iCloud Markdown vault as the web/desktop app — perfect interop.
- Capture, read, search, and edit against that vault; HealthKit feeding the rhythm layers.
- Handoff/Continuity, Widgets, Shortcuts, Spotlight, Continuity Camera as first-class.
- Reuse the Rust vault core (atomic/path-contained/recoverable) via UniFFI.
- All-local / user's-own-iCloud privacy story preserved ("data not collected").

**Non-goals (for this plan)**
- Rewriting the web/PWA/Tauri-desktop app — it keeps shipping unchanged until parity.
- A shared Rust *domain* core on day one (escape hatch, not MVP).
- visionOS / watchOS (SwiftUI makes them reachable later; out of scope now).
- Feature parity at launch — this is an MVP that grows room by room.

---

## 3. Architecture

```
Native Apple app (one SwiftUI multiplatform target: Mac + iPhone + iPad)
  ├── UI: SwiftUI views (rooms), NavigationSplitView adapts per device
  ├── Theme: Ateliera design tokens → SwiftUI (bundled fonts, colours, type scale)
  ├── Domain (Swift): note schema, Markdown round-trip, seasons/identity/rhythm,
  │                   FTS index — the file format is the shared contract
  ├── Vault core (Rust via UniFFI): vault.rs — atomic, path-contained, recoverable
  │                   + NSFileCoordinator / NSFileVersion on the Swift side
  └── Ecosystem: HealthKit, iCloud, Handoff, Widgets, Shortcuts, Spotlight

Shared with the web/desktop app: the iCloud Markdown VAULT (files + .studio/), not code.

Untouched: React/Vite web + PWA + Tauri desktop (ships until native reaches parity).
```

- **Repo shape.** A new `apple/` (or `AtelieraApp/`) Xcode project alongside the existing
  workspace; the Rust core is built as a UniFFI library from the existing `src-tauri`
  vault code (extracted into a reusable crate). The web packages are untouched.

---

## 4. The domain-sharing decision (the crux)

| Layer | Native app uses | Why |
|---|---|---|
| **Vault I/O + security** | **Rust core via UniFFI** (reuse `vault.rs`) | The dangerous, exhaustively-tested part; already compiles for iOS. One authoritative impl. |
| **Note schema + Markdown round-trip** | **Swift**, file format as contract | Modest; must produce byte-compatible Markdown (round-trip test against `@studio/content` fixtures). |
| **Seasons / identity / landscape / rhythm** | **Swift** | Reimplemented from the PRD spec + TS as reference; rhythm math is portable. |
| **Search index (FTS)** | **Swift** (SQLite) or Rust core | Disposable projection (ADR-008) — rebuildable from the vault, so low-risk either way. |

**Contract enforcement:** a cross-language golden-file suite — the Swift Markdown
serializer must round-trip the exact `@studio/content` test fixtures (including unknown-
frontmatter-key survival), so a note written on iPhone is byte-identical to one written on
the Mac web app. **Escape hatch:** if the TS and Swift domains drift painfully, consolidate
the shared logic into the Rust core (UniFFI for Swift, WASM for the web) — deferred until
it earns itself.

---

## 5. Custom identity → SwiftUI (Ateliera, not stock iOS)

- **Fonts:** bundle Source Serif 4, Figtree, Nothing You Could Do; expose the type scale
  (`--studio-type-*`) as SwiftUI `Font` + text styles that honour **Dynamic Type**.
- **Colour:** the meaning colours + surfaces/inks become a theme struct / asset catalog,
  with the seven themes and light/dark following the OS.
- **Spacing/rhythm/radius:** the `--studio-space-*` / `--studio-radius-*` tokens become a
  Swift spacing scale; the editorial-spread measures map to layout constants.
- **Components:** the primitives (Card, SemanticMark, RoomHeading, the note editor) are
  rebuilt as SwiftUI views matching the visual addendum — custom look, native behaviour
  (native text editing/selection replaces CodeMirror).

The design system is the *spec*; the DS-sync bundle and Storybook remain the web's, but the
tokens are the single source both UIs honour.

---

## 6. Ecosystem integrations

- **HealthKit** — read menstrual-cycle, sleep, and mindful-minutes data (with explicit
  permission) to power the cycle/rhythm layers and enrich reflections; never write silently.
- **iCloud + Handoff/Continuity** — same vault folder everywhere; start on Mac, continue on
  iPhone via `NSUserActivity`.
- **Widgets** — today's rhythm/almanac, the current season, a gentle "return" surface.
- **Shortcuts / App Intents** — quick capture, "add a reflection," open a room.
- **Spotlight** — index note titles for system search; **Continuity Camera** — drop a photo
  into a note from the iPhone while on the Mac.

All respect the no-alarm, no-guilt, no-streaks product constraints.

---

## 7. Hard problems

- **Byte-compatible Markdown across TS and Swift** (§4) — the golden-file round-trip is the gate.
- **Vault access parity on iOS/iPadOS** — the security-scoped folder + `NSFileCoordinator` +
  `NSFileVersion` conflict handling, now native (the ADR-011 design, done idiomatically).
- **UniFFI boundary for the Rust vault** — extract the vault into a reusable crate, define the
  UniFFI interface for the `VaultPort` surface, keep the security invariants across the FFI.
- **Cross-device conflicts** — `NSFileVersion` → the existing conflict/snapshot model; nothing
  overwritten across Mac/iPhone/iPad.
- **HealthKit privacy + calm** — permission prompts, on-device only, no pressure framing.
- **Two-domain maintenance** — mitigated by the shared file format + golden files; escape hatch to Rust core.

---

## 8. Phased plan (native MVP first; each phase ships value)

**Phase N0 — Skeleton + theme.** SwiftUI multiplatform target; bundle the fonts; build the
Ateliera theme (tokens → SwiftUI); a room shell renders on Mac + iPhone + iPad. **Gate:**
the type scale + meaning colours match the visual addendum at both idioms; Dynamic Type works.

**Phase N1 — Rust vault via UniFFI (read).** Extract `vault.rs` into a reusable crate; UniFFI
read surface (list/readText/readBinary/exists/getRevision); Swift opens an iCloud folder and
reads notes. **Gate:** open the same vault the web app uses; read a note byte-for-byte.

**Phase N2 — Swift domain + Markdown round-trip.** Note schema + parse/serialize in Swift;
the golden-file suite passes against `@studio/content` fixtures (unknown keys survive).
**Gate:** a note written natively is byte-identical to the web serializer's output.

**Phase N3 — Capture + read loop.** Native capture and reading on the shared vault, iPhone +
Mac; writes go through the UniFFI vault (atomic). **Gate:** capture on iPhone, see it on the
Mac web app; edit on the Mac native app, see it on iPhone.

**Phase N4 — Rhythm + HealthKit.** Port the rhythm layers; wire HealthKit (cycle/sleep/mindful).
**Gate:** the cycle layer is driven by Health data with permission; almanac renders natively.

**Phase N5 — Rooms + search + ecosystem.** Grow the rooms; native search over the index;
Widgets + Shortcuts + Handoff. **Gate:** the core rooms are usable natively; Handoff works
Mac↔iPhone.

**Phase N6 — Mac parity + distribution.** Native Mac chrome (menu bar, windows, Quick Look);
TestFlight, then App Store; privacy labels. **Gate:** installable on all three; parity with
the daily-use web features.

---

## 9. Interop with the existing app

- Both apps read/write the **same iCloud `Ateliera` vault** (Markdown + `.studio/`).
- The web/PWA/Tauri-desktop app is **untouched and keeps shipping** throughout; users can mix
  (Mac web app + iPhone native app) with no data conflict beyond normal file coordination.
- The native Mac app **replaces** the Tauri desktop app only once it reaches parity — a
  deliberate, later cutover, not a big-bang switch.

---

## 10. Risks and open questions

- **Scale.** This is a multi-month native build. Mitigation: strict MVP scope; value ships
  from Phase N3.
- **Two domains drifting.** Mitigation: golden-file round-trip as a hard gate; Rust-core
  escape hatch documented.
- **UniFFI ergonomics** for the vault surface (async, error mapping). Mitigation: the vault
  surface is small and already well-typed (`VaultPort`).
- **Swift/Rust toolchain in this repo's hermetic setup** (the `.toolchains/` + Xcode env gap
  Phase 0 hit) — the native app's Rust core build must handle the same env bridging.

**Decisions to confirm before Phase N0:**
1. **Repo layout** — a sibling `apple/` Xcode project in this repo vs. a separate repo.
2. **Index** — Swift SQLite vs. building it into the Rust core from the start.
3. **MVP room order** — which rooms land first (recommend: Foyer + Reflection capture).

---

## 11. What this explicitly does not change

The web app, the PWA, the Tauri desktop app, the `@studio/*` packages, the design tokens as
the source of truth, the vault format, and every product invariant (Markdown authoritative,
disposable index, no gamification). The native app is a new sibling on the same Studio.
