# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ateliera is a private journal for designing a life from the inside out. It ships as a native SwiftUI app (`apple/`) and a web and desktop app (`apps/`, `packages/`) that share a vault format, not code. Read [CONTRIBUTING.md](CONTRIBUTING.md) before any change: it holds the process, commit style, privacy, code, domain, test, localisation, accessibility and screenshot rules, and this file does not repeat them. [docs/design.md](docs/design.md) is the design record. Its section 2 principles are not negotiable. [docs/privacy.md](docs/privacy.md) says what the apps store and send.

**The repository is public.** Nothing secret or personal goes into an issue, pull request, commit, comment or fixture. Never use Anna's real journal, cycle, birth or location data to test anything.

## Layout

- `apple/`: the native app for iPhone, iPad and (later) Mac. See [apple/README.md](apple/README.md).
  - `project.yml` is the XcodeGen spec. `Ateliera.xcodeproj` is generated and ignored.
  - `Ateliera/` holds the app, one folder per room or concern: `Capture`, `Journal`, `Foyer`, `Rhythm`, `Season`, `Landscape`, `Identity`, `Wisdom`, `Reflection`, `Search`, `DataManagement`, `Settings`, `Onboarding`, `Theme` and others. `VaultStore.swift` and `RootView.swift` are the hubs.
  - `Ateliera/Content/` holds the reserved written content as JSON, loaded by `Shared/ContentLibrary.swift`.
  - `AtelieraWidgets/` is the widget extension. `Ateliera/Intents/` holds the one App Intent.
  - `AtelieraVaultCore/` is the Rust vault core (atomic, path-contained writes), exposed through UniFFI. `build.sh` builds `VaultCore.xcframework` and `Ateliera/Generated/`, both ignored.
  - `AtelieraTests/` and `AtelieraUITests/` hold the XCTest unit and UI tests.
- `packages/`: the TypeScript layers.
  - `domain` and `rhythm` have no workspace dependencies.
  - `content` (Markdown), `index` (disposable SQLite FTS5), and `storage` (vault ports and adapters) depend on `domain` only.
  - `application` holds the services. `ui` holds pure presentational React.
  - ESLint enforces the layering.
- `apps/studio/`: the React 19 PWA and Tauri desktop host. The Rust host is in `src-tauri/`.
- `fixtures/vaults/`: invented vaults for tests.
- `docs/`: the design record, privacy, the privacy policy draft, ADRs, the product PRD and roadmaps (`docs/product/`), and plans.
- `development-log.md`: history of completed work.

## How it fits together

- **Vault.** A folder of Markdown notes with YAML frontmatter (`schema_version: 1`) plus media. App state lives in `.studio/`: settings, config, views, `backups/` (revisions), `trash/`, `cache/`. The files are the truth; everything else can be rebuilt.
- **Storage.**
  - **Apple:** the user picks the vault folder, kept as a bookmark in `UserDefaults`. All writes go through the Rust core. Some settings (birth data, home place, preferences, draft recovery) still live in `UserDefaults`; #40 and #131 move them.
  - **Web:** the vault lives in OPFS, or IndexedDB where OPFS is missing.
  - **Desktop:** the vault is a folder on disk, written by the Rust host.
