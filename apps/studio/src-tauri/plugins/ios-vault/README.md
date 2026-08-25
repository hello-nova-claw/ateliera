# tauri-plugin-ios-vault

The iOS half of the Ateliera vault (Phase 1 of the iOS plan). It does **only** what
must touch UIKit — present a folder picker and mint/resolve an iOS security-scoped
bookmark — and holds the scoped access open. Once a folder path is handed back to
Rust, the existing cap-std vault in `commands/vault.rs` reads and writes it
unchanged. See `docs/superpowers/plans/2026-08-25-ateliera-ios.md` §7a and ADR-011.

## Why this shape

`register_existing_path` opens a capability-scoped `Dir` from any path, and every
read/write command operates on that `Dir`. Only `F_GETPATH`/`renameatx_np` are
macOS-only, and neither is on the read path. So the native iOS surface is one thing:
obtaining that `Dir` from a user-selected, security-scoped folder. This plugin
provides exactly that and nothing more.

## Layout

- `src/lib.rs` — Rust: `init()` registers the iOS Swift plugin; `IosVault::pick_folder`
  / `resolve_bookmark` bridge to Swift via `run_mobile_plugin`. **No JS commands**
  (so no ACL surface); the main crate calls these from Rust.
- `ios/Sources/IosVaultPlugin/IosVaultPlugin.swift` — the picker + iOS bookmark
  (`.minimalBookmark` create / `[]` resolve — **not** macOS `.withSecurityScope`) +
  `startAccessingSecurityScopedResource` held for the session.
- `ios/Package.swift` — links the Swift target against the Tauri Swift API.

## Status

- ✅ Rust crate compiles cleanly for **desktop and `aarch64-apple-ios-sim`**
  (verified while temporarily wired into the host); clippy (`-D warnings`) and
  rustfmt clean.
- ⚠️ **Deliberately NOT wired into the host build yet.** Wiring
  `.plugin(tauri_plugin_ios_vault::init())` makes the iOS link require the Swift
  symbol `_init_plugin_ios_vault`, but Tauri's CLI does **not** auto-add an in-tree
  path-dependency plugin's `ios/Package.swift` to the generated Xcode project
  (confirmed: absent from `gen/apple/project.yml` even after `tauri ios init`).
  Leaving it wired would break the working Phase 0 iOS build. It stays a standalone
  scaffold until the Swift package is linked (step 1).
- ⏳ **Remaining (needs a device/simulator and hands-on verification):**
  1. **Link the Swift package into the app.** Add this plugin's `ios/` Swift package
     to `gen/apple/project.yml` (`packages:` entry pointing at
     `../../plugins/ios-vault/ios`, plus a dependency on the app target), and have
     `run-ios.mjs` re-apply it idempotently like the toolchain bridge. Then re-add
     `.plugin(init())` + the `Cargo.toml` path dependency and rebuild.
  2. Wire `vault_select` / `vault_create` (iOS) to call `app.ios_vault().pick_folder()`
     / `resolve_bookmark()` and pass the path to `register_existing_path` /
     `create_in_selected_parent`.
  3. `ios-vault.ts` adapter: persist the base64 bookmark (vault-backed) and reuse the
     `tauri-vault.ts` read/write method bodies over the same `invoke` bridge.
  4. **Gate:** on the simulator, tap the picker, choose a folder, read a note,
     relaunch and confirm no re-pick. This step is inherently interactive.
  5. Layer `NSFileCoordinator` + iCloud `.icloud` placeholder download into the Swift
     read path (Phase 3), and add the iCloud-documents entitlement +
     `NSUbiquitousContainers` when the default-to-iCloud onboarding lands.

## Notes

- iOS document-picker scoped access needs **no** file-access entitlement (unlike the
  macOS sandbox). Only iCloud visibility needs entitlements.
- Scoped access must stay held while Rust holds the `Dir` fd — `ScopedAccess.shared`
  holds it for the process lifetime (iOS reclaims on exit).
