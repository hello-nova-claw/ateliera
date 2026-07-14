# The Studio threat model

**Status:** MVP security baseline  
**Last reviewed:** 2026-07-14  
**Applies to:** browser PWA and Tauri desktop wrapper

## Purpose and posture

The Studio holds intimate notes, reflections, plans, images, and dream material. It is private by default, local by default, usable without AI, and has no third-party telemetry. Markdown and ordinary media remain the user's durable source of truth. This document names realistic protections and residual risks; it does not claim that local storage or the application is perfectly secure.

The primary goals are:

- preserve the integrity and recoverability of the selected vault;
- prevent content from leaving the device without a deliberate, previewed action;
- keep imported content inert inside the application;
- keep every filesystem operation inside a user-selected capability;
- make diagnostics useful without copying titles, bodies, or external absolute paths;
- limit the damage possible through a compromised webview or dependency.

## MVP implementation status

Current production React surfaces render note titles and bodies as text and do not use an HTML injection sink. The hardened `renderMarkdown` function is a tested boundary for a future rendered preview; it is not currently called by the production UI. Any future callsite must retain its fixed allowlist and receive a separate DOM-sink review.

The application package exposes an in-memory, bounded diagnostics recorder and an exact-preview/export builder. They are not yet wired to a persistent log or Settings screen. No production diagnostic upload, telemetry transport, or third-party analytics callsite exists. A future UI must show the returned `preview` verbatim before saving the identical returned bytes.

## Assets and sensitivity

| Asset | Security need | Notes |
| --- | --- | --- |
| Markdown notes and frontmatter | Confidentiality, integrity, availability | May include `private` or `sensitive` content and AI access policy. |
| Attachments | Confidentiality, integrity, availability | Images can contain identifying metadata; active formats require caution. |
| View and season state in `.studio/` | Integrity, availability | Structured state is portable but is not a substitute for canonical Markdown. |
| Backups and exports | Confidentiality, integrity | A ZIP is a complete portable copy and is not encrypted by the MVP. |
| Vault capability token | Confidentiality, authorization | Random, window-owned, memory-only desktop authority; never durable content. |
| Future provider credentials | Confidentiality | Not implemented. If added, use OS secure storage, never Markdown, logs, or localStorage. |
| Diagnostics | Confidentiality, integrity | Technical metadata only; generated and previewed locally. |

## Trust boundaries and data flow

1. **Person to app UI.** Typed, pasted, dragged, or selected content is untrusted input until parsed and validated.
2. **Imported archive or Markdown to content engine.** Filenames, YAML, Markdown, links, and bytes are hostile even when the archive belongs to the user.
3. **Webview to native commands.** IPC arguments are untrusted. The native process validates the window-owned vault token, path, bounds, expected revision/hash, and command-specific data.
4. **Native process to selected filesystem directory.** The retained directory capability is trusted as the root; names below it are not. Operations use relative component traversal without following symlinks.
5. **App to browser origin storage.** OPFS/IndexedDB and service-worker storage are controlled by the browser profile and device account, not encrypted by The Studio.
6. **App to backup destination or external sync.** The destination is outside The Studio's confidentiality boundary after the user confirms it.
7. **App to future AI or cloud services.** No provider exists in the MVP. Future transmission must be allowlisted, locally policy-checked, exactly previewed, and confirmed before payload construction.

## Threats, controls, and residual risks

### Lost, shared, or compromised device

**Threats:** another local user opens the browser profile, selected vault, backup, swap data, or an unlocked desktop session.

**Current controls:**

- local-only operation and no application account;
- native vault authority is selected by the person, scoped to one window, held only in memory, and revoked when the window closes;
- private backup files are created with owner-only permissions where supported;
- no note content is placed in the service-worker app-shell cache.

**Residual risks:** the MVP does not encrypt vault files, browser origin storage, or backup ZIPs and has no app lock. Device encryption, a strong OS login, a private browser profile, careful backup placement, and screen locking remain essential. A user with filesystem or browser-profile access can read the content.

### Malicious Markdown, HTML, SVG, and attachments

**Threats:** script execution, event handlers, active URL schemes, remote tracking pixels, SVG scripting, parser denial of service, or unsafe documents opened by another application.

**Current controls:**

- the available Markdown rendering boundary excludes raw HTML, but the current production UI does not render Markdown as HTML;
- text and attributes are escaped, and link/image URLs are validated before HTML is produced;
- `javascript:`, `data:`, `file:`, protocol-relative, control-character, and encoded scheme tricks are rejected;
- rendered Markdown images are restricted to relative raster formats; remote and SVG sources are not loaded;
- React renders ordinary titles and card text as text, not injected HTML;
- imports enforce archive, entry, expansion, count, path, checksum, and schema bounds before publication;
- the content security policy blocks scripts and objects outside the packaged application.

**Residual risks:** attachments can still exploit the OS application chosen to open them, and image decoders are part of the browser/OS attack surface. The MVP does not render SVG from the vault. Unknown active formats should be downloaded/opened only after an explicit warning in a future attachment flow.

### Path traversal, symlinks, and unsafe writes

**Threats:** `../`, absolute paths, Windows path forms, case variants of reserved controls, symlink escape, zip slip, race conditions, partial publication, or overwriting another writer.

**Current controls:**

- browser and native adapters share a normalized relative-path contract;
- desktop access begins with a native folder picker and a retained directory capability rather than a renderer-supplied root path;
- native traversal opens each parent without following symlinks and reserves every case variant of `.studio-*` control components;
- conditional writes validate expected hashes/revisions under the vault lock and publish atomically;
- multi-file imports and migrations are all-or-none, revision-guarded operations with durable crash-recovery journals;
- ZIP import rejects absolute, escaping, duplicate, oversized, over-count, unsupported, and checksum-invalid entries before mutation.

