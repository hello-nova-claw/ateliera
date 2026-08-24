# Ateliera Calm Entry, Progressive Disclosure, and Writing Guidance Plan

**Status:** Audit complete — plan ready for review

**Date:** 23 August 2026

**Scope:** Reduce first-run overwhelm across the whole Studio. Three coordinated layers: (A) progressive disclosure of rooms and Foyer sections, (B) explicit on/off switches for the rhythm layers, (C) a "what goes here" helper line plus a concrete ghost example at every writing surface. Rewrite each room's intro to state its actual job.

**Product authority:** `docs/product/The-Studio-PRD-Design-Bible.md`

**Visual authority:** `docs/design/The-Studio-Final-Visual-Design-Addendum.md`

**Working agreement:** `AGENTS.md` (TDD, BEM/a11y, no gamification, atomic commits)

> A studio should invite one gesture at a time, not present its whole inventory at the door.

---

## 1. Executive decision

Ateliera currently renders its entire surface area the moment a Studio Space is open: ten rooms reachable immediately, a Foyer that stacks roughly eight distinct sections, three always-on rhythm layers, and dozens of writing surfaces that ask for input with a label and nothing else. The house is beautiful and complete, and that completeness is exactly what makes it hard to begin — especially for a person who experiences the open loops of ten rooms as ten unfinished tasks.

We will make three changes, together, so the Studio can **start small and grow with the person** without losing any of its depth:

1. **Progressive disclosure.** A vault-backed preferences store records which rooms and Foyer sections are active. New Studios begin with a small core; the rest are either opted into deliberately in Settings, or gently *revealed* as the person's use makes them relevant. Nothing is deleted or locked away — everything remains one switch from present.
2. **Rhythm as switchable layers.** The moon phase, micro-season, and body cycle keep their current default behaviour (so nothing regresses for existing Studios), but each gains an explicit off switch in one place.
3. **Guidance at every writing surface.** Every place the Studio asks a person to write gains a one-line description of what belongs there and a greyed, concrete example inside the field. The rare surfaces that already do this (Uncharted, Search) become the standard, not the exception.

The governing principle, consistent with the onboarding plan's *"Ateliera should unfold, not announce itself"*:

> **Show less by default; make everything reachable; explain everything you ask for.**

---

## 2. Problem statement — the audit

A read-only audit of `apps/studio/src/features/*`, `router.tsx`, and the settings/rhythm code surfaced five concrete problems.

### 2.1 Everything is visible at once, with no "start here"

Ten rooms are registered and reachable from the moment a Studio opens (`apps/studio/src/app/router.tsx:3`):

```
/foyer /identity /landscape /season /uncharted
/wisdom /reflection /search /inbox /settings
```

The command palette exposes all of them together (`apps/studio/src/app/App.tsx:1075`). There is no notion of a room being "not yet relevant," no core-versus-optional distinction, and no visibility preference anywhere in the codebase. The Foyer compounds this by presenting Becoming, Feelings, Principles, Almanac, Gift, Season preview, Return card, and an optional cover simultaneously (`apps/studio/src/features/foyer/FoyerPage.tsx`). For an ADHD user, that is eight competing focal points on the calmest screen in the app.

### 2.2 Room "purpose" copy describes a mood, not a job

Every room has an eyebrow and intro, but they set atmosphere rather than answer *"what do I do here, and when would I come back?"*:

- Uncharted — *"leave room for possibility"* (`features/uncharted/UnchartedPage.tsx:171`)
- Identity — *"who I am, and who I am becoming"* (`features/identity/IdentityPage.tsx:355`)
- Landscape — *"your life, held together"* (`features/landscape/LandscapePage.tsx:900`)
- Season — *"a humane present focus"* (`features/season/SeasonPage.tsx:613`)

The five-room first-visit tour (`features/onboarding/FirstVisitGuide.tsx:3`) explains purpose better, but it is a one-time passive read-through with temporary examples; once it ends, the standing interface reverts to mood-copy and the complexity it never reduced.

### 2.3 Almost no writing surface has an example, and most have no description

Across ~35 input surfaces the dominant pattern is **label only** — no placeholder, no helper, no example. The worst-affected, highest-intent surfaces:

