# P8 Spec — Data-Management UI
## Safety, portability, history, diagnostics, conflict resolution

Status: design-only / build-ready spec (2026-08-28).
Builds on Phase N2 (byte-identical note model) and needs the write surface from
the existing Rust core (`apple/AtelieraVaultCore`). All new Rust FFI is additive;
no existing symbols change.

---

## 1. Scope — web features this phase reaches

| Web surface | Source files |
|---|---|
| ZIP export (portable vault + checksums) | `packages/storage/src/export.ts`, `portability.ts`, `zip32.ts` |
| ZIP import with conflict resolution | `packages/storage/src/import.ts`, `backup.ts` |
| Portability settings UI | `apps/studio/src/features/settings/PortabilitySettings.tsx` |
| Revision/backup snapshots | `packages/storage/src/revisions.ts` |
| Diagnostics recorder | `packages/application/src/diagnostics.ts` |
| Parse-error / metadata / broken-link repair queue | `packages/application/src/search-service.ts`, `apps/studio/src/features/search/RepairPanel.tsx` |
| Draft recovery (autosave survives a crash) | `packages/application/src/draft-recovery.ts`, `apps/studio/src/features/capture/browser-draft-recovery.ts` |
| Conflict-merge UI (stale `expected_hash`) | `apple/AtelieraVaultCore/src/lib.rs` — `VaultError::Conflict` is already returned; P8 surfaces it in the editor |

The iCloud vault is already plain files, so export/import is less urgent here
than in the browser (OPFS). The ordering within P8 is: conflict-merge first
(cheapest, unblocks the editor), then draft recovery, then diagnostics/repair,
then export/import.

---

## 2. Native design

### 2a. New Rust FFI (apple/AtelieraVaultCore/src/lib.rs)

Four new `#[uniffi::export]` functions on `Vault`. All are additive; no
existing symbols change. Re-generate UniFFI bindings after each addition
(`cd apple && ./AtelieraVaultCore/build.sh`).

```rust
// ── 1. Remove a file (needed for import apply + revision pruning) ──────────
#[uniffi::record]
pub struct RemoveOptions {
    pub expected_hash: Option<String>,  // None = unconditional
}

pub fn remove(&self, path: String, options: RemoveOptions) -> Result<(), VaultError>

// ── 2. Move a file atomically (needed for import overwrite by note-id path
//       mismatch, and for future trash restore) ─────────────────────────────
#[uniffi::record]
pub struct MoveOptions {
    pub expected_hash: Option<String>,
}

pub fn move_file(&self, from: String, to: String, options: MoveOptions) -> Result<WriteOutcome, VaultError>

// ── 3. Atomic batch write (needed for import apply: multiple files at once
//       guarded by the vault revision) ─────────────────────────────────────
#[uniffi::record]
pub struct BatchWrite {
    pub path: String,
    pub bytes: Vec<u8>,
    pub expected_hash: Option<String>,
    pub expected_missing: bool,
}

#[uniffi::record]
pub struct BatchWriteResult {
    pub path: String,
    pub hash: String,
}

#[uniffi::record]
pub struct AtomicBatchOutcome {
    pub revision: String,
    pub results: Vec<BatchWriteResult>,
}

pub fn write_batch_atomic(
    &self,
    expected_revision: String,
    writes: Vec<BatchWrite>,
) -> Result<AtomicBatchOutcome, VaultError>

// ── 4. Read binary (needed for export: read media attachments + settings
//       files that are not UTF-8 text) ─────────────────────────────────────
pub fn read_binary(&self, path: String) -> Result<Vec<u8>, VaultError>
```

Implementation notes:
- `write_batch_atomic` reuses the same `lock_writes()` + `reserve_revision_locked()` guard as `write_text`. It checks all preconditions first, writes all temps, then renames all atomically in one locked section, bumping the revision once.
- `remove` and `move_file` also hold the write lock and bump the revision.
- `read_binary` is the same as `read_text` minus UTF-8 validation.
- Limits: same caps as Tauri crate (`MAX_BATCH_WRITES = 9_999`, `MAX_PORTABLE_ENTRY_BYTES = 64 MiB`, `MAX_BATCH_BYTES = 512 MiB`). Enforce in Swift before calling Rust to keep error messages meaningful.

