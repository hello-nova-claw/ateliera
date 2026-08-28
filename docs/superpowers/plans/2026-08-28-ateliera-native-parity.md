# Ateliera Native — Full Web Parity Roadmap

Status: proposed (2026-08-28). Builds on the native app after Phase N5 (search,
rooms, room-capture, Siri/Shortcuts, widget). Goal: the native SwiftUI app
(iPhone/iPad/Mac) reaches **full feature parity** with the web/PWA app, while
keeping every native-only win already shipped (HealthKit cycle, widget, Siri, the
shared iCloud vault, byte-identical Markdown).

## Where native stands vs web (baseline)

Native today ≈ a capture/read/edit client with the rhythm layer. It has: shared
vault I/O (Rust core, atomic + path-contained), quick capture, note edit
(title/body only), 4 simplified rooms (Foyer/Reflection/Inbox/Wisdom as filtered
lists), room-specific capture, basic title+body search, the almanac
(season/micro-season/moon/orientation/cycle), natal chart, one theme (chamomile),
the widget, and the Siri action. It is missing most of the web's depth (see the
phases). Rough coverage: ~30% of the web surface — but the daily-use 30%.

## Principles for ordering

PRD precedence (data ownership → calm → integrity → simple mechanics → aesthetics
→ breadth) sets the tie-breakers, but the sequence below leads with
**value-per-effort** and **unblocking** — several rich features are just organized
views over the note model, so the note model comes first. Each phase must land
green (unit + UI tests) and keep the byte-identical file contract (golden tests vs
`@studio/content` / `@studio/rhythm` where a format or algorithm is shared).

Note on data ownership (normally #1): the native vault is already plain Markdown
files in an iCloud folder — inherently portable and copyable — so the web's
export/import-ZIP is *less* load-bearing here than in the browser (OPFS) app. That
lets safety/portability UI (P8) sit later without violating the ownership value.

---

## P1 — Note depth: full metadata editing, tags, status, wikilinks
**The highest-leverage gap; unblocks the rich rooms and links.** Today edit only
changes title/body. Build a real note editor that reads/writes every frontmatter
field the model already round-trips: semantic type, tags, status
(draft/active/resting/archived/trashed), life-areas, landscape anchor, seasons,
source (title/creator/url), privacy (sensitivity/ai-access), cover/featured. Add
`[[wikilink]]` parsing in bodies with tap-to-navigate (foundation for backlinks).
- Effort: **M**. Value: **very high** (rooms in P5–P6 are views over these fields).
- Gate: edit any field on a note; it round-trips byte-identically; tapping a
  `[[link]]` opens the target; status changes reflected in lists.

## P2 — Themes (all 7) + theme switching
Port the remaining 6 themes (Fig Leaf, Sunrise, Wisteria; Deep Ocean, Sunset,
Forest) from the design tokens into the SwiftUI theme, plus a Settings switcher,
persisted. Pure value-per-effort and highly visible; chamomile already proves the
token→theme path.
- Effort: **S–M**. Value: **high** (parity *feel*, low cost).
- Gate: switch among 7 themes; persists; every surface re-themes correctly (light
  + dark).

## P3 — The Gift (SM-2 resurfacing, the "learns" loop)
The signature feature and the product's thesis ("an orientation surface that
learns"). Port the rest of `resurfacing.ts` (`isDue`, `sm2Interval`,
`selectResurface`) to Swift (golden-tested; `preferredKinds` is already ported).
Build the resurface pool (notes carrying `resurface_*` keys), the daily Gift card
on the Foyer, and the grading UI (Not now / Keep / This landed deeply → SM-2
quality 2/4/5) that writes `resurface_kind/due/interval_days` back to the note via
the existing atomic write path. Rhythm context drives card-kind preference.
- Effort: **M**. Value: **very high** (signature, self-contained, reuses rhythm +
  write path we already have).
- Gate: a rhythm-appropriate card surfaces daily; grading reschedules it (golden
  SM-2 intervals); "Keep"/"landed" also files a copy to Reflection.

