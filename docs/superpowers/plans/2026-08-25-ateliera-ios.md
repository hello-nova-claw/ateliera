# Ateliera iOS (iPhone + iPad) Build Plan

**Status:** Plan ready for review

**Date:** 25 August 2026

**Scope:** Ship Ateliera as a native iPhone and iPad app on the existing Tauri 2 host,
with the vault stored in a user-owned, iCloud-syncable folder. Capture and reading are
first-class on both devices from day one; full editorial authoring is an iPad-led phase.
No rewrite: one new host target, one new `VaultPort` adapter, one native storage plugin.

**Decision authority:** `docs/architecture/decisions/ADR-011-ios-app-and-icloud-vault.md`

**Product authority:** `docs/product/The-Studio-PRD-Design-Bible.md` (esp. ADR-004 — desktop authoring, mobile capture)

**Working agreement:** `AGENTS.md` (TDD, BEM/a11y, no gamification, atomic commits, layering enforced by ESLint)

> The vault belongs to the person, not the app. On every device, the app is a guest in their folder.

---

## 1. Executive decision

We already have the two things that make this cheap: a **Tauri 2.8** host and a clean
`VaultPort` seam. The React frontend runs unchanged in a `WKWebView`. So this plan is not
"port the app" — it is **"teach the storage layer to speak iOS."**

The whole effort concentrates in three artifacts:

1. **A native storage plugin** (Rust + a thin Swift/objc2 layer) under
   `apps/studio/src-tauri` that owns the document picker, security-scoped bookmarks,
   `NSFileCoordinator` I/O, and `NSMetadataQuery` change observation.
2. **An `iosVault` TypeScript adapter** in `@studio/storage` that implements `VaultPort`
   over that plugin's commands — mirroring `tauri-vault.ts`.
3. **The iOS host target** (`gen/apple`) plus entitlements, signing, and the calm new
   states (not-yet-downloaded, syncing, cross-device conflict).

Everything above the port — `@studio/domain`, `@studio/content`, `@studio/index`,
`@studio/application`, `@studio/ui`, and every room — is untouched. The layering holds.

The governing constraint, inherited from desktop and made harder by iCloud:

> **Atomic, path-contained, recoverable, and never silently overwritten — across devices.**

---

## 2. Goals and non-goals

**Goals (this plan)**
- iPhone + iPad app installable via TestFlight, then App Store.
- Vault in a user-selected folder; default onboarding creates an `Ateliera` folder in
  iCloud Drive; iPhone and iPad share one vault automatically.
- Capture, read, search, and light edit on iPhone; full authoring on iPad.
- All existing invariants preserved: atomic writes, path containment, conditional/guarded
  writes, disposable index, unknown-frontmatter survival, backup/restore.
- Offline-first: everything works with no network; sync is an enhancement, not a dependency.
- Minimum **iOS 17** (iPhone and iPad), for dependable OPFS and File Provider behaviour.

**Non-goals (explicitly later)**
- Android (Tauri 2 supports it; out of scope here).
- Push notifications / background refresh beyond what sync observation needs.
- A bespoke iPad pencil/handwriting surface (Inner Studio, PRD Phase 4).
- Widgets, Shortcuts, Share Sheet extension — desirable follow-ups, not MVP.

---

## 3. Architecture

```
apps/studio (React 19 + Vite)  ── unchanged UI, responsive
        │ selects adapter at wiring time (studio-service-factory.ts)
        ▼
@studio/storage : VaultPort
        ├── tauri-vault.ts        (desktop, exists)
        ├── browser-vault.ts      (PWA, exists)
        └── ios-vault.ts          (NEW — bridges the native plugin)
        ▼
apps/studio/src-tauri
        ├── commands/vault        (shared Rust, cross-platform)
        └── plugin: apple-vault    (NEW — Swift/objc2: picker, bookmarks,
                                    NSFileCoordinator, NSMetadataQuery)
```

- **Adapter selection** happens where the host is detected (extend the existing
  `apps/studio/src/app/studio-service-factory.ts` platform branch). iOS → `iosVault`.
