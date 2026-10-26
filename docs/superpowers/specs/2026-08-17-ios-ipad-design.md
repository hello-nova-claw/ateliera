# Ateliera on iOS/iPadOS — Design

**Status:** Approved design, not yet started
**Date:** 17 August 2026
**Author:** Anna McPhee (with Claude)

## 1. Purpose and scope

Bring Ateliera to iOS, with iPad treated as a first-class authoring surface — not
the capture/review-only mobile experience originally scoped in ADR-004
("Desktop authoring, mobile capture"). This supersedes that ADR's mobile scope
for iPad specifically; iPhone can remain closer to the original capture/review
intent.

**In scope:** full room parity on iPad, native multi-column layout, keyboard +
trackpad support, Apple Pencil capture, Stage Manager / multitasking support,
iCloud Drive-based vault sync.

**Out of scope for this spec:** folding the rhythm prototype's rhythm/astrology engine into
Ateliera. That is a separate, later effort and does not block or shape this
design — it is mentioned here only so the architecture isn't accidentally
closed off from it (it isn't; the domain/adapter layering keeps any future
the rhythm prototype integration independent of the iOS shell work).

**Sequencing:** this work does not start until Mac v1 ships — the 66 files
currently uncommitted in the `feat/studio-mvp` worktree (capture flow, room
layout work) land first, and the Mac app reaches a real shippable v1. Building
a second platform against a domain model that's still shifting risks rework.
This spec exists now so the target architecture is decided in advance, not so
implementation starts immediately.

## 2. Why this needs a design, not just "add an iOS target"

iOS's app sandbox has no equivalent to the desktop app's current filesystem
access. The Rust shell (`ateliera-desktop`) depends on `cap-fs-ext`, `cap-std`,
`notify` (file watching), and `rfd` (native file dialogs) — all desktop-only.
None of this reuses on iOS regardless of which shell technology is chosen, so
the real design problem is: how does a user's vault get onto an iPad at all,
and how does editing there stay consistent with Mac, given no direct folder
access and no custom sync server.

## 3. Shell architecture

**Decision: native SwiftUI shell hosting the existing web UI in a single
WKWebView**, rather than extending Tauri to iOS or a full native rewrite.

Three options were considered:

- **Extend Tauri to iOS.** Reuses the existing Rust command structure, but the
  reuse is smaller than it looks — the storage layer needs an iOS-native
  rewrite either way, since none of the desktop filesystem crates carry over.
  Tauri's iOS/mobile support is comparatively young; getting iCloud
  security-scoped bookmarks, Pencil input, and Stage Manager-aware windowing
  working well means working against an immature layer instead of Apple's own
  documented APIs for exactly those things. Rejected.
- **Native SwiftUI shell + WKWebView for room content (chosen).** A thin
  native app owns navigation chrome, multi-column layout, Stage Manager
  behavior, Pencil input, and iCloud vault access — all first-class Apple
  APIs. Room content (Foyer, Identity Studio, etc.) keeps running as the
  existing web UI inside a `WKWebView`, so `packages/ui`, `packages/domain`,
  and `packages/content` are reused close to as-is. A small JS↔Swift bridge
  connects the two. Precedent: Obsidian's iOS app uses the same shape
  (native shell, local/iCloud vault, web-rendered editing surface) and has
  shipped on the App Store for years.
- **Full native rewrite in Swift/SwiftUI.** Best possible platform-native
  feel, but means porting the entire UI/feature layer to Swift and
  permanently maintaining two parallel UI codebases. Too expensive for a
  single-maintainer project; rejected.

### 3.1 App Store compliance

This shape is App Store-viable, and this was checked explicitly before
committing to it:

- Electron is not a relevant comparison — it cannot run on iOS at all (no
  Chromium+Node runtime under the sandbox).
- The real risk is Guideline 4.2.1 ("Minimum Functionality"), which targets
  apps that are just a website repackaged in a WebView with nothing else
  going on. This design avoids that because the web content ships **bundled
  in the app binary** (built at release time, reviewed like any other app
  code — no live-loading from a server, which would also violate 2.5.2's ban
  on downloading executable code post-approval), `WKWebView` is Apple's own
  sanctioned framework for this (required, per 2.5.6, if displaying web
  content at all), and the app has substantial native functionality around
  it: native sidebar, iCloud vault access, PencilKit capture, Stage Manager
  support, keyboard shortcuts.

### 3.2 Component layout

```
Native SwiftUI app (new: apps/studio-ios)   Existing web app (unchanged)
+---------------------------+              +-------------------------------+
| NavigationSplitView        |             | packages/ui                    |
|  - room sidebar (native)   |   bridge    | packages/domain                 |
|  - WKWebView (detail)  ----+------------>| packages/content                 |
| Vault/iCloud service        |             | packages/index                   |
| Pencil capture (PencilKit)  |             | apps/studio (existing routes)    |
| Window/Stage Manager glue   |             +-------------------------------+
+---------------------------+
```

The room **switcher** is native (a SwiftUI sidebar list of the 8 rooms)
rather than the web app's own nav rail. This is what makes multi-column,
keyboard shortcuts (⌘1–8), and Stage Manager behavior feel native, since they
live entirely in Swift. The native shell tells the WKWebView which room route
to display; a single webview is used (not one per room) to keep Pencil/
keyboard focus simple.

### 3.3 Repo layout

- New `apps/studio-ios/` — Xcode project + SwiftUI sources, alongside the
  existing `apps/studio/`.
- New `packages/ios-bridge/` — implements the same storage-adapter interface
  `packages/storage` already defines for the desktop Tauri adapter, but calls
  through `window.webkit.messageHandlers` instead of Tauri commands. This
  follows the project's existing rule that adapters are the only place
  platform APIs live — `packages/domain` and `packages/ui` need no changes.

