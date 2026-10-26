# Fixtures

Every vault, note, preview and screenshot used in tests is invented.

- Never copy a real journal entry, dream, intention, cycle, birth detail or place into a fixture, a preview or an issue. That includes the maintainer's own.
- Names, dates and places in fixtures are made up. Birth data uses obviously synthetic values.
- Today, tests build their notes from explicit arrays of invented notes. Generated test data, when it comes, uses a seeded generator, so every run produces the same invented data.
- Screenshots are taken from fixture vaults with a fixed clock and time zone, never from a real vault.

`vaults/sample` is the small sample vault used by the restore drill and the parser tests. `vaults/malformed-frontmatter` holds notes that must be rejected.
