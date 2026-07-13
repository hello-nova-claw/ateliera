# The Studio

## Product Requirements & Design Bible

**Status:** Living product specification  
**Version:** 1.1
**Date:** 13 July 2026  
**Product owner:** Anna McPhee  
**Working definition:** A private, calm, Markdown-native personal environment for identity architecture, life design, reflection, and imagination.

> **Create enough structure that your imagination has somewhere to surprise you.**

---

## 1. How to use this document

This is the product’s durable source of truth, not a frozen contract. It records the product philosophy, user experience, content model, technical architecture, and staged delivery plan so that design and engineering decisions remain coherent as The Studio evolves.

Use the following labels throughout implementation:

- **MUST** — required for the specified release.
- **SHOULD** — expected unless testing produces a clear reason not to.
- **MAY** — valuable, but optional or exploratory.
- **DEFERRED** — explicitly excluded from the current release.

When a feature request conflicts with this document, resolve it in this order:

1. Data ownership and privacy.
2. Emotional calm and clarity.
3. Content integrity and accessibility.
4. Simple, reversible mechanics.
5. Aesthetic refinement.
6. Feature breadth.

The app is successful when Anna wants to return to it and can still understand, export, and own everything inside it years later.

### 1.1 Companion implementation authorities

- [The Studio Final Visual Design Addendum](../design/The-Studio-Final-Visual-Design-Addendum.md) is authoritative for the accepted final visual system, exact themes, typography, screen composition, component states, responsive behavior, and visual acceptance tests.
- [The Studio implementation plan](../superpowers/plans/2026-07-13-the-studio-mvp.md) is authoritative for sequencing, package boundaries, executable acceptance criteria, and MVP delivery gates.
- Product behavior, privacy, data ownership, safety, and MVP scope remain authoritative in this bible if a static mockup or prototype suggests otherwise.

---

## 2. Executive summary

The Studio is a private personal web app that combines the ownership model of Obsidian with a highly opinionated, editorial interface designed around one person’s way of thinking. It supports life vision, identity work, seasonal focus, imaginative possibility, collected wisdom, and reflective learning without becoming a task manager, generic second brain, or manifestation course.

The app presents a stable house of rooms:

1. **Foyer** — orientation and return.
2. **Identity Studio** — who Anna is and is becoming.
3. **Life Landscape** — a structured matrix connecting life areas to vision, identity, decisions, practices, and supporting systems.
4. **Current Season** — a deliberately limited focus for the present chapter.
5. **Uncharted** — dreams and possibilities whose route is not yet known.
6. **Wisdom Garden** — ideas organized by theme rather than guru.
7. **Reflection Garden** — learning, celebration, and evidence across time.
8. **Inner Studio** — an optional later space for guided imagery, dreams, symbolic places, and active-imagination notes.

All durable user content is stored as ordinary Markdown and media files. YAML frontmatter provides structure. A local database may index the vault for speed, but it is disposable and never the sole source of truth. The first product is a responsive, installable web app optimized for Mac authoring and iPhone capture/review.

### 2.1 Product promise

The Studio remembers what matters without turning life into a dashboard. It helps the user move among experience, meaning, identity, and action while leaving room for emergence.

### 2.2 Product boundaries

The Studio is:

- a beautiful window onto user-owned files;
- a structured thinking environment;
- a companion for noticing patterns over time;
- a place for both conscious design and open-ended imagination.

The Studio is not:

- a general-purpose project manager;
- a streak-driven habit tracker;
- a social network or community;
- a marketplace for courses or templates;
- a system that claims to interpret dreams or guarantee manifestation;
- an autonomous therapist, coach, or authority;
- a replacement for a calendar, reminders app, or clinical support.

---

## 3. Vision, philosophy, and product thesis

### 3.1 Vision

Create a calm, aesthetically nourishing place where Anna can design a meaningful life, recognize who she is becoming, preserve what she learns, and explore what she cannot yet explain or plan.

### 3.2 Core philosophy

The Studio occupies the middle ground between rigid planning and unbounded imagination. Productivity tools often over-specify outcomes and actions; manifestation tools can under-specify practical support. The Studio holds both:

**experience → meaning → identity → decisions → practices and structures → lived experience**

The loop is cyclical rather than linear. Reflections can revise identity. Celebrations can reveal values. An Uncharted possibility can become a seasonal experiment. A practical system can create more room for imagination.

### 3.3 Foundational principles

1. **Create enough structure that imagination has somewhere to surprise you.** Stable rooms and prompts create containment; their contents remain alive.
2. **The Studio belongs to Anna, not to the app.** Plain files are the durable product. The interface is replaceable.
3. **Depth over novelty.** The app helps synthesize and practice what already resonates instead of encouraging endless collection.
4. **A life is seasonal.** Focus changes with children, energy, work, health, and circumstance. The system must not mistake change for failure.
5. **The function matters more than the form.** A five-minute practice that survives a difficult day is more valuable than an ideal ritual that cannot.
6. **Beauty changes the willingness to return.** Aesthetics are functional, but decoration must never create noise.
7. **Curiosity before certainty.** The app invites interpretation and pattern recognition without declaring a single correct meaning.
8. **Reflection completes the system.** Progress includes learning, delight, identity shifts, and evidence—not only completed goals.
9. **No urgency by default.** The interface must not manufacture guilt through overdue badges, streak loss, alarming colors, or competitive metrics.
10. **AI notices; the user decides.** AI may surface patterns and possibilities, but must show evidence, mark uncertainty, and never act as an oracle.

### 3.4 Primary user and context

The initial product is explicitly for Anna: an intellectually curious, visually sensitive, synthesis-oriented user with young children, variable available time, many source materials, and a desire to move from course collection to a self-authored practice.

Design implications:

- Sessions may last 30 seconds on iPhone or 45 minutes on Mac.
- Interruptions are normal; drafts and layout changes must autosave.
- The interface must support re-entry without requiring the user to remember where she stopped.
- Defaults should feel complete; customization should not become a project of its own.
- The app must distinguish inspiration from commitment.

---

## 4. Goals, non-goals, and success measures

### 4.1 Product goals

- Make the current season and life direction legible within one minute.
- Enable frictionless capture without forcing immediate categorization.
- Turn a Markdown vault into beautiful, room-specific views.
- Preserve links among vision, identity, decisions, practices, systems, reflections, and celebrations.
- Keep the system useful on both ideal and disrupted days.
- Allow complete export, backup, and recovery without proprietary tooling.
- Support reflective retrieval: “What has mattered repeatedly?” rather than only keyword lookup.

### 4.2 Non-goals for MVP

- Multi-user collaboration.
- Public publishing or social sharing.
- Real-time cross-device collaboration.
- Full freeform whiteboarding.
- Native iOS or macOS applications.
- Autonomous AI editing of the vault.
- Audio generation, binaural beats, or lucid-dream coaching.
- General task management, calendars, reminders, or notifications.
- Plugin ecosystems or arbitrary user-defined schemas.

### 4.3 Success measures

Avoid engagement metrics that reward compulsive use. Evaluate meaningful utility instead:

- **Return:** The user voluntarily returns at least weekly after the first month.
- **Orientation:** She can identify the current season, its priorities, and what is intentionally “not now” in under one minute.
- **Capture:** A thought can be safely captured on iPhone in under 15 seconds.
- **Ownership:** A full export can be opened and understood without The Studio.
- **Recovery:** A clean install can rebuild all primary views from the vault with no semantic loss.
- **Calm:** Qualitative testing describes the interface as calm, spacious, clear, and inviting—not busy, demanding, or corporate.
- **Continuity:** Seasonal review makes progress and learning visible without requiring continuous tracking.

MVP instrumentation should be local and minimal. Do not add third-party analytics by default. A private diagnostics screen may show counts and performance, but personal content never enters telemetry.

---

## 5. Experience and design principles

### 5.1 Desired qualities

The experience must be:

- aesthetically calming, not busy;
- spacious;
- intellectually interesting;
- psychologically deep;
- flexible rather than rigid;
- grounded in reality, with room for imagination.

### 5.2 Interaction principles

**Quiet entry.** Opening the app should feel like entering a familiar room. Resume context gently; do not present an inbox of demands.

**Progressive disclosure.** Show the sentence, card, or section needed now. Metadata, history, backlinks, and advanced controls appear on demand.