### 2b. New Swift files to ADD

All new files live under `apple/Ateliera/DataManagement/`.

| File | Role |
|---|---|
| `DataManagement/VaultExporter.swift` | Pure value type. Implements the export algorithm from `export.ts`: list vault, filter by `exportDisposition`, collect SHA-256, build manifest JSON, produce a ZIP32 `Data`. Owns `Zip32Writer.swift`. |
| `DataManagement/Zip32Writer.swift` | Minimal ZIP32 writer (store-only, no compression). Matches `createZip32` in `zip32.ts` byte-for-byte so the web app can read the output. |
| `DataManagement/Zip32Reader.swift` | ZIP32 parser matching `parseZip32` in `zip32.ts`. Validates magic, CRC-32, entry paths, entry count ≤ 10,000, sizes ≤ 64 MiB / 512 MiB. |
| `DataManagement/PortableManifest.swift` | `Codable` struct mirroring `PortableVaultManifest`. Fields: `format`, `exportVersion`, `schemaVersions` (`note`, `settings`), `generatedAt`, `files` ([`path`, `sha256`, `size`]), `excludedCaches`. Constants: `PORTABLE_FORMAT = "ateliera-vault"`, `PORTABLE_EXPORT_VERSION = 1`, `PORTABLE_MANIFEST_PATH = ".studio/export-manifest.json"`. Validate with a `validPortableManifest()` function matching the TS implementation. |
| `DataManagement/VaultImporter.swift` | Import flow: `prepareImport(data:vault:)` returns `ImportPlan`. `applyImport(plan:conflicts:vault:)` calls `vault.writeBatchAtomic`. Mirrors `prepareVaultImport` + `applyVaultImport` from `import.ts`. |
| `DataManagement/ImportPlan.swift` | Value types: `ImportItem` (path, size, sha256, action: create/overwrite/conflict/skip, existingPath?, conflictKind?), `ImportPlan` (archiveHash, manifest, items, targetRevision). |
| `DataManagement/RevisionStore.swift` | Mirrors `createRevisionStore` from `revisions.ts`. Writes snapshots under `.studio/backups/YYYY-MM-DD/TIMESTAMP--ID/`. Uses `vault.writeText` for manifest, `vault.write_batch_atomic` (via `VaultStore`) for file copies. Prunes on 30-day retention, one-per-day kept. |
| `DataManagement/DiagnosticsRecorder.swift` | In-memory ring buffer of `DiagnosticEntry` (operation, occurredAt, outcome, durationMs?, errorCode?, fileId?, fileHash?). Thread-safe. Max 10,000 entries matching `maximumDiagnosticEntries`. |
| `DataManagement/DraftRecovery.swift` | Mirrors `DraftRecoveryStore` from `draft-recovery.ts`. Uses `UserDefaults` (keyed `studio:draft-recovery:\(studioId):\(path.percentEncoded)`). `readForDurable(studioId:path:durableHash:)` returns `.none`, `.recoverable(draft)`, or `.stale(draft)`. |
| `DataManagement/RepairQueue.swift` | Scans vault notes: parse each with `NoteParser`; collect `ParseErrorItem` (path, errors) and `BrokenLinkItem` (path, target, kind). Returns a `[RepairItem]` array. Does NOT depend on the search index (disposable). |
| `UI/DataManagementView.swift` | Root SwiftUI sheet/navigation destination. Tabs or `List` sections: Export, Import, History, Diagnostics, Repair. Presented from Settings. |
| `UI/ExportView.swift` | "Download portable backup" equivalent. Calls `VaultExporter.export(vault:)`, shares the resulting `Data` via `ShareLink` (UIActivityViewController on iOS). Shows progress + error. |
| `UI/ImportView.swift` | File picker (`fileImporter` for `.zip`), then shows `ImportPlanView`. |
| `UI/ImportPlanView.swift` | Mirrors `PortabilitySettings.tsx` preview section: counts by action, conflict resolution per item (keep/overwrite radio), confirmation toggle, apply button. |
| `UI/RevisionHistoryView.swift` | Lists snapshots from `.studio/backups/` (read with `vault.list`), shows reason + date. "Restore" button calls `VaultImporter` from snapshot files. |
| `UI/DiagnosticsView.swift` | Shows the last N entries from `DiagnosticsRecorder`. "Export diagnostics JSON" shares the log. |
| `UI/RepairQueueView.swift` | One card per `RepairItem`. Parse-error card: shows errors + edit form for the frontmatter fields (matches `MetadataRepair` in `RepairPanel.tsx`). Broken-link card: choose new target, remove. Uses `vault.writeText` to apply the repair. |
| `UI/ConflictMergeView.swift` | Presented as a `sheet` when `vault.writeText` throws `VaultError.Conflict`. Shows "your draft" vs "current stored note" side-by-side. Three actions: Keep stored version (discard draft), Overwrite with draft (re-read durable hash first, then write), Save draft as new note (capture to same room). |

