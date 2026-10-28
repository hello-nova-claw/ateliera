# Contributing to Ateliera

These rules apply to everyone, human or agent. The reviewer enforces them. CI enforces the parts a machine can check, and the checks still being built are linked to their issues below.

## The rule above all others

Ateliera holds some of the most private things a person writes. Before you build anything, check it against the design principles in [docs/design.md](docs/design.md#2-design-principles-not-negotiable). A pull request that breaks one is closed, however good the code is. In short:

1. The data stays with the user. Nothing leaves the device except to Apple services the user turned on, each named in [docs/privacy.md](docs/privacy.md).
2. No accounts, analytics, ads, tracking or SDKs that collect anything.
3. No medical or contraceptive claims. Cycle days and phases are estimates, and the app says so.
4. The user can export everything and delete everything, in two taps each.
5. No streaks, guilt or dark patterns.
6. AI runs on the device only. It speaks to the user and never writes the journal for them.

## How work flows

1. **Issue first.** Every change starts as an issue made from the task template (added in #144; until then, use its five headings in the issue body). An issue is not ready until all five fields are filled in: problem, scope, out of scope, acceptance criteria, how to test. Agents fill the template before writing code. Outside contributors open an issue and wait until it is accepted before writing code.
2. **Board.** Issues move across the project board: Backlog, Ready, In progress, In review, Done. Move the issue, not the pull request. Whoever files an issue adds it to the board and sets its milestone, Priority and Status together.
3. **One branch and one pull request per issue.** Name the branch `<issue number>-<short-slug>`, for example `132-delete-everything`.
4. **Pull request.** Use the template (added in #144: `Fixes #N`, What, Why, How to test, a VoiceOver note for UI, and a checklist). Link the issue with `Fixes #132`. Add your changelog line as a fragment, `changelog/<issue>-<slug>.txt`. Don't edit `CHANGELOG.md`: parallel pull requests would conflict over it. At release time `bin/changelog` (added in #145) folds every fragment in. If the change has no user-facing effect, say so and a maintainer adds the `no-changelog` label.
5. **Review.** CodeRabbit reviews every pull request, and its approval is the required review. Anna reviews anything that touches the design principles, `docs/privacy.md`, the privacy manifests, entitlements, usage strings or the licence files. `main` is protected: no direct pushes, all checks green.

## Licensing of contributions

- Code you contribute is licensed under MIT, the same licence as the rest of the code ([LICENSE](LICENSE)).
- Written content (anything under the `content/` folders listed in [CONTENT-LICENSE.md](CONTENT-LICENSE.md)) and artwork are not accepted without a written agreement with Anna McPhee first. Open an issue to ask.
- Never add the Ateliera name or icon to anything outside this repository. See [TRADEMARKS.md](TRADEMARKS.md).

## Housekeeping

- **Branches go when they merge.** GitHub deletes a merged branch. Run `git config fetch.prune true` once per checkout, and delete your local branch with `git branch -d`.
- **`main` is the only long-lived branch.** Branch from an up-to-date `main`. If your branch conflicts with `main`, merge `main` into it. Don't rebase a branch someone else may have checked out.
- **An issue is done when its pull request merges.** Work found along the way gets its own issue, not a quiet extra commit.
- **Commit only source.** Never commit build output, `node_modules/`, `.toolchains/`, Xcode's generated project, `DerivedData`, coverage reports, or editor and agent folders such as `.claude/`. Signing files, keys and `.env` files never go in. `.gitignore` covers them.
- **Leave no scaffolding.** Remove debug output and commented-out code. A TODO names its issue: `// TODO(#132): …`.

## Commits

Write commit messages in WordPress core style.

- Imperative mood, a component prefix, under 72 characters, ending with a full stop: `Cycle: Count the first day of each cycle as day 1.`
- Add a body only when there is a reason worth recording. Explain why, not what.
- No emoji. No `feat:` or other Conventional Commits prefixes.
- Keep commits small, one thing each. Commit the test before the code that makes it pass.
- A large pull request with a single commit is sent back.

Prefixes: `Journal`, `Capture`, `Dreams`, `Intentions`, `Reflection`, `Cycle`, `Moon`, `Rhythm`, `Seasons`, `Foyer`, `Landscape`, `Identity`, `Wisdom`, `Search`, `Storage`, `Vault`, `Sync`, `Privacy`, `Lock`, `Widgets`, `Intents`, `Export`, `AI`, `Settings`, `Onboarding`, `UI`, `Web`, `Desktop`, `Content`, `I18N`, `A11y`, `Build/Test Tools`, `Docs`.

## Privacy

These rules carry the design principles into code. [docs/privacy.md](docs/privacy.md) describes how data is handled today.

- **File protection.** New files that hold personal data use `.complete` file protection, or `docs/privacy.md` records why not. Secrets and the app-lock state live in the keychain, never in `UserDefaults`.
- **No new network calls.** Nothing talks to the network except through an entry on the allowlist in `bin/check-privacy.mjs`, and each entry has its reason in `docs/privacy.md`. CI runs the check on every pull request. Existing violations are listed in the script with their issue, and a file may not add more. No analytics, crash-reporting, advertising or attribution SDK, ever.
- **Personal data stays out of side channels.** Entry text, cycle data and birth details never appear in logs, crash reports, notifications, widgets, Spotlight, Siri or Shortcuts unless the user turned that on. The defaults are a neutral notification ("Time to write") and a widget that shows no entries.
- **The app switcher shows a privacy screen** while the app lock is on.
- **Export and delete stay complete.** Every new kind of data is added to both, with a test.
- **The vault format is tested for loss.** `apple/AtelieraTests/VaultFormatMigrationTests.swift` round-trips the current format and opens every released format under `fixtures/vaults/released/`.
- **The schema is versioned.** Every note carries `schema_version`. Until 1.0 ships, the format can change freely. At release it is frozen as version 1, and a fixture vault made with it is committed. From then on, every format change ships a migration and a test that opens a fixture vault from every released version and checks that nothing was lost.
- **Health data is read, never stored.** Nothing derived from Health is written to the vault, `UserDefaults` or anywhere else. The vault may be in iCloud, and App Review Guideline 5.1.3 forbids health data there.
- **`docs/privacy.md` changes with the code.** Any pull request that changes what is stored, where, with which protection, what is sent, what is shown outside the app, or what a permission is for, updates `docs/privacy.md` in the same pull request. So does any change to `PrivacyInfo.xcprivacy`, an entitlements file, or a usage-description string.
- **No real personal data**, anywhere: fixtures, previews, screenshots, issues, pull requests or commit messages. All test data is invented. See [fixtures/README.md](fixtures/README.md).

## Code

### Apple app

Use what Apple already has. Before you write anything custom, use the system equivalent. If there isn't one, say so in the pull request.

- **UI.** SwiftUI and system components, SF Symbols for icons. UIKit or AppKit only where SwiftUI has no equivalent.
- **Colour.** Colours come from the theme tokens in `apple/Ateliera/Theme/` or from colour sets in the asset catalogue. Don't add hard-coded colours anywhere else.
- **Type.** Use Dynamic Type text styles. Custom fonts scale with `relativeTo:`. No `.font(.system(size:))` for text.
- **Logging.** `os.Logger` only, with `privacy: .private` on anything personal. No `print`.
- **Platform services.** LocalAuthentication for the lock, UserNotifications, WidgetKit, App Intents, HealthKit (read only), CoreLocation and Foundation Models, each behind a protocol so tests can replace it.
- **Vault writes.** Go through the Rust vault core. Never write vault files directly from Swift.
- **Safety.** No force unwraps, `try!` or `fatalError` outside tests. UI state is `@MainActor`.
- **Dependencies.** Any third-party dependency needs an MIT-compatible licence, a reason in the pull request, and confirmation that it collects nothing. Swift packages also need an entry on the allowlist in `bin/check-privacy.mjs`. The check rejects known analytics, crash-reporting, advertising, attribution and HTTP-client packages in every manifest.

### Web and desktop app

- Package layering is enforced by ESLint (`eslint.config.js`). If you need an upward dependency, the design is wrong, not the rule.
- `@studio/ui` is pure: no `fetch`, no `localStorage`. Data arrives through props.
- CSS uses BEM naming, semantic classes and the studio's custom properties. Never `!important`. Stylelint enforces this.
- Rust follows `rustfmt` and Clippy (`pnpm rust:fmt`, `pnpm rust:clippy`).

### Lint and format

- SwiftLint runs with `--strict` against `.swiftlint-baseline.json`. The baseline records violations that existed when it was introduced. Remove entries as you fix them; never add to it to get a pull request through.
- swift-format lints every Swift file a pull request touches. Format what you touch: run `xcrun swift-format format -i <files>` before you commit.

### Comments

Comments explain why. Delete any comment that restates the line below it.

## Domain correctness

Dates, the moon and the cycle are where this app breaks. These rules hold in both apps.

- **Dates and times.** Store each entry's time with the offset of the zone it was written in, so travel or a DST change never moves an entry to another day. Name and group entries by the writer's local date. Respect the user's calendar, locale and first weekday. Inject the clock, calendar, time zone and locale; never call `Date()`, `Calendar.current`, `TimeZone.current` or `new Date()` in logic.
- **Moon phases.** Test against a published table (NASA or USNO phase times) across several years, time zones and both sides of the date line. Work out "today's phase" at the user's local time, not midnight UTC. If the app ever draws the moon's face, mirror it for the southern hemisphere.
- **Cycle.** Test with invented regular, short, long, irregular and missing-data cycles, and with a last period long ago or in the future. The wording never claims medical accuracy, fertility or contraceptive use.
- **Golden parity.** Shared algorithms match between Swift and TypeScript. Take expected values for Swift tests from the TypeScript packages, never from prose.

## Tests

- Write the test first, and commit it first.
- A pull request that changes app sources (`apple/Ateliera/`, `apple/AtelieraWidgets/`, `apple/AtelieraVaultCore/src/`, `apps/*/src/`, `packages/*/src/`) must also change a test. Reviewers check this, and CI will once #145 lands.
- Apple: XCTest or Swift Testing for unit tests, XCUITest for flows. TypeScript: Vitest, with `fast-check` for property tests; Playwright for end-to-end.
- Inject time, calendar, time zone and locale. No sleeps. No real network.
- Apple app line coverage must not drop below the figure in `.github/coverage-baseline`. The "Apple build and test" job prints the figure. When it rises by more than half a point, raise the baseline in the same pull request. The TypeScript packages keep their own Vitest coverage thresholds.

How to run everything is in [CLAUDE.md](CLAUDE.md#running-checks).

## Localisation

- Every user-facing string in the Apple app goes in the String Catalog, accessibility labels included. The web app is English-only for now. Keep its strings out of logic so they can be extracted later.
- Add a translator comment to every string with a placeholder.
- Never build a sentence by concatenation. Use one string with placeholders.
- Format dates, numbers and durations with `FormatStyle` (Swift) or `Intl` (TypeScript), never fixed formats or English month names.
- Layouts survive right-to-left languages and strings 50% longer than English.

## Accessibility

- Every interactive element has an accessibility label. The cycle, moon and constellation visuals also need a text or audio-graph alternative.
- Layouts survive the largest accessibility Dynamic Type sizes.
- Respect Reduce Motion. Never use colour as the only signal, especially for cycle phases.
- The web app targets WCAG 2.2 AA and gives a keyboard alternative for every drag.
- **Every pull request that touches UI says how it was tested with VoiceOver**: what was focused, what was read out, what was activated. For web UI, also say how it was tested with the keyboard alone.

## Screenshots

- Every pull request from this repository that touches UI gets a **Screenshots** comment. It shows before and after images of every screen and state that changed, plus a collapsed list of the ones that didn't. Reviewers look at it before approving. A visual change never fails the check, so nothing else catches one.
- Screenshots are taken from fixture vaults with a fixed clock and time zone, in every state the catalogue lists. They are named `<screen>--<state>--<locale>--<device>.png`. All data in them is invented.
- When you add a screen or a state, add it to the screenshot catalogue. The catalogue and the comment arrive with #148.

## Security and privacy bugs

Report them privately. See [SECURITY.md](SECURITY.md). Privacy bugs are security bugs.