**Structured flexibility.** The house, room purposes, semantic colors, and Landscape axes are opinionated. Cards, prompts, life areas, ordering, and content are editable.

**Snap, do not scatter.** Dragging reorders within purposeful lanes and grids. The MVP does not offer arbitrary pixel positioning.

**Edit in place.** Clicking text should allow immediate editing. Modal dialogs are reserved for destructive, complex, or system-level choices.

**Autosave quietly.** Changes persist after a short debounce and communicate state with unobtrusive language: “Saving…”, “Saved”, or “Stored locally.” No routine Save button.

**Reversible actions.** Undo/redo and version history must make experimentation safe. Destructive deletion uses a Trash folder and recoverable soft-delete.

**A thought may remain incomplete.** Drafts, fragments, and uncategorized Inbox cards are legitimate states.

### 5.3 Accessibility principles

- Target WCAG 2.2 AA.
- All essential meaning must survive without color.
- Keyboard access must cover navigation, editing, creation, dialogs, drag alternatives, and reordering.
- Support reduced motion, increased contrast, zoom to 200%, and screen-reader landmarks.
- Minimum touch target: 44 × 44 CSS pixels.
- Do not render body text below 16 CSS pixels on mobile.
- Use visible, tasteful focus states.
- Images support alt text; decorative imagery can be marked decorative.
- Audio features require transcripts and independent volume controls.

---

## 6. Visual language

### 6.1 Overall direction

The visual character is editorial, warm, restrained, and architectural: a quiet book, private atelier, or beautifully designed reading room. It should not resemble a corporate dashboard, scrapbook, saturated manifestation board, or “girlboss” planner.

Reference qualities—not copied brands—include generous Apple-like spacing, Kinfolk-like restraint, calm modern editorial hierarchy, natural materials, and subtle tactile warmth.

### 6.2 Design tokens