### 2c. Existing files to MODIFY

| File | Change |
|---|---|
| `VaultStore.swift` | Expose `vault` (internal) to `DataManagement` target via `@_spi` or package-internal access. Wire conflict from `saveEdit` to present `ConflictMergeView` instead of setting `error`. Add `diagnostics: DiagnosticsRecorder` property. |
| `Ateliera/Shared/` | Add `DataManagement` folder reference to `project.yml` source groups. |
| `project.yml` | Add `apple/Ateliera/DataManagement/` and `apple/Ateliera/UI/` (new files above) to sources. |
| `RootView.swift` | Add "Data & Backups" row to Settings sheet, navigating to `DataManagementView`. |
| `Note/NoteEditorSheet.swift` (or wherever edit errors surface) | Catch `VaultError.Conflict` and present `ConflictMergeView` as a sheet. |
| `AtelieraTests/` | New test files listed in §4. |

---

## 3. Data/format — portable ZIP format

### Manifest file

Path inside ZIP: `.studio/export-manifest.json`

```json
{
  "format": "ateliera-vault",
  "exportVersion": 1,
  "schemaVersions": { "note": 1, "settings": 1 },
  "generatedAt": "2026-08-28T09:00:00.000Z",
  "files": [
    { "path": "Reflection Garden/note.md", "sha256": "<64 hex chars>", "size": 1234 }
  ],
  "excludedCaches": [".studio/index/fts.db"]
}
```

Fields are in exactly this key order (JSON serialisation must match the TS
`JSON.stringify(manifest, null, 2)` output with a trailing newline). The
`generatedAt` must be a canonical ISO 8601 UTC string matching
`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`.

### exportDisposition — which vault paths are included

Matches `exportDisposition()` in `portability.ts` exactly:

- `include` — anything not under `.studio/`; plus `.studio/settings.json`, `.studio/config.json`, `.studio/settings/**`, `.studio/config/**`, `.studio/views/**`, `.studio/seasons/**`, `.studio/backups/**`, `.studio/trash/**`.
- `cache` — `.studio/index/**`, `.studio/cache/**`, `.studio/thumbnails/**`, `.studio/import-stage/**`, `.studio/import-backup/**`, `.studio/tmp/**`, `.studio/revisions/**`. Listed in `excludedCaches` but not included in the ZIP.
- `internal` — everything else under `.studio/`. Silently skipped.

Active/executable extensions are blocked from export. Swift implementation:
```swift
private static let ACTIVE_EXTENSIONS: Set<String> = [
    "app","bat","cmd","command","com","cpl","css","dll","dmg","exe",
    "gadget","hta","htm","html","jar","js","jse","jsx","mjs","msi",
    "pif","ps1","scf","scr","sh","svg","ts","tsx","vb","vbe","vbs",
    "wasm","ws","wsc","wsf","wsh"
]
```

### ZIP32 format (Zip32Writer.swift / Zip32Reader.swift)

Must match `createZip32` / `parseZip32` from `zip32.ts` identically:

