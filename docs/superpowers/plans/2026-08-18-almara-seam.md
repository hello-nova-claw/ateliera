# The Almara Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold Almara's rhythm/resurfacing engine into Ateliera — a Gift (a real resurfaced card or a calm fallback) appears in the Foyer, ranked by moon/cycle/season/natal position, and can be kept as a real card via the existing capture-placement system.

**Architecture:** `packages/rhythm` (already extracted, pure computation, no vault access) is merged in first. A resurfacing candidate pool is built by querying Ateliera's existing `packages/index` for cards with new opt-in frontmatter fields. A new rhythm-profile repository stores birth/location/cycle config the same way Wisdom theme preferences are stored. A new Foyer component wires all of it together and routes "Keep" through the existing `capturePlacements` table.

**Tech Stack:** pnpm workspace monorepo, TypeScript, React 19, Vitest, Zod (frontmatter schema), Tauri (not touched by this plan).

## Global Constraints

- Work happens in `~/manuka-apps/ateliera/.worktrees/studio-mvp` (NOT the top-level `~/manuka-apps/ateliera` checkout — that's a separate worktree used only for docs/spec commits to `main`).
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` must stay green after every task. Run all three before every commit.
- TDD: write the failing test first, watch it fail, then implement.
- Every commit message is a single line, imperative mood, no "Co-Authored-By" or any Claude attribution (repo owner's standing instruction — this applies to every commit in this plan, no exceptions).
- Follow existing precedent exactly where one exists — this repo already solved "add an optional frontmatter field" (commit `5fc7f65`) and "atomic versioned config file" (`packages/application/src/wisdom-theme-repository.ts`). Match their shape, don't invent a new one.
- `resurface_kind` is opt-in, never auto-assigned (spec §4) — no task in this plan should add automatic classification logic.
- Almara's ambient season concept is called "the year-wheel" in any new code/comments that need to distinguish it from Ateliera's Current Season room — never call it "season" in a context that could collide.

---

## Parallelization map

For subagent fan-out: Task 1 must run alone, first. After it lands, Tasks 2, 4, and 6 are mutually independent — fan out 3 subagents. Once those land, Tasks 3, 5, and 7 are mutually independent — fan out 3 more. Task 8 is last, alone, and depends on 3, 4, and 6 (not on 5 or 7, though the app is more realistically testable with them done).

```
Task 1 (merge)
   |
   +--> Task 2 (frontmatter fields)  --+
   +--> Task 4 (profile repository)  --+--> Task 8 (Foyer integration)
   +--> Task 6 (capture routing)     --+
        |                                |
        v                                |
   Task 3 (pool query, needs 2) ---------+
   Task 5 (Settings UI, needs 4)
   Task 7 (CardEditor action, needs 2)
```

---

### Task 1: Merge `feat/rhythm-extraction`

**Files:** none — this is a git merge, no file edits.

**Interfaces:**
- Produces: `packages/rhythm` on the working branch, with its full public API (`export * from './natal-chart' | './resurfacing' | './rhythm' | './timezone' | './types'`) available to every later task via `@studio/rhythm`.

- [ ] **Step 1: Confirm the branch is still green**

Run: `cd ~/manuka-apps/ateliera/.worktrees/studio-mvp && git log feat/studio-mvp..feat/rhythm-extraction --oneline`
Expected: the 5 commits (`8acc0fd`, `05a1404`, `2a922a1`, `259029c`, `ce3edf2`) still there.

- [ ] **Step 2: Merge into the working branch**

```bash
cd ~/manuka-apps/ateliera/.worktrees/studio-mvp
git checkout feat/studio-mvp
git merge feat/rhythm-extraction --no-ff -m "merge: land the extracted rhythm engine"
```

- [ ] **Step 3: Verify the whole workspace is still green**

Run: `pnpm install && pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass, including `@studio/rhythm`'s 60 tests (this was already verified on the branch — this step confirms the merge didn't change that).

No separate commit needed — the merge commit from Step 2 is the deliverable.

---

### Task 2: Add `resurface_kind` / `resurface_due` / `resurface_interval_days` frontmatter fields

**Files:**
- Modify: `packages/content/src/frontmatter-schema.ts`
- Modify: `packages/domain/src/note.ts` (StudioNote interface, currently at lines 23-48)
- Modify: `packages/content/src/parse-note.ts`
- Modify: `packages/content/src/serialize-note.ts`
- Test: `packages/content/src/parse-note.test.ts`

**Interfaces:**
- Consumes: nothing new — this is additive to existing types.
- Produces: `StudioNote.resurfaceKind?: 'evidence' | 'reframe' | 'wish' | 'dream'`, `StudioNote.resurfaceDue?: string` (ISO `YYYY-MM-DD`), `StudioNote.resurfaceIntervalDays?: number`. Task 3 and Task 7 both depend on these three fields existing on `StudioNote` and round-tripping through `parseNote`/`serializeNote`.

This follows commit `5fc7f65` exactly (which added `source_notes`/`sourceNoteIds` the same way) — same four files, same shape of change, three fields instead of one.

- [ ] **Step 1: Write the failing round-trip test**