- **Sync.** None of the app's own. If the user puts the vault in iCloud Drive, Apple syncs it.
- **Rhythm.** Seasons, moon and natal chart are computed on the device (Meeus). The cycle comes from HealthKit (menstrual flow, read only) and stays in memory.
- **AI.** Foundation Models on the device words the micro-season. Its input is never journal, cycle or birth data, and its output is never written into a note.
- **Lock.** None yet (#133).
- **Notifications.** None.
- **Widgets.** Season and moon only. The App Intent says the same.

## Invariants

- Markdown and media are authoritative; indexes and caches are disposable.
- Writes are atomic, path-contained, schema-validated and recoverable.
- Unknown YAML keys survive in order.
- A note is one piece of text. With no `title`, its first non-empty line is the title.
- Core behaviour works offline and without AI.
- Nothing leaves the device except to Apple services the user turned on, as listed in `docs/privacy.md`.
- Personal data uses `.complete` file protection, or `docs/privacy.md` says why not.
- Entry text, cycle and birth data stay out of logs, notifications, widgets, Spotlight and Siri.
- Export and delete cover every kind of data, with a test.
- Health data is never stored.
- No streaks, overdue badges or guilt-inducing counts.
- Shared algorithms are golden-matched between Swift and TypeScript.

## Running checks

Requires Node 22 and pnpm 10 (`pnpm install --frozen-lockfile`), Xcode, `xcodegen`, and the hermetic Rust toolchain in `.toolchains/`.

`.toolchains/` is ignored, so a fresh clone has to create it once, at the repository root:

```bash
cd "$(git rev-parse --show-toplevel)"
export CARGO_HOME="$PWD/.toolchains/cargo" RUSTUP_HOME="$PWD/.toolchains/rustup"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable
.toolchains/cargo/bin/rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-darwin
```

`apple/AtelieraVaultCore/build.sh` and `scripts/run-rust.mjs` pick it up from there. The Tauri desktop build may need more targets; `pnpm tauri:build` says which.

```bash
pnpm lint            # ESLint (with the layering rule) and Stylelint
pnpm typecheck
pnpm test            # Vitest across every package
pnpm build
pnpm test:e2e        # Playwright: builds, previews on :4173, runs tests/e2e
pnpm rust:fmt && pnpm rust:clippy && pnpm tauri:test
node bin/check-privacy.mjs && node bin/check-licence.mjs
swiftlint lint --strict --baseline .swiftlint-baseline.json
xcrun swift-format lint --strict <changed .swift files>
```

One TypeScript test:

```bash
pnpm --filter @studio/rhythm exec vitest run src/rhythm.test.ts -t "cycle" --coverage.enabled=false
```

`@studio/application` and `@studio/content` enforce 100% coverage in Vitest. A run of one of their files fails that gate even when its tests pass, so pass `--coverage.enabled=false` for single files.

Apple app:

```bash
cd apple
./AtelieraVaultCore/build.sh       # once, and after Rust changes
xcodegen generate                  # after adding or removing files
xcodebuild test -project Ateliera.xcodeproj -scheme Ateliera \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO \
  -only-testing:AtelieraTests/RhythmTests          # drop -only-testing for everything
```

Run date-sensitive tests under other zones too: prefix with `TZ=Pacific/Auckland`, `TZ=America/Los_Angeles` or `TZ=UTC`.

## Traps

- **A new worktree has no `.toolchains/` or `node_modules/`.** Both are ignored. Run `pnpm install --frozen-lockfile` in the worktree, and symlink `.toolchains` from the main checkout (`ln -s ../../../.toolchains .toolchains` from `.claude/worktrees/<name>/`). Never commit the symlink. Without it, `build.sh` and the Rust scripts fail.
- **Lint from the main checkout used to read every worktree.** ESLint and Stylelint lint dot-folders, so `pnpm lint` in the main checkout also linted `.claude/worktrees/*`, with other branches' errors. Both configs now ignore `.claude/**`. That pattern is relative to the directory the tool runs from, so inside a worktree its own files are still checked. Never make it an absolute path. A worktree's own path contains `.claude/worktrees/`, and a pattern matched against absolute paths would make lint inside a worktree check nothing. That happened with PHPCS on Undergrowth.
- **The macOS app target doesn't build on `main`** (#126). Use an iOS simulator destination.
- **`pnpm test:e2e` fails on `main`** (#129). Don't read its failure as yours until #129 is closed.
- **The simulator seeds a demo vault**; a device opens the folder picker (`VaultStore.swift`, `#if targetEnvironment(simulator)`).
- **Another session may share the main checkout.** Do branch work in a worktree under `.claude/worktrees/`, and never reset or switch the main checkout's branch.

## Pull requests

- Every pull request needs an issue with all five template fields, a branch named `<issue>-<slug>`, and a changelog fragment `changelog/<issue>-<slug>.txt` (`bin/changelog` arrives with #145). A pull request with no user-facing change, such as docs or tooling only, gets the `no-changelog` label instead.
- Commits use the repo-local Novaclaw git identity, in WordPress core style. Don't add `Co-Authored-By` or any AI attribution lines.
- The `gh` CLI has two accounts. Use Novaclaw for this repository: `GH_TOKEN=$(gh auth token --user hello-nova-claw) gh …`.
- CodeRabbit's approval is the required review. It allows about 10 reviews an hour per repository, so batch fixes into one push. When it says "Review paused", comment `@coderabbitai resume`, then `@coderabbitai review`.
- Auto-merge (`gh pr merge <n> --auto --merge`) can land a pull request while you are still fixing it. Run `gh pr view <n> --json state` and confirm it is `OPEN` before every push to its branch.
- Merge `main` into a branch only when it is DIRTY (conflicting). Being behind is not a reason: every push dismisses the approval and restarts CI.
- Every push queues every CI job. GitHub Free runs 5 macOS jobs at once. A push touching `apple/` queues one, or four when it changes the app or its UI tests (the accessibility audit runs as three parallel jobs), so keep **no more than one pull request that changes the app or its UI tests** being pushed at a time, or two that touch only other `apple/` files. Web-only pull requests run on Linux and are limited only by the 20-job total. Recompute this when the CI's macOS jobs change.
- When several sessions work in parallel, give each one a lane: an ordered list of issues in one area, one pull request at a time, so they don't edit the same files.
- Only `main` is protected. Never enable auto-merge on a pull request whose base is another feature branch, because it merges into that base at once.
- Never enable auto-merge on a pull request from outside, or on any pull request labelled `privacy`. Those wait for Anna.