- **Identity** — seven field types (*"What already feels true," "Belief in practice," "Embodiment cue," "Identity shift,"* …) at `features/identity/IdentityPage.tsx:201` and the `addLabels` map at `:28`. Zero examples.
- **Season wizard** — ~18 fields including priorities, 30/60/90-day decisions, practices, supports, constraints, "what will be enough," "what are you setting down" (`features/season/SeasonPage.tsx:311`–`:519`). Several are "one per line" with no sample line.
- **Wisdom** — idea, source (creator/title/URL), synthesis, "make it mine" (`features/wisdom/WisdomPage.tsx:427`–`:639`). No examples.
- **Reflection** — a single *"What did you notice?"* placeholder is the only guidance in the room (`features/reflection/ReflectionPage.tsx:475`).

The proof it can be done well already exists: Uncharted's *"Begin anywhere. You do not need to know what comes next."* (`features/uncharted/UnchartedPage.tsx:211`) and Search's *"A feeling, place, person, or idea…"* (`features/search/SearchPage.tsx:202`).

### 2.4 Rhythm layers are always-on and cannot be turned off

Moon phase and micro-season render for everyone in the Foyer almanac (`features/foyer/TodaysAlmanac.tsx:19`, note at `use-almanac.ts:20` — *"felt season need no profile, so the almanac shows for everyone"*) and in the Season year-wheel (`features/season/YearWheel.tsx:19`). The body cycle appears only when cycle data exists — so it is opt-in *by data*, not by an explicit choice. There is no single switch to say "no lunar layer" or "hide micro-seasons."

### 2.5 There is no preference or visibility infrastructure at all

The only user-configurable persisted state today is the rhythm profile (`packages/application/src/rhythm-profile-repository.ts`, stored at `.studio/config/rhythm-profile.json` through the vault, surfaced via `features/settings/use-rhythm-profile.ts`) and backup/restore. Nothing lets a person hide a room, hide a Foyer section, or disable a layer. The app therefore *cannot* start small — the capability does not exist yet.

---

## 3. Goals

### 3.1 User outcomes

- A first-time user sees a small, legible set of rooms and can tell, in a sentence per room, what each is for and when to return.
- Depth is never lost: any hidden room or section is reachable and switch-on-able from one obvious place.
- The Studio can *offer* a new room when the person's own activity makes it relevant, as a calm, dismissible invitation — never a badge, count, or nag.
- Every request to write is accompanied by a plain description and a concrete example, so no surface assumes the person already holds the app's mental model.
- A person who wants none of the rhythm layers can turn them all off in under a minute.

### 3.2 Product and engineering outcomes

- Room and section visibility, rhythm-layer switches, and reveal history persist per Studio Space in a single vault-backed config file, portable with the Studio, separate from canonical Markdown notes, and rebuildable-safe.
- A reusable `FieldGuidance` presentation contract lives in `@studio/ui` and is applied at every writing surface; guidance copy is data, not scattered JSX.
- Default behaviour for **existing** Studios does not regress: rhythm layers stay on until switched off; a migration with no preferences file behaves as "everything the person has already been using stays visible."
- Everything is keyboard accessible, screen-reader understandable, offline-capable, and verified in Playwright at desktop and mobile widths.

### 3.3 Aesthetic and emotional outcomes

- The opening screen has one clear focal point, not eight.
- A revealed room feels like a door quietly appearing, not a notification demanding a tap.
- Examples make potential tangible while leaving the resulting Studio unmistakably the person's own — they are presentation, never seeded content.
- Guidance reads in Anna's voice: calm, specific, permission-giving; no urgency, achievement, or instruction-manual tone.

## 4. Non-goals

- **No new rooms or features.** This is disclosure, switching, and guidance only.
- **No cloud, account, or sync.** Preferences are local and portable.
- **No compulsory setup.** The small-core default is the *only* default; the person is never marched through a configuration checklist.
- **No gamified reveal.** Reveals are not rewards, streaks, or unlocks-for-progress. They are relevance-based offers that can be permanently dismissed.
- **No removal of the existing tour.** The tour and this system are complementary; §7.4 covers their relationship.

---

## 5. Governing principles

1. **Reachability over visibility.** Hiding a room must never make it feel deleted. One switch, one obvious place, always.
2. **Relevance, not achievement.** A reveal is triggered by *"this would help you now,"* never by *"you completed enough to earn this."*
3. **Guidance is data.** Descriptions and examples are structured content applied through one component, so they stay consistent and are easy to revise.
4. **No regression for existing Studios.** Absence of a preferences file means "keep what is currently shown."
5. **Every default is calm.** When unsure, show less and explain more.