Add to `packages/content/src/parse-note.test.ts`, inside the existing `describe('parseNote', ...)` block that already tests `source_notes` round-tripping (find the test using `.replace('attachments: []', 'source: ...\nsource_notes: [...]\nattachments: []')` and extend it):

```ts
  it('round-trips resurface fields', () => {
    const fixture = validFixture()
      .replace(
        'attachments: []',
        'resurface_kind: evidence\nresurface_due: 2026-09-01\nresurface_interval_days: 6\nattachments: []',
      );
    const parsed = parseNote(fixture);
    expect(parsed.ok && parsed.note).toMatchObject({
      resurfaceKind: 'evidence',
      resurfaceDue: '2026-09-01',
      resurfaceIntervalDays: 6,
    });
    if (parsed.ok) {
      const reparsed = parseNote(serializeNote(parsed.note));
      expect(reparsed.ok && reparsed.note).toMatchObject({
        resurfaceKind: 'evidence',
        resurfaceDue: '2026-09-01',
        resurfaceIntervalDays: 6,
      });
    }
  });

  it('omits resurface fields from serialized output when absent', () => {
    const parsed = parseNote(validFixture());
    expect(parsed.ok && parsed.note.resurfaceKind).toBeUndefined();
    if (parsed.ok) {
      expect(serializeNote(parsed.note)).not.toContain('resurface_kind');
    }
  });
```

