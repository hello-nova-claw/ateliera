# Ateliera

A private journal for designing a life from the inside out: journal entries, reflections, dreams, gratitude, intentions and possibilities, set against the season, the moon and your own cycle.

Ateliera comes as a native app for iPhone and iPad, and as a web and desktop app. Both keep your journal as a folder of Markdown files that you own.

## Privacy

Your journal stays with you. Ateliera has no account, no server, no analytics and no tracking, and it collects nothing. Your entries are files in a folder you choose. Your cycle is read from Apple Health on your device and never stored. You can export everything and delete everything. [docs/privacy.md](docs/privacy.md) sets out exactly what each app stores, where, and what (if anything) leaves your device.

The code is public so that anyone can check this.

## App Store

Not released yet. A TestFlight beta comes first.

## Building

### iPhone and iPad app

Needs Xcode, [XcodeGen](https://github.com/yonaskolb/XcodeGen) and the repository's Rust toolchain (`.toolchains/`).

```sh
cd apple
./AtelieraVaultCore/build.sh
xcodegen generate
open Ateliera.xcodeproj
```

See [apple/README.md](apple/README.md) for tests and device builds.

### Web and desktop app

Needs Node 22 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm --filter @studio/app build
pnpm --filter @studio/app exec vite preview --host 127.0.0.1 --port 4173
pnpm test
```

`pnpm tauri:build` builds the desktop app. [CLAUDE.md](CLAUDE.md#running-checks) lists every check.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Every change starts as an issue. Report security and privacy problems privately: see [SECURITY.md](SECURITY.md).

## Licensing

The code is licensed under MIT; see [LICENSE](LICENSE). The name, icon and the app's written content (journal prompts, invitations, micro-seasons, guided threads and onboarding copy) are all rights reserved; see [CONTENT-LICENSE.md](CONTENT-LICENSE.md) and [TRADEMARKS.md](TRADEMARKS.md). Bundled fonts, photographs and data keep their own licences; see [NOTICE.md](NOTICE.md).