## P4 — Search parity: facets, match reasons, backlinks, link repair
Upgrade the basic substring search to the web's model. Build a native, rebuildable
(disposable-per-invariant) in-memory index over the vault: FTS-like ranking +
**facets** (rooms, semantic types, life-areas, seasons, status, tags, card types),
snippet highlights, and match reasons; plus a **link graph** (`[[wikilinks]]`,
markdown links, `studio://note/ID`) for backlinks/forward-links and a broken-link
repair panel. (In-memory is fine for personal vault sizes; if it ever isn't, the
escape hatch is an FTS5 index in the Rust core via `rusqlite`.)
- Effort: **M–L**. Value: **high** (needs P1's metadata + links).
- Gate: faceted search matches the web's results shape; backlinks list is correct;
  a broken link can be repaired.

## P5 — The centerpiece rooms: Life Landscape + Identity Studio
The big structural surfaces, built over the P1 note model.
- **Life Landscape**: the 5 anchors (Vision, Identity-values-feelings, Decisions,
  Practices, Structure-strategy) × user-managed life-areas as a grid; drag-and-drop
  cards between anchors/areas (with a keyboard-accessible alternative per AGENTS),
  decision horizons (30/60/90/someday), area add/rename/reorder/remove, and
  orphan-card repair.
- **Identity Studio**: the 7 sections (Already True, Practicing Now, Values &
  Principles, Desired Feelings, Beliefs in Practice, Embodiment Cues, Identity
  Shifts) with evidence linking and card promotion.
- Effort: **L–XL** (two large rooms; likely split across sessions). Value: **high**
  (core life-design structure).
- Gate: place/move cards across the landscape and it persists in frontmatter;
  identity sections show linked evidence.

## P6 — Season authoring + Uncharted + rich Wisdom/Reflection
- **Current Season**: the 9-step authoring wizard (name/dates → prior-reflection →
  feelings → priorities → decisions/experiments by horizon → supports/constraints →
  enough → not-now → confirm), status (draft/active/archived), mid-season notes,
  and the close-with-reflection flow. (The astronomical year-wheel is already in the
  almanac.)
- **Uncharted**: near/beyond possibility horizons; "invite into the season".
- **Wisdom Garden (rich)**: 7 kinds (Insight/Quote/Principle/Practice/Question/
  Resource/Synthesis), custom themes, source metadata, synthesis creation, "make it
  mine".
- **Reflection Garden (rich)**: the 4 views (Garden/Reflection/Celebration/Themes),
  connections to notes/seasons/areas, image attachments.
- Effort: **XL** (several rooms + flows; multi-session). Value: **medium–high**.
- Gate: author + activate + close a season; capture wisdom by kind into a theme;
  reflection views filter correctly.

## P7 — Structured / classified capture + media
Extend capture beyond quick-capture: classify into a landscape anchor, an identity
section, a wisdom kind (with source), or an uncharted horizon; set semantic type
and decision horizon at capture time; capture from a room pre-selects its
classification. Add **attachments/media** (cover images, image attachments)
end-to-end (pick → store in vault → reference → display).
- Effort: **M–L** (depends on P5–P6 rooms existing). Value: **medium–high**.
- Gate: a classified capture lands with the right frontmatter + folder; an image
  attaches and renders.

## P8 — Data-management UI (safety, portability, history)
Surface the storage capabilities the Rust core can back: ZIP **export/import**
(portable vault format with checksums + conflict resolution), a **revision/backup
history** browser (the core already bumps `.studio-revision` and the Tauri crate
has the backup/journal model to port), a **diagnostics/repair** queue (parse
errors, metadata issues, broken links), **draft recovery**, and a **conflict-merge**
UI (the core already returns `Conflict` on a stale `expected_hash`; surface a merge
choice instead of a bare error).
- Effort: **L** (needs new write surfaces in the Rust core for export/revisions).
  Value: **medium–high** (high-precedence ownership/safety, but touched rarely;
  the vault is already file-portable, which lowers urgency).
- Gate: export a ZIP the web app imports (and vice-versa); browse + restore a
  revision; resolve a conflict without data loss.

## P9 — Onboarding, progressive disclosure, settings depth, Foyer richness
The calm-tier polish that ties it together, last because it needs the rooms to
exist. Guided first-visit tour, example/glimpse cards, seeded small-core for new
studios, and room-reveal invitations; **room-visibility** toggles, **Foyer-section**
toggles, and **rhythm-layer** toggles in Settings; and the **rich Foyer** (who
you're becoming, desired feelings, principles, the Gift, season preview, cover
image) once Identity/Season (P5–P6) feed it.
- Effort: **M–L**. Value: **medium** (polish + first-run experience).
- Gate: a new studio starts small and reveals rooms gently; Foyer shows the
  becoming/feelings/season sections; every toggle works.

---

## Cross-cutting / shared infrastructure

- **Note model editing** (P1) is the spine — most rooms are organized views over
  its fields; do it well once.
- **The link graph + index** (P4) is reused by search, backlinks, the Gift's
  resurface pool, and landscape/identity evidence.
- **Rust core write surfaces**: P8 (export, revisions/backup) needs new FFI beyond
  the single-note `write_text` we have; scope it when P8 starts.
- **Golden parity** stays the gate wherever a format or algorithm is shared:
  serializer/parser vs `@studio/content`; rhythm/resurfacing vs `@studio/rhythm`;
  filenames/ids vs `@studio/content` filenames.
- **Interleave polish**: fold Anna's on-device polish points into whichever phase
  owns the surface (e.g. capture-sheet tweaks → P1/P7, almanac tweaks → its phase).

## Rough sizing

P1 M · P2 S–M · P3 M · P4 M–L · P5 L–XL · P6 XL · P7 M–L · P8 L · P9 M–L.
Realistically several focused sessions per L/XL phase. Suggested order is the phase
order above (value-per-effort, unblocking); P2 (themes) can be pulled earlier as a
quick morale/visible win, and P8 (export) pulled earlier if cross-device data
portability becomes urgent.
