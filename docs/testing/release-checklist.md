# Ateliera MVP release checklist

This checklist is the release authority for Ateliera MVP. It distinguishes reproducible automated evidence from checks that require Anna, physical Apple devices, assistive technology, or signing credentials. A green build is necessary but does not by itself authorize a public release.

## Candidate identity

- Candidate version/tag:
- Git commit:
- Date and tester:
- Reference Mac and macOS version:
- iPhone/iOS version:
- Evidence bundle: `artifacts/release-evidence/`
- Known limitations reviewed: yes / no

Run the complete reproducible gate from a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm verify:release
```

The command must fail on any automated quality, security, accessibility, offline, performance-budget, PWA, restore, Rust, or packaging failure. Its machine-readable manifest and human summary belong in `artifacts/release-evidence/`; Playwright traces, screenshots, reports, build inventories, and package logs are referenced from there.

## Automated release proof

- [ ] Workspace typecheck, ESLint/stylelint, unit/integration tests, and production builds pass.
- [ ] Complete production E2E matrix passes in desktop Chromium, mobile Chromium, and desktop WebKit, with every skip named and justified.
- [ ] Visual and axe matrix passes at 1440×1000, 1024×768, and 390×844 after self-hosted fonts load.
- [ ] Keyboard flows, 200% zoom/text scaling, forced colors, reduced motion, missing images, long international strings, and 44px touch targets pass their automated checks.
- [ ] The complete local-first journey survives disposable-index destruction and rebuild without losing canonical Markdown or media.
- [ ] Warm shell, note-open, room-transition, search, save, and offline budgets meet the thresholds in the product bible on the recorded reference hardware or the release harness's conservative proxy budgets.
- [ ] The production PWA manifest, icons, service worker, complete precache, response security headers, and fresh offline navigation pass.
- [ ] No design prototype runtime, reference `.dc.html`, external font request, remote analytics, or private vault content appears in production routes, bundles, caches, or network evidence.
- [ ] Security regression, npm production dependency audit, target-aware macOS Rust audit, Rust tests, formatting, and clippy pass.
- [ ] The exact sample-vault backup → destructive restore → all-room rebuild drill passes.
- [ ] A macOS `.app` and distributable bundle are built from production assets, and their hashes and file inventories appear in the evidence bundle.

## Manual keyboard and VoiceOver gate

Run on the packaged macOS app, not only in a browser. Use keyboard alone first, then VoiceOver with Quick Nav off and on where appropriate.

- [ ] Open/create the local Studio and understand the seven-room navigation without visual-only instructions.
- [ ] Complete onboarding, change theme, move among rooms, invoke Search and Settings, and return focus after every overlay.
- [ ] Capture and edit a note; hear dirty, saving, saved, offline, conflict, and blocking-error status without duplicate announcements.
- [ ] Move/reorder a Landscape card through the keyboard/menu alternative, choose a destination, and hear its resulting position.
- [ ] Search, filter, open Inspector/backlinks, repair malformed metadata, and return to the originating control.
- [ ] Begin/review/close a season, including disposition choices and the archived season letter.
- [ ] Archive, Trash, restore, export a backup, preview a restore conflict, resolve it explicitly, and cancel safely.
- [ ] Confirm headings, landmarks, names, values, descriptions, reading order, and rotor navigation remain coherent in every room.
- [ ] Confirm visible focus is never hidden by sticky bars and all full-screen sheets have a persistent, named exit.

Record every defect, workaround, and intentionally deferred issue beside the candidate. Any P0–P2 accessibility finding blocks release.

## Manual responsive and display gate

- [ ] Inspect every room in all seven themes at 1440×1000, 1024×768, and 390×844.
- [ ] Inspect 200% browser zoom, macOS increased contrast, macOS reduced motion, and forced-colors emulation.
- [ ] Apply WCAG text-spacing overrides and the largest practical OS/browser text size; no content or action clips.
- [ ] Confirm long German-style compounds, right-to-left text fragments, emoji, combining Unicode, and unbroken user strings wrap or scroll only inside the intentional Landscape region.
- [ ] Remove or corrupt each optional user image; alt text and a quiet repair affordance remain, without broken layout.
- [ ] Confirm mobile sheets fit safe areas, the page has no global horizontal overflow, and every touch target is at least 44×44 CSS pixels.

## Installed PWA and offline gate

- [ ] Install the PWA fresh in supported desktop Chromium and confirm name, icon, standalone launch, and update behavior.
- [ ] Install/add the PWA on Safari on iPhone where supported; record any platform limitation rather than assuming parity with desktop filesystem access.
- [ ] Launch the installed PWA online once, then disable all network access and cold-launch it.
- [ ] While offline, read every room, capture/edit/save, search, reorganize, reflect, export a backup, and reload without data loss.
- [ ] Confirm local-only wording says “Stored locally” and no network failure blocks core work.
- [ ] Confirm private Markdown, attachments, exports, restored content, and diagnostics are absent from Cache Storage and network requests.

## Backup, restore, and ownership gate

- [ ] Export a backup from a realistic Studio and inspect the portable manifest and checksums.
- [ ] Restore into an empty Studio and compare all rooms, links, attachments, Trash, seasons, view state, and backups.
- [ ] Exercise create, overwrite, conflict, skip, cancel, stale-preview, and interrupted-recovery paths.
- [ ] Confirm the original vault and export remain usable after every rejected or interrupted restore.
- [ ] Open representative Markdown and media outside Ateliera to confirm data remains ordinary and user-owned.

## Privacy and security gate

- [ ] Review `docs/security/threat-model.md` and `docs/security/dependency-audit.md` against the candidate.
- [ ] Confirm no analytics, AI, sync, sharing, remote content, or diagnostic upload is silently enabled.
- [ ] Preview diagnostics and compare the exact exported bytes; no titles, bodies, paths, messages, or stacks appear.
- [ ] Confirm CSP, anti-framing, nosniff, no-referrer, permissions policy, Tauri capabilities, path containment, and import limits remain intact.
- [ ] Test on a shared/lost-device assumption: document that MVP data is not app-level encrypted and relies on device/account security.

## macOS packaging, signing, and notarization

The reproducible workflow intentionally carries no Apple credentials. Its `.app`/DMG output is signing-ready evidence, but is **not signed or notarized**. Never describe it as signed, notarized, or ready for external distribution until the following credentialed gate succeeds.

- [ ] Confirm bundle identifier `au.com.annamcphee.ateliera`, version, icon, display name, minimum window, privacy behavior, and included production assets.
- [ ] Sign the app and nested code with the intended Developer ID Application certificate.
- [ ] Verify with `codesign --verify --deep --strict --verbose=2` and record certificate/team identity.
- [ ] Submit to Apple notary service, wait for acceptance, staple the ticket, and retain the notarization log.
- [ ] Verify with `spctl --assess --type execute --verbose=4` on a clean Mac user account.
- [ ] Fresh-install the signed/notarized artifact, complete the core journey, upgrade over the previous candidate, and verify vault preservation.

Unavailable credentials are a documented manual blocker, never an automated pass. A private local development build may proceed; public distribution may not.

## Release decision and known limitations

Required MVP limitations to communicate clearly:

- Browser and native vault capabilities differ; iPhone Safari cannot promise desktop-equivalent filesystem behavior.
- There is no encrypted sync, app lock, cloud account, collaborative sharing, AI dependency, or remote diagnostics upload in MVP.
- Device compromise, unlocked shared accounts, unencrypted backups, and user-enabled cloud/Git folders can expose private content.
- Browser ZIP32 portability is bounded and is not the later streaming 5 GB reference-vault exporter.
- VoiceOver, installed PWA, code signing, notarization, Gatekeeper, and clean-device installation remain manual gates.
- Inner Studio is optional/post-MVP and must not be represented as an active therapeutic or guided-session feature.

Decision:

- [ ] Automated evidence reviewed and complete.
- [ ] Manual gates complete or each blocker explicitly recorded.
- [ ] No open P0–P2 defects.
- [ ] Backup retained and destructive restore witnessed.
- [ ] Privacy limitations accepted.
- [ ] Candidate approved by Anna for its stated distribution scope.