(Match whatever the existing fixture helper is actually called in that file — it's referred to as `validFixture()` above as a stand-in; use the same helper the neighboring `source_notes` test already uses.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @studio/content test -- parse-note`
Expected: FAIL — `resurfaceKind` is `undefined`, not `'evidence'` (the field doesn't exist yet).

- [ ] **Step 3: Add the fields to the frontmatter schema**

In `packages/content/src/frontmatter-schema.ts`, add to `recognizedFrontmatterKeys` (after `'source_notes'`, before `'attachments'`):

```ts
  'resurface_kind',
  'resurface_due',
  'resurface_interval_days',
```

Add to `frontmatterSchema`, in the same position:

```ts
  resurface_kind: z.enum(['evidence', 'reframe', 'wish', 'dream']).optional(),
  resurface_due: z.iso.date().optional(),
  resurface_interval_days: z.number().int().positive().optional(),
```

(`z.iso.date()` matches the `YYYY-MM-DD` format already used for `ResurfaceCard.dueDate` in `packages/rhythm/src/types.ts`.)

- [ ] **Step 4: Add the fields to StudioNote**

In `packages/domain/src/note.ts`, add after `sourceNoteIds?: string[];` (line 39):

```ts
  resurfaceKind?: 'evidence' | 'reframe' | 'wish' | 'dream';
  resurfaceDue?: string;
  resurfaceIntervalDays?: number;
```

- [ ] **Step 5: Wire parsing**

In `packages/content/src/parse-note.ts`, immediately after the existing block:
```ts
  if (data.source_notes !== undefined)
    note.sourceNoteIds = [...new Set(data.source_notes)];
```
add:
```ts
  if (data.resurface_kind !== undefined) note.resurfaceKind = data.resurface_kind;
  if (data.resurface_due !== undefined) note.resurfaceDue = data.resurface_due;
  if (data.resurface_interval_days !== undefined)
    note.resurfaceIntervalDays = data.resurface_interval_days;
```

- [ ] **Step 6: Wire serialization**

In `packages/content/src/serialize-note.ts`, immediately after the existing block:
```ts
    ...(note.sourceNoteIds === undefined
      ? {}
      : { source_notes: note.sourceNoteIds }),
```
add:
```ts
    ...(note.resurfaceKind === undefined
      ? {}
      : { resurface_kind: note.resurfaceKind }),
    ...(note.resurfaceDue === undefined
      ? {}
      : { resurface_due: note.resurfaceDue }),
    ...(note.resurfaceIntervalDays === undefined
      ? {}
      : { resurface_interval_days: note.resurfaceIntervalDays }),
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @studio/content test -- parse-note`
Expected: PASS, both new tests.

- [ ] **Step 8: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (this touches a shared domain type, so packages that construct `StudioNote` object literals need to still typecheck — they will, since the new fields are optional).

- [ ] **Step 9: Commit**

```bash
git add packages/content/src/frontmatter-schema.ts packages/domain/src/note.ts packages/content/src/parse-note.ts packages/content/src/serialize-note.ts packages/content/src/parse-note.test.ts
git commit -m "content: support resurface frontmatter fields"
```

---

### Task 3: Resurfacing candidate pool query

**Files:**
- Create: `packages/application/src/resurface-pool.ts`
- Test: `packages/application/src/resurface-pool.test.ts`

**Interfaces:**
- Consumes: `IndexPort.search(query: string, filters?: SearchFilters): Promise<SearchHit[]>` from `@studio/index` (filters support `rooms?: string[]` and `statuses?: NoteStatus[]`). `StudioNote.resurfaceKind/resurfaceDue/resurfaceIntervalDays` from Task 2. `ResurfaceCard` type from `@studio/rhythm` (`{ sourcePath: string; kind: ResurfaceKind; dueDate: string; intervalDays: number }`).
- Produces: `buildResurfacePool(index: IndexPort): Promise<ResurfaceCard[]>` — Task 8 calls this directly.

Note: `SearchHit` (what `index.search` returns) does not carry `resurfaceKind`/`resurfaceDue`/`resurfaceIntervalDays` — check `packages/index/src/index-port.ts`'s `SearchHit` interface before writing this; if those fields aren't on `SearchHit`, use `index.getManyById(hits.map(h => h.id))` to fetch full `IndexedNoteRecord`s (which wrap the complete `StudioNote`) and read the fields from `record.note`. Confirm this by reading the actual `SearchHit` fields first — don't assume.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createSqliteIndex } from '@studio/index'; // or whatever in-memory/test index factory this workspace already uses elsewhere — check packages/index/src/test-helpers.ts for the established pattern first
import { buildResurfacePool } from './resurface-pool';

describe('buildResurfacePool', () => {
  it('includes only cards with a resurface_kind set, from reflection-garden and uncharted', async () => {
    const index = /* build a test index using this workspace's existing test-helpers pattern, matching how other packages/application tests construct an IndexPort fixture */;
    // seed: one Reflection Garden card WITH resurface_kind: 'evidence', resurface_due, resurface_interval_days
    // seed: one Reflection Garden card WITHOUT resurface_kind (must be excluded)
    // seed: one Uncharted card WITH resurface_kind: 'dream'
    // seed: one card in a different room (e.g. 'foyer') WITH resurface_kind set (must be excluded — wrong room)

    const pool = await buildResurfacePool(index);

    expect(pool).toHaveLength(2);
    expect(pool.find((c) => c.kind === 'dream')).toBeDefined();
    expect(pool.find((c) => c.kind === 'evidence')).toBeDefined();
  });

  it('maps sourcePath, dueDate, and intervalDays from the note frontmatter', async () => {
    const index = /* same fixture pattern */;
    // seed one card: resurface_kind='wish', resurface_due='2026-09-01', resurface_interval_days=6, at path 'Reflection Garden/Reflections/wish-1.md'

    const pool = await buildResurfacePool(index);

    expect(pool[0]).toEqual({
      sourcePath: 'Reflection Garden/Reflections/wish-1.md',
      kind: 'wish',
      dueDate: '2026-09-01',
      intervalDays: 6,
    });
  });
});
```

Before finalizing this step, read `packages/application/src/*.test.ts` (e.g. `season-service.test.ts` or `life-area-repository.test.ts`, both of which already exercise `IndexPort`) to find the actual established fixture-building helper for a test `IndexPort` in this workspace, and use that exact helper rather than inventing a new one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @studio/application test -- resurface-pool`
Expected: FAIL — `buildResurfacePool` is not defined.

- [ ] **Step 3: Implement**

```ts
import type { IndexPort } from '@studio/index';
import type { ResurfaceCard } from '@studio/rhythm';

export async function buildResurfacePool(index: IndexPort): Promise<ResurfaceCard[]> {
  const hits = await index.search('', { rooms: ['reflection-garden', 'uncharted'] });
  const records = await index.getManyById(hits.map((hit) => hit.id));
  const pool: ResurfaceCard[] = [];
  for (const record of records) {
    const { note, path } = record;
    if (note.resurfaceKind === undefined) continue;
    if (note.resurfaceDue === undefined || note.resurfaceIntervalDays === undefined) continue;
    pool.push({
      sourcePath: path,
      kind: note.resurfaceKind,
      dueDate: note.resurfaceDue,
      intervalDays: note.resurfaceIntervalDays,
    });
  }
  return pool;
}
```

(This assumes `index.search('', ...)` with an empty query returns all matching-filter entries — verify this against `packages/index/src/sqlite-index.ts`'s actual `search` implementation in Step 1's research; if an empty query doesn't behave this way, use whatever the existing codebase's established "list everything matching these filters" call shape is instead — `packages/application/src/search-service.ts` likely already does exactly this for the Search room and is the pattern to copy.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @studio/application test -- resurface-pool`
Expected: PASS, both tests.

- [ ] **Step 5: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/resurface-pool.ts packages/application/src/resurface-pool.test.ts
git commit -m "application: build the resurfacing candidate pool from the index"
```

---

### Task 4: Rhythm profile repository

**Files:**
- Create: `packages/application/src/rhythm-profile-repository.ts`
- Test: `packages/application/src/rhythm-profile-repository.test.ts`

**Interfaces:**
- Consumes: `VaultPort` from `@studio/storage/portable` (`readText`, `writeTextAtomic`, `exists` — same as `createWisdomThemeRepository`'s dependency). `RhythmProfile`/`Hemisphere`/`CycleProfile` types from `@studio/rhythm`.
- Produces: `RhythmProfileRepository` with `load(): Promise<RhythmProfileSnapshot>` and `save(profile: StoredRhythmProfile, expectedRevision: string | null): Promise<RhythmProfileSnapshot>`. Task 5 (Settings UI) and Task 8 (Foyer) both depend on this exact interface.

Mirrors `packages/application/src/wisdom-theme-repository.ts` — same versioned-JSON-at-a-fixed-`.studio`-path shape, same revision-based optimistic concurrency via `VaultPort.writeTextAtomic`'s `WriteCondition`, same "corrupt bytes → recoverable defaults, `repairRequired: true`, original bytes untouched" behavior. Read that file in full before starting this task; don't reinvent its shape.

Per spec §6, the stored shape holds both the raw birth inputs (kept so the chart can be recomputed) and the cached computed placements:

```ts
export const RHYTHM_PROFILE_CONFIG_PATH = '.studio/config/rhythm-profile.json';

export interface StoredRhythmProfile {
  hemisphere: 'N' | 'S';
  cycle?: { lastPeriodStart: string; avgLengthDays: number };
  birth: {
    date?: string;
    timeLocal?: string;
    timeZone?: string;
    lat?: number;
    lon?: number;
    place?: string;
  };
  natal: { placements: Record<string, string> };
}

export interface RhythmProfileSnapshot {
  profile: StoredRhythmProfile | null; // null = no profile saved yet, distinct from "saved but empty"
  revision: string | null;
  repairRequired: boolean;
}

export interface RhythmProfileRepository {
  load(): Promise<RhythmProfileSnapshot>;
  save(
    profile: StoredRhythmProfile,
    expectedRevision: string | null,
  ): Promise<RhythmProfileSnapshot>;
}
```

- [ ] **Step 1: Write the failing tests**

Mirror `packages/application/src/wisdom-theme-repository.test.ts`'s three cases exactly, adapted to this shape:

```ts
import { createInMemoryVault } from '@studio/storage';
import { describe, expect, it } from 'vitest';
import {
  RHYTHM_PROFILE_CONFIG_PATH,
  createRhythmProfileRepository,
  type StoredRhythmProfile,
} from './rhythm-profile-repository';

const sample: StoredRhythmProfile = {
  hemisphere: 'S',
  cycle: { lastPeriodStart: '2026-08-01', avgLengthDays: 28 },
  birth: {
    date: '1990-01-01',
    timeLocal: '08:00',
    timeZone: 'Pacific/Auckland',
    lat: -36.85,
    lon: 174.76,
    place: 'Auckland',
  },
  natal: { placements: { sun: 'Capricorn', moon: 'Leo', rising: 'Virgo' } },
};

describe('Rhythm profile repository', () => {
  it('has no profile until one is saved', async () => {
    const vault = createInMemoryVault();
    const repository = createRhythmProfileRepository(vault);
    const initial = await repository.load();
    expect(initial.profile).toBeNull();
    expect(initial.revision).toBeNull();

    const saved = await repository.save(sample, initial.revision);
    expect(saved.profile).toEqual(sample);
    expect(await vault.exists(RHYTHM_PROFILE_CONFIG_PATH)).toBe(true);
  });

  it('shows a recoverable null profile without overwriting malformed bytes', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(RHYTHM_PROFILE_CONFIG_PATH, '{broken', {
      expectedMissing: true,
    });
    const snapshot = await createRhythmProfileRepository(vault).load();
    expect(snapshot.repairRequired).toBe(true);
    expect(snapshot.revision).not.toBeNull();
    expect((await vault.readText(RHYTHM_PROFILE_CONFIG_PATH)).text).toBe('{broken');
  });

  it('refuses to downgrade a future config version', async () => {
    const vault = createInMemoryVault();
    await vault.writeTextAtomic(
      RHYTHM_PROFILE_CONFIG_PATH,
      '{"version":2,"profile":null}',
      { expectedMissing: true },
    );
    await expect(createRhythmProfileRepository(vault).load()).rejects.toThrow(
      'newer version',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @studio/application test -- rhythm-profile-repository`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Copy `packages/application/src/wisdom-theme-repository.ts` as the starting point and adapt: replace the `themes` array validation (`normalize`/`hasExactKeys`/id-slug/title-length rules) with validation for `StoredRhythmProfile`'s shape (hemisphere is `'N' | 'S'`, `natal.placements` is a plain string-keyed record, `birth`/`cycle` fields are optional strings/numbers with no cross-field uniqueness constraints — this is a much simpler validation surface than Wisdom's themes array, since there's no ordering/uniqueness to enforce, just type-shape checking). Keep the exact same `load()`/`save()` control flow: try `vault.readText`, `JSON.parse`, check `version` field, fall back to `{ profile: null, repairRequired: true }` on any parse/shape failure without rewriting the file, and use `VaultUnavailableError` + `vault.exists` the same way to distinguish "never saved" from "vault broken."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @studio/application test -- rhythm-profile-repository`
Expected: PASS, all three.

- [ ] **Step 5: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/rhythm-profile-repository.ts packages/application/src/rhythm-profile-repository.test.ts
git commit -m "application: add the rhythm profile repository"
```

---

### Task 5: Rhythm profile Settings section

**Files:**
- Create: `apps/studio/src/features/settings/RhythmProfileSettings.tsx`
- Create: `apps/studio/src/features/settings/RhythmProfileSettings.css`
- Test: `apps/studio/src/features/settings/RhythmProfileSettings.test.tsx`
- Modify: `apps/studio/src/app/rooms/SettingsRoom.tsx`

**Interfaces:**
- Consumes: `RhythmProfileRepository`, `StoredRhythmProfile` from Task 4 (`@studio/application`). `computeNatalChartLocal(birthDate, birthTimeLocal, birthTimeZone, birthLat, birthLon): Promise<NatalChart>` and `zoneOptions(): { id: string; label: string }[]` from `@studio/rhythm`.
- Produces: a form component recomputing and caching `natal.placements` on save. Not consumed by any later task in this plan (Task 8 reads the profile via the repository directly) — this task exists so a human can actually enter their birth data, independent of Foyer wiring.

Model this component's structure on `PortabilitySettings.tsx` (a form-shaped settings section already living in the same directory, already wired into `SettingsRoom.tsx`) — same file organization (component + co-located CSS + co-located test), same prop-injection style `SettingsRoom.tsx` already uses for `PortabilitySettings` (optional callback props, conditionally spread when the underlying service is available).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RhythmProfileSettings } from './RhythmProfileSettings';

describe('RhythmProfileSettings', () => {
  it('saves birth data and shows the computed placements', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <RhythmProfileSettings
        profile={null}
        onSave={onSave}
      />,
    );

    await userEvent.type(screen.getByLabelText('Birth date'), '1990-01-01');
    await userEvent.type(screen.getByLabelText('Birth time'), '08:00');
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Pacific/Auckland');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        birth: expect.objectContaining({
          date: '1990-01-01',
          timeLocal: '08:00',
          timeZone: 'Pacific/Auckland',
        }),
        natal: { placements: expect.any(Object) },
      }),
    );
  });

  it('shows the existing profile when one is already saved', () => {
    render(
      <RhythmProfileSettings
        profile={{
          hemisphere: 'S',
          birth: { date: '1990-01-01' },
          natal: { placements: { sun: 'Capricorn' } },
        }}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Birth date')).toHaveValue('1990-01-01');
  });
});
```

Check `PortabilitySettings.test.tsx` for this workspace's actual established render/query conventions (e.g. whether it wraps `render` in a shared test provider) before finalizing this file — match its setup exactly rather than assuming React Testing Library defaults are used bare.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @studio/app test -- RhythmProfileSettings`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

A form with fields for birth date, birth time, timezone (a `<select>` populated from `zoneOptions()`), birth place/lat/lon, and cycle basis (last period start, average length). On submit: call `computeNatalChartLocal` with the entered birth fields to get fresh `placements`, then call `onSave` with the assembled `StoredRhythmProfile` (hemisphere inferred from latitude sign if provided, otherwise defaulted to `'N'` with an explicit toggle — Anna's call on exact UX, but the field must be present since `RhythmProfile.location.hemisphere` is required, not optional). Follow `PortabilitySettings.tsx`'s existing patterns for save-state display (idle/saving/saved/error) rather than inventing a new one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @studio/app test -- RhythmProfileSettings`
Expected: PASS.

- [ ] **Step 5: Wire into SettingsRoom**

In `apps/studio/src/app/rooms/SettingsRoom.tsx`, add a `rhythmProfile`/`onSaveRhythmProfile` prop pair (following the exact same optional-prop-conditionally-rendered pattern already used for `vault`/`onStartTour`) and render `<RhythmProfileSettings profile={rhythmProfile ?? null} onSave={onSaveRhythmProfile} />` when the callback is provided.

- [ ] **Step 6: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/features/settings/RhythmProfileSettings.tsx apps/studio/src/features/settings/RhythmProfileSettings.css apps/studio/src/features/settings/RhythmProfileSettings.test.tsx apps/studio/src/app/rooms/SettingsRoom.tsx
git commit -m "settings: add the rhythm profile section"
```

---

### Task 6: Route Gifts through existing capture placements

**Files:**
- Modify: `packages/application/src/capture-metadata.ts`
- Test: `packages/application/src/capture-metadata.test.ts` (new file — none exists yet)

**Interfaces:**
- Consumes: nothing new.
- Produces: `capturePlacementMetadata('gift-dream' | 'gift-resurfaced')` — Task 8's "Keep" action calls this via the existing `CapturePlacement` union, now widened to include these two values.

Per spec §5: `dream` → `uncharted` (existing placement, reused as-is — a kept dream Gift becomes a genuinely ordinary Uncharted card, no new placement needed). `evidence`/`reframe`/`wish` → `reflection` (existing placement, reused as-is). **No new placement entries are actually needed** — re-reading the spec's routing table against the existing table (`capturePlacements` already has `uncharted` and `reflection` entries with exactly the right `cardType`/`semanticType`/`rooms`/`folder`), the mapping is: `ResurfaceCard.kind === 'dream'` → pass `placement: 'uncharted'` to `StudioService.capture()`; any other kind → pass `placement: 'reflection'`. This is a plain conditional in Task 8, not a schema change here.

Given that, this task shrinks to: confirm this reasoning is correct by reading `capture-metadata.ts` once more in full, and — since no code change is actually required — add a small regression test locking in the mapping so Task 8's use of it is verified independently and any future change to `capturePlacements` that breaks this assumption fails loudly.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { capturePlacementMetadata } from './capture-metadata';

describe('Gift placement routing', () => {
  it('routes a dream Gift to Uncharted', () => {
    expect(capturePlacementMetadata('uncharted')).toMatchObject({
      rooms: ['uncharted'],
      semanticType: 'uncharted',
    });
  });

  it('routes evidence, reframe, and wish Gifts to Reflection Garden', () => {
    expect(capturePlacementMetadata('reflection')).toMatchObject({
      rooms: ['reflection-garden'],
      semanticType: 'reflection',
    });
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @studio/application test -- capture-metadata`
Expected: PASS immediately — this locks in existing behavior, no implementation step needed. If it fails, the existing `capturePlacements` table has changed shape since the spec was written; stop and re-read `capture-metadata.ts` in full before proceeding to Task 8.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/capture-metadata.test.ts
git commit -m "test: lock in Gift-to-placement routing"
```

---

### Task 7: "Mark for resurfacing" CardEditor action

**Files:**
- Modify: `packages/ui/src/CardEditor/CardEditor.tsx`
- Modify: `packages/ui/src/CardEditor/CardEditor.css`
- Modify: `packages/ui/src/CardEditor/CardEditor.test.tsx`

**Interfaces:**
- Consumes: `StudioNote.resurfaceKind/resurfaceDue/resurfaceIntervalDays` from Task 2.
- Produces: nothing consumed by other tasks in this plan — this is the opt-in UI surface a human uses; the pool query (Task 3) reads whatever it writes, but Task 3 doesn't call into this component directly.

Read the current `CardEditorProps` interface (`packages/ui/src/CardEditor/CardEditor.tsx:25-42`) and the "Note details" `<details>` section (where `Semantic meaning`, `Status`, `Source title`, `Source creator`, `Source URL`, `Themes` fields already live — this was the exact section extended for `source_notes` support). Add resurfacing controls in the same section, following its established `<label><span>...</span><input/></label>` pattern:

- A select or checkbox to set `resurfaceKind` (`'evidence' | 'reframe' | 'wish' | 'dream'`, or unset).
- When set, a due-date input for `resurfaceDue` and a numeric input for `resurfaceIntervalDays`, defaulting to `sm2Interval`'s first-pass value (6 days, from `@studio/rhythm`'s `SM2_FIRST_PASS_DAYS` — this constant isn't exported today; either export it from `packages/rhythm/src/resurfacing.ts` or hardcode `6` with a comment referencing where it comes from, matching whichever is less invasive at implementation time).
- Only show this control when the note's room is Reflection Garden or Uncharted (`note.rooms.includes('reflection-garden') || note.rooms.includes('uncharted')`) — resurfacing doesn't make sense for other rooms per the spec's routing table.

- [ ] **Step 1: Write the failing test**

Add to `packages/ui/src/CardEditor/CardEditor.test.tsx`, following its existing test style (check an existing "Source title" field test in that file for the exact `render`/`fireEvent` conventions used, and match them):

```tsx
it('offers resurfacing controls for a Reflection Garden note and calls onChange with the new fields', async () => {
  const onChange = vi.fn();
  const note = /* build a base StudioNote fixture the same way neighboring tests in this file do, with rooms: ['reflection-garden'] */;
  render(<CardEditor note={note} onChange={onChange} onFlush={vi.fn()} saveState="idle" />);

  await userEvent.click(screen.getByText('Note details'));
  await userEvent.selectOptions(screen.getByLabelText('Mark for resurfacing'), 'evidence');

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ resurfaceKind: 'evidence' }),
  );
});

