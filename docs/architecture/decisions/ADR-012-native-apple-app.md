# ADR-012: A native SwiftUI app across the Apple ecosystem, on the shared vault

- Status: accepted
- Date: 2026-08-25
- Supersedes: ADR-011 (iOS via Tauri 2) — the vault decision carries forward; the host changes.
- Refines: ADR-004 (Desktop authoring, mobile capture)
- Depends on the invariant of ADR-001 (Markdown is authoritative)

## Context

Ateliera ships today as a React 19 + Vite web app: a PWA, a Tauri macOS desktop app,
and (Phase 0) a Tauri iOS host. The product now wants two things from its Apple
presence that the webview architecture cannot give well:

1. **A genuinely native *feel*** — real scrolling, text editing, gestures, sheets,
   haptics, Dynamic Type, transitions — while keeping Ateliera's own custom visual
   identity (Source Serif 4 / Figtree / Nothing You Could Do; ADR-009). A WKWebView can
   reproduce the *look* but never the *feel*; the two are not in tension in SwiftUI,
   which supports fully custom fonts, colours, and components on native behaviour.
2. **Deep, seamless ecosystem integration** — HealthKit (cycle, sleep, mindful minutes
   feeding the rhythm and reflection features), iCloud, Handoff/Continuity between Mac
   and iPhone, Files, Widgets, Shortcuts, Continuity Camera, Universal Control. Each of
   these is a native API that Tauri can only reach through an awkward plugin bridge —
   and Phase 0 showed the bridge does not even fit this app's Rust-only iOS host.

The enabling insight is Ateliera's own first principle: **the vault of Markdown + media
is the source of truth, not the code** (ADR-001). So a native app does not need to share
*code* with the web app — it shares the *vault*. Both read and write the same iCloud
folder of Markdown, and interoperate perfectly.

## Decision

**Build one native SwiftUI app targeting Mac, iPhone, and iPad, in Ateliera's own
styling, operating on the same user-owned iCloud Markdown vault. Keep the web/PWA app for
non-Apple platforms. The vault format — not shared code — is the contract between them.**

- **One multiplatform SwiftUI codebase** for Mac + iPhone + iPad. Navigation adapts per
  device (`NavigationSplitView`: sidebar/columns on Mac and iPad, stack on iPhone);
  most views are shared. This app will, over time, **replace the Tauri macOS desktop
  app** with a genuinely native one (menu bar, multiple windows, Quick Look, Spotlight,
  Services, keyboard-first).

- **The vault decision from ADR-011 stands unchanged**: a user-owned folder, defaulted to
  `Ateliera` in iCloud Drive, so Mac + iPhone + iPad share one Studio. On the Mac the
  vault is a real folder (no security-scoped-bookmark friction); on iOS/iPadOS it is a
  security-scoped folder as ADR-011 described — but reached with *native* `NSFileCoordinator`
  and `NSFileVersion` conflict handling, first-class instead of bridged.

- **Reuse the Rust vault core.** `apps/studio/src-tauri/src/commands/vault.rs` — the
  atomic, path-contained, recoverable write model with ~900 lines of security tests — is
  the crown jewel of correctness. It is exposed to Swift via **UniFFI** (it already
  compiles for `aarch64-apple-ios`, proven in Phase 0) rather than reimplemented. This
  keeps one authoritative implementation of the dangerous part.

- **The higher domain is Swift-native for the MVP.** The note schema, Markdown
  round-trip, seasons/identity/landscape projections, and rhythm calc
  (`@studio/domain`/`content`/`index`/`rhythm`) are reimplemented in Swift, with the
  **Markdown file format as the shared contract** (specified in the PRD appendix and the
  `@studio/content` serializer). Rationale: the domain is modest, files are the real
  interop boundary, and this keeps the MVP tractable. If divergence between the TS and
  Swift domains becomes painful, the escape hatch is to consolidate the shared logic into
  the **Rust core** (UniFFI for Swift, WASM for the web) — a larger migration deferred
  until it earns itself.

- **Custom identity via design tokens → SwiftUI.** The existing token system (`tokens.css`,
  the type scale, the meaning colours, spacing/rhythm) maps directly to a SwiftUI theme:
  the three brand fonts are bundled (`Font.custom`), colours become an `Asset`/theme
  struct, the type scale becomes text styles. Ateliera looks like Ateliera; the platform
  supplies the feel. No stock-iOS look is adopted.

- **Ecosystem integrations are first-class**, not bridged: HealthKit (read cycle/sleep/
  mindful minutes into the rhythm layers), Handoff/Continuity, Widgets, Shortcuts,
  Continuity Camera, Spotlight. Each is a native module in the SwiftUI app.

## Consequences

- The React UI, the web design-system CSS, the 393 web tests, Storybook, and the visual-
  regression suite are **not** reused by the native app. The web/PWA keeps them and keeps
  running unchanged for non-Apple platforms.
- **Nothing from prior work is wasted:** the product design (PRD, rooms, conceptual model),
  the vault format + `.studio/` conventions, the Rust vault core, the design tokens, and
  every ADR carry forward. Phase 0's proof that the Rust core compiles + links for iOS is
  the foundation UniFFI builds on. The Tauri desktop/PWA remain the shipping product until
  the native app reaches parity.
- Two UI codebases exist (SwiftUI for Apple, web for the rest), reconciled by the vault
  format. This is consistent with — and only possible because of — Ateliera's file-first
  architecture.
- HealthKit and iCloud require Apple entitlements and privacy declarations; the data stays
  on-device / in the user's own iCloud, so the privacy story remains "not collected."
- This is a large, multi-month build. It is scoped as a **native MVP** (capture + read on
  the shared iCloud vault, in Ateliera's styling) that grows room by room, so value ships
  early and the web app is never blocked.

The engineering breakdown, the domain-sharing detail, the token→SwiftUI mapping, HealthKit,
and the phased MVP live in `docs/superpowers/plans/2026-08-25-ateliera-apple-native.md`.
