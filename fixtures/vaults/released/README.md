# Released vault formats

One folder per released vault format, added on release day by the release checklist (`docs/release-checklist.md`):

- `v1/`: a vault written by the 1.0 release, with every kind of note and `.studio/` file, all invented.
- `v1/expected.json`: what each note must read back as (id, title, body and every frontmatter key).

`apple/AtelieraTests/VaultFormatMigrationTests.swift` opens every folder here with the current code and checks that nothing was lost. Never edit a released fixture: add a new folder for the next format, and a migration.

Until 1.0 ships the folder is empty, and the test only round-trips the current format.