- **The native plugin is the only new privileged surface.** It never returns the raw path
  to the webview; it returns an opaque vault token, exactly as desktop does.
- **The index** (`@studio/index`) is unchanged. It runs in the WKWebView worker
  (`search-index-worker.ts`) against OPFS/IndexedDB in the app sandbox. A native
  `rusqlite` driver behind the injected port is the fallback if OPFS misbehaves — a config
  swap, not a domain change.

---

## 4. The hard problems, and how each is solved

Each is a real risk; each has a concrete approach and its own acceptance evidence.

### 4.1 Vault selection and durable access
- **Problem:** iOS sandboxes filesystem access; access to a user folder must be earned and persisted.
- **Approach:** `UIDocumentPickerViewController` (folder mode) → resolve a security-scoped
  URL → persist bookmark data in the app container → on launch, re-resolve with
  `startAccessingSecurityScopedResource`/`stopAccessing…`. Onboarding offers "Create in
  iCloud Drive" (writes into the app's iCloud ubiquity container surfaced in Files) or
  "Choose a folder." The bookmark is the durable handle; the path is never surfaced.
- **Evidence:** relaunch survives without re-picking; moving/renaming the folder is handled
  or re-prompts calmly; a revoked bookmark degrades to a re-pick, not a crash.

### 4.2 Coordinated, atomic writes that satisfy `VaultPort`
- **Problem:** `writeTextAtomic`/`writeBinaryAtomic`/`writeBatchAtomic` must be atomic and
  guarded (`expectedHash`, `expectedMissing`, `expectedUserState`) while another process
  (iCloud daemon, another app) may touch the folder.
- **Approach:** every op runs inside an `NSFileCoordinator` coordinated block. Atomic replace
  = coordinated write to a temp item + `replaceItemAt(...)`. `writeBatchAtomic` stages all
  writes and publishes under one coordination boundary or none (mirror the desktop staging).
  Guarded writes re-read-and-compare *inside* the coordinated block before publishing;
  a mismatch rejects, matching desktop's "cooperative external writer is never clobbered."
- **Evidence:** the `packages/storage/src/__contract__` suite passes against `iosVault` in a
  simulator; a device test reproduces "guarded write rejects a changed public-note state."

### 4.3 Change observation, eviction, and the "not downloaded" state
- **Problem:** `watch()` must emit `VaultChange` for edits from sync/other devices; iCloud
  files can be non-materialised `.icloud` placeholders.
