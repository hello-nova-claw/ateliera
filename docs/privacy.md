# How Ateliera handles personal data

This file describes what the apps actually do today, checked against the code. It must match both `PrivacyInfo.xcprivacy` files and, at each submission, the App Store privacy label. Any pull request that changes how data is stored, shown or sent updates this file in the same pull request.

Where the apps fall short of the design principles in [docs/design.md](design.md#2-design-principles-not-negotiable), the gap is listed with its issue. A gap is not a promise kept.

Last checked against the code: 27 October 2026.

## Summary

- The developer collects nothing. There is no account, server, analytics, crash-reporting, advertising or attribution SDK.
- Journal entries live in a vault: a folder of Markdown files the user chooses.
- Data leaves the device in only three ways:
  - the vault syncs if the user keeps it in iCloud Drive;
  - place lookups go to Apple's geocoder;
  - the user exports or shares a backup themselves.
- Cycle data is read from Health on the device, kept in memory, and never stored.

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
| Notes, media, `.studio/` settings, views and config | The vault folder the user picks. The app keeps a bookmark to it. | The iOS default class, `completeUntilFirstUserAuthentication`. No class is set. Gap: #130. | `Ateliera/VaultStore.swift`, `AtelieraVaultCore/src/lib.rs` |
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
| Apple's geocoder (`CLGeocoder`) | Device coordinates, to find the place name and hemisphere | On every launch when location is allowed. Gap: #34. | `Ateliera/Rhythm/LocationHemisphere.swift`, `Ateliera/Rhythm/PlaceGeocoder.swift` |
| Apple's geocoder | The birthplace or home place the user types | When the user searches for a place | `Ateliera/Rhythm/PlaceGeocoder.swift` |
| The user's iCloud Drive | The whole vault, including `.studio/` | Only if the user picked a vault in iCloud Drive. Apple syncs it to the user's own account. | Folder chosen in `Ateliera/RootView.swift` |
| Wherever the user shares it | The export ZIP: every note, revision and trashed note | When the user taps Export and chooses a destination | `Ateliera/DataManagement/ExportView.swift`, `PortableManifest.swift` |
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
- **Notifications:** none.
- **Spotlight, Handoff, Live Activities:** none.
- **Clipboard:** the app never writes to it. The user can select and copy text.
- **App switcher:** shows the last screen, including entry text. There is no app lock. Gap: #133.
- **Logs:** the app writes no logs. There is no `print`, `os_log` or `Logger` in Swift and no logging in the Rust core. A diagnostics buffer holds operation names and error codes in memory only.

### On-device AI

- Apple's Foundation Models framework, on the device, when Apple Intelligence is available. It is on by default and can be turned off in Settings.
- Input: the season, moon phase, standard micro-season, climate band, hemisphere and home place name.
- Never input: journal text, cycle data or birth details.
- Output: micro-season wording shown in the almanac and season views, cached in the vault. It is never written into a note. `Ateliera/Rhythm/FoundationModelsPersonalizer.swift`.

### Export and delete

- **Export:** a ZIP of every note, media file, revision and trashed note, with a SHA-256 manifest. It is four taps from the main screen. Settings, birth data and home place are not included (#131).
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
| Birth details and home place | The vault, `.studio/config/rhythm-profile.json` (exported with it) | `packages/application/src/rhythm-profile-repository.ts` |
| Settings | The vault, `.studio/settings.json` | `packages/application/src/onboarding-settings.ts` |
| List of browser studios, active studio, studio name, theme | `localStorage` `studio:browser-studios`, `studio:active-browser-studio`, `studio:name`, `studio:theme` | `apps/studio/src/app/browser-studios.ts`, `App.tsx`, `providers.tsx` |
| Unsaved capture draft | `sessionStorage`, cleared when the tab closes | `apps/studio/src/features/capture/browser-draft-recovery.ts` |
| App shell (code, fonts, icons) | Service worker cache. Never entries. | `apps/studio/src/app/service-worker.ts` |
| Search index | SQLite in a Web Worker, rebuilt from the vault | `packages/index/` |

### What leaves the device

Nothing. The content security policy allows connections only to the app's own origin (`apps/studio/index.html`) and, on desktop, to Tauri's internal IPC (`apps/studio/src-tauri/tauri.conf.json`). Fonts are self-hosted. The places list for birthplace search is bundled, not fetched. The service worker fetches only the app's own files.

### Permissions

None beyond the folder the desktop user picks.

## Rules for changes

- New personal data uses `.complete` file protection, or this file records why not.
- No new outbound connection unless it is on the allowlist in `bin/check-privacy` and listed here with its reason.
- Entry text, cycle data and birth details never go into logs, notifications, widgets, Spotlight or Siri unless the user turned that on.
- Every new kind of data is added to export and delete, with a test.
- `PrivacyInfo.xcprivacy`, entitlements and usage strings change only together with this file.