The accepted token contract, exact Chamomile values, per-theme note-stock pairs, seven theme override maps, geometry, elevation, spacing, and motion values are specified in [the final visual addendum](../design/The-Studio-Final-Visual-Design-Addendum.md#3-canonical-token-contract).

Tokens are semantic CSS custom properties applied at the app root. Components must not embed theme hex values or branch by theme name. Chamomile is the complete fallback; other themes are typed override maps. The six semantic colors normally appear as a labeled heart/dot, edge, underline, or icon accent—not as a full saturated card background.

### 6.3 Color semantics

| Semantic type | Accent | Meaning | Guiding question |
|---|---:|---|---|
| Foundations | Grey | Values, principles, beliefs, supports, non-negotiables | What supports this? |
| Vision | Gold/yellow | The life or experience intentionally being created | What am I creating? |
| Growth | Sage green | Practices, skills, experiments, health, cultivation | What am I cultivating? |
| Reflection | Muted blue | Lessons, questions, insights, observations | What am I learning? |
| Celebration | Warm orange | Wins, gratitude, evidence, meaningful moments | What is working? |
| Uncharted | Dusty purple | Possibilities beyond the current map | What if…? |

The removed “Action” color is intentional. Execution belongs primarily in calendars or task systems. Within The Studio, decisions and practices may be represented structurally without creating a seventh semantic category.

### 6.4 Typography

Accepted hierarchy:

- **Editorial display:** self-hosted Newsreader for room titles, card display titles, and occasional short pull statements.
- **Interface and body:** self-hosted Hanken Grotesk.
- **Handwritten accent:** self-hosted Caveat, used rarely and decoratively; never for essential copy or controls.
- **Monospace:** `SFMono-Regular`, `Consolas`, monospace, only for file paths, Markdown, and metadata examples.

Font files require recorded licenses, `font-display: swap`, privacy-preserving local delivery, offline availability, and resilient system fallbacks. See [ADR-007](../architecture/decisions/ADR-007-self-hosted-typography.md).

Suggested scale:

- Room title: clamp(2.25rem, 5vw, 4.5rem), normal weight.
- Page subtitle: 1.125–1.375rem, muted.
- Section heading: 0.75rem, semibold, uppercase, tracked.
- Card title: 1.125rem, medium.
- Body: 1rem desktop, 1rem mobile, 1.55–1.7 line height.
- Metadata: 0.8125–0.875rem, never essential as the only label.

### 6.5 Layout and spacing

- Use an 8px base spacing rhythm with generous 32–96px section gaps.
- Primary room content caps at approximately 1180px and should rarely occupy more than 70–80% of a wide viewport.
- Reading views cap line length near 65–75 characters.
- Cards have generous internal padding (20–28px desktop, 16–20px mobile).
- White space is a functional component and should not be automatically filled.
- Allow one strong image or visual anchor rather than many competing thumbnails.

### 6.6 Imagery and iconography

Use personal photographs, nature, architecture, books, light, texture, family, workspaces, and symbolic places. Avoid generic luxury-signifier imagery. Images must be removable and optional; the app must remain beautiful without them.

Icons should be simple outline symbols with text labels. Emoji hearts may be used in personal content, but the UI should use consistent accessible icons plus semantic labels.

### 6.7 Motion

Motion is subtle and purposeful:

- 150–220ms fades and position transitions.
- Gentle room entry and card reordering.
- No parallax, celebration confetti, bouncing reminders, or ambient animation in MVP.
- Honor `prefers-reduced-motion` with instant transitions.

---

## 7. Information architecture

### 7.1 Stable navigation

Primary navigation contains the seven core rooms. Inner Studio appears only when enabled. A small utility layer contains Search, Inbox, Archive, Trash, Settings, and Help.

Desktop:

- Collapsible left rail with room names.
- Main room canvas.
- Optional right inspector for metadata, links, and history.
- Global search/command trigger in the top bar.

Mobile:

- Home/room switcher with a compact bottom navigation for Home, Capture, Search, and More.
- Full-screen card editor.
- No permanent inspector; metadata opens as a sheet.
- Capture is always one tap away.

### 7.2 Fixed, configurable, and movable elements

**Fixed system elements**

- The house metaphor and seven core room purposes.
- Six semantic types and meanings.
- Core card fields and file integrity rules.
- Landscape’s vertical progression.
- Archive, Trash, and version history behavior.

**Configurable elements**

- Room subtitles and prompts.
- Life areas and their order.
- Current Season duration and title.
- Featured content, cover images, and preferred views.
- Visibility of optional sections.
- Typography fallback and theme accessibility settings.

**Drag-reorderable elements**

- Cards within compatible sections.
- Life-area columns.
- Current Season priorities and featured practices.
- Images and supporting cards within defined layout slots.
- Wisdom themes.

**Not freely draggable in MVP**

- Global navigation.
- Foyer’s structural regions.
- Landscape row meanings.
- Semantic legend.
- Search and safety controls.

### 7.3 Cross-room relationships

A single note may appear in multiple generated views without duplication. Example: a retreat idea with `semantic_type: uncharted`, `life_areas: [business, creativity]`, and `season: 2027-summer` appears in Uncharted, the relevant Landscape columns, and that season’s supporting material. Its canonical Markdown file remains singular.

### 7.4 Inbox and triage

Fast capture creates an Inbox note with minimal metadata. Inbox is a utility view, not an eighth philosophical room. Triage is optional:

- Keep as fragment.
- Assign a semantic type.
- Place in a room/life area.
- Link to an existing note.
- Archive or delete.

The Inbox must not display guilt-inducing counts on the main navigation.

---

## 8. Room-by-room specifications

## 8.1 Foyer

### Purpose

The Foyer answers: “Where am I, what matters now, and how do I want to enter?” It is the default landing room and a compass rather than a dashboard.

### Primary content

- Studio name and optional motto.
- “Currently becoming…” — one sentence.
- Current Season card with title and up to three priorities.
- Desired feelings, shown as a quiet cluster.
- Selected guiding principles.
- One featured image or texture.
- Semantic legend, compact and optional.
- A gentle “return” element: recent reflection, celebration, or meaningful note from the past.

### Mechanics

- Structure is fixed; content slots are editable.
- Each slot can be hidden, but users cannot add unlimited dashboard widgets.
- Featured content is selected manually in MVP; later, suggested items may be offered.
- “Continue where I left off” appears only when an unfinished draft exists.
- The Foyer never shows overdue tasks, charts, streaks, or total note counts.

### Empty state

Prompt the user to add only three things: one sentence for the current becoming, one desired feeling, and one principle. Everything else can wait.

### Acceptance criteria

- Loads in under one second from a warm cache.
- Remains visually composed with zero, partial, or full content.
- All editable content is reachable by keyboard and screen reader.
- No more than three primary calls to action are visible at once.

## 8.2 Identity Studio

### Purpose

A place to articulate and revise identity without forcing a performance of a perfect “future self.” It holds current truths, becoming statements, values, beliefs being chosen, emotional qualities, and embodiment practices.

### Sections

- **Currently becoming** — one featured identity sentence.
- **Who I am now** — strengths, truths, lived identities.
- **Who I am becoming** — emerging qualities and capacities.
- **Values and principles** — durable foundations.
- **How I want to feel** — desired emotional qualities, not mandatory baselines.
- **Beliefs in practice** — beliefs being tested or strengthened.
- **Embodiment cues** — small observable ways identity appears in daily life.
- **Identity shifts** — a dated history of changed language or assumptions.

### Mechanics

- Cards snap into sections and can be reordered.
- A card may be promoted to “currently becoming” without duplication.
- Before-and-after identity language can be captured as a linked pair.
- The interface discourages absolute self-judgment; prompts use “I am practicing…” and “I notice…” alongside “I am…”.
- Optional “evidence” links connect celebrations or reflections to identity cards.

### Empty-state prompts

- What already feels true about you?
- What quality are you practicing this season?
- What does that quality look like in an ordinary hour?

## 8.3 Life Landscape

### Purpose

The Landscape converts a whole-life vision into an understandable matrix without collapsing it into a to-do list. It applies the same thinking progression across configurable life areas.

### Default columns

Family, Home, Health & Wellbeing, Work/Business, Money, Creativity, Relationships/Community, Adventure, Spirituality, and Learning. The user may rename, reorder, hide, or add areas. Recommend 5–10 active areas to preserve readability.

### Fixed rows

1. **Vision** — What does this area actually look and feel like?
2. **Identity, values & feelings** — Who is living it? What matters? How does she move and feel?
3. **Decisions** — What choices can be made in the next 30, 60, or 90 days?
4. **Practices** — What recurring rhythms express the identity?
5. **Structure & strategy** — What concrete supports make those choices and practices possible?

### Desktop views

- **Matrix overview:** columns are life areas; rows are the five anchors. Cells show one featured card and a count of additional cards.
- **Focus view:** selecting a life area zooms into its five anchors as spacious stacked sections.
- **Lens view:** selecting an anchor shows it across all life areas, useful for reviewing every Vision or every Structure.

### Mobile views

- Default to one life area at a time with a horizontal area switcher.
- Anchors appear vertically.
- The entire matrix is available only as a zoomable overview, not the primary editor.

### Mechanics

- Dragging reorders cards inside a cell or life-area columns in overview.
- Moving a card to another cell updates `life_areas` and `landscape_anchor` metadata.
- A card can appear in multiple life areas; dragging with a modifier/explicit command chooses move versus link.
- Decisions may carry a horizon (`30d`, `60d`, `90d`, or `someday`) without becoming tasks.
- Practices can link outward to a calendar or reminders URI, but The Studio does not schedule them in MVP.
- The matrix must remain legible with missing cells; blank space is not an error.

### Prompts

Vision: What would an ordinary Tuesday look like if this were true?  
Identity: Who is the version of me living this? How does she move in rooms?  
Decisions: What can I choose in the next 30, 60, or 90 days?  
Practices: What rhythm lets this be lived repeatedly?  
Structure: What time, environment, help, boundary, money, or system supports it?

## 8.4 Current Season

### Purpose

Translate the larger landscape into a humane, limited present focus. A season is a named chapter, not necessarily a calendar quarter.

### Core fields

- Season title and optional date range.
- Season statement: “This is a season of…”
- Up to three priorities.
- Desired qualities/feelings.
- Active decisions and experiments.
- Supporting practices.
- “Not now” shelf.
- Support and constraints: childcare, energy, finances, health, time.
- Definition of enough.
- Mid-season notes.

### Mechanics

- Exactly one season is active.
- Season duration is flexible; suggested default is 8–13 weeks.
- Cards are linked into the season, not duplicated.
- Limits are enforced gently: adding a fourth priority requires replacing one or explicitly overriding the recommendation.
- “Not now” is celebrated as intentional focus, not treated as backlog debt.
- The room can generate a printable/read-only one-page season view.

### Close-season workflow

The user reflects, celebrates, carries forward selectively, and archives the season. Nothing is automatically carried forward. See Section 14.

## 8.5 Uncharted

### Purpose

A pressure-free place for possibilities beyond the current map: “What if…?”, “I wonder…”, childhood landscapes, wild ideas, and goals whose path cannot yet be imagined.

### Content types

- What-if cards.
- Dream fragments.
- Place and scene cards.
- Big possibilities.
- Questions without answers.
- Image-led inspiration.
- Future horizons.

### Mechanics

- New-card prompt defaults to “What if…”.
- No due dates, progress bars, or conversion pressure.
- Cards may be loosely clustered by theme or horizon.
- A card can be “invited into a season,” creating a link while retaining its Uncharted identity.
- Optional status language is non-linear: `seed`, `returning`, `ripening`, `invited`, `resting`. These are DEFERRED until user testing validates value.
- Random resurfacing is opt-in and gentle: “Would you like to revisit something Uncharted?”

### Safety

The app must not describe imaginative material as prophecy, fact, or guaranteed future reality. It supports creative and reflective exploration.

## 8.6 Wisdom Garden

### Purpose

Transform collected teachings into a thematic, self-authored philosophy. Organize ideas by concepts, not by teachers or courses.

### Default themes

Alignment, identity, self-worth, creativity, motherhood, money, business, relationships, beauty, rest, decision-making, imagination, and nervous-system care. Themes are editable.

### Card types

- Insight.
- Quote with source.
- Principle.
- Practice.
- Question.
- Book/course/podcast note.
- Synthesis note connecting several sources.

### Mechanics

- Source attribution is preserved even though browsing centers themes.
- Multiple cards can be selected to create a synthesis note with backlinks.
- Notes support ordinary wiki links (`[[Note title]]`) and Markdown links.
- A “make it mine” prompt asks: What do I believe? What have I observed? How would this fit my actual life?
- The app avoids incentivizing volume. No collection completion metrics.

## 8.7 Reflection Garden

### Purpose

Complete the learning loop by preserving reflection, celebration, evidence, surprise, and change across time.

### Views

- **Garden:** a spacious chronological stream.
- **Reflection:** blue-accented learning and questions.
- **Celebration:** orange-accented wins, gratitude, evidence, and moments.
- **Themes:** recurring tags and linked concepts.
- **Then and now:** manually or AI-suggested connections across time.

### Entry prompts

- What is working?
- What surprised me?
- What am I proud of?
- What did I learn?
- What delighted me?
- What am I releasing?
- Where did I see evidence of the person I am becoming?

### Mechanics

- Quick reflection supports one sentence; longer journal entries use a distraction-free editor.
- Celebration is a first-class semantic type, not merely a positive reflection tag.
- Entries can link to a season, identity, life area, or Uncharted card.
- Calendar heat maps and streaks are excluded.
- “On this day” is opt-in and must exclude private/sensitive entries when requested.
- Private-on-device sentiment or theme processing may come later; never label emotional states as diagnoses.

## 8.8 Optional Inner Studio — post-MVP

### Purpose

A deliberately bounded space for guided imagery, dream incubation notes, recurring dream environments, symbolic places, lucid-dream records, and Jung-inspired active imagination.

### Conceptual distinction

- **Outer Studio:** consciously designed structures, values, plans, and reflections.
- **Inner Studio:** imagery and symbolic material encountered with curiosity, without assuming it is literal, predictive, or objectively interpretable.

### Objects

- Places (garden, library, hearth, hill, gate, greenhouse).
- Figures (librarian, child, guide, animal), described by the user.
- Journeys/sessions.
- Dreams.
- Symbols.
- Guided scripts and audio.
- Connections to Outer Studio notes.

### Modes

1. **Arrival meditation:** intentionally revisit a known place.
2. **Open exploration:** begin with a doorway or place and allow imagery to unfold.
3. **Dream incubation:** set a gentle pre-sleep intention.
4. **Session capture:** record what appeared before interpreting it.
5. **Meaning-making:** add personal associations later, clearly separated from observation.

### Safeguards

- Display a clear educational disclaimer: this is a reflective creativity tool, not therapy, medical care, or a source of supernatural certainty.
- Encourage stopping if a session becomes distressing and seeking appropriate human support.
- Never generate authoritative symbol interpretations.
- Keep “What happened” separate from “What it might mean.”
- Avoid intense audio frequencies, health claims, sleep disruption prompts, or encouragement to practice while driving.
- Provide reduced sensory mode and silence by default.

---

## 9. Interaction model

### 9.1 Core object flow

Capture → optionally classify → place/link → revisit → reflect → archive or evolve.

Classification is not required at capture. The app derives room views from metadata while preserving the original Markdown content.

### 9.2 Creation

Creation entry points:

- Global “New” button.
- Keyboard shortcut (`N` when not editing; platform-aware command palette).
- Mobile quick capture.
- Contextual add button in a room, section, or Landscape cell.
- Paste/import from clipboard or Markdown file.

The quick composer asks only for content. Context pre-fills metadata. The full editor exposes title, semantic type, links, life areas, season, tags, source, and attachments.

### 9.3 Editing and autosave

- Inline title/body editing where space permits.
- Full-page editor for long-form notes.
- Autosave after 500–1,000ms of inactivity and on blur/navigation.
- Use optimistic UI with conflict-aware file writes.
- Show non-blocking save state.
- Keep a recovery buffer in local storage for unsaved editor title/body text. In
  the MVP, structured metadata edits are protected by durable autosave but are
  not duplicated into the session recovery record; expanding recovery fidelity
  requires a versioned recovery schema and migration before claiming full-note
  crash recovery.
- Preserve user formatting as CommonMark/GFM-compatible Markdown.

### 9.4 Drag and drop

- Use drag for reordering and moving among compatible containers.
- Display clear drop targets and a preview of metadata changes.
- Provide keyboard commands: Move up/down, Move to…, Add to…, Remove from view.
- Touch uses long press followed by drag; accidental motion thresholds prevent unintended moves.
- Cross-room dragging creates or updates metadata, not new file copies.
- Undo is available immediately after a move.

### 9.5 Linking and transclusion

- Support `[[wiki links]]` and standard Markdown links.
- Backlinks are shown in the inspector.
- A card may be embedded as a compact preview in another room without duplicating its content.
- Broken links remain visible and repairable.
- Renames update internal wiki links transactionally, with a preview when many files are affected.

### 9.6 Delete, archive, and history

- Archive removes an item from active views while retaining its file under `Archive/` or with `status: archived` according to the chosen file strategy.
- Delete moves the file to `.studio/Trash/` and records deletion metadata.
- Trash retention defaults to 30 days but is configurable.
- Local snapshots retain recent versions; Git history is optional.
- Permanent deletion requires explicit confirmation and lists affected attachments/backlinks.

### 9.7 Command palette

The palette supports navigation and safe, reversible commands: open room, create card, move card, link note, change semantic type, start/close season, export, and open settings. It does not expose developer jargon by default.

### 9.8 Error states

Errors use plain language and preserve work:

- Vault unavailable: enter read-only cached mode and explain how to reconnect.
- File conflict: show both versions, common ancestor if available, and a merge editor.
- Invalid frontmatter: render the note body, mark metadata for repair, and never discard content.
- Attachment missing: retain the reference and offer relink/remove.
- Index failure: rebuild from files; do not block editing unless the file system itself is unavailable.

---

## 10. Card system

### 10.1 Card as the fundamental presentation unit

A card is a view of a Markdown document or a selected excerpt, not necessarily a separate database record. Long notes can render as compact cards in rooms and full documents in the editor.

### 10.2 Required fields

- Stable `id` (UUIDv7 or ULID).
- Title or generated display label for untitled fragments.
- Markdown body.
- Created and updated timestamps.
- Semantic type.
- Status.

### 10.3 Optional fields

- Room(s) and section.
- Life area(s) and Landscape anchor.
- Season(s).
- Tags.
- Links/backlinks.
- Source citation and source URL.
- Attachments and cover image.
- Alt text.
- Featured/pinned state.
- Sort order per view.
- Sensitivity/privacy flags.
- AI permission scope.

### 10.4 Card variants

- Text/idea.
- Quote.
- Image.
- Principle.
- Prompt/question.
- Reflection.
- Celebration.
- Dream/session.
- Place/symbol (Inner Studio).
- Audio/meditation (future).

Variants affect rendering and optional fields, not storage ownership.

### 10.5 Display states

- **Glimpse:** title, semantic heart, one-line excerpt.
- **Card:** title, excerpt, optional image, light metadata.
- **Expanded:** full content in context.
- **Focus:** distraction-free document view.

### 10.6 Ordering

Manual order is stored per view in `.studio/views/*.json` because one note may appear in several contexts with different orders. The Markdown note remains unaware of incidental visual ordering unless order has semantic meaning. If a view file is lost, fall back to `updated`, `created`, or title order.

---

## 11. Markdown-first storage architecture

### 11.1 Source-of-truth rule

Markdown and ordinary media files are authoritative. The app must be able to rebuild all primary content views after deleting caches and databases. Any feature that cannot be reconstructed from the vault must be explicitly classified as disposable UI state.

### 11.2 Markdown dialect

- CommonMark plus GitHub Flavored Markdown.
- YAML 1.2 frontmatter.
- UTF-8.
- LF line endings preferred; preserve existing line endings when editing imported files.
- Wiki links supported as an extension.
- Do not rewrite user Markdown unnecessarily; use a concrete syntax tree and minimally invasive serialization where practical.

### 11.3 Canonical frontmatter schema

```yaml
---
schema_version: 1
id: 01J2ABC3DEF4GHI5JKL6MNPQRS
title: A calm home that supports family life
card_type: vision
semantic_type: vision
status: active
rooms:
  - life-landscape
life_areas:
  - home
landscape_anchor: vision
seasons:
  - 2026-winter
tags:
  - calm-home
  - family
created: 2026-07-13T10:15:00+10:00
updated: 2026-07-13T10:15:00+10:00
source:
  title: null
  creator: null
  url: null
attachments: []
display:
  cover: null
  featured: false
privacy:
  sensitivity: private
  ai_access: ask
---
```

### 11.4 Schema rules

- `schema_version`, `id`, `created`, and `updated` are machine-managed.
- `title` may be absent for fragments; UI generates but does not necessarily persist an excerpt label.
- `semantic_type` is one of `foundations`, `vision`, `growth`, `reflection`, `celebration`, `uncharted`.
- `card_type` is a presentation/content subtype and can expand without changing color semantics.
- `rooms`, `life_areas`, and `seasons` are arrays to support multiple views.
- `status` is `draft`, `active`, `resting`, `archived`, or `trashed`; MVP UI mainly exposes active/archive/trash.
- Unknown frontmatter keys must be preserved.
- Invalid enum values must not cause content loss; show an “unrecognized metadata” warning.
- All migrations are versioned, reversible where possible, and preceded by an automatic backup.

### 11.5 File naming

Recommended canonical filename: `YYYY-MM-DD--slug--shortid.md`. The stable ID—not the path—is identity. Renaming titles may rename files only if the user enables automatic filenames. Imported filenames are preserved by default.

### 11.6 Attachments

- Store ordinary files under `Attachments/`, optionally grouped by year/month.
- Use relative Markdown paths.
- Calculate content hashes to detect duplicates without forcing deduplication.
- Store generated thumbnails only in cache, never alongside originals unless exported.
- Never alter originals silently; image optimization creates a derivative.

### 11.7 Structured UI state

The following can live under `.studio/` because they are app-specific but exportable:

- `settings.json` — vault-level preferences.
- `views/*.json` — manual ordering, collapsed sections, saved lenses.
- `seasons/*.json` — workflow checkpoints not suited to note content.
- `backups/` — pre-migration snapshots.
- `Trash/` — recoverable deleted files.
- `index.sqlite` — disposable search/index cache.

No secret keys should be stored unencrypted in the vault.

### 11.8 Obsidian interoperability

- Avoid reserved proprietary Markdown syntax when standard Markdown or frontmatter will work.
- Wiki links and attachments should open in Obsidian.
- App-specific folders are hidden-prefixed where appropriate.
- The Studio should ignore `.obsidian/` safely.
- Provide an interoperability document explaining which Studio features degrade to plain notes in Obsidian.

---

## 12. File and folder structure

Recommended human-readable structure:

```text
The Studio/
├── Foyer/
├── Identity Studio/
├── Life Landscape/
│   ├── Family/
│   ├── Home/
│   ├── Health and Wellbeing/
│   ├── Work and Business/
│   ├── Money/
│   └── .../
├── Current Season/
├── Uncharted/
├── Wisdom Garden/
├── Reflection Garden/
│   ├── Reflections/
│   └── Celebrations/
├── Inner Studio/
│   ├── Places/
│   ├── Figures/
│   ├── Dreams/
│   └── Sessions/
├── Attachments/
├── Archive/
└── .studio/
    ├── settings.json
    ├── views/
    ├── backups/
    ├── Trash/
    └── index.sqlite
```

Folder placement supplies a default room, but frontmatter is authoritative for multi-room display. The app should offer a “flat vault mode” later for users who prefer all notes in one directory. MVP uses the readable structure above.

---

## 13. Search, retrieval, and connections

### 13.1 MVP search

- Full-text search across titles, body, tags, sources, and selected frontmatter.
- Filters for room, semantic type, life area, season, status, date, and card type.
- Typo-tolerant title/tag search.
- Search snippets with highlighted matches.
- Keyboard-first command/search overlay.
- Search remains entirely local.

### 13.2 Indexing

Use SQLite with FTS5 or an equivalent local index. Watch vault changes and update incrementally. The index stores parsed metadata, text, links, hashes, and file modification state. It must be safely deletable and rebuildable.

### 13.3 Natural-language and semantic search — later

Examples:

- “Show me moments when I felt peaceful.”
- “What themes recur in my motherhood reflections?”
- “Show Uncharted ideas related to travel and community.”

Semantic embeddings should be opt-in, generated locally where feasible, and clearly disclose whether content leaves the device. Keyword evidence must remain visible beside semantic matches.

### 13.4 Meaningful resurfacing

Later versions may offer:

- On this day.
- Earlier note connected to a new celebration.
- Uncharted idea recurring across several reflections.
- A principle frequently evidenced in practice.

Users control frequency, excluded notes, and whether resurfacing appears at all.

---

## 14. Seasonal workflows

### 14.1 Begin a season

1. Name the season and optionally choose dates.
2. Reflect on the previous season or explicitly skip.
3. Choose how this season should feel.
4. Select up to three priorities from existing cards or create them.
5. Choose decisions/experiments and supporting practices.
6. Name real constraints and available support.
7. Define “enough.”
8. Move tempting but inactive items to “Not now.”
9. Confirm the one-page season view.

### 14.2 Weekly return — optional, lightweight

The app may offer a five-minute prompt:

- What matters this week?
- What support is needed?
- What can be released?
- What deserves celebration?

This is not a required ritual and creates no missed-week state.

### 14.3 Mid-season review

- What has changed?
- Are the priorities still honest?
- Is the current structure supporting family reality?
- What is working unexpectedly?
- What should be adjusted, paused, or invited in?

Users may revise the season without marking the original plan as failure. Changes are preserved in history.

### 14.4 Close a season

1. Capture celebrations and evidence.
2. Reflect on learning, surprise, delight, and difficulty.
3. Review identity shifts and desired feelings.
4. For each active item: complete/celebrate, archive, return to Landscape, invite into next season, or let go.
5. Create a concise season letter/snapshot.
6. Archive the season read-only while allowing later annotations.

No card carries forward automatically.

---

## 15. AI features and policy

### 15.1 AI product role

AI is a reflective assistant that notices, retrieves, compares, and offers drafts. It does not decide what Anna wants, diagnose her, interpret symbols authoritatively, or silently rewrite her archive.

### 15.2 Permission model

AI access is explicit at three levels:

- **Off:** no AI processing.
- **Selected:** only notes manually included in a request.
- **Scoped:** user grants access to named rooms, date ranges, or semantic types for a specific feature.

Every AI invocation shows its scope before sending. Sensitive notes may carry `ai_access: never`. This flag must be enforced locally before any request payload is constructed.

### 15.3 Candidate features

**MVP:** No required AI dependency. The app must be fully useful offline without AI.

**V1:**

- Summarize selected notes.
- Suggest links among selected notes.
- Draft a seasonal reflection from selected evidence.
- Generate prompts from current content.
- Explain why each result was surfaced with citations to local notes.

**V2:**

- Pattern noticing across an explicitly scoped corpus.
- Theme and language changes over time.
- Natural-language retrieval.
- Guided meditation script drafting from user-selected Inner Studio places.
- Duplicate/near-duplicate insight suggestions.

### 15.4 AI response requirements

- Cite note titles and stable IDs/links.
- Separate observation from inference.
- Use probabilistic language where appropriate.
- Never claim frequency counts unless computed deterministically.
- Offer edits as a preview/diff; do not write without confirmation.
- Provide “Why am I seeing this?” and “Exclude this note/theme.”
- Do not train external models on user content unless the user separately and explicitly opts in.

### 15.5 Safety and psychological boundaries

AI must not:

- affirm delusions as external fact;
- guarantee manifestation outcomes;
- encourage sleep deprivation or unsafe lucid-dream practices;
- replace professional mental-health, medical, legal, or financial advice;
- infer diagnoses from journal content;
- impose universal dream-symbol meanings;
- use manipulative language to increase engagement.

---

## 16. Data model

### 16.1 Durable entities

**Note** — canonical Markdown document.  
**Attachment** — ordinary referenced file.  
**Season** — a Markdown season note plus structured workflow metadata.  
**LifeArea** — configured concept with stable slug and display order.  
**Theme** — tag-like Wisdom grouping.  
**Link** — parsed relationship between notes or external resources.

### 16.2 Derived/index entities

**CardProjection** — representation of a Note in a specific room/view.  
**Backlink** — inverse parsed link.  
**SearchDocument** — indexed title/body/metadata.  
**ViewOrder** — note ordering within a view/container.  
**Thumbnail** — cached derivative.  
**Embedding** — optional local/remote-derived vector, disposable and permission-bound.

### 16.3 Relationship summary

- A Note has zero or more semantic room projections.
- A Note has one semantic type and one card type.
- A Note can belong to multiple LifeAreas and Seasons.
- A Season references many Notes; Notes may appear in multiple Seasons historically.
- Notes link many-to-many through wiki/Markdown links.
- Attachments may be referenced by many Notes.
- ViewOrder relates a view key to an ordered list of Note IDs.

### 16.4 Identity and concurrency

- Stable IDs use UUIDv7 or ULID for time-sortable local generation.
- File path is mutable and not a foreign key.
- Updates use file hash plus modified timestamp to detect concurrent edits.
- On conflict, preserve both file bodies until resolved.

---

## 17. Sync, backup, import, and export

### 17.1 MVP strategy

Begin local-first. The desktop app opens a user-chosen vault using the File System Access API where supported, or a local companion service/Tauri shell if browser limitations prevent reliable directory access. The product should not pretend a pure PWA can safely offer identical filesystem behavior on every browser or iPhone.

MVP deployment options, in preferred order:

1. **Desktop-first local web app with a small local companion service** for reliable vault access, plus responsive browser UI.
2. **Tauri desktop wrapper** sharing the same web UI if the companion approach adds too much setup.
3. Browser-only OPFS prototype for interaction testing, with explicit export/import; not the final ownership model.

Mobile MVP may be read/capture through a private sync service or a simplified share-to-vault workflow. True seamless cross-device sync is a separate milestone.

### 17.2 Sync options

**iCloud Drive folder:** natural for Apple devices but browser/server access and file-conflict behavior require testing. Best with a desktop/native wrapper.  
**Git:** excellent version history and backup for technical operation, but not a user-facing sync experience. Keep optional and automated.  
**Private Studio Sync:** encrypted object/file synchronization with accounts; greatest polish and engineering cost.  
**WebDAV/S3-compatible storage:** future advanced option.

Recommended path: local vault → automatic local snapshots → optional Git backup → end-to-end encrypted Studio Sync after the product proves useful.

### 17.3 Conflict resolution

- Sync operates at file level with stable IDs.
- Non-overlapping files merge automatically.
- Frontmatter and body edits to the same file use a three-way merge when a common ancestor exists.
- Unresolved conflicts create preserved siblings and a human-readable merge screen.
- Never silently choose “latest modified” when both sides changed.

### 17.4 Backup

- Automatic pre-migration backup.
- Daily rolling local snapshots when the app is used.
- User-triggered ZIP export containing Markdown, assets, settings, schema version, and checksums.
- Restore preview shows items to create, overwrite, or conflict.
- Periodic restore tests are part of release QA.

### 17.5 Import/export

Import:

- Existing Markdown folder or Obsidian vault.
- Individual Markdown/text files.
- Images, PDFs, and audio.
- Later: Freeform PDF/image as reference, not automatically reconstructed layout.

Export:

- Complete portable ZIP.
- Selected notes as Markdown.
- Current Season as Markdown/PDF/print view.
- Room snapshot as static HTML or PDF later.

Browser ZIP portability is deliberately bounded to the safe, interoperable
ZIP32 subset. One export may contain at most 9,999 user files, each entry may
contain at most 64 MiB, and both expanded data and the resulting archive must
remain at or below 512 MiB. The app must report these as typed, actionable
export-limit errors before allocating or publishing an incomplete archive.
These are export-transport limits, not vault-capacity limits: a larger browser
vault remains usable and can be exported in selections until ZIP64 or streamed
multi-part export is designed and tested. Desktop may later provide a streaming
export path with larger limits, but must preserve the same manifest and checksum
contract.

---

## 18. Privacy and security

### 18.1 Privacy posture

Private by default, local by default, no advertising, no content analytics, and no AI processing without deliberate scope. The business model, if one is ever needed, should not depend on extracting personal data.

### 18.2 Threat model

Protect against:

- accidental loss or destructive migration;
- unauthorized access to a shared/lost device;
- cloud provider or sync-service exposure;
- leaked AI prompts/responses;
- malicious imported Markdown, SVG, HTML, or attachments;
- path traversal and unsafe file operations;
- cross-site scripting in rendered Markdown;
- secrets committed through Git backup.

### 18.3 Controls

- Sanitize Markdown HTML; disable raw HTML by default.
- Content Security Policy with no unnecessary third-party origins.
- Validate all paths remain inside the selected vault.
- Treat SVG and active documents cautiously; render safely or require explicit open.
- Encrypt sync in transit and at rest; future Studio Sync should use end-to-end encryption where practical.
- Offer optional app lock using platform authentication in wrappers.
- Store API keys in OS keychain/secure storage, not Markdown or localStorage.
- Redact personal content from error reports; diagnostics are opt-in.
- Maintain dependency scanning and a security update process.

### 18.4 Privacy controls in content

Each note may specify sensitivity and AI permissions. Future sharing must be allowlist-based: selected notes only, with a preview of exact files and attachments.

---

## 19. Engineering architecture

### 19.1 Recommended stack

- **Frontend:** React + TypeScript, Vite (or a similarly lightweight build system).
- **Routing/state:** React Router; TanStack Query for async state; a small local UI store such as Zustand where needed.
- **Styling:** CSS Modules or vanilla CSS with BEM naming and design tokens; no utility-class soup and no `!important`.
- **Editor:** CodeMirror 6 for Markdown source/focus mode plus a carefully chosen rich Markdown surface if needed. Preserve Markdown fidelity.
- **Drag and drop:** dnd-kit with keyboard sensors and accessible alternatives.
- **Parsing:** unified/remark ecosystem with YAML parsing and sanitized rendering.
- **Index:** SQLite/FTS5 via local service or Tauri plugin; browser prototype may use OPFS + SQLite WASM.
- **Desktop bridge:** evaluate a small Rust/Tauri shell versus a Node local companion. Prefer the least operational complexity that provides safe filesystem watching and atomic writes.
- **Testing:** Vitest, React Testing Library, Playwright, axe-core; filesystem integration tests against temporary vault fixtures.

Avoid choosing Next.js solely for server rendering: the core product is local-first and application-like. If private cloud sync/auth later needs a service, keep it separate from the local content engine.

### 19.2 Architectural layers

1. **Vault adapter** — list/read/write/move/watch files, atomic operations, path safety.
2. **Content engine** — parse/serialize Markdown/frontmatter, schema validation, migrations, link resolution.
3. **Index engine** — disposable SQLite search and relationship index.
4. **Domain layer** — rooms, seasons, life areas, semantic types, view projections.
5. **Application services** — capture, search, reorder, archive, export, sync, AI scope builder.
6. **UI** — responsive room views, editor, inspector, command palette.

All layers depend inward toward file/content abstractions. UI must not write files directly.

### 19.3 Write safety

- Write to a temporary file in the same directory, fsync where available, then atomic rename.
- Preserve file permissions and unknown metadata.
- Validate a newly serialized document before replacing the original.
- Keep a short automatic revision journal for crash recovery.
- Batch link updates transactionally with rollback artifacts.

### 19.4 Offline behavior

- All core reading, writing, searching, and organizing work offline.
- Service worker caches the application shell, not private vault content unless explicitly encrypted.
- Cloud sync and AI show offline states without blocking local work.

### 19.5 Performance targets

On a reference vault of 10,000 notes and 5 GB attachments:

- Warm app shell to interactive: under 1.5 seconds on a recent Mac.
- Room transition: under 150ms perceived delay.
- Note open: under 100ms after index warm-up.
- Search first results: under 200ms for keyword queries.
- Incremental save acknowledgment: under 100ms; durable write under 1 second.
- Full index rebuild: progress visible, editing remains possible, and completes within a reasonable hardware-dependent window.

The reference vault is a performance and storage target; it does not imply that
the MVP browser ZIP32 exporter can package the entire reference vault in one
archive. Full-reference-vault portability requires the later streaming or
multi-part export path described in Section 17.5.

### 19.6 Observability

Use structured technical logs stored locally with content redaction. Record operation type, timing, error code, file ID/hash—not titles or bodies. A diagnostics export must preview exactly what it contains.

### 19.7 Testing strategy

Follow test-driven development for domain rules and file safety.

- Unit: schema parsing, serialization fidelity, semantic rules, season limits, path safety.
- Property/fuzz: malformed frontmatter, unusual filenames, Unicode, Markdown edge cases.
- Integration: atomic writes, watcher events, index rebuild, rename/link updates, trash/restore.
- Component: keyboard navigation, empty states, editor recovery, inspector.
- End-to-end: create → edit → drag → search → archive → export → fresh restore.
- Visual regression: every room at desktop/tablet/mobile, empty/partial/full states, dark/high-contrast/reduced-motion variants when introduced.
- Accessibility: automated axe checks plus keyboard and VoiceOver manual passes.
- Browser/device: Safari and Chromium on macOS; Safari on iPhone; installed PWA where supported.

Any visible feature must be inspected in a real browser with Playwright screenshots before acceptance.

---

## 20. UI mockup descriptions

These descriptions are implementation references for wireframes and high-fidelity mockups.

### 20.1 App shell — desktop

A warm-white window with a narrow left rail. At the top sits “The Studio” in a restrained serif, followed by seven room labels with small line icons. The active room is indicated by a pale surface and a thin semantic-neutral marker, not a bright block. Search and Inbox sit near the bottom; Settings is visually quiet. The central canvas has generous margins. A right inspector slides in only when requested.

### 20.2 Foyer

The room title “The Studio” appears large but not heavy. Beneath it: “Life by design” or the current motto in muted sans serif. The page is asymmetrical but aligned: a wide left column holds “Currently becoming…” and Current Season; a narrower right column holds one personal image and a small cluster of desired feelings. Three guiding principles float below as cream cards with tiny grey hearts. The six-heart legend sits quietly near the footer. At least 35% of the visible canvas remains empty.

### 20.3 Identity Studio

Title and one-sentence introduction at top. “Currently becoming” is a wide, pale card with a small foundation/vision accent. Below, a two-column editorial layout: “Already true” and “Practicing now.” Values appear as compact typographic chips without pill-heavy UI. Evidence links appear as small orange hearts with dates. On mobile, all sections stack and the featured sentence stays first.

### 20.4 Life Landscape

The overview resembles an elegant architectural matrix, not a spreadsheet. Life-area names sit across the top on a sticky header. The five anchors form a quiet left rail. Each cell contains one readable card preview and a subtle “+2” indicator. Borders are sparse; alignment and whitespace create the grid. Selecting Home animates to a focus view with five large vertical sections and a compact area switcher.

### 20.5 Current Season

An editorial cover at top: season name, date range, one-sentence definition of enough. Three priority cards sit in a balanced row on desktop and a vertical stack on mobile. Supporting practices and constraints are quieter below. “Not now” is a closed shelf that can expand without feeling like a backlog. A small “Close season” action stays out of the primary visual path.

### 20.6 Uncharted

The most spacious room. A purple heart and the prompt “What if…?” sit beside a large blank composer. Existing possibilities form loose but snapped clusters with abundant negative space. There are no progress indicators. An optional “Beyond the gate” divider separates familiar possibilities from ideas that feel genuinely unknowable.

### 20.7 Wisdom Garden

Theme names appear like a book’s contents rather than database filters. Selecting “Identity” opens a reading column of insights, quotes, and synthesis notes. Sources are shown in small, clear type. A “Make it mine” side prompt invites a personal response without demanding one.

### 20.8 Reflection Garden

A quiet chronological path. Blue reflections and orange celebrations alternate with date labels and plenty of whitespace. Cards link outward to identities, seasons, and life areas. A gentle top switch offers Garden / Reflection / Celebration / Themes. No calendar heatmap. “Then and now” connections appear as paired cards with a thin line and explanation.

### 20.9 Inner Studio

A darker-but-not-dark, low-stimulation canvas with a simple map or list of known places. “Enter” begins a full-screen guided session with text, optional audio, pause, and exit always visible. Afterward, a split capture distinguishes “What I noticed” from “What I think it might mean.” The visual design must not imitate a mystical authority or clinical tool.

### 20.10 Mobile quick capture

One tap opens a warm blank sheet with a blinking cursor and optional voice dictation. The only required action is Done. A second row offers semantic hearts and “Place later.” The sheet closes quickly and confirms “Remembered.”

---

## 21. Roadmap

### Phase 0 — Product proof and foundations

Goal: validate mechanics and emotional direction before building breadth.

- Interactive high-fidelity prototype for Foyer, Landscape focus view, Current Season, and mobile capture.
- Design tokens, typography licensing decision, responsive grid, accessibility baseline.
- Markdown/frontmatter schema spike with round-trip fidelity tests.
- Filesystem access spike: browser companion versus Tauri decision record.
- User test with Anna using realistic content.

Exit: selected architecture can safely round-trip a fixture vault; prototypes feel calm and understandable on Mac and iPhone.

### Phase 1 — MVP: a useful local Studio

- Open/create local vault.
- Foyer.
- Life Landscape matrix and focus view.
- Current Season with start/close workflows.
- Uncharted.
- Reflection and Celebration capture.
- Core card variants, semantic colors, inline/full editing.
- Markdown/YAML files, attachments, autosave, Inbox, Archive, Trash.
- Keyword search and filters.
- Export/backup and fresh restore.
- Responsive mobile web capture/review.
- Accessibility, browser QA, automated tests.

Identity Studio and Wisdom Garden may be included if schedule permits, but should not delay a coherent MVP; their content can initially be represented through Foyer/Landscape/cards.

### Phase 1.1 — Complete the seven-room house

- Full Identity Studio.
- Full Wisdom Garden and thematic synthesis.
- Better cross-room links/backlinks.
- View ordering and richer card variants.
- PWA installation polish.
- Print/PDF Current Season snapshot.

### Phase 2 — Continuity and sync

- Local snapshots and optional automated Git backup.
- Private account and end-to-end encrypted Studio Sync, or validated iCloud/Tauri strategy.
- Robust cross-device conflict resolution.
- Offline mobile capture queue.
- “On this day” and manually curated then/now connections.

### Phase 3 — Gentle intelligence

- Selected-note AI summaries and synthesis.
- Evidence-cited pattern noticing.
- Natural-language search.
- Prompt and seasonal-letter drafting.
- Local embedding option where hardware permits.
- Fine-grained AI scopes and audit log.

### Phase 4 — Inner Studio

- Place, figure, dream, symbol, and session schemas.
- Arrival and open-exploration scripts.
- Dream/session capture.
- User-authored map.
- Optional generated scripts/audio with safety controls.
- Cross-links between inner and outer notes.

### Future explorations

- Native Apple wrapper and Share Sheet.
- Voice capture/transcription on device.
- Static private publishing of selected notes.
- Template packs authored by Anna, without marketplace pressure.
- Local models for private synthesis.
- Rich spatial canvas only if structured layouts prove insufficient.

---

## 22. MVP release criteria

The MVP is ready only when:

- A new user can create/open a vault and understand the house without instruction.
- Every durable edit is represented in Markdown/frontmatter or ordinary assets.
- Deleting the index and rebuilding reproduces primary views.
- Autosave, crash recovery, Trash, export, and restore have end-to-end tests.
- The Landscape works with empty, sparse, and dense realistic data.
- Mobile capture completes in under 15 seconds.
- Keyboard-only and VoiceOver flows are usable.
- Playwright visual review has been completed across required viewports.
- No personal content appears in logs or network calls unexpectedly.
- The complete app works without AI and without an internet connection, except installation/update and optional sync.
- Anna describes the result as a place she wants to return to.

---

## 23. Decisions still requiring validation

1. **Desktop container:** local companion service versus Tauri wrapper.
2. **MVP mobile continuity:** local-only capture export, iCloud-mediated vault, or early private sync.
3. **Webfont licensing:** Canela Text versus a legally distributable serif fallback.
4. **Folder authority:** physical folders plus metadata versus metadata-first flat storage. This document recommends readable folders for MVP.
5. **Editor experience:** source-faithful Markdown editor only versus a paired rich editor. Fidelity must win if the two conflict.
6. **Room scope in first release:** four-room nucleus versus all seven. This document recommends a coherent nucleus, then Phase 1.1.
7. **Season limits:** whether the three-priority recommendation should be overridable or absolute. Recommend overridable with friction.
8. **Semantic type versus room inference:** define exact defaults during schema spike while preserving explicit user choice.

Each decision should receive a short architecture/design decision record containing context, choice, consequences, and reversal cost.

---

## 24. Product language guide

Prefer:

- Remembered.
- Return when you’re ready.
- Not now.
- Invite into this season.
- What are you noticing?
- What feels true already?
- What would enough look like?
- Would you like to revisit this?
- The Studio is stored locally.

Avoid:

- You’re behind.
- Complete your streak.
- Crush your goals.
- You failed to check in.
- The AI knows what this means.
- Manifest guaranteed results.
- Optimize every area of your life.
- Inbox zero.

Voice is intelligent, warm, concise, and non-saccharine. Avoid excessive emoji, exclamation marks, pseudo-spiritual certainty, and corporate productivity jargon.

---

## Appendix A — Example Markdown files

### A.1 Foyer principle

```markdown
---
schema_version: 1
id: 01J2PRINCIPLE00000000000001
title: Structure and surprise
card_type: principle
semantic_type: foundations
status: active
rooms: [foyer, identity-studio]
tags: [studio-philosophy, imagination]
created: 2026-07-13T09:00:00+10:00
updated: 2026-07-13T09:00:00+10:00
display:
  featured: true
privacy:
  sensitivity: private
  ai_access: selected
---

# Structure and surprise

Create enough structure that your imagination has somewhere to surprise you.
```

### A.2 Life Landscape vision

```markdown
---
schema_version: 1
id: 01J2HOMEVISION000000000000001
title: A calm home that supports family life
card_type: vision
semantic_type: vision
status: active
rooms: [life-landscape]
life_areas: [home, family]
landscape_anchor: vision
seasons: []
tags: [calm-home, family, spaciousness]
created: 2026-07-13T10:15:00+10:00
updated: 2026-07-13T10:15:00+10:00
attachments:
  - ../Attachments/2026/07/morning-light.jpg
display:
  cover: ../Attachments/2026/07/morning-light.jpg
  featured: false
privacy:
  sensitivity: private
  ai_access: ask
---

# A calm home that supports family life

Our home feels warm, functional, and easy to live in. It supports a young family without requiring perfection. The ordinary Tuesday version includes clear surfaces where they matter, toys that have homes, nourishing food that is easy to reach, and room to rest and create.
```

### A.3 Identity card

```markdown
---
schema_version: 1
id: 01J2IDENTITY0000000000000001
title: A woman who creates from calm
card_type: identity
semantic_type: foundations
status: active
rooms: [identity-studio, foyer]
seasons: [2026-winter]
tags: [calm, creativity, becoming]
created: 2026-07-13T10:30:00+10:00
updated: 2026-07-13T10:30:00+10:00
display:
  featured: true
privacy:
  sensitivity: private
  ai_access: selected
---

# A woman who creates from calm

I am practicing creating from calm rather than urgency.

## What this looks like in an ordinary hour

- I choose one meaningful next step.
- I leave margin for interruption.
- I create before I collect more advice.
- I let a small completed piece count.

## Evidence

- [[A quiet morning that worked]]
```

### A.4 Current Season

```markdown
---
schema_version: 1
id: 01J2SEASON2026WINTER00000001
title: Winter 2026 — Making room
card_type: season
semantic_type: growth
status: active
rooms: [current-season, foyer]
season_id: 2026-winter
date_start: 2026-07-13
date_end: 2026-09-30
priorities:
  - 01J2HOMEVISION000000000000001
  - 01J2STUDIOBUILD00000000000001
  - 01J2FAMILYRHYTHM0000000000001
tags: [season]
created: 2026-07-13T11:00:00+10:00
updated: 2026-07-13T11:00:00+10:00
privacy:
  sensitivity: private
  ai_access: selected
---

# Winter 2026 — Making room

This is a season of making enough physical and mental room for family, creativity, and sustainable work.

## How I want it to feel

Calm. Capable. Curious. Connected.

## Enough

The house becomes easier in the few places that most affect daily life; The Studio reaches a genuinely usable first version; family rhythms feel supported rather than optimized.

## Not now

- Buying another personal-development course.
- Building every future Inner Studio feature.
- Creating a perfect whole-house organization system.
```

### A.5 Uncharted possibility

```markdown
---
schema_version: 1
id: 01J2UNCHARTEDRETREAT00000001
title: What if I created a retreat?
card_type: possibility
semantic_type: uncharted
status: resting
rooms: [uncharted]
life_areas: [business, creativity, relationships-community]
tags: [retreat, nature, community]
created: 2026-07-13T11:30:00+10:00
updated: 2026-07-13T11:30:00+10:00
privacy:
  sensitivity: private
  ai_access: ask
---

# What if I created a retreat?

What if there were a place for thoughtful women to explore identity, creativity, and meaningful life design without urgency or guru culture?

I do not need to know whether this becomes a business, a weekend, a property, or only an idea. It can remain Uncharted.
```

### A.6 Wisdom synthesis

```markdown
---
schema_version: 1
id: 01J2WISDOMSYNTHESIS000000001
title: Identity needs practical support
card_type: synthesis
semantic_type: reflection
status: active
rooms: [wisdom-garden, life-landscape]
life_areas: [health-wellbeing, work-business]
tags: [identity, systems, synthesis]
source_notes:
  - 01J2SOURCEABRAHAM00000000001
  - 01J2SOURCENATANYA00000000001
  - 01J2SOURCEBELLA0000000000001
created: 2026-07-13T12:00:00+10:00
updated: 2026-07-13T12:00:00+10:00
privacy:
  sensitivity: private
  ai_access: selected
---

# Identity needs practical support

Emotional alignment and future-self imagery can clarify how I want to live. They become durable when paired with decisions, realistic practices, and structures that account for young children, variable energy, and actual time.

## What I believe

Identity is not a performance maintained all day. It is a direction made visible through ordinary choices and supported environments.
```

### A.7 Reflection and celebration

```markdown
---
schema_version: 1
id: 01J2CELEBRATION0000000000001
title: A quiet morning that worked
card_type: celebration
semantic_type: celebration
status: active
rooms: [reflection-garden]
life_areas: [family, creativity]
seasons: [2026-winter]
tags: [evidence, calm, ordinary-life]
created: 2026-07-20T09:35:00+10:00
updated: 2026-07-20T09:35:00+10:00
privacy:
  sensitivity: private
  ai_access: selected
---

# A quiet morning that worked

I wrote for fifteen minutes before opening anything else. My toddler interrupted twice, and it still counted. I returned without making the interruption mean the practice had failed.

This is evidence for [[A woman who creates from calm]].
```

### A.8 Inner Studio session

```markdown
---
schema_version: 1
id: 01J2INNERSESSION000000000001
title: The hill and the unexpected gate
card_type: inner-session
semantic_type: reflection
status: active
rooms: [inner-studio, reflection-garden]
inner_places: [childhood-hill]
session_mode: open-exploration
session_date: 2026-08-02T21:10:00+10:00
tags: [hill, gate, childhood-landscape]
created: 2026-08-02T21:30:00+10:00
updated: 2026-08-02T21:30:00+10:00
privacy:
  sensitivity: sensitive
  ai_access: never
---

# The hill and the unexpected gate

## What I noticed

The countryside was not exactly as I remembered it. The hill was there, but a narrow gate stood near the top. I did not open it. The light felt like late afternoon.

## What I think it might mean

I am not assigning a fixed meaning. I felt curious rather than afraid. The unopened gate may simply be an image worth revisiting.

## Aftercare

I wrote this down, drank water, and returned attention to the room around me.
```

---

## Appendix B — Schema enum reference

```yaml
semantic_type:
  - foundations
  - vision
  - growth
  - reflection
  - celebration
  - uncharted

status:
  - draft
  - active
  - resting
  - archived
  - trashed

landscape_anchor:
  - vision
  - identity-values-feelings
  - decisions
  - practices
  - structure-strategy

privacy.sensitivity:
  - private
  - sensitive

privacy.ai_access:
  - never
  - ask
  - selected
  - scoped
```

## Appendix C — Initial architecture decision records

### ADR-001: Markdown is authoritative

**Decision:** Durable user content lives in Markdown/YAML and ordinary assets. SQLite is a disposable index.  
**Why:** Ownership, longevity, interoperability, recoverability, and AI-readable structure.  
**Consequence:** File fidelity, migrations, and conflict handling require more engineering care than a database-only app.

### ADR-002: Structured layouts before freeform canvas

**Decision:** Cards snap into room-specific sections, lanes, and grids. Arbitrary pixel positioning is deferred.  
**Why:** Preserve calm, accessibility, responsive behavior, and meaningful structure.  
**Consequence:** Some Freeform-like expression is unavailable initially; images and cards still allow editorial composition.

### ADR-003: Core value without AI

**Decision:** AI is optional and post-MVP.  
**Why:** Privacy, offline resilience, cost, and protection of the product’s reflective purpose.  
**Consequence:** Search and relationships must be excellent without model calls.

### ADR-004: Desktop authoring, mobile capture

**Decision:** Optimize initial authoring for Mac and capture/review for iPhone.  
**Why:** Complex spatial planning is better on a large screen; real life requires fast interrupted capture.  
**Consequence:** Mobile does not reproduce every desktop layout in MVP.

### ADR-005: No manufactured urgency

**Decision:** No streaks, overdue badges, red alerts, or compulsory rituals.  
**Why:** The Studio exists to create clarity and return, not engagement pressure.  
**Consequence:** Success must be measured qualitatively and through durable value rather than daily active use.

### ADR-006: Token override themes preserve semantic identity

**Decision:** Use Chamomile as the complete base token set and implement the other six themes as typed root-level CSS custom-property overrides.
**Why:** Theme changes must preserve component behavior, content, and the learned meaning of all six semantic colors.
**Consequence:** Every theme requires independent contrast, state, and screenshot verification. See [the full ADR](../architecture/decisions/ADR-006-theme-architecture.md).

### ADR-007: Self-host the licensed Studio typefaces

**Decision:** Self-host Newsreader, Hanken Grotesk, and Caveat with reviewed licenses and robust fallbacks.
**Why:** Preserve the final editorial direction while remaining private and complete offline.
**Consequence:** Font licenses, bundle weight, fallback layout, and font-ready screenshots are release-gated. See [the full ADR](../architecture/decisions/ADR-007-self-hosted-typography.md).

---

*End of version 1.1. Update this document alongside product decisions, schema migrations, and meaningful changes to the Studio’s philosophy or accepted design authority.*