- **Approach:** `NSMetadataQuery` scoped to the folder + an `NSFilePresenter` translate FS
  events into `created`/`modified`/`moved`/`removed`. Placeholders trigger
  `startDownloadingUbiquitousItem` on read; "downloading" is a distinct calm UI state.
  A periodic reconcile (as desktop's watcher does) covers missed events.
- **Evidence:** an edit on device B appears on device A within sync latency; opening a
  never-downloaded note shows a calm "fetching" state, then the note — never an error.

### 4.4 Cross-device conflicts
- **Problem:** two devices edit the same note offline.
- **Approach:** surface `NSFileVersion` conflict versions through the existing
  `conflict.ts`/`revisions.ts` model; the CardEditor conflict UI (already built) is the
  resolution surface. Nothing is overwritten; a snapshot precedes any resolution.
- **Evidence:** offline edits on two devices produce a conflict the user resolves in-app,
  with both versions preserved.

### 4.5 The index on device
- **Problem:** OPFS/SQLite-WASM stability and memory in WKWebView.
- **Approach:** keep the WASM worker; the index lives in the app sandbox, never synced,
  always rebuildable from the vault. Add a device smoke test for build + rebuild under
  memory pressure. Keep the native `rusqlite` swap ready behind the injected driver.
- **Evidence:** cold index build and a forced rebuild succeed on the lowest supported device;
  killing the app mid-rebuild loses no vault data.

### 4.6 iPhone vs iPad UX
- **Problem:** ADR-004 says capture on mobile, authoring on desktop; iPad blurs it.
- **Approach:** iPhone = capture-first (the capture surface, reading, search, light edit);
  iPad = full editorial spreads + external-keyboard authoring + (later) Split View / Stage
  Manager. Reuse the responsive layouts; add iPad-width breakpoints only where the spreads
  need a third column. Touch-tune CodeMirror (selection, toolbar).
- **Evidence:** visual + a11y pass at iPhone and iPad widths; on-device editing has no
  blocking papercuts (selection handles, keyboard, scroll-into-view).

### 4.7 Signing, entitlements, distribution, privacy
- **Problem:** Apple toolchain, entitlements, review.
- **Approach:** Apple Developer account; iCloud + security-scoped-bookmark entitlements,
  `NSUbiquitousContainers`, document-type declarations. Ship to TestFlight first. App Store
  privacy labels: "data not collected." `run-tauri.mjs`/`run-rust.mjs` grow iOS build/dev
  wrappers.
- **Evidence:** a signed build runs on a physical device via TestFlight; App Store Connect
  accepts the privacy declaration.

---

## 5. Phased task plan (TDD; each phase has a gate)

Each phase is independently valuable and leaves the desktop/PWA builds green.

**Phase 0 — Host bring-up.** `tauri ios init`; the existing web build loads in the simulator
with an in-memory vault; CI still builds desktop + PWA. Add `ios:dev`/`ios:build` script
wrappers. **Gate:** app launches in the simulator; `pnpm lint/typecheck/test` unchanged.

**Phase 1 — Native vault plugin (read path).** Document picker → security-scoped bookmark →
coordinated `list`/`readText`/`readBinary`/`exists`/`getRevision`. `iosVault` adapter passes
the read half of the `__contract__` suite. **Gate:** open a real iCloud folder, read notes,
relaunch without re-picking.

**Phase 2 — Coordinated writes.** `writeTextAtomic`/`writeBinaryAtomic`/`writeBatchAtomic`/
`move`/`remove` with `WriteCondition`, all inside `NSFileCoordinator`. Full `__contract__`
suite green against `iosVault`. **Gate:** guarded-write rejection reproduced on device;
kill-during-write loses nothing.

**Phase 3 — Watch, eviction, conflicts.** `NSMetadataQuery` watcher → `VaultChange`;
`.icloud` placeholder download; `NSFileVersion` → existing conflict model. **Gate:**
cross-device edit propagates; a two-device offline conflict resolves in-app with both
versions kept.

**Phase 4 — On-device index + capture loop.** Wire `iosVault` in the service factory; index
builds/rebuilds in the worker; the capture → note → resurface loop works end to end on
iPhone. **Gate:** capture on iPhone, see it on iPad; index rebuild recovers.

**Phase 5 — iPad authoring + touch polish.** iPad editorial-spread authoring, CodeMirror
touch tuning, iPhone capture polish, calm sync/download states in the UI. **Gate:** visual +
a11y pass at both widths; editor usable on device.

**Phase 6 — Signing, TestFlight, privacy, docs.** Entitlements, TestFlight build, privacy
labels; update `development-log.md` and the fonts/manifest if the bundle changes. **Gate:**
installable via TestFlight on a physical iPhone and iPad; App Store Connect privacy accepted.

---

## 6. Testing strategy

- **Contract-first.** `packages/storage/src/__contract__` is the shared conformance suite;
  `iosVault` must pass it (in the simulator for coordination behaviour).
- **Adapter unit tests** for path containment, hashing, conditional-write logic — pure, in CI.
- **Device-only tests** (documented, run manually / on a device lane): coordination races,
  eviction/download, `NSFileVersion` conflicts, index build under memory pressure. These
  cannot run in headless CI and are called out as such.
- **Visual/a11y** at iPhone (390) and iPad (768/1024/1366) widths, reusing the Playwright
  visual harness patterns.
- **No new AI or network dependency** — offline paths are the default test path.

---

## 7. Risks and open questions

- **Tauri 2 iOS plugin ergonomics.** The native picker/coordination layer may need objc2 or a
  small Swift package; budget spike time in Phase 1. *Mitigation:* thin plugin, everything
  else is existing Rust.
- **OPFS in WKWebView.** Stability is the main index risk. *Mitigation:* the disposable-index
  design + the `rusqlite` fallback behind the injected port.
- **iCloud eviction and latency** are outside our control; the UI must stay calm, never alarmed.
- **`writeBatchAtomic` across a coordinating daemon** is the subtlest correctness point — it
  gets the most device testing.

**Confirmed decisions (locked 25 Aug 2026):**
1. **Default vault location** — onboarding creates/points to an `Ateliera` folder in
   **iCloud Drive**; "Choose a folder" remains available for any File Provider.
2. **iPhone editing scope** — **light edit only** (capture, read, search, small fixes);
   full editorial authoring is iPad-led (ADR-004 holds).
3. **Distribution** — **TestFlight first**, App Store submission after on-device soak.
4. **Minimum iOS version** — **iOS 17** (dependable OPFS + File Provider); revisit only if a
   needed API forces higher.

---

## 7a. Phase 1 design (refined after reading the vault internals)

Research into `vault.rs` changed the shape of Phase 1 for the better. The desktop
read/write commands are **portable `cap-std` logic** — `register_existing_path`
opens a capability-scoped `Dir` from *any* path and every later command
(`vault_list`, `vault_read_text`, …) operates on that `Dir`. Only `F_GETPATH`
(watcher) and `renameatx_np` (write) are macOS-only, and neither is on the read
path. So the native iOS surface shrinks to **one thing: obtaining that `Dir` from
a user-selected, security-scoped folder.**

**Approach — a thin Swift plugin, then reuse everything:**

- **Swift plugin (`plugins/ios-vault/ios`)** does only what must touch UIKit:
  `pickFolder` (present `UIDocumentPickerViewController(forOpeningContentTypes:
  [.folder])` via `self.manager.viewController`, `asCopy: false`), create an iOS
  security-scoped bookmark (`.minimalBookmark` — **not** macOS `.withSecurityScope`),
  `startAccessingSecurityScopedResource()`, and return `{ path, bookmark }`;
  `resolveBookmark(base64)` for relaunch (resolve with options `[]`, start access).
  Scoped access is held for the app session (the retained `Dir` fd depends on it).
- **Rust** registers the plugin (`tauri::ios_plugin_binding!`, `register_ios_plugin`)
  and, on iOS, `vault_select`/`vault_create` call `run_mobile_plugin("pickFolder"|
  "resolveBookmark", …)` to get the path, then reuse the existing
  `register_existing_path` / `create_in_selected_parent` — **no new read/write code.**
- **`ios-vault.ts`** mirrors `tauri-vault.ts`: after selection it reuses the same
  read/write method bodies over the same `invoke` bridge (share the internal factory).
  It persists the base64 bookmark (vault-backed, like the rhythm profile) so relaunch
  resolves without re-picking.
- **`NSFileCoordinator`** wrapping and iCloud `.icloud` placeholder download are a
  follow-up refinement layered into the Swift read path (Phase 3); direct reads
  inside the scoped resource work for a first cut.
- **Entitlements:** iOS needs *no* file-access entitlement for document-picker
  scoped access; iCloud visibility needs the iCloud-documents capability +
  `NSUbiquitousContainers` (added when the default-to-iCloud onboarding lands).
- **ACL:** each plugin command needs a capability/permission entry or Tauri blocks it.

**What's verifiable off-device vs. on-device.** The plugin + app *compiling and
linking for iOS*, the app launching with the plugin registered, and the
`ios-vault.ts` adapter unit tests (mock bridge, like `tauri-vault.test.ts`) are
CI/simulator-checkable. The Phase 1 **gate itself — tapping the picker, choosing a
real iCloud folder, reading a note, relaunching without re-picking — is inherently
interactive** and must be verified on the simulator/device by hand.

## 8. What this explicitly does not change

No change to `@studio/domain`, `@studio/content`, `@studio/index`, `@studio/rhythm`, or
`@studio/ui`; no change to the note schema, the Markdown round-trip, the theme system, or the
disposable-index principle. The iOS app is a new host and a new adapter behind the same ports.