- Local file header: signature `0x04034b50`, version 20, flags `0x0800` (UTF-8), method 0 (stored), CRC-32 (IEEE), uncompressed size == compressed size, filename UTF-8.
- Central directory entry: signature `0x02014b50`, same fields, offset to local header.
- End of central directory: signature `0x06054b50`, disk 0, entry counts, central directory size and offset.
- Limits: entries ≤ 10,000; entry ≤ 64 MiB; archive ≤ 512 MiB (both expanded and raw).
- CRC-32 polynomial: `0xEDB88320` (IEEE, reflected). CRC-32 is part of the ZIP spec and must be correct; no golden test needed beyond the ZIP round-trip test.
- SHA-256 of each file content: `CryptoKit.SHA256.hash(data:)` — `hex(SHA256(bytes))`. Compare against the TS `sha256()` function (`crypto.subtle.digest`). **Golden value**: capture from a throwaway vitest (`packages/storage/src/zip32.test.ts`) for a known 3-byte input (`[0, 1, 255]`) and assert the Swift `SHA256(Data([0, 1, 255]))` hex matches.

### Revision snapshot format

Manifest path: `.studio/backups/YYYY-MM-DD/YYYY-MM-DDTHH-MM-SS-mmmZ--ID/manifest.json`

```json
{
  "version": 1,
  "id": "<uuid>",
  "reason": "conflict-resolution",
  "createdAt": "2026-08-28T09:00:00.000Z",
  "state": "complete",
  "files": [
    { "originalPath": "note.md", "snapshotPath": ".studio/backups/.../files/note.md", "hash": "<sha256>" }
  ]
}
```

Valid `reason` values: `migration`, `multi-file-rename`, `conflict-resolution`, `season-close`.
Valid `state` values: `writing`, `complete`, `incomplete`, `pruning`.

### Draft recovery key format

`UserDefaults` key: `studio:draft-recovery:<percentEncoded(studioId)>:<percentEncoded(path)>`

Value is JSON:
```json
{
  "studioId": "<vault recovery id>",
  "path": "Reflection Garden/note.md",
  "title": "optional title",
  "body": "note body text",
  "expectedHash": "<sha256 of the note when the draft was started>",
  "updatedAt": "2026-08-28T09:05:00.000Z"
}
```

`studioId` comes from the existing `.studio-vault-id` file that the Rust core
already creates (readable via `vault.readText(path: ".studio-vault-id")` —
note: this path is excluded from `collect_entries` by `is_internal_component`
but is directly readable via `readText`). Cache it in `VaultStore`.

### Golden values to capture from the TypeScript engine

Run a throwaway vitest in `packages/storage/` to capture these, then hard-code
in Swift golden tests:

1. **SHA-256 of `[0x00, 0x01, 0xFF]`**: run `sha256(new Uint8Array([0, 1, 255]))` from `zip32.ts`. Expected: `"b3a8e0e1f9ab1bfe3a36f231f676f78bb28a2028da7f5741a37e630d398f4d0d"` — verify in vitest.
2. **ZIP32 of one file**: `createZip32([["hello.md", new TextEncoder().encode("world\n")]])` — capture the hex of the resulting `Uint8Array` and assert the Swift `Zip32Writer` produces the same bytes.
3. **Manifest JSON for a minimal export**: capture `JSON.stringify(manifest, null, 2) + "\n"` for a manifest with one file entry and verify the Swift `PortableManifest` encodes identically (key order must match).
4. **portable path key**: `portablePathKey("Réflexion/Note.md")` — must equal `"réflexion/note.md"` (NFC + toLower). Assert Swift `String.lowercased(Locale(identifier:"en"))` after `String.precomposedStringWithCanonicalMapping` matches.

Capture script location: `packages/storage/src/p8-golden.test.ts` (delete after
golden values are committed to the Swift tests). Run with:
```sh
pnpm --filter @studio/storage exec vitest run src/p8-golden.test.ts
```

---

## 4. TDD plan

### Unit tests (AtelieraTests/)

Add to existing `AtelieraTests/` target.