---

## 6. Layer A — Progressive disclosure

### 6.1 Room states

Each room has one of three states in the preferences file. The distinction is authoring-time intent; at render time a room is simply on or off.

| State | Meaning | On by default? |
| --- | --- | --- |
| `core` | Always present; cannot be hidden. | Yes |
| `optional` | Off for new Studios; turned on by opt-in **or** guided reveal. | No |
| `utility` | Always reachable but not part of the "designing a life" surface. | Yes |

Recommended assignment (tunable — this is the calmest meaningful starting loop, not a fixed law):

- **core:** Foyer, Landscape
- **utility:** Search, Settings, Capture (Capture is an action, always available)
- **optional (revealable):** Identity, Season, Uncharted, Wisdom, Reflection, Inbox

Rationale: the smallest useful loop is *capture a thought → see it held somewhere across your life*. Foyer is home; Landscape is the one "designing" surface that gives a captured thought a place. Identity, Season, Uncharted, Wisdom, and Reflection are the depth that unfolds once there is something to work with.

### 6.2 The two ways a room turns on

Per the chosen blend of *small core + opt-in + guided reveal*:

**Opt-in (deliberate).** Settings gains a "Rooms" panel listing every optional room with its one-line purpose and an on/off switch, plus a single "Show every room" affordance for people who want the whole house immediately. Turning a room on is instant and undoable.

**Guided reveal (offered).** When the person's own activity crosses a relevance threshold, the Studio surfaces a quiet, single, dismissible invitation ("A room for this has appeared — *Current Season*. Open it, or not yet."). Accepting flips the room on and navigates there; dismissing sets a `revealDismissed` flag so the same offer never returns. Only one invitation may be pending at a time; they queue and never stack.

Suggested reveal triggers (each fires once, ever):

| Optional room | Revealed when | Invitation copy (draft) |
| --- | --- | --- |
| Identity | 3+ captures exist, or a capture is tagged as identity/foundations meaning | "There is a room for who you are becoming — *Identity Studio*." |
| Season | Landscape has any life area with a placed card | "When you're ready to name what matters now, *Current Season* is here." |
| Reflection | A season exists, **or** 5+ captures exist | "The Studio can begin to remember with you — *Reflection Garden*." |
| Wisdom | A capture is saved with a quote/source, or meaning = Reflection/Growth | "A place for ideas worth keeping — *Wisdom Garden*." |
| Uncharted | 7+ captures exist | "For possibilities without a plan yet — *What if…?*" |
| Inbox | (Deferred; Inbox is still a placeholder — keep `optional`, off, no reveal.) | — |

Thresholds are deliberately low and are counts of the person's *own* activity, surfaced as offers, never as progress meters.

### 6.3 Foyer section disclosure

The Foyer's sections become individually switchable and default to a reduced set for new Studios:

- **Shown by default:** one primary section (Becoming) + Today's Gift.
- **Off by default, opt-in/reveal:** Feelings, Principles, Almanac, Season preview, Return card, cover.

Almanac visibility on the Foyer is additionally gated by the Layer B rhythm switches (a person who turns the rhythm layers off should not see the almanac block regardless of the Foyer-section switch).

### 6.4 Command palette and navigation

The command palette lists only rooms that are currently on, plus a single always-present "Rooms & sections…" command that opens the Settings Rooms panel. Off rooms are not shown in navigation; they are shown (greyed, with a switch) only in that panel. This keeps ⌘K legible without ever hiding the door to re-enable.

---

## 7. Layer B — Rhythm as switchable layers

### 7.1 The switches

Three independent booleans, stored in preferences, defaulting to **on** (no regression, per the chosen "keep current, add off switches" decision):

- `rhythm.moon` — moon phase + illumination in the almanac and year-wheel.
- `rhythm.microSeason` — micro-season term and gloss in the almanac and year-wheel.
- `rhythm.cycle` — body-cycle line in the almanac (already additionally gated by whether cycle data exists).

### 7.2 Where they live and what they gate

A new "Rhythms" panel in Settings, adjacent to the existing Rhythm Profile, holds the three switches with a one-line description each. The switches gate rendering at:

- `features/foyer/TodaysAlmanac.tsx` — each line wrapped in its switch.
- `features/foyer/use-almanac.ts` — may skip computing a disabled layer.
- `features/season/YearWheel.tsx` — micro-season/moon annotations respect their switches.

When all three are off, the Foyer almanac block does not render and the Foyer-section switch for the almanac is disabled with an explanatory note ("Turn on a rhythm layer to show the almanac").

### 7.3 Relationship to the Rhythm Profile

The profile (birth details, cycle data) stays exactly as is. The switches control *display*, not data — turning the cycle layer off never deletes cycle dates. Copy in the Rhythms panel makes this explicit.

### 7.4 Relationship to the existing tour

The five-room tour remains the *first* orientation. It should walk only the rooms that are currently on (core + any already revealed), so a new user's tour matches their actual, smaller house. Tour copy stays; the tour's job narrows from "here is everything" to "here is what's open now, and more can appear."

---

## 8. Layer C — Guidance at every writing surface

### 8.1 The pattern

A single presentational contract in `@studio/ui`, applied to every field:

```
[ Label ]
[ one-line description: what belongs here ]
┌───────────────────────────────────────────┐
│ e.g. <concrete, greyed example>            │   ← real placeholder text
└───────────────────────────────────────────┘
```

- **Description** — always visible, one line, plain language, states what goes in the field and (where useful) when to leave it blank.
- **Example** — a real, concrete, greyed placeholder inside the field, prefixed "e.g." so it can never be mistaken for saved content. Clears on focus/typing like any placeholder.

Implementation notes:

- Add a `FieldGuidance`/`GuidedField` wrapper (or extend the existing field primitives) in `@studio/ui`. UI stays pure — copy arrives via props.
- Guidance copy is a **data table** (a typed record keyed by surface id), colocated with each feature or in a shared `field-guidance` module, so wording is easy to review and change without touching layout.
- Accessibility: description is associated via `aria-describedby`; the "e.g." placeholder is decorative and not the accessible name (the real `<label>` remains the name). Placeholders are never the sole source of a field's meaning (WCAG) because the persistent description carries it.

### 8.2 Copy inventory

Draft description + example for every writing surface, in Anna's voice. Examples model the no-gamification, permission-giving tone. These are the starting drafts to refine, not final strings.

#### Capture (`features/capture/QuickCapture.tsx`)

| Field | Description | Example (ghost) |
| --- | --- | --- |
| Quick note (`:68`) | Anything you want the Studio to hold — a thought, a line, a fragment. It doesn't need to be finished. | e.g. Kept choosing rest today instead of pushing through. |

#### Reflection (`features/reflection/ReflectionPage.tsx`)

| Field | Description | Example |
| --- | --- | --- |
| A sentence to keep (`:475`) | One thing you noticed, learned, or want to remember. A single sentence is plenty. | e.g. I do my clearest thinking in the first hour, before messages. |

#### Identity (`features/identity/IdentityPage.tsx`, labels at `:28`)

| Section | Description | Example |
| --- | --- | --- |
| What already feels true | A quality you no longer have to force — it's just how you are now. | e.g. I rest before I'm depleted, not after. |
| What I am practicing | Something you're growing into, not yet automatic. | e.g. Saying "let me think about it" instead of an instant yes. |
| Value or principle | A value you want to steer by. | e.g. Depth over breadth — a few things, done with care. |
| Desired feeling | A feeling you want more room for in ordinary days. | e.g. Unhurried. |
| Belief in practice | A belief, and how it shows up in what you do. | e.g. My work is enough — so I stop at a good stopping point. |
| Embodiment cue | A small physical reminder of who you're being. | e.g. Shoulders down, slow exhale, before I open the laptop. |
| Identity shift | A change you've noticed in yourself, however small. | e.g. I used to over-explain; lately I let a "no" stand. |
| Short title (`:194`) | Optional. A handful of words to find this by later. | e.g. Unhurried mornings |

#### Landscape (`features/landscape/LandscapePage.tsx`)

| Field | Description | Example |
| --- | --- | --- |
| New life area (`:1354`) | A part of your life you want to tend. Five to ten keeps the Landscape spacious. | e.g. Body & energy |
| Rename life area (`:1269`) | A name that feels like yours. | e.g. Home & belonging |

#### Season (`features/season/SeasonPage.tsx`)