**Residual risks:** arbitrary external programs need not honor The Studio's advisory lock. The app detects conflicts but cannot make unrelated tools transactional. Filesystem, disk, or OS failure can still cause loss, so tested backups remain required.

### Cross-site scripting and webview compromise

**Threats:** imported text reaches an executable DOM sink, a dependency injects code, a remote page gains native privileges, or navigation exposes IPC.

**Current controls:**

- no production `dangerouslySetInnerHTML` or direct `innerHTML` content sink exists;
- the tested Markdown renderer boundary emits a fixed HTML tag/attribute allowlist and has no current production DOM sink;
- web and Tauri CSPs default to packaged/same-origin resources, deny objects, forms, frames, and base-tag changes, and list only required image, font, worker, and IPC transports;
- the single Tauri capability targets only the `main` local window, grants `core:default` only, and defines no remote URL pattern;
- native commands require window-owned vault authority rather than accepting an absolute vault path.

**Residual risks:** `style-src 'unsafe-inline'` remains because current React views use inline style properties for theme/layout state. It does not permit script execution, but removing it is a future defense-in-depth improvement. A native code or WebKit compromise can bypass application controls.

### Backup, cloud, and Git leakage

**Threats:** an unencrypted ZIP is emailed, placed in broadly shared cloud storage, retained after deletion, or committed to Git with secrets.

**Current controls:**

- backup creation is explicit and previews the manifest/conflicts before restore;
- portable exports exclude disposable search indexes and include checksums/schema metadata;
- native backup names and bytes are bounded and the destination is selected through a native save dialog;
- no credentials are stored in the vault by the application;
- documentation and UI describe backups as complete private copies.

**Residual risks:** backup ZIPs are not encrypted, cloud providers can retain versions, and Git history preserves removed files. The Studio cannot revoke a copy after export. Users should keep vaults out of public repositories, use encrypted destinations, review sync-sharing settings, and rotate any credential accidentally written into a note.

### AI and network disclosure

**Threats:** private notes, prompts, responses, identifiers, or credentials reach an AI provider or analytics service.

**Current controls:**

- the MVP has no AI provider, advertising, analytics SDK, remote font, or third-party telemetry;
- note-level `privacy.ai_access` is durable metadata for a future local enforcement boundary;
- CSP network destinations contain no third-party origin;
- the diagnostics boundary builds its preview and export bytes locally and excludes note titles/bodies and absolute external paths.

**Residual risks:** browser extensions, endpoint security products, cloud-synced browser profiles, and OS services operate outside the app boundary. Future AI work must receive a separate threat-model review and must never treat consent to one request as standing consent.

### Diagnostics and logs

**Threats:** errors or support bundles copy titles, bodies, filenames, absolute paths, tokens, or backup contents.

**Current controls:**

- diagnostics use a typed allowlist of operation, duration, error code, counts, app/platform versions, and irreversible identifiers/hashes;
- unexpected keys and content-bearing fields are ignored rather than generically serialized;
- absolute external paths, URL query/fragment data, control characters, and secret-like text are redacted;
- the prepared export exposes the exact serialized bytes as its preview; any saving UI must present that preview before download;
- diagnostics stay local and opt-in; no automatic upload endpoint exists.

**Residual risks:** metadata such as timestamps, versions, operation sequences, counts, and stable hashes can still be identifying. The person should inspect the preview and share it only with a trusted recipient.

### Dependency and build-chain compromise

**Threats:** a package, Rust crate, build script, CDN, or compromised update introduces data access or executable code.

**Current controls:**

- package and crate versions are locked;
- fonts and application assets are self-hosted with recorded licenses/checksums;
- production JavaScript and Rust dependency audits are release gates;
- CSP prevents an installed build from fetching executable third-party scripts;
- generated indexes are disposable and cannot replace Markdown authority.

**Residual risks:** advisory databases are incomplete and a trusted dependency can act with the application's privileges. Lockfile changes require review, CI must build from a controlled environment, and security updates require prompt triage.

## Misuse and safety boundaries

The Inner Studio and reflective features are imagination and journaling tools, not diagnosis, therapy, prediction, or a source of objective symbolic meaning. Future AI must use tentative language, must not intensify paranoia or delusional certainty, and must not claim that imagined events caused external outcomes. A distressing experience should be easy to stop, save privately, or discard.

## Security verification

The security gate includes:

- Markdown/URL regression tests for script, handler, encoded-scheme, remote image, SVG, and escaping attacks;
- CSP and Tauri capability policy tests;
- diagnostics allowlist, exact-preview, and private-content canary tests;
- storage/import contract, traversal, symlink, bounds, conditional-write, rollback, and crash-recovery tests;
- `pnpm audit --prod` and `cargo audit` with explicit runtime-advisory triage;
- Rust formatting, Clippy with warnings denied, unit/integration tests, and the full workspace suite.

## Response and maintenance

Security reports should identify the affected version, platform, reproduction steps, and whether data disclosure or mutation occurred, without attaching a real vault. Preserve a minimal redacted fixture. For a credible issue:

1. stop distribution of the affected build where practical;
2. reproduce against synthetic content;
3. assess confidentiality, integrity, availability, exploit preconditions, and affected versions;
4. patch with a failing regression test first;
5. rotate any exposed credential and advise affected users about backup/cloud copies;
6. update this threat model when a trust boundary, provider, sync mechanism, renderer, attachment flow, or native capability changes.

Every AI, sync, sharing, plugin, external-link-opening, app-lock, or encrypted-backup feature requires a fresh threat-model delta before implementation.
