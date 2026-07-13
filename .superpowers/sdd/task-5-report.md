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
- `0e56612` — reserve control paths case-insensitively for default macOS filesystems
- `4b37301` — reject blocking special-file reads and add capability-based periodic watcher reconciliation
- `ddf44c0` — enforce conditional text, binary, and remove mutations across the shared vault contract

All commits are authored solely by Anna McPhee and contain no attribution trailers.

## Authority and path containment

- Native `rfd` folder selection is the only ambient-path authority boundary.
- Rust immediately opens and retains the selected directory as a `cap_std::fs::Dir`.
- The webview receives a random opaque token scoped to its owning window label; it never receives a reusable native path capability.
- Public operations validate normalized relative paths, open every parent component relative to retained directory descriptors, and do not follow symlinks.
- Direct text and binary reads add `O_NONBLOCK`, then inspect metadata from the opened descriptor and reject anything that is not a regular file before reading. FIFOs and devices therefore cannot block a read command.
- Absolute paths, parent traversal, NULs, Windows separators/drives, symlink components, invalid tokens, and every ASCII case variant of a path component beginning `.studio-` are rejected with the typed `path_escape` or `unavailable` error. Case-insensitive reservation is required for default macOS volumes.
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

A condition may require a matching `expectedHash`, an absent destination with `expectedMissing`, or both. Text and binary writes use the same native path. An `expectedMissing` create publishes with macOS `renameatx_np(RENAME_EXCL)`, so even a non-cooperating destination creator cannot be overwritten. If both conditions are supplied, the destination cannot satisfy both and the write conflicts.

Conditional remove acquires the same locks, opens through the retained capability, and validates `expectedHash` or `expectedMissing` before unlink. An existing file with `expectedMissing` conflicts; an absent file remains unavailable, matching the shared adapters. A failed candidate is never swapped into the public destination. Conflict cleanup removes only the writer's own temporary file, so it cannot roll back over a winning cooperative writer. Moves use `RENAME_EXCL` and therefore do not clobber an existing destination.

### Explicit limitation

An arbitrary external tool that ignores `.studio-write.lock` can race the final validation and rename. Such tools are outside the exact CAS guarantee. The second validation detects ordinary non-cooperating changes that occur before publication and preserves them, but this is best-effort detection rather than an impossible universal content-hash CAS claim.

## Watch architecture and capability reconciliation

- `notify` events never supply trusted file paths to storage operations. They only mark the watcher dirty and trigger a fresh capability-relative snapshot.
- Snapshot diffs emit coalesced logical `created`, `modified`, `moved`, and `removed` events. `.studio-*` lock and temporary artifacts cannot enter snapshots or payloads.
- macOS `notify` requires a pathname even though the vault authority is a descriptor. Registration obtains the descriptor's current path with `F_GETPATH`, starts the watcher, then compares the registered path's device and inode with `Dir::dir_metadata()`.
- If the pathname was replaced between `F_GETPATH` and `watch()`, or before verification, the watcher is dropped and registration retries from the retained descriptor's new current path. Registration fails closed after eight unsuccessful identity attempts.
- This device/inode check detects ordinary one-way replacement but cannot prove which directory `notify` attached to if a non-cooperating local process performs replace → watch → restore (an ABA) during registration.
- Correctness therefore does not trust native watcher identity. Both raw-event reconciliation and an independent two-second periodic reconciliation read only through the retained `Dir` and compare capability-relative snapshots. A native event from an outside/replacement directory can at most schedule a retained-vault rescan; it cannot put outside filenames or content in a logical event.

### Accepted watch limitation

A non-cooperating local process can use pathname ABA or a later directory rename to leave the native watcher attached to the wrong directory or no live directory. This can remove immediate event delivery and add up to the periodic reconciliation interval before a retained-vault change is surfaced. It does not disclose outside content or change the authority used for snapshots. The implementation does not claim that pathname device/inode verification closes ABA.

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
- watcher registration had no adversarial replacement hook or identity verification;
- direct FIFO reads could block before target-type validation; and
- pathname ABA had no independent retained-capability reconciliation path.
- the renderer bridge discarded binary/remove conditions and native commands did not enforce shared conditional mutation semantics.

GREEN:

- `pnpm tauri:test`: 18 passed.
  - production builder lifecycle callback wiring assertion;
  - `WindowEvent::Destroyed` capability revocation branch;
  - case-insensitive reserved `.studio-*` component validation;
  - complete public IPC denial for internal text/binary/list/move/remove/exists paths;
  - retained capability survives selected pathname replacement;
  - forged ambient pathname token rejection;
  - traversal and symlink component rejection;
  - nonblocking rejection of FIFO text and binary reads;
  - cooperative external writer serialization and preservation;
  - exactly one winner across two independent selections using the same expected hash;
  - exactly one winner across two selections conditionally creating the same binary path;
  - IPC enforcement and conflict preservation for conditional text, binary, and remove operations;
  - non-cooperating pre-publication change detection without swap/rollback;
  - atomic no-clobber move behavior;
  - adversarial `F_GETPATH`/`watch()` replacement detection and retry;
  - ABA outside-content non-disclosure;
  - retained-vault event recovery after the native watcher is deliberately dropped;
  - logical rename coalescing.
- `pnpm --filter @studio/storage test:tauri`: 9 passed, including conditional argument transport and native watcher cleanup when event subscription fails.
- `pnpm --filter @studio/storage test`: 290 passed, including shared conditional binary create/replace and remove contracts.
- `pnpm test`: 337 passed.
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
- consistent conditional text, binary, and remove behavior across in-memory, browser, and desktop adapters;
- no-clobber moves;
- logical watcher events derived only from retained-capability snapshots, with independent periodic reconciliation; and
- explicit capability/watcher cleanup paths.

The implementation does **not** claim universal CAS against non-cooperating external tools, ABA-proof native watcher attachment, immediate watch delivery after pathname manipulation, or a real macOS window-close E2E test in Tauri's mock runtime.