| Field | Description | Example |
| --- | --- | --- |
| Season name (`:311`) | A short name for this chapter — evocative, not a deadline. | e.g. Quiet foundations |
| Carry as learning (`:341`) | One thing from the last stretch you want to bring forward. | e.g. Protecting mornings mattered more than any to-do list. |
| This is a season of… (`:361`) | Finish the sentence in a few words. | e.g. …tending what I've already started. |
| How should it feel? (`:369`, one per line) | A few feelings you want this season to have. One per line. | e.g. steady · spacious · warm |
| Priorities (`:382`) | Up to three areas that deserve the clearest attention now. | (choose from your life areas) |
| New priority (`:407`) | A focus that isn't a life area yet. | e.g. Finish the studio rewrite |
| Decisions — 30 days (`:448`, per line) | Small experiments or decisions for the next month. One per line. | e.g. Try a 4-day writing week |
| Decisions — 60 days (`:456`) | Slightly further out. One per line. | e.g. Decide whether to keep the Tuesday commitment |
| Decisions — 90 days (`:463`) | The horizon of this season. One per line. | e.g. Revisit where I live |
| Practices (`:472`, per line) | Repeatable things that support the season. One per line. | e.g. Walk before screens |
| Support available (`:485`, per line) | People, tools, or conditions you can lean on. One per line. | e.g. Thursday call with Sam |
| Real constraints (`:492`, per line) | Honest limits to design around, without judgement. One per line. | e.g. Low energy until the meds settle |
| What will be enough? (`:503`) | Name "enough" now, so you can recognise it later. | e.g. If mornings stay mine, this season did its work. |
| Setting down (`:513`, per line) | What you're deliberately not doing now — resting, not backlog. One per line. | e.g. Learning a new language |
| What do you celebrate? (`:862`) | Something worth marking from this season. | e.g. I kept the promise about mornings. |
| What did you learn? (`:871`) | One lesson you're taking forward. | e.g. Constraints made me more, not less, creative. |
| Who did you become? (`:880`) | A way you changed across this chapter. | e.g. Someone who stops at enough. |

#### Uncharted (`features/uncharted/UnchartedPage.tsx`)

| Field | Description | Example |
| --- | --- | --- |
| What if… (`:211`) | *Already strong — keep as reference standard.* A possibility with no plan attached. | e.g. What if I only worked mornings? (existing placeholder retained) |

#### Wisdom (`features/wisdom/WisdomPage.tsx`)

| Field | Description | Example |
| --- | --- | --- |
| Idea (`:436`) | The insight, quote, or principle, in your own words or theirs. | e.g. You don't rise to your goals; you fall to your systems. |
| Title (`:427`) | Optional. A short handle for this idea. | e.g. Systems over goals |
| Creator (`:449`) | Who said or made it. | e.g. James Clear |
| Book / course / episode (`:457`) | Where you met it. | e.g. Atomic Habits |
| Source URL (`:465`) | Optional link back to it. | e.g. https://… |
| What connects these ideas? (`:586`) | The thread you see running through the ones you've chosen. | e.g. All three are really about lowering the cost of starting. |
| What do you believe? (`:631`) | Your own take — what you've observed, how it fits your life. | e.g. For me this shows up as: prepare the space the night before. |

#### Search (`features/search/SearchPage.tsx`)

| Field | Status |
| --- | --- |
| Search query (`:202`) | *Already strong* — "A feeling, place, person, or idea…". No change; use as the reference example. |

### 8.3 Room intro rewrites

Keep the poetic eyebrow; add or revise the intro so it names the job. Drafts:

- **Identity** — "Notice who you already are and who you're practising becoming — and keep the small, ordinary evidence that it's changing."
- **Landscape** — "See your whole life at a glance, then step into one area to tend it."
- **Season** — "Name what matters *now* as a gentle chapter — priorities, experiments, and what you're setting down. Not a deadline."
- **Uncharted** — "Keep possibilities that don't need a plan, an answer, or a reason yet."
- **Wisdom** — "Keep ideas worth returning to, and make them your own."
- **Reflection** — "Gather what you're learning and celebrating, so the Studio remembers with you."

---

## 9. Data model and persistence

### 9.1 New file

A single preferences file, following the rhythm-profile pattern exactly (`packages/application/src/rhythm-profile-repository.ts` as the template):