it('hides resurfacing controls for a note outside Reflection Garden or Uncharted', async () => {
  const onChange = vi.fn();
  const note = /* base fixture, rooms: ['foyer'] */;
  render(<CardEditor note={note} onChange={onChange} onFlush={vi.fn()} saveState="idle" />);
  await userEvent.click(screen.getByText('Note details'));
  expect(screen.queryByLabelText('Mark for resurfacing')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @studio/ui test -- CardEditor`
Expected: FAIL — no "Mark for resurfacing" label exists yet.

- [ ] **Step 3: Implement**

Add the conditional block inside the existing `<div className="card-editor__metadata">` (immediately after the existing `Themes` label block, `packages/ui/src/CardEditor/CardEditor.tsx` around line 295-306), gated on the room check described above, following the exact `<label><span>Field name</span><input onChange={...}/></label>` shape every neighboring field in that block already uses.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @studio/ui test -- CardEditor`
Expected: PASS.

- [ ] **Step 5: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/CardEditor/CardEditor.tsx packages/ui/src/CardEditor/CardEditor.css packages/ui/src/CardEditor/CardEditor.test.tsx
git commit -m "ui: add the mark-for-resurfacing card editor action"
```

---

### Task 8: `TodaysGift` Foyer component

**Files:**
- Create: `apps/studio/src/features/foyer/TodaysGift.tsx`
- Create: `apps/studio/src/features/foyer/TodaysGift.css`
- Create: `apps/studio/src/features/foyer/use-todays-gift.ts`
- Test: `apps/studio/src/features/foyer/TodaysGift.test.tsx`
- Test: `apps/studio/src/features/foyer/use-todays-gift.test.tsx`
- Modify: `apps/studio/src/features/foyer/FoyerPage.tsx`
- Modify: `apps/studio/src/app/rooms/FoyerRoom.tsx`

**Interfaces:**
- Consumes: `buildResurfacePool(index)` (Task 3), `RhythmProfileRepository` (Task 4), `capturePlacementMetadata`/routing logic (Task 6), `computeRhythmContext(profile, date)` + `selectResurface(cards, ctx, today)` from `@studio/rhythm`, `StudioService.capture(input: CaptureNoteInput): Promise<SavedNote>` (existing, `packages/application/src/studio-service.ts:246-260`).
- Produces: nothing further downstream — this is the final integration task.

This is the one task in the plan that touches an existing hand-authored file's render tree (`FoyerPage.tsx`), so do it last and by itself, not fanned out alongside anything else that also touches Foyer.

**Gift-kind mapping** (from spec §3-5): if `selectResurface` returns a card, its `payload.text` is read from the vault at `card.sourcePath` (reuse whatever note-loading the `StudioService` already exposes — check `service.load(path): Promise<SavedNote>`, already listed in `StudioService`, `packages/application/src/studio-service.ts:256`), and `Gift.kind` is `'dream'` when `card.kind === 'dream'`, else `'resurfaced'`. If no card is due (or the profile isn't set yet), the Gift is the calm static fallback (`{ kind: 'line', payload: { text: 'A quiet place to begin.' } }`, matching Almara's own `CALM_GIFT` — same copy, since it's already well-considered product writing, not a placeholder).

- [ ] **Step 1: Write the failing hook test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { useTodaysGift } from './use-todays-gift';
import { renderHook, waitFor } from '@testing-library/react';

describe('useTodaysGift', () => {
  it('returns null (no Gift slot) when no rhythm profile is saved', async () => {
    const service = {
      rhythmProfile: { load: vi.fn().mockResolvedValue({ profile: null, revision: null, repairRequired: false }) },
      index: { search: vi.fn().mockResolvedValue([]), getManyById: vi.fn().mockResolvedValue([]) },
    };
    const { result } = renderHook(() => useTodaysGift(service as never, '2026-08-18'));
    await waitFor(() => expect(service.rhythmProfile.load).toHaveBeenCalled());
    expect(result.current.gift).toBeNull();
  });

  it('returns the calm fallback when a profile exists but nothing is due', async () => {
    const service = {
      rhythmProfile: {
        load: vi.fn().mockResolvedValue({
          profile: { hemisphere: 'S', natal: { placements: {} } },
          revision: 'r1',
          repairRequired: false,
        }),
      },
      index: { search: vi.fn().mockResolvedValue([]), getManyById: vi.fn().mockResolvedValue([]) },
    };
    const { result } = renderHook(() => useTodaysGift(service as never, '2026-08-18'));
    await waitFor(() => expect(result.current.gift?.kind).toBe('line'));
  });

  it('returns a dream Gift when a due dream card exists in the pool', async () => {
    // seed a mock service whose rhythmProfile.load resolves a saved profile
    // and whose index returns one due-dream SearchHit/IndexedNoteRecord
    // assert result.current.gift?.kind === 'dream' and payload.text matches the loaded note body
  });
});
```

Before finalizing, check whether this workspace already has a `StudioService` test-double/mock factory used by other Foyer-adjacent hook tests (e.g. `use-foyer-cover.test.tsx` or `use-foyer.test.tsx` if either exists) and reuse it rather than hand-rolling a new mock shape.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @studio/app test -- use-todays-gift`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the hook**

Per spec §9, "no rhythm profile set yet" means the Foyer shows no Gift slot
at all — that is a distinct state from the calm fallback (which means "a
profile exists, nothing happens to be due"). `gift` is therefore
`Gift | null`, not defaulted to the calm fallback, and `TodaysGift` (Step 8)
must not render anything when it's `null`.

```ts
import { useEffect, useState } from 'react';
import type { StudioService } from '@studio/application';
import { buildResurfacePool } from '@studio/application';
import { computeRhythmContext, selectResurface, type RhythmProfile } from '@studio/rhythm';

export interface Gift {
  kind: 'dream' | 'resurfaced' | 'line';
  payload: { text: string };
  sourcePath?: string; // present when kind is 'dream' or 'resurfaced' — needed by the Keep action
}

const CALM_GIFT: Gift = { kind: 'line', payload: { text: 'A quiet place to begin.' } };

export function useTodaysGift(service: StudioService | undefined, today: string) {
  // null = no profile saved yet, don't render the slot. Never defaults to
  // CALM_GIFT — that fallback only applies once a profile exists.
  const [gift, setGift] = useState<Gift | null>(null);

  useEffect(() => {
    if (service === undefined) return;
    let current = true;
    void (async () => {
      const snapshot = await service.rhythmProfile.load();
      if (snapshot.profile === null) { if (current) setGift(null); return; }
      const profile: RhythmProfile = {
        location: { hemisphere: snapshot.profile.hemisphere },
        cycle: snapshot.profile.cycle,
        natal: snapshot.profile.natal,
      };
      const ctx = computeRhythmContext(profile, today);
      let card: ReturnType<typeof selectResurface> = null;
      try {
        const pool = await buildResurfacePool(service.index);
        card = selectResurface(pool, ctx, today);
      } catch {
        // Index query failed — resurfacing is a nice-to-have layer, never a
        // hard dependency for the Foyer to render (spec §9). Falls through
        // to the calm fallback below, same as an empty pool.
      }
      if (card === null) { if (current) setGift(CALM_GIFT); return; }
      const loaded = await service.load(card.sourcePath);
      if (!current) return;
      setGift({
        kind: card.kind === 'dream' ? 'dream' : 'resurfaced',
        payload: { text: loaded.note.body },
        sourcePath: card.sourcePath,
      });
    })();
    return () => { current = false; };
  }, [service, today]);

  return {
    gift,
    async keep() {
      if (service === undefined || gift === null || gift.kind === 'line') return;
      await service.capture({
        body: gift.payload.text,
        placement: gift.kind === 'dream' ? 'uncharted' : 'reflection',
      });
    },
  };
}
```

Two things to verify against the real codebase before trusting this verbatim: (1) whether `StudioService` actually exposes `rhythmProfile` and `index` as named properties — check `StudioServiceDependencies`/`StudioService`'s full interface (`studio-service.ts:231-260` and onward) and `createStudioService`'s implementation; if the repository from Task 4 isn't wired into `StudioService` yet, add it there first, following exactly how `wisdomThemes: WisdomThemeRepository` is already wired in (same file, same constructor pattern). (2) `IndexPort` isn't necessarily exposed on `StudioService` directly — check whether `buildResurfacePool` needs to be called some other way the existing codebase already established for other index-querying features (e.g. how `search-service.ts` gets its `IndexPort`).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @studio/app test -- use-todays-gift`
Expected: PASS.

- [ ] **Step 5: Write the failing component test**

```tsx
it('renders a dream Gift with a Keep action', () => {
  render(
    <TodaysGift
      gift={{ kind: 'dream', payload: { text: 'A door in the hallway.' } }}
      onKeep={vi.fn()}
    />,
  );
  expect(screen.getByText('A door in the hallway.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
});

it('renders the calm fallback without a Keep action', () => {
  render(
    <TodaysGift
      gift={{ kind: 'line', payload: { text: 'A quiet place to begin.' } }}
      onKeep={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();
});

it('renders nothing when there is no profile yet', () => {
  const { container } = render(<TodaysGift gift={null} onKeep={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 6: Run it, verify it fails, then implement `TodaysGift.tsx`**

A small presentational component: returns `null` immediately when `gift` is `null` (no profile saved — spec §9, not an error state, just nothing to show). Otherwise renders `gift.payload.text`, and a "Keep" button calling `onKeep` only when `gift.kind !== 'line'`. Follow `packages/ui`'s existing Card-family visual pattern (check `Becoming.tsx` in the same `foyer` directory for the closest sibling shape, since it's the component immediately before this one in the render order).

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm --filter @studio/app test -- TodaysGift`

- [ ] **Step 8: Wire into FoyerPage**

In `apps/studio/src/features/foyer/FoyerPage.tsx`, add a `gift: Gift | null`/`onKeepGift` prop pair to `FoyerPageProps` (import `Gift` from `../use-todays-gift`), and render `<TodaysGift gift={gift} onKeep={onKeepGift} />` inside `.foyer-page__wide`, immediately after the `<Becoming .../>` block (including its tour-example-card sibling block) and before `<SeasonPreview .../>` — matching spec §7's "second slot, after Becoming, before SeasonPreview." `TodaysGift` itself handles the `null` case (Step 6), so this call site doesn't need its own conditional.

- [ ] **Step 9: Wire into FoyerRoom**

In `apps/studio/src/app/rooms/FoyerRoom.tsx`, call `useTodaysGift(service, todayISO)` (today's date — check how other rooms in this codebase source "today," e.g. `SeasonPage`/`SeasonRoom` likely already inject a clock/today value; reuse that source rather than calling `new Date()` inline, to stay consistent with the codebase's existing clock-injection pattern for testability) and pass `gift`/`onKeepGift={keep}` down to `FoyerPage`.

- [ ] **Step 10: Full workspace check**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green, including every prior task's tests still passing.

- [ ] **Step 11: Run the full e2e suite**

Run: `pnpm test:e2e`
Expected: green. If the Foyer's existing e2e specs assert an exact set of visible elements/order, they may need a small update to account for the new `TodaysGift` slot — that's expected and acceptable, not a regression, as long as the assertion change is narrowly about the new element's presence.

- [ ] **Step 12: Commit**

```bash
git add apps/studio/src/features/foyer/TodaysGift.tsx apps/studio/src/features/foyer/TodaysGift.css apps/studio/src/features/foyer/use-todays-gift.ts apps/studio/src/features/foyer/TodaysGift.test.tsx apps/studio/src/features/foyer/use-todays-gift.test.tsx apps/studio/src/features/foyer/FoyerPage.tsx apps/studio/src/app/rooms/FoyerRoom.tsx
git commit -m "foyer: wire the rhythm engine's Gift into the Foyer"
```

(If Step 9 required also modifying `studio-service.ts` to expose `rhythmProfile`/`index`, that's a separate atomic commit made at that point, e.g. `git commit -m "application: expose the rhythm profile repository on StudioService"`, before this final commit.)

---

## Final check

- [ ] Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` from a clean state one more time after all 8 tasks land.
- [ ] Confirm `git log feat/studio-mvp` shows one commit per task (plus Task 8's possible extra `StudioService` wiring commit) — no giant squashed commit, no leftover uncommitted files (`git status --short` empty).
- [ ] Do not merge this branch into `main` as part of this plan — that's Anna's call once she's tried the Gift in the running app, same as the release-readiness pattern already established for `feat/studio-mvp` itself.
