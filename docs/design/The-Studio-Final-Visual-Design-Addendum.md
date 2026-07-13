# The Studio Final Visual Design Addendum

**Status:** Accepted implementation authority
**Version:** 1.0
**Date:** 13 July 2026
**Design source:** Anna McPhee's final “The Studio design system” handoff

> Create enough structure that your imagination has somewhere to surprise you.

## 1. Purpose and authority

This addendum translates the final high-fidelity design handoff into an implementation contract. It replaces provisional visual values in the product bible and Task 2 primitives without expanding the MVP feature set.

Authority is resolved in this order:

1. The product bible controls product intent, MVP scope, data ownership, privacy, safety, content semantics, and emotional boundaries.
2. The implementation plan controls sequencing, package boundaries, tests, and release gates.
3. This addendum controls visual composition, exact tokens, themes, type, component appearance, responsive behavior, and interaction presentation.
4. The supplied prototype controls details not transcribed here only when they do not conflict with the first three sources.
5. WCAG 2.2 AA and content integrity override pixel fidelity. Record any resulting visual deviation.

The `.dc.html` artifact is a reference prototype, not an application dependency. Do not ship its runtime, copy its inline-style architecture, or reproduce simulated behavior without real domain and storage integration. See [the reference manifest](reference/README.md).

## 2. Experience target

The Studio should feel like a quiet book, private library, and architect's studio: editorial, warm, spacious, tactile, and composed. It must not resemble a corporate dashboard, productivity cockpit, scrapbook, or saturated manifestation board.

The composition should preserve negative space, reveal secondary detail progressively, and avoid manufacturing urgency. Beauty is functional because it invites return; decoration is subordinate to clarity.

## 3. Canonical token contract

Use CSS custom properties on `.studio-app`. Components reference semantic token names only. BEM component classes remain the styling interface. Do not use `!important`, utility-class strings as component APIs, raw theme values inside components, or color as the only carrier of meaning.

### 3.1 Chamomile base colors

| Token | Exact value | Role |
|---|---|---|
| `--studio-color-canvas` | `#f7f5f0` | Page canvas |
| `--studio-color-frame` | `#eae6dd` | Area outside app frame |
| `--studio-color-rail` | `#f2eee6` | Navigation and segmented-control ground |
| `--studio-color-surface` | `#fffdfa` | Cards, sheets, menus |
| `--studio-color-sunken` | `#f6f3ec` | Active/quiet surfaces |
| `--studio-color-ink` | `#292a28` | Primary text |
| `--studio-color-ink-strong` | `#26271f` | Display headings |
| `--studio-color-ink-1` | `#3a3b34` | Card headings and strong body |
| `--studio-color-ink-muted` | `#54564f` | Secondary text |
| `--studio-color-ink-soft` | `#6f716c` | Tertiary text |
| `--studio-color-ink-faint` | `#8a8c86` | Metadata and section labels |
| `--studio-color-line` | `#e2ddd2` | Hairline borders |
| `--studio-color-line-strong` | `#c9c2b3` | Strong/dashed borders |
| `--studio-color-topbar` | `rgb(247 245 240 / 86%)` | Sticky bar with 8px backdrop blur |
| `--studio-color-script` | `#b09a70` | Decorative handwritten detail |
| `--studio-color-script-ink` | `#7a642f` | Warm editorial emphasis |
| `--studio-color-link` | `#6e91ad` | Links |
| `--studio-color-accent-soft` | `#f4ecd8` | Primary quiet action background |
| `--studio-color-accent-soft-hover` | `#efe4c9` | Primary quiet action hover |
| `--studio-color-accent-line` | `#d8c9a6` | Primary quiet action border |

### 3.2 Semantic accents

| Meaning | Token | Chamomile | Required label | Guiding question |
|---|---|---:|---|---|
| Foundations | `--studio-semantic-foundations` | `#8c8d89` | Foundations | What supports this? |
| Vision | `--studio-semantic-vision` | `#d5ab42` | Vision | What am I creating? |
| Growth | `--studio-semantic-growth` | `#6f9478` | Growth | What am I cultivating? |
| Reflection | `--studio-semantic-reflection` | `#6e91ad` | Reflection | What am I learning? |
| Celebration | `--studio-semantic-celebration` | `#d2874f` | Celebration | What is working? |
| Uncharted | `--studio-semantic-uncharted` | `#8976a7` | Uncharted | What if…? |

