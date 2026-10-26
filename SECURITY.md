# Security policy

Ateliera holds some of the most private things a person writes: journal entries, dreams, intentions, birth details and menstrual cycle data. A bug that exposes any of it is a security bug.

## Report privately

Report vulnerabilities through this repository's [security advisory form](https://github.com/hello-nova-claw/ateliera/security/advisories/new). Do not open a public issue, pull request or discussion.

Say what you found, which version or commit, which device and OS, and the steps to reproduce it. You will get a reply within seven days.

## Privacy bugs are security bugs

Report these the same way:

- Data leaves the device without the user turning that on, or goes somewhere other than what [docs/privacy.md](docs/privacy.md) says.
- Entry text, cycle data or birth details appear where they should not: logs, notifications, widgets, Spotlight, Siri, the app switcher, or another app.
- Files holding personal data are written without file protection.
- Export leaves something out, or delete leaves something behind.
- The app lock can be bypassed.

## Do not send your own data

Never include real journal entries, dreams, cycle data, birth details or screenshots of your own entries in a report. Describe them instead, or reproduce the problem with invented data.

## Supported versions

Only the latest release on the App Store, and `main`, get security fixes.