| Test file | Coverage |
|---|---|
| `Zip32WriterTests.swift` | Golden round-trip: write one entry, parse with `Zip32Reader`, bytes match. ZIP structure fields (magic, CRC, size). Rejects oversized entry / archive. |
| `Zip32ReaderTests.swift` | Parse the TS-generated golden ZIP hex. Rejects bad magic, bad CRC, encrypted entry, duplicate path, path traversal. |
| `PortableManifestTests.swift` | Golden JSON encoding matches TS output (key order, trailing newline). `validPortableManifest` accepts the golden and rejects structurally invalid inputs. |
| `ExportDispositionTests.swift` | `exportDisposition("Reflection Garden/note.md")` == `.include`. `.studio/index/fts.db` == `.cache`. `.studio-revision` and `.studio-write.lock` == `.internal` (not reachable via `list` anyway). All active extensions blocked. |
| `VaultExporterTests.swift` | Export a temp vault with 3 notes + 1 settings file; parse the resulting ZIP; verify manifest SHA-256 values match actual file hashes; verify `.studio/index/` absent from ZIP entries; verify excluded caches list populated. |
| `VaultImporterTests.swift` | `prepareImport`: create/overwrite/skip/conflict actions classified correctly. `applyImport`: writes land; conflict items require explicit resolution; stale revision rejected. `extractNoteId`: parses `id:` from frontmatter. |
| `RevisionStoreTests.swift` | Create snapshot, verify `.studio/backups/` structure. Prune removes expired snapshots. 30-day retention keeps one per day. |
| `DraftRecoveryTests.swift` | Write a draft; `readForDurable` with matching hash → `.recoverable`; with different hash → `.stale`; missing → `.none`. Remove clears it. |
| `RepairQueueTests.swift` | Vault with one unparseable note (missing frontmatter) → `ParseErrorItem`. Vault with `[[broken-link]]` in body → `BrokenLinkItem`. Both combined. Vault with no issues → empty queue. |
| `DiagnosticsRecorderTests.swift` | Ring buffer caps at 10,000. `record` accepts valid operations. Clears correctly. |
| `RustFFIExtensionsTests.swift` | `write_batch_atomic`: two-file create, then stale-revision rejection. `remove` with correct + stale hash. `move_file` between paths. `read_binary` round-trip. |

### Golden-parity tests

| Test | Assertion |
|---|---|
| `Zip32GoldenTests.swift` | `Zip32Writer.create(files: [("hello.md", Data("world\n".utf8))])` hex == golden from TS `createZip32`. |
| `SHA256GoldenTests.swift` | `SHA256(Data([0, 1, 255])).hex` == `"b3a8e0e1..."` (captured from `zip32.ts sha256()`). |
| `ManifestGoldenTests.swift` | `PortableManifest` JSON encoding of the reference manifest == golden string from TS. |
| `PortablePathKeyTests.swift` | `portablePathKey("Réflexion/Note.md")` == `"réflexion/note.md"`. |

### UI tests (AtelieraUITests/)

| Test | Steps |
|---|---|
| `ExportImportUITest` | Open vault fixture, navigate Settings → Data & Backups → Export, share sheet appears, cancel. Import a known-good ZIP fixture, plan preview shows correct counts, apply, vault contains the imported note. |
| `ConflictMergeUITest` | Open a note, simulate a concurrent write to the same path (write directly via `vault.writeText` from test setUp), try to save the edit, conflict sheet appears, choose "Save as new note", new note exists and original unchanged. |
| `DraftRecoveryUITest` | Open a note, edit without saving, kill and re-open (simulate via `app.terminate()` + relaunch with same vault), draft recovery banner appears, tap "Restore draft", note body shows the draft content. |

---

## 5. Dependencies

### Hard dependencies

- **Phase N2** (byte-identical note model) — must be complete. `NoteParser` and `StudioNote.serialize()` are used by `RepairQueue` and `ConflictMergeView`.
- **New Rust FFI** (`write_batch_atomic`, `remove`, `move_file`, `read_binary`) — must be merged and `build.sh` re-run before `VaultExporter` or `VaultImporter` can be built.
- **VaultStore.vault access** — internal `vault: Vault?` must be made accessible (via a package-internal accessor) so `VaultExporter` can call the new FFI methods without coupling through `VaultStore`.

### Soft dependencies (not blockers, but improve completeness)

- **P4 (search + link graph)** — `RepairQueue` works without it (scans raw Markdown). The broken-link detection is less precise without the full wikilink index from P4, but the parse-error and metadata cards are fully independent.
- **P1 (full metadata editing)** — `ConflictMergeView` and `RepairQueueView` edit only the fields the current `StudioNote` model supports. Richer editing follows P1's note editor.

### Shared contracts relied upon