There is no Action semantic color. Semantic accents normally appear as a labeled dot/heart, edge, underline, or small icon. Full saturated semantic fills are prohibited.

### 3.3 Note-stock tokens

| Meaning | Background | Edge |
|---|---:|---:|
| Foundations | `#ebe6da` | `#d8d3c1` |
| Vision | `#f6e8bd` | `#e6d497` |
| Growth | `#dae9d0` | `#c3dab6` |
| Reflection | `#d7e5ef` | `#bed5e6` |
| Celebration | `#f6dcc4` | `#ecc8a6` |
| Uncharted | `#e4dbf0` | `#d2c3e8` |

Expose each as `--studio-stock-<meaning>` and `--studio-stock-<meaning>-edge`. Note stock is pastel paper, not a semantic status substitute.

### 3.4 Geometry, elevation, space, and motion

| Token | Value | Use |
|---|---:|---|
| `--studio-radius-note` | `4px 4px 12px 12px` | Sticky-note cards |
| `--studio-radius-card` | `18px` | Editorial cards |
| `--studio-radius-sheet` | `14px` | Popovers and compact sheets |
| `--studio-radius-control` | `12px` | Controls |
| `--studio-shadow-note` | `0 3px 9px rgb(43 42 38 / 6%)` | Note stock |
| `--studio-shadow-card` | `0 8px 28px rgb(43 42 38 / 8%)` | Editorial card |
| `--studio-shadow-drag` | `0 18px 40px rgb(43 42 38 / 18%)` | Pointer drag preview |
| `--studio-content-max` | `73.75rem` / `1180px` | Primary rooms |
| `--studio-content-narrow` | `47.5rem` / `760px` | Search, Inbox, reading |
| `--studio-reading-measure` | `65ch` to `75ch` | Long copy |
| `--studio-nav-width` | `15.5rem` / `248px` | Desktop rail |
| `--studio-topbar-height` | `3.75rem` / `60px` | Desktop top bar |
| `--studio-inspector-width` | `27.5rem` / `440px`, max `92vw` | Card inspector |
| `--studio-motion-fast` | `150ms` | Hover/focus feedback |
| `--studio-motion-base` | `180ms` | Card transitions |
| `--studio-motion-room` | `220ms` | Room transition maximum |
| `--studio-motion-theme` | `350ms` | Theme cross-fade |
| `--studio-ease-standard` | `ease` | Default prototype-equivalent easing |

Use an 8px base rhythm. Permitted spacing steps are 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, and 96px. Room sections use 32–96px vertical gaps. Reduced motion makes all non-essential transitions instant and removes drag rotation, pulses, blinking decorative carets, and entrance translation.

## 4. Theme system

Implement [ADR-006](../architecture/decisions/ADR-006-theme-architecture.md). Chamomile is the complete base. Themes apply typed overrides to `.studio-app[data-theme]`; `color-scheme` follows theme mode.

### 4.1 Theme inventory and canvas

| Theme | Mode | Frame | Rail | Surface | Canvas |
|---|---|---:|---:|---:|---|
| Chamomile | light | `#eae6dd` | `#f2eee6` | `#fffdfa` | `#f7f5f0` |
| Fig Leaf | light | `#dde5cf` | `#e9efdf` | `#fbfdf7` | `radial-gradient(120% 90% at 20% 0%,#f1f4e8,transparent 60%),linear-gradient(165deg,#eef2e6,#e7eede 55%,#dfe8d3)` |
| Sunrise | light | `#f0dccc` | `#f7e6d6` | `#fffdf9` | `radial-gradient(120% 95% at 18% 0%,#fdeee0,transparent 55%),linear-gradient(168deg,#fbecdc,#f8e2d2 45%,#f4dcd6 80%,#efd6cf)` |
| Wisteria | light | `#e3d9ec` | `#ece5f3` | `#fdfbff` | `radial-gradient(120% 90% at 22% 0%,#f1ecf7,transparent 55%),linear-gradient(168deg,#efe9f6,#eae4f2 50%,#efe6ee 85%,#f2e6ea)` |
| Deep Ocean | dark | `#0e1720` | `#132534` | `#183446` | `radial-gradient(120% 90% at 25% 0%,#1c3040,transparent 55%),linear-gradient(168deg,#16293a,#122232 55%,#0f1b28)` |
| Sunset | dark | `#1a1220` | `#281c30` | `#2f2338` | `radial-gradient(120% 95% at 78% 4%,#5a3350,transparent 52%),linear-gradient(168deg,#3a2436,#2b1f34 55%,#201a2c)` |
| Forest | dark | `#0f150f` | `#182418` | `#1c2a1b` | `radial-gradient(120% 90% at 22% 0%,#233524,transparent 55%),linear-gradient(168deg,#1a271a,#152014 58%,#111a11)` |

