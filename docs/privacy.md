# How Ateliera handles personal data

This file describes what the apps actually do today, checked against the code. It must match both `PrivacyInfo.xcprivacy` files and, at each submission, the App Store privacy label. Any pull request that changes how data is stored, shown or sent updates this file in the same pull request.

Where the apps fall short of the design principles in [docs/design.md](design.md#2-design-principles-not-negotiable), the gap is listed with its issue. A gap is not a promise kept.

Last checked against the code: 27 October 2026.

## Summary

- The developer collects nothing. There is no account, server, analytics, crash-reporting, advertising or attribution SDK.
- Journal entries live in a vault: a folder of Markdown files the user chooses.
- Data leaves the device in only these ways:
  - place lookups go to Apple's geocoder;
  - the vault syncs if the user keeps it in iCloud Drive;
  - the user exports or shares a backup;
  - the user opens a link from an entry in their browser.
- Apple app: Health samples are read on the device and the derived cycle is kept in memory. One trace persists: a dismissed invitation's ID can name the cycle phase it was shown in (see the `UserDefaults` row).
- Web app: no Health access. A last period start and average length the user types in are stored in the vault (#151).

## What is personal here

- Journal entries, reflections, dreams, gratitude, intentions and possibilities, with their titles, tags and attachments.
- Birth date, time, place, coordinates and time zone (for the natal chart).
- Home place and its coordinates.
- Menstrual flow from Health, and the cycle day and phase derived from it.
- Unsaved drafts.

## Apple app (`apple/`)

### Where data is stored

| Data | Where | Protection | Source |
|---|---|---|---|
| Notes, media, and the vault's `.studio/` settings, views and config | The vault folder the user picks. The app keeps a bookmark to it. | The iOS default class, `completeUntilFirstUserAuthentication`. No class is set. Gap: #130. | `Ateliera/VaultStore.swift`, `AtelieraVaultCore/src/lib.rs` |
| Revisions (30 days) and trash | Vault `.studio/backups/`, `.studio/trash/` | Default. Gap: #130. | `Ateliera/DataManagement/RevisionStore.swift` |
| On-device AI wording cache | Vault `.studio/cache/micro-seasons.json`. Its key includes the home place name. Gap: #134. | Default | `Ateliera/Rhythm/MicroSeasonStore.swift` |
| Vault bookmark | `UserDefaults` `ateliera.vault.bookmark` | Default | `Ateliera/VaultStore.swift` |
| **Unsaved draft text and title** | `UserDefaults` `studio:draft-recovery:<vault>:<note>`, written on every keystroke. Cancel doesn't clear it. Gap: #40. | Default | `Ateliera/DataManagement/DraftRecovery.swift` |
| **Birth date, time, place, coordinates, zone** | `UserDefaults` `ateliera.birthdata`. Not exported or deleted. Gap: #131. | Default | `Ateliera/Rhythm/RhythmSettings.swift` |
| **Home place and coordinates** | `UserDefaults` `ateliera.homeplace`. Gap: #131. | Default | `Ateliera/Rhythm/HomePlaceStore.swift` |
| Preferences, sky layers, tour seen, dismissed invitations, migration flag | `UserDefaults` `studio:preferences:*`, `studio:sky-layers:*`, `studio:tour-seen:*`, `studio:invitations-dismissed:*`, `ateliera.inbox-journal-migrated:*`. Per-vault keys contain the vault's folder path. Dismissed invitation IDs can include a cycle phase name. | Default | `Ateliera/Settings/StudioPreferences.swift`, `Ateliera/Foyer/Invitation.swift` |
| Theme, hemisphere | `UserDefaults` `ateliera.theme`, `ateliera.hemisphere` | Default | `Ateliera/Theme/ThemeStore.swift`, `Ateliera/Shared/SharedStore.swift` |
| Search index | Memory only. Never written. | n/a | `Ateliera/Search/SearchIndex.swift` |
| Cycle (from Health) | Memory only. Never written. | n/a | `Ateliera/Rhythm/HealthCycleSource.swift`, `Ateliera/RootView.swift` |
| Export ZIP | `tmp/Ateliera-backup.zip`, written with `Data.write` and never deleted. Gap: #36. | None | `Ateliera/DataManagement/ExportView.swift` |

- **Keychain:** not used.
- **Database:** none. There is no SwiftData, Core Data or SQLite.
- **App group:** none.
- **Backups:** nothing is excluded from device backup, so `UserDefaults` and the app container go into iCloud or computer backups when the user has those turned on.

### What leaves the device

| Where it goes | What is sent | When | Source |
|---|---|---|---|
| Apple's geocoder (`CLGeocoder`), reverse lookup | Device coordinates, to name the home place. The hemisphere is worked out on the device from the latitude, without the geocoder. | On every launch when location is allowed, and from "Use my location". Gap: #34. | `Ateliera/Rhythm/LocationHemisphere.swift`, `Ateliera/Rhythm/PlaceGeocoder.swift` |
| Apple's geocoder, forward lookup | The birthplace or home place name the user types | When the user searches for a place | `Ateliera/Rhythm/PlaceGeocoder.swift` (`search`) |
| Apple's geocoder, reverse lookup | The coordinates of the place just found | During a place search, when the first answer has no time zone | `Ateliera/Rhythm/PlaceGeocoder.swift` (`search`) |
| The user's iCloud Drive | The whole vault, including `.studio/` | Only if the user picked a vault in iCloud Drive. Apple syncs it to the user's own account. | Folder chosen in `Ateliera/RootView.swift` |
| Wherever the user shares it | The export ZIP (contents below) | When the user taps Export and chooses a destination | `Ateliera/DataManagement/ExportView.swift`, `PortableManifest.swift` |
| The default browser | A link the user taps in an entry | When the user taps it | `Ateliera/Note/BodyPreviewView.swift` |

The app contains no `URLSession`, web view, analytics or third-party SDK. The macOS build has the `network.client` entitlement; the geocoder is the only thing that uses it.

The location permission text says location "stays on your device". That is wrong while the geocoder runs. Gap: #34.

### Permissions

| Permission | What for | Asked when | Gap |
|---|---|---|---|
| Health, read menstrual flow only (`NSHealthShareUsageDescription`) | Cycle day and phase in the almanac and Foyer. Nothing is written to Health. | At first launch | Should be asked when the user turns the cycle on: #35 |
| Location when in use (`NSLocationWhenInUseUsageDescription`) | Hemisphere, and a starting home place | At first launch | #35; the wording is inaccurate: #34 |
| Folder access | The vault | When the user chooses or creates a vault | — |

### Outside the app

- **Widget:** shows the season, micro-season and moon only. No cycle data, no entries, no AI wording. `AtelieraWidgets/RhythmWidget.swift`.
- **Siri and Shortcuts:** one intent, "Today's rhythm", which reads out the season and moon. No cycle data. `Ateliera/Intents/TodaysRhythmIntent.swift`.
- **Notifications, Spotlight, Handoff, Live Activities, clipboard writes:** none. There is no `UserNotifications`, `CoreSpotlight`, `NSUserActivity`, `ActivityKit` or `UIPasteboard` anywhere in `apple/Ateliera/` or `apple/AtelieraWidgets/`. The user can select and copy text themselves (`Ateliera/Note/BodyPreviewView.swift`).
- **App switcher:** shows the last screen, including entry text. There is no `scenePhase` handling and no app lock (`Ateliera/AtelieraApp.swift`). Gap: #133.
- **Logs:** the app writes no logs. There is no `print`, `os_log` or `Logger` in Swift, and no logging in `AtelieraVaultCore/src/`. A diagnostics buffer holds operation names, outcomes, error codes and note IDs in memory only, never note content (`Ateliera/DataManagement/DiagnosticsRecorder.swift`, fed by `VaultStore.saveEdit`).
- To recheck: `git grep -n -E "UserNotifications|CoreSpotlight|NSUserActivity|ActivityKit|UIPasteboard|scenePhase|os_log|Logger\(|print\(" -- 'apple/*.swift'`.

### On-device AI

- Apple's Foundation Models framework, on the device, when Apple Intelligence is available. It is on by default and can be turned off in Settings.
- Input: the season, moon phase, standard micro-season, climate band, hemisphere and home place name.
- Never input: journal text, cycle data or birth details.
- Output: micro-season wording shown in the almanac and season views, cached in the vault. It is never written into a note. `Ateliera/Rhythm/FoundationModelsPersonalizer.swift`.

### Export and delete

- **Export:** a ZIP with a SHA-256 manifest, four taps from the main screen. It includes:
  - every note and media file, except active file types the export refuses (`html`, `js`, `svg`, `sh` and others; full list in `Ateliera/DataManagement/PortableManifest.swift`);
  - the vault's `.studio/` settings, config, views, seasons, revisions and trash.

  It leaves out caches and the index, and everything in `UserDefaults`: birth data, home place and preferences (#131).
- **Delete:** a note can be moved to the trash. There is no "delete everything" (#132). Deleting the app removes `UserDefaults` and the app container. It does not remove a vault in iCloud Drive or another folder the user picked.

### Privacy manifests

- `Ateliera/PrivacyInfo.xcprivacy`:
  - no tracking, no tracking domains, no collected data types;
  - required-reason APIs: `UserDefaults` (`CA92.1`) and file timestamps (`C617.1`).
  - The timestamp reason may be wrong for files in a user-selected vault: #39.
- `AtelieraWidgets/PrivacyInfo.xcprivacy`: no tracking, `UserDefaults` (`CA92.1`).
- These agree with this file: the developer collects no data. Apple's geocoder is Apple's processing for the user, not collection by the developer.

## Web and desktop app (`apps/studio`, `packages/*`)

### Where data is stored

| Data | Where | Source |
|---|---|---|
| Vault (browser) | The browser's origin-private storage (OPFS), or IndexedDB `ateliera-browser-vaults` where OPFS is missing | `packages/storage/src/browser-vault.ts` |
| Vault (desktop) | A folder the user picks on disk, written by the Rust core | `apps/studio/src-tauri/src/` |
| Rhythm profile: hemisphere, birth details, natal placements, and a typed-in last period start and average cycle length | The vault, `.studio/config/rhythm-profile.json`, exported with it. The cycle dates are #151. | `packages/application/src/rhythm-profile-repository.ts` |
| Settings | The vault, `.studio/settings.json` | `packages/application/src/onboarding-settings.ts` |
| List of browser studios, active studio, studio name, theme | `localStorage` `studio:browser-studios`, `studio:active-browser-studio`, `studio:name`, `studio:theme` | `apps/studio/src/app/browser-studios.ts`, `App.tsx`, `providers.tsx` |
| Unsaved capture draft | `sessionStorage`, cleared when the tab closes | `apps/studio/src/features/capture/browser-draft-recovery.ts` |
| App shell (code, fonts, icons) | Service worker cache. Never entries. | `apps/studio/src/app/service-worker.ts` |
| Search index | SQLite in a Web Worker, rebuilt from the vault | `packages/index/` |

### What leaves the device

Nothing. The content security policy allows connections only to the app's own origin (`apps/studio/index.html`) and, on desktop, to Tauri's internal IPC (`apps/studio/src-tauri/tauri.conf.json`). Fonts are self-hosted (`apps/studio/src/assets/fonts/`). The places list for birthplace search is a bundled file loaded from the app's own origin (`packages/rhythm/src/places-data.js`). The service worker caches and serves only the app's own files (`apps/studio/src/app/service-worker.ts`). The only `fetch` calls are to the app's own origin: the app-shell version check in `apps/studio/src/app/App.tsx` and the service worker. `bin/check-privacy` allows network code in these two files only.

### Permissions

None beyond the folder the desktop user picks.

## Rules for changes

- New personal data uses `.complete` file protection, or this file records why not.
- No new outbound connection unless it is on the allowlist in `bin/check-privacy` and listed here with its reason.
- Entry text, cycle data and birth details never go into logs, notifications, widgets, Spotlight or Siri unless the user turned that on.
- Every new kind of data is added to export and delete, with a test.
- `PrivacyInfo.xcprivacy`, entitlements and usage strings change only together with this file.
