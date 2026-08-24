# ADR-010: Studio preferences as portable, non-projected configuration

- Status: accepted
- Date: 2026-08-23

## Context

To reduce first-run overwhelm (see `docs/superpowers/plans/2026-08-23-ateliera-calm-entry-and-guidance.md`), the Studio needs per-Studio user configuration: which rooms and Foyer sections are shown, whether each rhythm layer (moon, micro-season, body cycle) is displayed, and which guided-reveal offers have already been made. None of this is derivable from the Markdown notes, so it cannot live in the disposable SQLite index (ADR-008), and it is not itself a note.

The rhythm profile already established a pattern for small, user-owned configuration that is neither a note nor an index projection: a versioned JSON file under `.studio/config/`, read and written through the `VaultPort`, surfaced to the UI through an application-layer repository and a React hook.

## Decision

Studio preferences follow that established pattern rather than introducing a new mechanism.

- **Storage.** A single versioned JSON file at `.studio/config/studio-preferences.json`, written atomically through the `VaultPort` with optimistic revision (`expectedHash` / `expectedMissing`), a 64 KiB byte cap, and a `version` envelope that refuses to downgrade a newer file.
- **Sparse overrides.** Every field is optional; an absent key means "use the default," resolved in the settings feature. The file stores only deviations from default, so an untouched Studio has no file and behaves entirely by default.
- **Layering.** `StudioPreferencesRepository` lives in `@studio/application` (`createStudioPreferencesRepository`, exposed as `StudioService.preferences`). The React hook and settings panels live in `apps/studio`. The on/off switch components live in `@studio/ui` and remain pure — preference state arrives via props and is saved via callbacks; the UI package touches no storage.
- **Structural, not vocabulary, validation.** The repository validates value *shapes* (`'on' | 'off'`, booleans, `'accepted' | 'dismissed'`) but not the *identifiers* of rooms, sections, or reveals. The set of rooms is a UI concern; keeping it out of the application layer means new rooms need no repository change, and unknown keys from a future build are simply ignored at resolution time rather than treated as corruption.
- **Recoverability.** A malformed, oversized, or well-shaped-but-invalid file loads as empty preferences (all defaults) with `repairRequired: true`, and the malformed bytes are never overwritten silently — identical to the rhythm-profile contract.
- **No regression for existing Studios.** Absence of the file means "keep current behaviour": all rhythm layers on, all rooms and sections shown as before. New-Studio defaults (small core, reduced Foyer) are applied by the settings feature keyed off the existing first-visit onboarding state, not by the repository.

## Consequences

- Preferences are canonical user configuration, not a projection: they are backed up and restored with the vault (`.studio/config/` is already swept by `packages/storage/src/portability.ts`), and survive an index rebuild untouched.
- Preferences are portable with the Studio Space and never mixed into Markdown notes.
- The moon, micro-season, and cycle layers become display switches; turning the cycle layer off never deletes cycle data in the rhythm profile.
- Adding a new preference is: extend `StoredStudioPreferences`, add structural validation, add a control in a settings panel, and resolve its default in the feature — no change to notes, index, or storage adapters.