### 4.2 Theme structure and ink overrides

Values are ordered `sunken / line / line-strong / ink / ink-strong / ink-1 / ink-muted / ink-soft / ink-faint / topbar`.

| Theme | Exact values |
|---|---|
| Fig Leaf | `#eef2e6 / #dce4d1 / #c2cdb2 / #2a2d26 / #222519 / #353a2d / #54564f / #6f716c / #8a8c86 / rgb(238 242 230 / 85%)` |
| Sunrise | `#f9eee1 / #efdccb / #dcc4ac / #2e2822 / #261f18 / #3d352c / #54564f / #6f716c / #8a8c86 / rgb(251 236 220 / 85%)` |
| Wisteria | `#efe9f5 / #e4dcee / #cbbfe0 / #2b2830 / #231f2a / #38333f / #54564f / #6f716c / #8a8c86 / rgb(239 233 246 / 85%)` |
| Deep Ocean | `#1e3c50 / #264656 / #356073 / #e2edf2 / #eef6f9 / #d2e2ea / #a6bcc7 / #86a0ad / #6d8794 / rgb(18 34 50 / 80%)` |
| Sunset | `#382a42 / #40304a / #584568 / #f1e6ec / #f8eff2 / #e5d8e0 / #c0b0bd / #9f8f9d / #82727f / rgb(43 31 52 / 80%)` |
| Forest | `#233324 / #2c3d2b / #3f553d / #e7eede / #f0f5e8 / #d8e3cd / #aebca4 / #8ba083 / #728a6b / rgb(21 32 20 / 80%)` |

### 4.3 Semantic overrides

Values are ordered `Foundations / Vision / Growth / Reflection / Celebration / Uncharted / link / script / script-ink`.

| Theme | Exact values |
|---|---|
| Fig Leaf | `#87897f / #c6a94a / #5f8f6a / #5f8aa0 / #cf8a54 / #8478a4 / #4f7691 / #7f8a5f / #5f6a30` |
| Sunrise | `#8f8a83 / #d5a742 / #6f9478 / #6f8fb0 / #d67f4f / #9079ab / #6e91ad / #b98a5f / #8a5f30` |
| Wisteria | `#89858f / #c6a24f / #679277 / #6987ad / #cd825a / #8a6fb0 / #6e91ad / #9a7fb0 / #6a4f8a` |
| Deep Ocean | `#9fb0b3 / #e6c56a / #79c0a0 / #7fc2dc / #e8a06b / #b39ad6 / #7fc2dc / #8fc7cf / #e6c56a` |
| Sunset | `#aaa1a6 / #eec06a / #89b98f / #9aa6db / #ec9463 / #c294c9 / #e6a08f / #e2a6b0 / #eec06a` |
| Forest | `#a4ac9c / #dcc169 / #84c07f / #84b6cc / #e0a06a / #af9dce / #84b6cc / #b6c98a / #dcc169` |

### 4.4 Note-stock overrides

Each pair is `background / edge`, ordered Foundations; Vision; Growth; Reflection; Celebration; Uncharted.