## 4. Vault access and sync (iCloud Drive)

**Decision: iCloud Drive folder, not a custom sync service.** The vault lives
in an iCloud Drive folder; sync between devices is handled by iCloud itself,
with no server to build or run, keeping the "plain files you own" philosophy
intact. Trade-off: sync timing and conflict behavior are iCloud's black box,
not something we can control end-to-end — accepted as the right trade-off for
a project with no budget for running backend infrastructure.

- **Setup:** the user picks (ideally the same folder already used on Mac) via
  the standard iOS document picker.
- **Persistent access:** iOS requires a **security-scoped bookmark** to
  retain folder access across launches (there is no raw path access as on
  desktop). Stored in Keychain, resolved on each launch.
- **Change detection:** replaces the desktop `notify`-based watcher.
  `NSMetadataQuery` scoped to iCloud documents detects when another device's
  changes have synced down, triggering the same "vault changed → reindex"
  event the web layer already expects.

### 4.1 iCloud edge cases (explicit, not deferred)

These are the actual hard part of this design and must be handled explicitly,
not discovered later:

1. **Download-on-demand** — a file can exist as an undownloaded placeholder.
   Must show a "syncing" state scoped to that item, not treat it as missing.
2. **Conflict copies** — simultaneous offline edits on two devices can
   produce an iCloud-generated `(conflicted copy)` file instead of a merge.
   Needs a dedicated, calm review surface (see §6) — never silently resolved.
3. **iCloud unavailable** — signed out or disabled account needs a clear,
   specific state, not a hang or generic error.

## 5. Navigation and multi-column layout

`NavigationSplitView` with a native sidebar (8 rooms) and a single `WKWebView`
detail pane.

- **Compact widths** (iPhone, narrow Split View) auto-collapse to stacked
  navigation — a property of `NavigationSplitView` at compact size classes,
  not new code.
- **Regular widths** (iPad full screen, most Stage Manager sizes, wide Split
  View) show sidebar + detail side by side.
- The web content needs no new multi-column code, since existing per-room CSS
  breakpoints already respond to container width — the webview pane is simply
  however wide SwiftUI allocates it.
- **Deferred, not blocking v1:** Life Landscape's matrix may eventually want
  a third inspector column on wide iPad layouts. This is a per-room
  refinement to design later, not a v1 requirement.
- **Keyboard shortcuts** (⌘1–8 room switching, ⌘K command palette) are native
  `.keyboardShortcut` modifiers on sidebar items, forwarding remaining key
  events into the webview's existing command-palette JS where applicable.
- **Stage Manager** support is largely a property of building a well-behaved
  resizable SwiftUI app (no hard-coded minimum sizes beyond genuine usability
  floors) — validated through the testing plan in §7, not special-cased code.

## 6. Apple Pencil and capture

A PencilKit capture sheet, primarily for Uncharted (dreams/possibilities) and
Foyer quick capture. Requires **no schema changes** — cards already have an
`attachments: []` frontmatter field. Flow: native canvas → export PNG → write
to the vault's attachments folder via the existing bridge write call → the
existing `packages/content` card-writing logic (unchanged, called from native
via bridge) attaches it to the card. Pencil is additive to the existing
15-second typed quick-capture, not a replacement for it.

## 7. Error handling

Extends the app's existing calm empty/loading/stale/offline/error state
pattern (already established for Identity Studio and Wisdom Garden) to new
iOS-specific states, rather than inventing new visual language:

| State | Handling |
|---|---|
| Vault access lost (stale bookmark, folder moved/deleted) | Calm "reconnect vault" prompt, re-runs picker, local cache preserved in the meantime |
| iCloud unavailable | Dedicated explanatory state, not a generic error |
| File still downloading | Inline "syncing" indicator scoped to that card/room, not a full-app block |
| Conflict copies detected | Dedicated review surface listing conflicts; user picks a version or keeps both — never auto-resolved |
| Bridge call failure (e.g. app backgrounded mid-write) | Writes are queued and retried on next foreground, not dropped |

## 8. Testing strategy

- **Bridge contract tests:** run the same adapter-contract test suite that
  validates the desktop Tauri adapter against a mocked iOS bridge —
  guarantees identical read/write/list/watch semantics across platforms.
- **XCTest:** bookmark persistence/resolution, iCloud availability detection,
  conflict-version enumeration, PencilKit export path.
- **XCUITest:** multi-column behavior across iPad size classes and Stage
  Manager resize events, keyboard shortcut wiring, VoiceOver pass on the
  native shell (matching the accessibility bar already held elsewhere in the
  app).
- **Visual regression:** extend the existing Playwright visual suite (already
  covers desktop/tablet/mobile viewports) to iPad-width viewports for the web
  content.
- **Explicit gap:** iCloud multi-device sync is genuinely hard to automate in
  CI (needs real multi-device state under one Apple ID). Plan for a manual
  multi-device checklist before each release rather than claiming false
  coverage here.

## 9. Phased rollout

0. *(blocking, already in progress)* Land the 66 uncommitted Mac changes, ship
   Mac v1.
1. `packages/ios-bridge` + adapter-contract tests against a **mocked**
   bridge — pure TypeScript work, no Xcode project required yet.
2. Minimal native shell: Foyer room only, iCloud picker + bookmark
   persistence, compact-only layout. Goal: prove sandboxed vault access works
   end-to-end on a real device before investing in polish.
3. Full room parity, multi-column layout, keyboard shortcuts.
4. Pencil capture, Stage Manager polish, conflict-resolution UI.
5. TestFlight, then App Store submission.

Phase 2 deliberately isolates the single biggest unknown — whether
iCloud-backed vault access behaves as assumed, end-to-end, on a real device —
before any effort is spent on breadth.
