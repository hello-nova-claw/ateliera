# Ateliera — native Apple app

A native SwiftUI app for iPhone, iPad, and Mac, operating on the same user-owned
iCloud Markdown vault as the web/PWA Studio. The vault format — not shared code — is the
contract between them (see `docs/architecture/decisions/ADR-012-native-apple-app.md`).

Every shared format and algorithm is **golden-matched** to the `@studio/*` TypeScript
packages: the note schema + Markdown round-trip, seasons/identity/landscape/wisdom/
reflection projections, the SM-2 resurfacing "Gift", faceted search + backlinks + link
repair, ZIP export/import, and the rhythm calc. All writes are atomic, path-contained,
and recoverable — that dangerous core is the Rust vault library reused via UniFFI, not
reimplemented.

Feature parity with the web Studio spans the full P1–P9 roadmap (note depth + wikilinks,
seven themes, the Gift, search + repair, Life Landscape + Identity, Season + Uncharted +
Wisdom + Reflection, classified capture + cover media, data management, and onboarding +
progressive disclosure).

## Layout

- `AtelieraVaultCore/` — the Rust vault core (atomic/path-contained writes, revision
  guard, batch write, `remove`), exposed to Swift over UniFFI.
- `Ateliera/` — the SwiftUI app: one multiplatform codebase (navigation adapts per
  device). Feature areas live in per-room folders (`Capture`, `Season`, `Wisdom`,
  `Reflection`, `Landscape`, `Search`, `DataManagement`, …). `Generated/` holds the
  UniFFI Swift binding (a build artifact — gitignored).
- `AtelieraTests/` — colocated unit tests; every shared format/algorithm has golden
  parity tests. `AtelieraUITests/` — XCUITest flows.
- `AtelieraWidgets/` — the widget extension.
- `project.yml` — the xcodegen project spec (globs source automatically). `Ateliera.xcodeproj`
  is generated and gitignored.

## Build & test

Prereqs: `xcodegen` (Homebrew), Xcode, and the repo's hermetic Rust toolchain under
`.toolchains/` (used by the vault-core build).

```sh
# 1. Build the Rust vault core → VaultCore.xcframework + Swift bindings
#    (three slices: iOS device arm64, iOS-sim arm64+x86_64, macOS arm64).
./AtelieraVaultCore/build.sh

# 2. Generate the Xcode project from project.yml (re-run after adding files).
xcodegen generate

# 3. Run the unit tests on a simulator.
xcodebuild test -project Ateliera.xcodeproj -scheme Ateliera \
  -destination "platform=iOS Simulator,name=iPhone 15 Pro Max" \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO
```

`VaultCore.xcframework`, `AtelieraVaultCore/target/`, `Ateliera/Generated/`, and `build/`
are all gitignored — regenerate them from a clean checkout with steps 1–2 above.

To run on a device, open `Ateliera.xcodeproj` in Xcode (or `xcodebuild -destination
"platform=iOS,name=<device>"` with your signing team), pick your iPhone, and run.