| Theme | Exact pairs |
|---|---|
| Fig Leaf | `#ecefe4/#dbe0cf; #f2ecc9/#e4d9a8; #dfe9d3/#c9d9ba; #dde8ea/#c6d8da; #f2e3d0/#e6cdb0; #e6e0ee/#d3c9e2` |
| Sunrise | `#efe9df/#e0d7c6; #f9e9bf/#eed79a; #e2ebda/#cddcc0; #e0e8ef/#ccd9e6; #f9ddc6/#f0c6a6; #ecdff0/#dcc9e6` |
| Wisteria | `#ece9ef/#dcd6e4; #f2ebcf/#e5daae; #e0ebe1/#cadccb; #e1e8f1/#ccd8e8; #f3e2da/#e8cdc0; #eadff3/#d8c6ea` |
| Deep Ocean | `#1e3646/#2c4a5c; #333820/#4a4e2b; #183a35/#265049; #173a4c/#265264; #3a2f24/#4e3f2e; #2b2f45/#3b3f5b` |
| Sunset | `#332a3a/#443850; #3a2f1e/#50402a; #26342c/#374a3b; #2b2f45/#3d4160; #3d2a26/#543a30; #382a42/#4c3959` |
| Forest | `#2a352a/#3a473a; #333820/#484e2b; #22371f/#324b2d; #213a3f/#315056; #37301f/#4c412b; #2d2f3f/#3f4155` |

Theme swatches are the canvas gradients simplified to 135-degree chips. Dark themes must be visibly labeled as dark; do not infer selection through swatch alone. Theme changes announce the selected name politely and close the popover.

## 5. Typography

Implement [ADR-007](../architecture/decisions/ADR-007-self-hosted-typography.md).

| Role | Family | Size / line height | Weight / treatment |
|---|---|---|---|
| Room title | Newsreader | `clamp(2.25rem, 5vw, 4.5rem)` / 1.0–1.08 | 400, slight negative tracking |
| Editorial statement | Newsreader | `clamp(1.5rem, 2.6vw, 2.05rem)` / 1.28 | 400; italic only for short emphasis |
| Card display title | Newsreader | 1.5–1.85rem / 1.15–1.25 | 400 |
| Body | Hanken Grotesk | 1rem / 1.55–1.7 | 400 |
| Control | Hanken Grotesk | .875–.9375rem / 1.2 | 500–600 |
| Section eyebrow | Hanken Grotesk | .6875rem / 1.2 | 600; uppercase; .15em tracking |
| Metadata | Hanken Grotesk | .8125rem / 1.4 | 400; never sole essential label |
| Handwritten accent | Caveat | 1.0625–1.375rem / 1.1 | 500–600; decorative and sparse |

Do not use Caveat for paragraphs, navigation, field labels, or explanatory copy. Do not emulate Canela with an unlicensed asset. All custom-font styles must remain stable under fallback fonts and international text.

## 6. Shell and navigation

### 6.1 Desktop authoring shell

- Fixed/sticky 248px left rail, full viewport height, 26px 16px 18px padding.
- Brand block uses Newsreader “The Studio” and optional decorative Caveat “life by design.”
- Room rows are at least 44px high in production, with semantic outline mark plus visible label; active state uses sunken surface and `aria-current="page"`.
- Utilities are separated visually: Search, Inbox, Settings. Design System, States Gallery, and Mobile Preview are development-only routes and never production navigation.
- Sticky 60px top bar with 34px horizontal padding: search/command trigger, autosave state, theme picker, Inbox, and New.
- Main content is centered within its room maximum. Inspector is a 440px right modal drawer with focus trap, labelled dialog semantics, close restoration, and a 92vw cap.
- Metadata/backlinks stay collapsed until requested.

### 6.2 Mobile shell

- The desktop rail and top bar do not compress into a miniature desktop.
- Bottom navigation exposes Home, Capture, Search, and More, with one-tap Capture from every primary room.
- Room selection lives in More or a compact room switcher.
- Editors and inspectors become full-screen routes/sheets.
- Body copy remains at least 16px and all targets at least 44×44px.
- Respect safe-area insets for bottom navigation, sheets, and capture controls.

### 6.3 Production route boundary

The MVP production routes remain those in the implementation plan. Identity Studio and Wisdom Garden may appear as honest preview/coming-later entrances only if the product bible permits; their full behavior remains Phase 1.1. Inner Studio remains disabled by default and post-MVP. The final design's completed visual concepts do not pull these rooms into MVP implementation.

