# Task 5 report — secure Tauri macOS vault

## Status

IMPLEMENTED; awaiting independent security re-review.

This report describes the current implementation. It intentionally does not claim exact compare-and-replace behavior against arbitrary external tools or a full operating-system window-destruction integration test.

## Commits

- `e1007e0e528246d450497da6d341657202aea86c` — retain native vault authority and add the runnable Tauri bootstrap
- `59a81530d6d5b1c3de29f08a7e407acb450657e4` — require native folder selection from the renderer
- `60d2bff` — replace swap/rollback CAS with the documented cooperative locking boundary, retain watcher identity, and clean up failed subscriptions
- `646d485` — keep generated Rust toolchains and build output outside lint scope
- `c0fb671` — reserve internal control paths, prove two-selection concurrency, and verify watcher identity through registration

All commits are authored solely by Anna McPhee and contain no attribution trailers.

## Authority and path containment

- Native `rfd` folder selection is the only ambient-path authority boundary.
- Rust immediately opens and retains the selected directory as a `cap_std::fs::Dir`.
- The webview receives a random opaque token scoped to its owning window label; it never receives a reusable native path capability.
- Public operations validate normalized relative paths, open every parent component relative to retained directory descriptors, and do not follow symlinks.
- Absolute paths, parent traversal, NULs, Windows separators/drives, symlink components, special files, invalid tokens, and every path component beginning `.studio-` are rejected with the typed `path_escape` or `unavailable` error.
- `.studio-*` is a reserved internal namespace. Public text/binary read and write, move source and destination, remove, exists, and prefixed list calls cannot address it. Unprefixed list, snapshots, and logical watcher output omit it.

## Mutation and conflict model

Every Studio desktop mutation acquires:

1. the `Vault` instance's in-process mutex; and
2. an exclusive advisory `flock` on the retained vault's `.studio-write.lock`.

This is the exact serialization and compare-and-replace boundary for Studio processes and other writers that cooperate by locking the same control file. Selecting the same directory twice creates separate `Vault` instances and file descriptors, so the shared file lock—not only the per-instance mutex—serializes them.

Conditional writes:

1. acquire both locks;
2. validate the current content hash;
3. write and sync a same-directory `.studio-<uuid>.tmp` file;
4. validate the expected hash again immediately before publication;
5. atomically rename the completed temporary over the destination; and
6. sync the containing directory.

A failed candidate is never swapped into the public destination. Conflict cleanup removes only the writer's own temporary file, so it cannot roll back over a winning cooperative writer. Moves use macOS `renameatx_np(RENAME_EXCL)` and therefore do not clobber an existing destination.

### Explicit limitation

An arbitrary external tool that ignores `.studio-write.lock` can race the final validation and rename. Such tools are outside the exact CAS guarantee. The second validation detects ordinary non-cooperating changes that occur before publication and preserves them, but this is best-effort detection rather than an impossible universal content-hash CAS claim.

## Watch architecture and identity proof

- `notify` events never supply trusted file paths to storage operations. They only mark the watcher dirty and trigger a fresh capability-relative snapshot.
- Snapshot diffs emit coalesced logical `created`, `modified`, `moved`, and `removed` events. `.studio-*` lock and temporary artifacts cannot enter snapshots or payloads.
- macOS `notify` requires a pathname even though the vault authority is a descriptor. Registration obtains the descriptor's current path with `F_GETPATH`, starts the watcher, then compares the registered path's device and inode with `Dir::dir_metadata()`.
- If the pathname was replaced between `F_GETPATH` and `watch()`, or before verification, the watcher is dropped and registration retries from the retained descriptor's new current path. Registration fails closed after eight unsuccessful identity attempts.
- An adversarial test hook performs the replacement precisely after the first native `watch()` call and before identity verification. The mismatched watcher is rejected; the retry observes only the retained directory. A later replacement of the verified pathname does not retarget the established watcher to the replacement.

### Watch availability limitation

The macOS `notify` backend does not continue delivering recursive events after the already-verified watched directory is subsequently renamed. The implementation remains fail-closed—it does not begin watching a replacement directory—but watch availability is lost until a new watcher is registered. The test and this report make that limitation explicit.

## Watch and capability lifecycle

- Native watcher registrations are owned by the selected `Vault`; dropping or revoking the vault drops its `RecommendedWatcher` handles.
- If Rust creates a watcher but the TypeScript event subscription fails, the adapter calls `vault_unwatch` before rethrowing the original subscription error.
- `studio_builder` registers the production `.on_window_event` callback, which routes `WindowEvent::Destroyed` to `handle_window_event` and revokes every token/watch owned by that label.
- The app's `RunEvent::Exit` handler revokes all remaining capabilities.

Tauri's `MockRuntime::run_iteration` is empty and does not dispatch a synthetic operating-system `Destroyed` event. Tests therefore cover the exact `WindowEvent::Destroyed` branch and assert that `studio_builder` wires the production callback source, but they do not claim a real Wry/macOS window-close end-to-end event.

## TDD and verification proof

RED was observed for each remediation before production changes:

- failed event subscription left the native watcher registered;
- cooperative locking and retained-watcher test helpers did not exist;
- `.studio-write.lock` was publicly readable/writable/removable;
- two independently selected vault instances had no explicit shared-concurrency proof; and
- watcher registration had no adversarial replacement hook or identity verification.

GREEN:

- `pnpm tauri:test`: 14 passed.
  - production builder lifecycle callback wiring assertion;
  - `WindowEvent::Destroyed` capability revocation branch;
  - reserved `.studio-*` component validation;
  - complete public IPC denial for internal text/binary/list/move/remove/exists paths;
  - retained capability survives selected pathname replacement;
  - forged ambient pathname token rejection;
  - traversal and symlink component rejection;
  - cooperative external writer serialization and preservation;
  - exactly one winner across two independent selections using the same expected hash;
  - non-cooperating pre-publication change detection without swap/rollback;
  - atomic no-clobber move behavior;
  - adversarial `F_GETPATH`/`watch()` replacement detection and retry;
  - no watcher retargeting to a later replacement pathname;
  - logical rename coalescing.
- `pnpm --filter @studio/storage test:tauri`: 8 passed, including native watcher cleanup when event subscription fails.
- `pnpm test`: 312 passed at the prior remediation checkpoint; rerun after the current task's concurrent Task 6 changes belongs to the integration owner.
- `cargo clippy --all-targets -- -D warnings`: passed for the current Rust changes.
- `cargo fmt --check`: passed for the current Rust changes.
- `pnpm tauri:build`, TypeScript typecheck, ESLint, and Stylelint passed at the prior remediation checkpoint.

## Review boundary

The security properties claimed here are:

- retained descriptor authority and component-relative no-follow access;
- renderer isolation through opaque window-owned tokens;
- complete public reservation of internal `.studio-*` controls;
- atomic completed-file publication;
- exact conditional-write serialization among writers that honor `.studio-write.lock`;
- no-clobber moves;
- fail-closed watcher identity verification through registration; and
- explicit capability/watcher cleanup paths.

The implementation does **not** claim universal CAS against non-cooperating external tools, uninterrupted watch availability after the retained directory is renamed post-registration, or a real macOS window-close E2E test in Tauri's mock runtime.