- **Path:** `.studio/config/studio-preferences.json`
- **Repository:** `StudioPreferencesRepository` in `@studio/application` with `load()` / `save(prefs, expectedRevision)` and optimistic revision, mirroring `RhythmProfileRepository`.
- **Hook:** `useStudioPreferences(service)` in `apps/studio/src/features/settings/`, mirroring `use-rhythm-profile.ts`.
- **Portability:** included in the backup ZIP as config (not notes); rebuild-safe; unknown keys preserved on read/write per the product invariant.

### 9.2 Shape (draft)

```jsonc
{
  "version": 1,
  "rooms": {                 // omitted room => its default state
    "identity": "on",        // "on" | "off"
    "season": "off"
  },
  "foyerSections": {
    "feelings": "off",
    "almanac": "on"
  },
  "rhythm": { "moon": true, "microSeason": true, "cycle": true },
  "reveals": {               // reveal offers already made
    "season": "accepted",    // "accepted" | "dismissed"
    "wisdom": "dismissed"
  }
}
```

### 9.3 Defaults and migration

- **No file present (existing Studios):** treat as "current behaviour" — all rhythm layers on; rooms/sections show as they do today. This guarantees no regression. New-Studio defaults (§6.1, §6.3) apply only to Studios created after this ships, detected via the onboarding first-visit state that already exists.
- **Reads tolerate missing/unknown keys**; a corrupt file falls back to defaults with a diagnostic, never a crash.

### 9.4 ADR

Add a short ADR under `docs/architecture/decisions/` recording: preferences are canonical user configuration (not a disposable projection like the index), live in `.studio/config`, are portable, and are separate from Markdown notes. Note the layering: repository in `@studio/application`, hook + panels in `apps/studio`, pure switches in `@studio/ui`.

---

## 10. Accessibility and testing

- **Guidance:** description associated via `aria-describedby`; field meaning never depends on placeholder alone.
- **Switches:** real checkboxes/switches with labels; keyboard operable; state announced.
- **Reveal invitation:** a polite live region, dismissible by keyboard, never auto-focusing away from the person's work, never modal.
- **TDD order** (write failing tests first, per AGENTS.md):
  1. `StudioPreferencesRepository` — load/save/revision/unknown-key preservation (property-based where natural).
  2. Reveal-threshold logic — pure function from activity counts → pending offer; fires once.
  3. Room/section visibility selectors — default resolution with/without file.
  4. `GuidedField` — renders description + example, associations correct.
  5. Component tests per surface that guidance renders.
- **Playwright:** new-Studio calm entry (small core), opt-in a room, receive+accept a reveal, turn a rhythm layer off (almanac disappears), guidance visible at representative surfaces — desktop and mobile widths, plus a visual snapshot.
- **Lint/boundaries:** repository in application layer only; UI imports nothing upward; stylelint/BEM for new panels; no `!important`.

---

## 11. Sequencing

Small, atomic, independently shippable steps.

1. **Preferences foundation** — `StudioPreferencesRepository` + hook + backup inclusion + ADR. No UI behaviour change yet.
2. **Rhythm switches (Layer B)** — Rhythms panel + gate the three layers. Lowest risk, immediately useful, exercises the store end to end.
3. **`GuidedField` primitive (Layer C infra)** — the reusable component + guidance-copy data module, applied first to Capture and Reflection as the pattern's proof.
4. **Guidance rollout** — apply the §8.2 copy across Identity, Season, Landscape, Wisdom; rewrite room intros (§8.3).
5. **Room/section visibility (Layer A opt-in)** — Settings Rooms panel + Foyer section switches + command-palette filtering + new-Studio defaults.
6. **Guided reveal (Layer A offers)** — threshold logic + the single invitation surface + queue + dismissal.
7. **Tour alignment (§7.4)** — tour walks only on rooms.

Layers B and C deliver visible calm early and are independent of the more involved disclosure work in steps 5–6.

---

## 12. Open questions for review

- **Core-room set (§6.1):** is Foyer + Landscape the right minimal core, or should Season be core too (some people arrive wanting to name a season immediately)?
- **Foyer default sections (§6.3):** is Becoming + Today's Gift the right calm default, or even leaner (Becoming only)?
- **Reveal thresholds (§6.2):** are the counts about right, or should reveals be time-based / entirely manual for a first version?
- **Voice of examples (§8.2):** these drafts are in a first-person calm register — worth a pass to make sure they sound like you and not like a coach.