## 7. Room composition matrix

| Room | Desktop composition | Mobile composition | MVP status |
|---|---|---|---|
| Foyer | Asymmetric 1.55fr/1fr editorial spread; becoming, season, principles left; polaroid, feelings, resurfaced celebration right; legend footer; ≥35% negative space | Single reading flow: becoming, season, feelings, principles, return card; optional image never blocks content | MVP |
| Identity Studio | Editorial statement groups for currently becoming, already true, values, desired feelings, beliefs, cues, evidence | Stacked sections and full-screen detail | Phase 1.1 |
| Life Landscape matrix | Horizontally scrollable architecture: 184px anchor rail + 5–10 area columns, minimum 132px; sticky headers; Matrix/Focus/Lens segmented control | Matrix hidden; open one area at a time | MVP |
| Life Landscape focus | Area pills, then five spacious anchor sections with serif prompt, note cards, drag handles, and add affordance | Same five sections stacked; horizontally scrollable area pills | MVP |
| Current Season | Editorial cover, date range, season statement, max-three priority cards, feeling chips, Enough, decisions with 30/60/90 horizons, practices, supports, collapsed Not now | Single-page reading flow; actions remain reachable without sticky noise | MVP |
| Uncharted | Maximum 1060px; large purple What if composer, two-column near possibilities, Beyond the gate divider, dashed unknowable cards; generous bottom space | One-column capture and reading; no density pressure | MVP |
| Wisdom Garden | 236px theme contents rail + max-660px reading column, Make it mine prompt, resources | Theme switcher then reading flow | Phase 1.1 |
| Reflection Garden | Garden/Reflection/Celebration/Themes switch; chronological stream, Then & now pair, optional taped image | Same stream, segmented switch scrolls if needed | MVP |
| Inner Studio | Independent dusk canvas, safety explanation, places, session modes, separate observation/interpretation capture | Full-screen low-stimulation mode with visible Exit | Post-MVP |

## 8. Component contract

### 8.1 Card families

| Family | Surface and geometry | Content | Behavior |
|---|---|---|---|
| Editorial card | Surface, 18px radius, card shadow | Eyebrow, Newsreader title, body, optional metadata/actions | Opens inspector unless it is a direct control |
| Note card | Semantic stock, asymmetric radius, note shadow | Labeled semantic mark, title, excerpt, optional chips | Select/edit/move; one canonical note |
| Quote | Surface or reflection stock with blue left edge | Quote, source, optional note | Source always visible |
| Principle | Quiet surface, Foundations mark | Short principle and optional explanation | Can be featured in Foyer |
| Prompt/empty | Transparent or sunken surface, dashed line | Soft question and add action | Never red or error-like |
| Polaroid | White paper, square/landscape image, lower caption area, subtle tilt and tape | User image, alt text, optional decorative caption | Removable; layout survives absence |
| Feeling chip | Pale stock tint, outlined | Short feeling | Not a status or filter unless explicitly interactive |
| Semantic legend | Mark + visible meaning, six items | Name and optional question | Reference, not a filter by default |

Cards use a named `article` region when they are content. Do not place an entire complex card inside a `button`; use an article with a clear title link/button and separate named actions. Drag handles are controls with accessible names.

### 8.2 Card state matrix

| State | Visual treatment | Copy/announcement | Required behavior |
|---|---|---|---|
| Empty | Dashed strong line, faint prompt | Soft question | Add action; no red |
| Partial | Normal card, missing optional fields omitted | No warning unless required metadata invalid | Editable |
| Full | Standard semantic mark and content | — | Opens detail |
| Selected | 1.5px Vision/gold ring and elevated shadow | Selection count/meaning announced | `aria-selected` only in selection context |
| Editing | Reflection/blue focus border plus 3px translucent ring | Field label and validation | Focus visible; Escape behavior documented |
| Dragging | Lifted shadow, `rotate(-1.5deg) translateY(-2px)` | Position announced | Rotation removed for reduced motion; keyboard Move alternative |
| Saving | Quiet script-ink indicator/pulse | “Saving…” in polite live region | Body retained locally |
| Saved | Growth dot/text | “Saved” | Avoid repeated live announcements |
| Offline | Strong neutral edge | “Stored locally” | Full local behavior continues |
| Conflict | Strong neutral/warm border, not destructive red | “Another version exists” | Preserve both drafts; explicit resolution |
| Error | Celebration-toned repair edge | Exact metadata problem | Keep and show body; never discard |
| Archived | 62% visual opacity | “Archived” | Recoverable and not disabled to assistive tech |
| Disabled | Only for genuinely unavailable controls | Explain why if non-obvious | Never used for loading |
| Loading | Geometry-matched neutral skeleton | Status announced once | No indefinite layout shift |

