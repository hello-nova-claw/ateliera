# ADR-011: iOS app via Tauri 2, with a user-owned iCloud-synced vault

- Status: accepted
- Date: 2026-08-25
- Refines: ADR-004 (Desktop authoring, mobile capture); depends on ADR-008 (disposable SQLite index)

## Context

Ateliera ships today as a PWA and a Tauri **2.8** desktop app. We want a first-class
iPhone and iPad app. The frontend is React 19 + Vite and already runs unchanged inside
a webview; the responsive layouts and mobile bottom nav exist. The only platform-shaped
code lives behind two ports: the `VaultPort` (`packages/storage/src/vault-port.ts`) and
the injected synchronous SQLite driver (ADR-008). So "make an iOS app" is not a rewrite —
it is one new host target and one new storage adapter.

The hard question is **where the vault lives on iOS**. The product's first invariant is
that Markdown + media in a folder the user owns are the source of truth, openable in any
editor and portable off the device. Desktop maps that to a real folder the user selects.
iOS has no user-visible app folder by default; an app gets a sandboxed container plus
mediated access to files elsewhere.

Three options were considered:

1. **App private container** — trivial, but the vault is invisible and non-portable,
   breaking the ownership promise.
2. **Expose the container in the Files app** (`LSSupportsOpeningDocumentsInPlace`) — the
   folder becomes visible but is still app-owned and does not sync across devices on its own.
3. **A user-selected folder reached through the document picker, access persisted with a
   security-scoped bookmark, all I/O coordinated through `NSFileCoordinator`** — the folder
   can live in iCloud Drive (or any File Provider: Dropbox, Working Copy, etc.). This
   preserves real ownership and gives iPhone↔iPad sync for free when the folder is in iCloud.

We also want offline-first behaviour and the existing atomicity/recoverability guarantees
to survive the move.

## Decision

**Ship iOS as a Tauri 2 mobile target of the existing app, and store the vault in a
user-selected, security-scoped folder coordinated through `NSFileCoordinator` — defaulting
onboarding to an `Ateliera` folder in iCloud Drive so iPhone and iPad share one vault.**
(Option 3.)

- **Host.** `tauri ios init` scaffolds an Xcode project under `apps/studio/src-tauri/gen/apple`.
  The same web build loads in a `WKWebView`. Tauri commands are cross-platform Rust, so the
  vault command surface the desktop adapter already exposes (`vault_select`, batch writes,
  guarded writes, watch, `backup_save_zip`) is the reuse boundary; iOS-specific behaviour is
  added, not forked at the TypeScript layer.

- **Vault access.** The user picks a folder via `UIDocumentPickerViewController`. We persist
  its **security-scoped bookmark** and re-resolve it on launch with
  `startAccessingSecurityScopedResource`. The bookmark — never a raw path — is the durable
  handle, consistent with the desktop rule that the vault path is never disclosed to the
  webview (see `secure_tests.rs`). Default onboarding offers to create the folder in iCloud
  Drive; any File-Provider folder is accepted.

- **A new `iosVault` adapter implements `VaultPort`** with the same contract as the desktop
  adapter — monotonic `getRevision`, `writeTextAtomic`/`writeBinaryAtomic`/`writeBatchAtomic`
  with `WriteCondition`, guarded `move`/`remove`, and `watch`. Every read and write is wrapped
  in `NSFileCoordinator` coordinated blocks. Atomic replace uses coordinated write to a temp
  item followed by `replaceItemAt`. Path containment is enforced against the resolved bookmark
  root exactly as desktop enforces it against the selected root.

- **Change observation and eviction.** External changes (the iCloud sync daemon, edits made on
  another device or in another app) are observed with `NSMetadataQuery` over the folder plus an
  `NSFilePresenter`, surfaced through `VaultChange` on `watch`. iCloud may keep files as
  non-materialised `.icloud` placeholders; the adapter triggers `startDownloadingUbiquitousItem`
  on demand and treats "not yet downloaded" as a distinct, calm state, never as corruption.

- **Conflicts are real and first-class.** iCloud can produce conflict versions (`NSFileVersion`).
  These flow into the existing conflict model (`packages/storage/src/conflict.ts`, `revisions.ts`)
  rather than a new mechanism — "nothing is overwritten" holds across devices, and the
  CardEditor conflict UI already built is the resolution surface.

- **The lock model changes.** The desktop advisory `.studio-write.lock` cannot coordinate the
  out-of-process iCloud daemon. On iOS, correctness rests on `NSFileCoordinator` + the existing
  conditional writes (`expectedHash` / `expectedUserState`) + conflict versions, not on a lock
  file. A guarded write that loses a race is rejected and re-presented, exactly as the desktop
  contract already requires.

- **The index stays disposable and on-device.** The SQLite FTS index (ADR-008) remains a
  projection: the SQLite-WASM worker (OPFS with an IndexedDB fallback) runs in the WKWebView,
  stored in the **app sandbox, never in the vault and never synced**. If WKWebView OPFS proves
  unstable on device, the index port lets us swap to native `rusqlite` behind the same injected
  driver with no domain change. Either way the index is rebuilt from the vault, so device
  storage pressure or a failed migration is recoverable, not data loss.

- **iPhone captures; iPad authors.** ADR-004 stands. iPhone leads with capture and reading;
  the full editorial-spread authoring experience is a first-class iPad target (large screen,
  external keyboard). This is a UX posture, not a code fork — the same rooms render responsively.

## Consequences

- A new Rust/Swift plugin under `src-tauri` handles the document picker, security-scoped
  bookmarks, `NSFileCoordinator`, and `NSMetadataQuery`; the TypeScript `iosVault` adapter is a
  thin bridge over its commands, mirroring `tauri-vault.ts`. `@studio/domain`, `@studio/content`,
  `@studio/index`, and `@studio/ui` are untouched — the layering holds.
- New entitlements and Info.plist keys: iCloud (container + documents), security-scoped
  bookmarks, `NSUbiquitousContainers`, document types. An Apple Developer account is required.
- The `VaultPort` contract tests (`packages/storage/src/__contract__`) become the shared
  conformance gate the iOS adapter must pass, alongside device-only tests for coordination,
  eviction, and conflict versions that cannot run in CI.
- Backup/restore, import/export, and revisions work unchanged — they are vault operations
  above the port, already swept by `portability.ts`.
- The privacy story is strong and literal: all data is local or in the user's own iCloud;
  App Store privacy labels are "not collected." Distribution can start on TestFlight before
  any App Store submission.
- Background sync, storage eviction, and the "file not yet downloaded" state are new calm
  states the UI must express — consistent with the no-alarm, no-guilt product posture.

The engineering breakdown, phasing, and acceptance gates live in
`docs/superpowers/plans/2026-08-25-ateliera-ios.md`.