- `VaultError.Conflict` — already returned by `write_text` on a stale `expected_hash`. P8 catches it in the editor and routes to `ConflictMergeView` rather than setting `error` on `VaultStore`.
- Vault recovery identity (`.studio-vault-id`) — already written by the Rust core; used as `studioId` in `DraftRecovery`.
- `.studio-revision` monotonic counter — already implemented; used as `targetRevision` in `ImportPlan` to detect concurrent writes during apply.
- `portability.ts` constants — `PORTABLE_FORMAT`, `PORTABLE_EXPORT_VERSION`, `PORTABLE_MANIFEST_PATH` — must be hard-coded as literals in Swift with golden tests asserting they match.

---

## 6. Risks and first vertical slice

### Risks

| Risk | Mitigation |
|---|---|
| ZIP32 writer produces bytes the web parser rejects | Golden test: feed the Swift-produced ZIP to `parseZip32` from `zip32.ts` in the capture vitest; assert no error and content matches. |
| `write_batch_atomic` in Rust does not hold the write lock across all renames | Implementation must hold `lock_writes()` for the entire prepare-then-rename sequence, not per file. |
| `expected_revision` check in batch write is a time-of-check / time-of-use race | Read revision inside the write lock, not before acquiring it. |
| Import `applyImport` calls `write_batch_atomic` with stale revision if vault changed between plan and apply | `ImportPlan.targetRevision` is passed as `expected_revision` to the batch; Rust rejects with `Conflict`. Surface as "vault changed, re-scan" to the user. |
| Draft recovery `UserDefaults` key collides across vault opens | `studioId` is the per-vault `.studio-vault-id` UUID, making the key globally unique per vault per note path. |
| `DraftRecovery` on iOS: `UserDefaults` survives app restarts (unlike `sessionStorage`) | This is intentional — iOS has no "page reload" concept; `expectedHash` still guards against stale drafts. |
| Security-scoped bookmark expires between export and share | Export produces `Data` immediately; share sheet holds it in memory. Bookmark expiry is irrelevant. |

### Smallest first vertical slice

**ConflictMerge** (1–2 days, no new Rust FFI needed):

1. In `VaultStore.saveEdit`, catch `VaultError.Conflict` and store `conflictState: ConflictState?` (`@Published`).
2. `ConflictState` holds the draft (title, body, path) and re-reads the durable text via `vault.readText` to show the "current stored" version.
3. `ConflictMergeView` sheet with three actions: keep durable (dismiss), overwrite (re-read hash, call `saveEdit`), save as new note (call `capture`).
4. Tests: `ConflictMergeUITest` (UI test) + unit test that `VaultError.Conflict` populates `conflictState`.

This vertical slice is self-contained, adds user-visible value immediately
(the editor currently silently loses the edit on conflict), and requires no new
Rust FFI, no ZIP logic, and no new navigation.

**Draft Recovery** (1 day, no new Rust FFI):

1. Add `DraftRecovery.swift` backed by `UserDefaults`.
2. In the note editor, `onAppear` read the vault hash and call `readForDurable`; if `.recoverable`, show a banner "Restore your unsaved draft?".
3. `onChange` of body text write a draft record; `onDisappear` after a successful save remove it.
4. `DraftRecoveryUITest`.

**Export/Import** (3–5 days, needs new Rust FFI):

After the Rust FFI additions are merged:
1. `Zip32Writer` + golden test.
2. `VaultExporter` + `ExportView` (share sheet).
3. `Zip32Reader` + `PortableManifest` validation.
4. `VaultImporter.prepareImport` + `ImportPlanView`.
5. `VaultImporter.applyImport` using `write_batch_atomic`.
6. `VaultExporterTests` + `VaultImporterTests`.

**Diagnostics + Repair** (2 days, no new Rust FFI):

1. `DiagnosticsRecorder` threaded into `VaultStore` (record on every write/read error).
2. `RepairQueue` over the existing `vault.list` + `NoteParser`.
3. `RepairQueueView` + `DiagnosticsView`.
4. `RepairQueueTests` + `DiagnosticsRecorderTests`.

**Revision History** (1 day, needs `write_batch_atomic`):

1. `RevisionStore` writing snapshots under `.studio/backups/`.
2. `RevisionHistoryView` listing and restoring.
3. `RevisionStoreTests`.