### 8.3 Control states

Every control requires default, hover, active, focus-visible, disabled, and busy styles. Hover alone never reveals an essential action. Focus uses a visible 2–3px outline/ring with at least 3:1 contrast against adjacent colors. Dark themes require their own verified ring token.

## 9. Interaction contract

- Navigation changes one room at a time and announces the new route title.
- Matrix columns/cells open focused Life Landscape views; Back to map restores focus to the initiating column/cell.
- Clicking a card's title opens the inspector. The drawer traps focus, closes on Escape or labelled close, and restores focus.
- Inline editing autosaves after 750ms inactivity within the allowed 500–1000ms range, and flushes on blur/navigation.
- Save states are `dirty → saving → saved`, plus `offline`, `conflict`, and `error`. An unsaved-text recovery buffer exists before durable storage.
- Pointer/touch drag reorders compatible cards. The same move is available through card menu and keyboard commands. Moving updates metadata or view ordering; it never duplicates the note.
- Theme picker is a radio menu, closes on selection/Escape/outside interaction, restores trigger focus, and persists locally.
- Not now is a collapsible shelf with `aria-expanded` and retained contents.
- Quick capture returns a quiet “Remembered.” toast and completes under 15 seconds. Voice capture is a future capability unless separately specified; do not ship a fake microphone action.
- Uncharted invitations create links into a season; they never silently convert semantic type.
- All destructive actions use Archive/Trash recovery rules, never swipe-only gestures.

## 10. Responsive contract

CSS breakpoints are implementation tools, not domain states. Components should respond to available space, but release screenshots use these canonical viewports:

| Range / reference | Required behavior |
|---|---|
| Wide desktop, ≥1280px; reference 1440×1000 | 248px rail, 60px top bar, complete room compositions; inspector overlays from right |
| Compact desktop/tablet, 768–1279px; reference 1024×768 | Rail may collapse to labelled drawer; top actions may move into More; Foyer may reduce column ratio before stacking; no clipped content |
| Mobile, <768px; reference 390×844 | Bottom navigation, full-screen editor/inspector, one-column rooms, Life Landscape focus only, safe areas, no global horizontal overflow |

Additional rules:

- Foyer stacks below the point at which either column falls under 320px.
- Two-column Uncharted and Current Season support grids stack below 720px.
- Landscape matrix may scroll horizontally on desktop/tablet inside its own named region; it is `display:none` on mobile routes.
- Area and theme switches may scroll horizontally, with visible focus and selected state.
- At 200% zoom, layouts reflow without loss of content or two-dimensional page scrolling; the Landscape region remains the only intentional horizontal scroller.
- Long English and international strings wrap. Do not truncate user-authored titles in focused/read views. Matrix excerpts may clamp to three lines with full title available through accessible naming and focus detail.
- Missing images collapse cleanly; broken images show a quiet repair affordance and preserve alt text.

## 11. Screen and content states

Every MVP room must have fixtures and screenshots for:

- first-use empty;
- partial content;
- realistic full content;
- dense content;
- loading/index rebuild;
- offline/local-only;
- storage conflict;
- malformed metadata repair;
- missing attachment;
- archived content where applicable;
- reduced motion;
- increased/forced contrast;
- light and dark theme.

Empty states offer no more than three starting choices. Error states explain what remains safe. Loading uses stable skeleton geometry. Offline copy says “Stored locally”; it does not imply loss. Conflicts never overwrite automatically.

## 12. Accessibility acceptance matrix

