# Released vault formats

One folder per released vault format, added on release day by the release checklist (`docs/release-checklist.md`):

- `v1/`: a vault written by the 1.0 release, with every kind of note and `.studio/` file, all invented.
- `v1/expected.json`: for each note file, the `id`, `title` and `body` it must read back as, as strings. A note with no title has no `title` entry.

`apple/AtelieraTests/VaultFormatMigrationTests.swift` opens every folder here with the current code. It checks each note's id, title and body against `expected.json`, and that every frontmatter key, unknown keys included, survives a save. Never edit a released fixture: add a new folder for the next format, and a migration.

Until 1.0 ships the folder is empty, and the test only round-trips the current format.
