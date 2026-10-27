# Release checklist

Work through this for every release of the Apple app. Tick each box in the release's issue, not here.

## First submission (1.0 only)

Do these once, before the first build goes to App Review.

- [ ] **Freeze the vault format as version 1.**
  - Write a fixture vault with the release build into `fixtures/vaults/released/v1/`: every kind of note and every `.studio/` file, all invented.
  - Write `fixtures/vaults/released/v1/expected.json` with each note's id and body.
  - Confirm `VaultFormatMigrationTests` passes.
- [ ] **Switch CodeRabbit to the post-release rule.** In `.coderabbit.yaml`, change the vault-format path instructions from "before 1.0" to "every format change needs a migration and a migration test". Update the Privacy section of `CONTRIBUTING.md` to match.
- [ ] **App Store privacy label.** In App Store Connect, answer "Data Not Collected". Check every answer against `docs/privacy.md`.
- [ ] **Privacy policy.**
  - Every gap listed at the top of `docs/privacy-policy.md` is closed.
  - Anna has approved the wording, and the draft comment is removed.
  - GitHub Pages serves it at `https://hello-nova-claw.github.io/ateliera/privacy-policy`.
  - The URL is entered in App Store Connect and linked from the app (#48).
- [ ] **HealthKit.** The App ID has the HealthKit capability. The app shows clearly where Health data is used (Guideline 2.5.1).
- [ ] **Age rating.** Answer the questionnaire for wellness and astrology content (#53). The rating must match the age line in the privacy policy.
- [ ] **Screenshots and metadata.**
  - App Store screenshots for 6.9" and 6.5" iPhone and 13" iPad, taken from fixture vaults with invented data only.
  - Name, subtitle, description, keywords, support URL and privacy policy URL.
  - The description makes no medical, fertility or contraceptive claims.
- [ ] **Review notes for App Review:**
  - The app has no account and needs no login.
  - It collects nothing; entries stay on the device or in the user's own iCloud Drive.
  - Health access is read-only menstrual flow, used on the device and never stored.
  - Cycle days and phases are estimates, not medical advice.
  - Location is used for the hemisphere and the user's home place. Place names are looked up with Apple's geocoder.
  - The on-device model words the season and never sees journal text.
- [ ] **Export compliance.** `ITSAppUsesNonExemptEncryption` is `false` (#51).

## Every release

- [ ] All issues in the release's milestone are closed or moved to a later one.
- [ ] `main` is green: every required check passed on the release commit.
- [ ] `pnpm changelog` has folded the fragments into `CHANGELOG.md`, and the `## Unreleased` heading is renamed to the version and date.
- [ ] `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `apple/project.yml` are bumped.
- [ ] **Privacy:**
  - `PrivacyInfo.xcprivacy` (app and widget) lists every required-reason API the code uses, with the right reason.
  - `docs/privacy.md` describes this release exactly, and its "Last checked against the code" date is updated.
  - The App Store privacy label still matches `docs/privacy.md`.
  - The privacy policy URL loads, and the policy still matches `docs/privacy.md`.
- [ ] **Vault format.**
  - If the format changed since the last release, a migration and its test are in.
  - A new fixture folder `fixtures/vaults/released/v<N>/` is committed for the format being released.
  - `VaultFormatMigrationTests` opens every released format.
- [ ] **By hand on a real device**, with an invented vault:
  - export everything, delete everything, then import the export, and check that nothing is missing;
  - turn on the app lock and check the app switcher;
  - deny Health and location and check that the app still works.
- [ ] The weekly "Apple tests on iOS 17" job passed on the release commit. Run it by hand from the Actions tab if needed.
- [ ] A TestFlight build has been tried by hand before submission.
- [ ] Tag the release commit `v<version>` and publish GitHub release notes from `CHANGELOG.md`.
