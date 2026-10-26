# Ateliera

A private studio for designing a life from the inside out.

## Development

Use Node.js 22 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Workspace dependencies follow the architecture documented in the implementation plan and are enforced by ESLint.

## Native Apple app

A native SwiftUI app for iPhone, iPad, and Mac lives in [`apple/`](apple/README.md). It
operates on the same user-owned iCloud Markdown vault as the web/PWA Studio — the vault
format, not shared code, is the contract between them (see
`docs/architecture/decisions/ADR-012-native-apple-app.md`). It is at full P1–P9 feature
parity, golden-matched to the `@studio/*` packages, and reuses the Rust vault core via
UniFFI. See [`apple/README.md`](apple/README.md) for build and test commands.

## Licensing

The code is licensed under MIT; see [LICENSE](LICENSE). The name, icon and the app's written content (journal prompts, invitations, micro-seasons, guided threads and onboarding copy) are all rights reserved; see [CONTENT-LICENSE.md](CONTENT-LICENSE.md) and [TRADEMARKS.md](TRADEMARKS.md). Bundled fonts, photographs and data keep their own licences; see [NOTICE.md](NOTICE.md).
