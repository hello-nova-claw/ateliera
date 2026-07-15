# Ateliera — Agent Instructions

## Product sources of truth

- Read `docs/product/The-Studio-PRD-Design-Bible.md` before implementation.
- Read `docs/superpowers/plans/2026-07-13-the-studio-mvp.md` before implementation.
- Check `development-log.md` for the current phase and completed work.

## Workflow

- Use test-driven development: write and observe a failing test before production code.
- Make small, atomic commits with one-line conventional commit messages.
- Commits are authored solely by Anna McPhee, with no co-author or AI attribution.
- Verify visible changes in a real browser with Playwright screenshots at desktop and mobile widths.
- Preserve user-authored and unrelated changes.

## CSS and accessibility

- Use BEM CSS naming, semantic classes, and CSS custom properties.
- Never use `!important`.
- Target WCAG 2.2 AA and provide keyboard alternatives for drag-and-drop.

## Product constraints

- Markdown and ordinary media files are authoritative; indexes are disposable.
- Core behavior works offline and without AI.
- No streaks, overdue badges, gamification, compulsory check-ins, or guilt-inducing counts.
- Unknown YAML frontmatter keys survive read/write cycles.
- All file writes are atomic, path-contained, schema-validated, recoverable, and tested.