| Area | Acceptance requirement |
|---|---|
| Semantics | Landmarks for rail, top bar, main, and optional inspector; one page `h1`; logical heading hierarchy |
| Color | Semantic dot/heart always paired with visible or programmatic label; all seven themes meet WCAG 2.2 AA |
| Keyboard | Room navigation, dialogs, capture, edit, menus, theme selection, season shelf, search, and move/reorder complete without pointer |
| Focus | Visible focus in every theme; no obscured focused element behind sticky bars; focus restored after overlays |
| Touch | 44×44px minimum targets and safe-area padding |
| Text | 16px minimum body on mobile; 200% zoom and text spacing overrides do not clip |
| Motion | `prefers-reduced-motion` disables entrances, pulses, caret blink, theme cross-fade, and drag rotation |
| Contrast | Default, hover, focus, selected, disabled, note stock, and muted copy tested separately in light/dark themes |
| Images | User images require editable alt text; purely decorative sprig/tape/gradients are hidden from assistive tech |
| Live regions | Save and route status are polite and deduplicated; errors use assertive announcement only when blocking |
| Drag | Menu and keyboard Move actions expose destination and announce resulting position |
| Inner Studio | Later implementation has persistent visible exit, transcript, low-sensory mode, and separated observation/interpretation |

## 13. Prototype gaps and implementation resolutions

| Prototype gap | Production resolution |
|---|---|
| Fixed 860px demonstration surface and no real media queries | Implement the responsive contract and test actual viewports/devices. |
| Inline styles and bespoke streaming tags | Rebuild with React/TypeScript, BEM CSS, semantic custom properties, and package boundaries. |
| Google Fonts network imports | Self-host licensed WOFF2 files; no runtime third-party font request. |
| Simulated state and content | Connect to application services and Markdown projections; fixtures remain test data. |
| Card-like buttons with complex content | Use semantic articles with explicit actions to avoid nested/interactivity problems. |
| Fake Mobile preview and microphone interaction | Mobile preview is development documentation only; no fake voice capture in MVP. |
| Development routes in the rail | Design System, States Gallery, and Mobile Preview remain dev/Storybook surfaces. |
| Theme values not contrast-certified | Treat exact values as visual targets; minimally adjust only failing text/control pairings, record the deviation, never remap semantics. |
| No full loading/conflict/permission flows | Implement the complete state matrix using storage/application behavior. |
| Placeholder gradient photography | Use optional user image slots with alt text and graceful absence. |
| Prototype Inner Studio suggests functioning session | Keep disabled/post-MVP until its separate safety plan and review pass. |
| Full visual designs for Phase 1.1 rooms | Preserve designs as future authority without changing MVP scope. |

## 14. Visual verification protocol

For every visible task:

1. Add Storybook states for component variants before room composition.
2. Wait for self-hosted fonts before screenshot assertions.
3. Capture desktop 1440×1000, compact 1024×768, and mobile 390×844.
4. Exercise empty, full, dense, error, offline, and interaction states with Playwright.
5. Test Chamomile plus at least one light and one dark theme during feature work; run all seven at the release gate.
6. Test keyboard-only, VoiceOver smoke journeys, 200% zoom, reduced motion, and forced colors.
7. Compare to the prototype for composition, hierarchy, palette, type, space, and emotional tone—not its implementation geometry.
8. Store CI artifacts outside the repository; commit only intentionally approved baselines.
9. Record deviations in the development log with reason and approving authority.

## 15. Implementation acceptance checklist

- [ ] Token names are semantic and complete; no component embeds theme hex values.
- [ ] All seven themes preserve semantic identity and pass contrast review.
- [ ] Newsreader, Hanken Grotesk, and Caveat are self-hosted with licenses and fallbacks.
- [ ] Desktop shell, mobile shell, and inspector follow this contract.
- [ ] Card and control state matrices are represented in Storybook and automated tests.
- [ ] Foyer, Landscape, Current Season, Uncharted, and Reflection match the accepted room compositions without adding out-of-scope features.
- [ ] Identity, Wisdom, and Inner Studio designs remain documented for their planned phases.
- [ ] Responsive and accessibility matrices pass at canonical widths.
- [ ] Prototype runtime, external font requests, placeholder simulated controls, and inline-style architecture are absent from production.
