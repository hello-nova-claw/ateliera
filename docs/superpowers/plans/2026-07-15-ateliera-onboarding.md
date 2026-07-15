# Ateliera Studio Entry and First-Visit Onboarding Plan

**Status:** Ready for implementation

**Date:** 15 July 2026

**Scope:** The experience before a Studio Space is open, creation/opening progress, and the optional first-visit walkthrough for a newly created Studio Space

**Product authority:** `docs/product/The-Studio-PRD-Design-Bible.md`

**Visual authority:** `docs/design/The-Studio-Final-Visual-Design-Addendum.md`

> The front door should feel as intentional as the rooms beyond it.

## 1. Executive decision

Ateliera must have two visually and structurally distinct application states:

1. **Outside a Studio Space:** a quiet, dedicated entry experience containing only the Ateliera identity and the actions required to create or open a Studio Space.
2. **Inside a Studio Space:** the complete application shell, rooms, capture, search, theme controls, and Studio-specific status.

The room rail, Foyer, Search, Inbox, Capture, and dashboard content must not render before a Studio Space is active. The present implementation renders the complete shell and an empty Foyer first, then places the Studio chooser inside it. That creates a false sense that a Studio is already open and exposes controls that cannot yet work.

After a new Studio Space is successfully created, Ateliera should offer a calm, optional first-visit walkthrough. The walkthrough should teach the structure through the real interface, invite one meaningful first contribution, remain skippable and resumable, and never behave like a compulsory setup checklist.

## 2. Problem statement

A person launching Ateliera without an active Studio Space currently sees the full application architecture before they have created or selected the place that architecture belongs to. Navigation, Search, Inbox, and Capture therefore appear prematurely, while the actual entry decision is visually secondary.

After creation, a person is placed directly into a sophisticated but empty house. The room names are evocative, but their relationships are not self-explanatory. Without a first-visit orientation, an empty Studio Space can feel like a dashboard to populate rather than a private place that can grow slowly.

## 3. Goals

### 3.1 User outcomes

- A first-time user can tell within five seconds that they must create or open a Studio Space before entering Ateliera.
- A user always understands whether Ateliera is creating, opening, preparing, ready, or unable to enter a Studio Space.
- A newly created Studio Space offers a gentle explanation of the house, realistic examples that reveal each room's potential, and a clear first action without demanding completion.
- A returning user reaches the Foyer without being forced through onboarding again.
- An interrupted first visit can be resumed or dismissed without losing user-authored content.

### 3.2 Product and engineering outcomes

- No room service, projection, search worker, or active-Studio navigation mounts before a storage adapter and `StudioService` are ready.
- Browser and native launch behavior share one explicit state model while retaining platform-specific storage language.
- The first-visit state is stored per Studio Space, survives relaunch, is portable with the Studio Space, and is not mixed with canonical Markdown notes.
- No create/open action can leave the interface on an unexplained indefinite spinner.
- The entire flow is keyboard accessible, screen-reader understandable, responsive, offline-capable, and verified visually in Playwright.

## 4. Non-goals

- **Account creation, sign-in, or cloud sync.** This remains a local-first entry flow.
- **A product-marketing carousel.** The walkthrough exists to orient the person inside their own Studio Space, not to advertise features.
- **Compulsory personal disclosure.** Every reflective prompt can be skipped.
- **A full Current Season ritual during onboarding.** The existing nine-step ritual deserves its own intentional moment.
- **Persisted sample notes or examples presented as if they belong to the user.** The tour deliberately shows clearly labelled, temporary example content so the potential of each room feels visible. Those examples remain a presentation layer and never become Studio content unless the person explicitly chooses to use one as a starting point.
- **A spotlight tour that disables the rest of the page.** It is brittle, difficult to make accessible, and visually noisy.
- **Automatic opening of arbitrary native folders.** Tauri capabilities remain session-scoped; native users select the folder again after relaunch.
- **Telemetry.** Success will initially be evaluated with local test evidence and Anna's qualitative review. No private behavior is transmitted.

## 5. Terminology and copy rules

### 5.1 User-facing terms

- Use **Studio Space** when explaining the storage/container concept.
- Use **Studio** conversationally once the user is inside it.
- Use **Create a new Studio Space** for creation.
- Use **Open an existing Studio Space** for folder or local-space selection.
- Use **Continue the tour**, **Start the tour again**, and **Leave the tour** for walkthrough state.
- Never show **vault**, **repository**, **database**, **index**, **mount**, or **hydrate** in user-facing copy.

Internal interfaces may retain `VaultPort` until a separate engineering-language refactor is justified. Internal names must not leak into labels, errors, progress messages, accessibility names, or diagnostics previews.

### 5.2 Voice

- Calm, direct, specific, and free of urgency.
- Explain what remains safe when something fails.
- Avoid commands such as “Complete your setup.”
- Prefer “Begin wherever feels useful” and “You can return to this later.”
- Do not use progress percentages unless they represent measured work.

## 6. Experience model

```text
APPLICATION BOOT
      |
      v
ENTRY GATE --------------------------------------------------+
  |                                                          |
  +-- Create a new Studio Space --> PREPARING --> FIRST VISIT |
  |                                              |            |
  |                                              +--> TOUR ---+--> ACTIVE STUDIO
  |                                              |            |
  |                                              +--> ENTER --+
  |
  +-- Open an existing Studio Space --> PREPARING ------------+--> ACTIVE STUDIO
  |
  +-- Resume interrupted first visit --------------------------+--> TOUR / ACTIVE STUDIO
```

The top-level application state, not the current route, determines which experience is mounted.

```ts
type StudioEntryState =
  | { kind: 'entry'; knownStudios: BrowserStudioRecord[] }
  | { kind: 'creating'; name: string; phase: EntryProgressPhase }
  | { kind: 'opening'; label?: string; phase: EntryProgressPhase }
  | {
      kind: 'entry-error';
      action: 'create' | 'open';
      message: string;
      recoverable: true;
    }
  | {
      kind: 'first-visit';
      session: ActiveStudioSession;
      onboarding: OnboardingState;
    }
  | { kind: 'active'; session: ActiveStudioSession; tour?: ActiveTour }
  | { kind: 'closing' };

type EntryProgressPhase =
  | 'choosing-location'
  | 'creating-space'
  | 'opening-space'
  | 'preparing-rooms'
  | 'ready';
```

Avoid parallel booleans such as `opened`, `createOpen`, `studioAction`, and `service !== null` as competing sources of truth. Modal state may remain separate, but entry ownership must be represented by one discriminated union and one reducer.

## 7. Screen specifications

### 7.1 Boot transition

The initial HTML and app background should use the current theme's canvas color so there is no white flash. Browser Studio records are synchronous and should not produce a spinner. Native Ateliera cannot restore a folder capability, so it should immediately show the entry gate.

If asynchronous restoration is introduced later, show the Ateliera wordmark and the text **“Opening Ateliera…”** in a stable, centered composition. Do not render the room shell underneath it.

### 7.2 Entry Gate — no known browser Studio Spaces

**Composition**

- Full viewport using the selected Ateliera theme.
- No room rail, top bar, mobile bottom navigation, room route, Search, Inbox, or Capture.
- Ateliera wordmark, `inside out` signature, tagline, a short explanation, and no more than two primary choices.
- Optional quiet illustration or image from the accepted design system, hidden from assistive technology if decorative.
- Theme selection may be offered as a small secondary control because theme preference is app-level, not Studio-specific. It must not compete with the entry actions.

**Recommended copy**

```text
Ateliera
A private studio for designing a life from the inside out.

Your Studio Space holds the notes, images, reflections, and possibilities
that make Ateliera yours.

[ Create a new Studio Space ]
[ Open an existing Studio Space ]
```

Platform-specific supporting line:

- Native: **“Your Studio Space lives in a private folder you choose on this Mac.”**
- Browser: **“Your Studio Space stays in this browser on this device.”**

### 7.3 Entry Gate — known browser Studio Spaces

If one local Studio Space is known, show it as the primary return action:

```text
Welcome back.

[ Open Anna's Studio ]
[ Create a new Studio Space ]
[ Open another Studio Space ]  // only when browser import/open supports it
```

If several browser Studio Spaces are known, show a short, accessible list of Studio cards rather than a select field. Each card contains only its name and **Open** action. The last active Studio may be first and labelled **Last opened** if that information is reliable. Do not display misleading filesystem locations in the browser.

The list must not become a management dashboard. Renaming, deletion, import, and advanced storage management remain in Settings or a later Studio Space manager.

### 7.4 Create Studio Space flow

Creation is a short dedicated sheet or page, not a dialog floating above a visible room dashboard.

**Step 1 — Name**

- Label: **Studio Space name**
- Supporting copy: **“This names the private space Ateliera will create for you. You can change the display name later.”**
- Use `Ateliera` only as a placeholder or suggested value, not unexplained pre-filled personal content.
- Primary: **Choose where to create it** on native; **Create Studio Space** in browser.
- Secondary: **Back**.

**Step 2 — Location, native only**

- Use the native folder chooser.
- Explain before opening the chooser: **“Choose the folder that will contain your new Studio Space.”**
- Cancellation returns to the name step with the typed name intact.
- Never request the same location twice during one successful creation.

**Step 3 — Preparing**

Use honest, event-backed messages:

1. **Creating your Studio Space…** while the directory and control files are created.
2. **Preparing your rooms…** while the service starts and the empty index becomes ready.
3. **Your Studio Space is ready.** when the session can safely mount.

Show a progress indicator only while work is active. After 2 seconds, add a calm detail line. After 10 seconds, show **“This is taking longer than usual. Your Studio Space is still being prepared.”** If a recoverable failure occurs, stop the progress animation and show **Try again** and **Return to the beginning**. Never leave an animation running after the underlying operation has settled.

### 7.5 Open existing Studio Space flow

Native opens the system folder chooser directly after a short explanation. Browser opens a known local Studio card. Importing a portable backup remains a Settings/restore flow unless separately promoted later.

Opening must:

1. Acquire the storage adapter.
2. Validate/recover storage journals.
3. Create and start the `StudioService`.
4. Establish index state.
5. Read per-Studio settings and onboarding state.
6. Only then mount the active Studio shell.

If opening fails, return to the entry gate with a focused error summary. Copy must state that no Studio content was changed. For example:

> This Studio Space couldn't be opened. Nothing inside it was changed. Choose the folder and try again.

### 7.6 First Visit welcome

This screen appears only immediately after successful creation, or when resuming a first visit explicitly. It is a threshold between entry and the full house.

**Recommended copy**

```text
Your Studio Space is ready.

Nothing here needs to be finished. Ateliera is a place to return to,
rearrange, and let grow with you.

[ Take a gentle tour ]
[ Enter my Studio ]
```

Supporting line: **“The tour is optional, and you can leave it at any time.”**

`Enter my Studio` records the walkthrough as dismissed, enters the Foyer, and leaves a quiet **Take the Studio tour** action in Settings. It must not be labelled Skip on the welcome screen; entering directly is a valid choice, not a failure.

### 7.7 The first-visit walkthrough

The tour uses the real active Studio shell plus a non-modal **First Visit Guide**. It must not use opaque backdrops, holes cut into overlays, pulsing hotspots, or disabled navigation.

On desktop the guide is a 320–360px editorial side card that does not cover the focused content. On compact and mobile layouts it is a collapsible bottom sheet with a persistent **First visit** button. Its DOM position follows the main content so reading and focus order remain logical.

Each step contains:

- step name and optional `1 of 5` text;
- one short explanation;
- one **Show me** or **Visit this room** action;
- **Back**, **Next**, and **Leave tour**;
- a visible **You can return to this later** reminder where a prompt is offered.

#### Furnished preview layer

During the tour, each visited room temporarily appears lightly furnished with a small amount of realistic example content. The purpose is emotional and explanatory: the person should be able to feel what it might be like to inhabit Ateliera, rather than being taught through an empty interface.

The examples follow these rules:

- Every item carries a visible **Example** label and an accessible name such as **“Example Vision card.”**
- Examples use the room's real layout, typography, semantic hearts, note stock, and spacing, but have a subtle preview treatment that distinguishes them from authored cards.
- Examples never enter the `StudioService`, Markdown storage, `.studio/settings.json`, search index, backlinks, Inbox, Reflection chronology, backups, diagnostics, or revision history.
- Examples are defined as immutable application fixtures and injected only into the tour presentation layer. They are not synthetic `StudioNote` records and do not receive canonical note IDs.
- They cannot be dragged, reordered, archived, inspected, linked, or edited in place.
- Where an example makes a useful starting point, show **Use as a starting point**. This opens the normal composer with a copy of the example text. Nothing is saved until the person explicitly chooses **Remember**.
- The copied draft immediately loses its **Example** status and follows all normal validation, cancellation, draft-recovery, and Markdown-save behavior.
- Cancelling a copied draft leaves no note or relationship behind.
- Leaving or completing the tour removes every example immediately. Replaying the tour shows the same examples without duplicating anything.
- If the room already contains real content, examples remain visually secondary and never displace, reorder, or obscure it.
- Example content must be grounded, specific, and emotionally spacious. Avoid luxury clichés, universal prescriptions, hustle language, or claims that one life is ideal for everyone.

The preview layer should feel like walking through a sensitively furnished display home: alive enough to invite imagination, clearly not yet the visitor's own.

#### Step 1 — Foyer: return to what matters

**Purpose:** explain the Foyer as the calm return point rather than a dashboard.

Copy direction:

> The Foyer holds a few things you want to meet again: who you are becoming, how you want life to feel, a guiding principle, and the season you are living now.

Offer one optional real action: **Add a becoming sentence**. This reuses the existing canonical Foyer capture flow and saves ordinary Markdown. The tour proceeds whether the user contributes or not.

Show these temporary examples in their natural Foyer positions:

- **Currently becoming:** “Someone who creates from calm and trusts her own timing.”
- **How I want life to feel:** “Spacious · playful · well supported.”
- **Guiding principle:** “Create enough structure that your imagination has somewhere to surprise you.”

The Becoming example may offer **Use as a starting point**.

#### Step 2 — Life Landscape: see the whole life

**Purpose:** explain categories across the top and the five anchors down the side.

Copy direction:

> The Landscape lets you look across life areas through five anchors: Vision; Identity, values & feelings; Decisions; Practices; and Structure & strategy.

Navigate to `/landscape`. On mobile, show the Focus view because the matrix is intentionally unavailable. Offer **Add a Vision card** only if the person chooses to try it; do not require choosing all life areas.

Furnish one life area across all five anchors so the relationship between the rows becomes visible:

- **Vision:** “On an ordinary Tuesday, meaningful work fits into a calm family rhythm.”
- **Identity, values & feelings:** “I am a thoughtful creator who values depth, family, and spaciousness.”
- **Decisions:** “Protect two focused mornings for the work that matters most.”
- **Practices:** “Create before I consume.”
- **Structure & strategy:** “Agree on protected time, prepare the workspace, and keep the current project small.”

On desktop these examples trace a readable path down one matrix column. On mobile they appear in the same order in one Focus view. The Vision example may offer **Use as a starting point**, prefilled for the currently viewed life area rather than silently assuming the example's category.

#### Step 3 — Current Season: choose what matters now

**Purpose:** distinguish the whole-life map from a temporary focus.

Copy direction:

> A season is a gentle boundary around what matters now. It can hold up to three priorities, experiments, practices, support, and what is deliberately Not Now.

Do not launch the nine-step season ritual automatically. Offer **Visit Current Season** and explain that it can wait.

Show a temporary example cover for **A season of gentle foundations**:

- **Desired feelings:** “Grounded · spacious · hopeful.”
- **Priorities:** “A calmer family rhythm”; “Protected creative work”; “Strength and energy.”
- **Enough:** “If I protect what matters and leave room to breathe, this season is enough.”
- **Not Now:** “Launching everything at once.”

These items demonstrate the shape of a season but do not offer one-click creation. Beginning a real season must still enter the complete season ritual deliberately.

#### Step 4 — Uncharted: leave room for what you cannot map yet

**Purpose:** teach the pressure-free imagination space.

Copy direction:

> Uncharted is for the possibilities that do not need a plan yet. Begin with “What if…?” and let the idea remain open.

Offer an optional draft prompt. Persist only if the person chooses **Remember**.

Show two temporary possibilities with different horizons:

- **Near:** “What if my work could feel spacious, creative, and financially abundant?”
- **Beyond the Gate:** “What if there is a way of living I cannot fully picture yet?”

The Near example may offer **Use as a starting point** and open the normal Uncharted composer.

#### Step 5 — Reflection Garden: notice what is changing

**Purpose:** complete the Ateliera loop.

Copy direction:

> Reflection Garden gathers what you are learning, celebrating, and seeing differently over time. It is where the Studio begins to remember with you.

Show a temporary Then & Now pairing:

- **Reflection:** “I noticed I feel most like myself when I leave space around the things that matter.”
- **Celebration:** “Today I chose calm over urgency, and the important work still moved forward.”

These examples demonstrate the relationship between noticing and evidence over time. They do not use real dates, enter the chronological stream, or offer one-click creation; the person's first reflection should arise in their own words.

End with:

```text
This Studio does not need to be completed.
Begin wherever feels useful, and let it become yours over time.

[ Return to the Foyer ]
```

Completing the tour records `completed`, returns to the Foyer, focuses the main heading, and announces **“First visit complete. Welcome to your Studio.”**

### 7.8 Resuming and replaying

- If Ateliera closes during a tour, the next open shows a small welcome-back choice: **Continue the tour** or **Enter the Studio**.
- The exact last completed step is retained.
- Settings exposes **Take the Studio tour** after dismissal/completion and **Start the tour again** while completed.
- Replaying changes only walkthrough state. It never duplicates user notes.
- A tour started from Settings begins at the Foyer unless the user chooses to continue an interrupted tour.

### 7.9 Existing Studio Spaces without onboarding metadata

Do not block an existing user with a newly introduced first-run screen.

- If the Studio Space contains canonical content and has no onboarding metadata, treat it as a legacy Studio, enter normally, and show a single dismissible Foyer invitation: **New here? Take a gentle tour.**
- If the Studio Space is empty and has no onboarding metadata, enter normally but show the same invitation more prominently in the Foyer empty state.
- Record dismissal so the invitation does not return indefinitely.
- Never infer that an existing empty folder was newly created merely because it contains no notes; only the current successful create transaction earns the automatic First Visit welcome.

## 8. Onboarding persistence

### 8.1 Authority

Walkthrough state is portable Studio control state, not a Markdown note and not a disposable search-index record. Store it in `.studio/settings.json`, which already belongs to the portable set. Theme may remain app-level. Unknown settings keys must survive read/write cycles.

```ts
interface StudioSettingsV1 {
  version: 1;
  displayName?: string;
  onboarding?: StudioOnboardingV1;
  [unknownKey: string]: unknown;
}

interface StudioOnboardingV1 {
  version: 1;
  status: 'not-started' | 'in-progress' | 'completed' | 'dismissed';
  currentStep:
    | 'welcome'
    | 'foyer'
    | 'landscape'
    | 'season'
    | 'uncharted'
    | 'reflection'
    | 'complete';
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  dismissedAt?: string;
  invitationDismissedAt?: string;
}
```

### 8.2 Write behavior

- Read and validate settings after the Studio storage adapter is ready and before deciding between First Visit and active Foyer.
- Update state on every step transition using exact-hash conditional atomic writes.
- Preserve unknown keys byte-semantically where the settings serializer contract allows, and structurally in every case.
- A failed settings write must not lose a Markdown contribution made during the same tour step.
- If a contribution succeeds but tour-state persistence fails, keep the durable note, show **“Your note was saved, but Ateliera couldn't remember your place in the tour.”**, and offer retry or entry to the Studio.
- Restore/import includes the onboarding state because `.studio/settings.json` is portable.

### 8.3 Separation from launcher registry

Browser `localStorage` may continue to hold the small registry needed to list known browser Studio Spaces. It must not become the authority for per-Studio walkthrough progress. Native Ateliera must not persist ambient folder access or an absolute private path merely to support onboarding.

## 9. Application architecture

### 9.1 Component boundary

Refactor the current monolithic `App.tsx` into explicit entry and active-session boundaries:

```text
App
└── StudioProviders
    └── StudioEntryController
        ├── StudioEntryGate
        ├── CreateStudioFlow
        ├── StudioEntryProgress
        ├── FirstVisitWelcome
        └── ActiveStudioApplication
            ├── AppShell
            ├── RoomRoute
            ├── FirstVisitGuide
            ├── Capture
            ├── Editor
            └── CommandPalette
```

Recommended files:

```text
apps/studio/src/features/onboarding/
├── onboarding-state.ts
├── onboarding-reducer.ts
├── onboarding-settings.ts
├── StudioEntryGate.tsx
├── StudioEntryGate.css
├── CreateStudioFlow.tsx
├── StudioEntryProgress.tsx
├── FirstVisitWelcome.tsx
├── FirstVisitGuide.tsx
├── FirstVisitGuide.css
└── *.test.ts(x)

apps/studio/src/app/
├── App.tsx                    // providers and top-level controller only
├── ActiveStudioApplication.tsx
├── studio-session.ts
└── ...
```

`packages/ui` should receive a new primitive only when it is genuinely generic. The entry gate and First Visit Guide are product-specific and should remain in the application feature package.

The furnished preview uses a deliberately smaller view model than a real note:

```ts
interface TourExample {
  id: string;
  room: 'foyer' | 'landscape' | 'season' | 'uncharted' | 'reflection';
  label: string;
  title?: string;
  body: string;
  semanticType:
    | 'foundation'
    | 'vision'
    | 'growth'
    | 'reflection'
    | 'celebration'
    | 'uncharted';
  startingPoint?:
    | { kind: 'foyer'; placement: 'foyer-becoming'; body: string }
    | { kind: 'landscape'; anchor: 'vision'; body: string }
    | { kind: 'uncharted'; horizon: 'near'; body: string };
}
```

`TourExample` must remain structurally incompatible with `StudioNote` and every index/storage input. A room receives examples through an explicit optional presentation prop such as `tourExamples`; normal room projections remain canonical and unchanged. The **Use as a starting point** adapter may copy approved fields into the existing composer only after a user action.

### 9.2 Session object

Build the active session before rendering the shell:

```ts
interface ActiveStudioSession {
  id: string;
  displayName: string;
  storage: VaultPort;
  service: StudioService;
  settings: StudioSettingsV1;
  platform: 'browser' | 'native';
}
```

Creation/opening should return this object from one orchestration function. That function owns cleanup when any later initialization step fails. `ActiveStudioApplication` should never receive a partially initialized service.

### 9.3 Startup and cleanup

- Abort or invalidate superseded async attempts with an attempt ID or `AbortController` where supported.
- Ignore late results from an abandoned attempt and dispose any service they created.
- Disable only conflicting actions while an operation is active; preserve Back/Cancel where it is safe.
- Closing or switching a Studio waits for the current service's terminal dispose promise before opening another session.
- `prepareOfflineShell()` remains app-level and must not control whether the entry UI can render.

### 9.4 Routing

- When no Studio is active, render the entry experience regardless of the current room URL.
- Successful creation enters the First Visit welcome and records `/foyer` as the eventual destination.
- Successful opening enters `/foyer` unless a valid, deliberate in-app destination was captured during the same session.
- The room router does not run before the active shell mounts.
- Browser Back within create/first-visit steps follows the flow; it must not expose an inactive Foyer beneath the flow.

## 10. Interaction and accessibility contract

- One visible `h1` per entry/first-visit screen.
- Entry gate has a `main` landmark labelled **Ateliera welcome**; the active shell retains its existing room-labelled `main`.
- On transition, focus the new `h1` or main landmark. Do not leave focus on an unmounted button.
- Progress text uses `role="status"` and is deduplicated. Blocking failure uses `role="alert"` once.
- The guide is non-modal. It must not set `aria-modal`, trap focus, or hide the room from assistive technology.
- Guide controls appear in logical order and have 44×44px minimum targets.
- `Leave tour` opens a small confirmation only if there is an unsaved composer draft; otherwise it exits immediately.
- The selected room and guide step are both expressed in text, never by color alone.
- Reduced motion removes entry transitions and progress flourishes, but retains clear state changes.
- At 200% zoom the entry actions and guide form one column without horizontal page scrolling.
- On mobile, the collapsed guide control must not cover bottom navigation or safe-area content.
- VoiceOver journey: launch → create/open → first visit → optional contribution → leave/complete → Foyer.

## 11. Visual direction

### 11.1 Entry Gate mockup description

At wide desktop size, use a quiet two-part composition without resembling a login screen. The left or central reading column contains the Ateliera wordmark, tagline, and two actions. A restrained right-hand field may contain a soft architectural/natural image, the six-heart legend, or the foundational sentence. Leave at least 96px of visual breathing room around the primary composition. The frame uses the current theme; the central content should not float in a generic white authentication card.

At mobile size, collapse to one editorial column. Place actions near the lower half but above the safe area. The tagline remains visible without scrolling at 390×844.

### 11.2 First Visit welcome mockup description

Treat this as opening a door: a large Newsreader heading, a short Hanken Grotesk paragraph, one small handwritten accent, and two quiet actions. A subtle threshold line or doorway-shaped negative space may separate the welcome from the Studio. Avoid confetti, progress rings, and celebratory product graphics.

### 11.3 Guide mockup description

The guide looks like an editorial note placed beside the real room, not a software tooltip. Use the Chamomile surface, one semantic heart corresponding to the room's dominant meaning, a small step label, generous line height, and quiet Back/Next controls. The current target may receive a static 2px accent outline with an adjacent programmatic description. Do not animate or pulse it.

### 11.4 Furnished preview mockup description

Example cards should look native to the room while remaining unmistakably provisional. Use the correct semantic heart and note stock at reduced visual emphasis, a small **Example** eyebrow, and a subtle dashed or double-edge treatment defined by semantic design tokens. Do not reduce text opacity below accessible contrast, blur content, or cover it with a watermark.

The examples should form meaningful compositions rather than a repeated card grid: three sparse Foyer fragments, one vertical line through the Landscape anchors, one coherent Season cover, two possibilities at different Uncharted horizons, and one Then & Now Reflection pairing. Real cards retain full emphasis whenever both are present. **Use as a starting point** is a quiet text action with a 44×44px activation area and an accessible description naming the example it will copy.

## 12. Error, interruption, and edge-case matrix

| Scenario                                         | Required behavior                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Native location chooser cancelled                | Return to name/entry with typed name intact; no error alert                                                                      |
| Create clicked twice                             | One transaction only; controls remain serialized                                                                                 |
| Existing name/folder conflict                    | Explain the conflict; offer Open existing or choose another name/location                                                        |
| Storage created but service initialization fails | Close the partial session; explain that the folder may exist and no personal notes were lost; offer Open it or retry preparation |
| Index rebuild is slow                            | The Studio may open with explicit rebuilding state if projections are safe; do not block indefinitely on a disposable index      |
| Settings missing                                 | Use defaults and write settings only after explicit onboarding action                                                            |
| Settings malformed                               | Preserve/backup malformed control state, enter safely, and offer tour without blocking access to notes                           |
| App closes during tour                           | Resume at the last durably recorded step                                                                                         |
| App closes during an unsaved prompt              | Existing draft-recovery behavior applies; walkthrough state does not claim the step was completed                                |
| Offline browser launch                           | Known local Studio Spaces remain openable; entry copy says Stored locally                                                        |
| No persistent browser storage                    | Entry still works; calm persistence guidance appears after creation without implying immediate loss                              |
| Imported/restored completed Studio               | Respect restored onboarding status                                                                                               |
| Legacy populated Studio                          | Enter normally; one optional tour invitation                                                                                     |
| Legacy empty Studio                              | Enter normally; prominent but non-blocking invitation                                                                            |
| Tour step target missing after future UI change  | Guide still renders its explanation and Next/Back; no selector-driven crash                                                      |
| 200% zoom or text spacing overrides              | Guide reflows, target remains visible, no obscured focus                                                                         |
| Tour opens an otherwise empty room               | Clearly labelled examples furnish only the active tour view; canonical projections remain empty                                  |
| Real content already exists in a toured room     | Real content keeps its order and emphasis; examples remain secondary and do not affect projection counts                         |
| User copies an example then cancels              | The draft closes through normal recovery rules; no note, index row, relationship, or onboarding contribution is created          |
| User copies an example and chooses Remember      | One normal canonical note is created from the editable draft; it contains no example-only metadata                               |
| Tour ends or is replayed                         | Examples disappear or reappear from immutable fixtures without storage writes, duplicate notes, or chronology changes            |

## 13. Test-driven implementation sequence

Every production change begins with a failing test and ends with focused verification. Commits remain small, conventional, one line, and authored only by Anna McPhee.

### Task 1 — Characterize and replace the inactive-shell contract

**Failing tests first**

- App component test: without a service, no `Studio rooms`, `Mobile navigation`, Search, Inbox, Capture, Foyer heading, or `RoomRoute` content exists.
- Playwright: fresh launch shows only the Ateliera entry main and the create/open actions.
- Accessibility: entry gate has one `h1`, one main landmark, and no disabled dashboard controls.

**Implementation**

- Add `StudioEntryState` and reducer.
- Move the current active shell into `ActiveStudioApplication`.
- Render `StudioEntryGate` before any room shell.
- Preserve injected test services as direct active-session fixtures.

**Verification**

```sh
pnpm --filter @studio/app test -- App.test.tsx onboarding
pnpm test:e2e -- onboarding.spec.ts
```

**Commit:** `refactor: separate Studio entry from active shell`

### Task 2 — Build the dedicated Entry Gate

**Failing tests first**

- No-known, one-known, and multiple-known browser Studio states.
- Native platform copy and folder-selection behavior.
- Keyboard focus, cancellation, theme persistence, mobile layout, and axe.
- User-visible copy contains no case-insensitive `vault` occurrence.

**Implementation**

- Add `StudioEntryGate` and responsive BEM CSS.
- Replace the select picker with accessible Studio cards when several browser spaces exist.
- Keep theme selection quiet and available outside a Studio.
- Add Storybook states for new, returning, multiple, native, dark, mobile, long name, and error.

**Verification**

- Playwright screenshots at 1440×1000, 1024×768, and 390×844 in Chamomile and one dark theme.
- Inspect every screenshot rather than relying on snapshot thresholds.

**Commit:** `feat: add dedicated Studio entry gate`

### Task 3 — Make create/open orchestration explicit and recoverable

**Failing tests first**

- State-reducer transition table.
- Cancellation keeps name and returns focus.
- Duplicate actions serialize.
- Late completion from an abandoned attempt cannot activate a session.
- Partial session initialization disposes resources.
- Long-running progress changes copy at defined thresholds using fake timers.
- Failure stops progress and exposes retry/back.

**Implementation**

- Add `createStudioSession` / `openStudioSession` orchestration.
- Add honest progress phases and timeout copy.
- Unify browser/native session activation.
- Ensure index preparation never creates an unexplained permanent spinner.

**Verification**

```sh
pnpm --filter @studio/app test -- onboarding-state studio-session App.test.tsx
pnpm test:e2e -- onboarding.spec.ts lifecycle.spec.ts
pnpm tauri:test
```

**Commit:** `fix: make Studio entry progress recoverable`

### Task 4 — Add per-Studio onboarding settings

**Failing tests first**

- Missing settings, valid v1, malformed JSON, unknown keys, exact-hash conflict, and interrupted-write recovery.
- State transition tests for not-started, in-progress, completed, dismissed, resume, and replay.
- Backup/restore preservation of onboarding state.

**Implementation**

- Add a typed `.studio/settings.json` repository through the existing Studio control storage boundary.
- Preserve unknown settings keys.
- Add exact-hash updates and conflict-safe retry.
- Do not store progress in localStorage.

**Verification**

```sh
pnpm --filter @studio/application test -- onboarding-settings
pnpm test:e2e -- onboarding.spec.ts portability.spec.ts
```

**Commit:** `feat: persist Studio onboarding state`

### Task 5 — Build First Visit welcome and guide

**Failing tests first**

- Newly created Studio shows First Visit welcome; opened existing Studio does not.
- Enter directly records dismissed and opens Foyer.
- Tour visits the five rooms in order and can navigate Back/Next.
- Leave and resume return to the correct step.
- Every room shows its specified, clearly labelled example composition during the relevant tour step.
- Example content is absent from canonical room projections, Search, Inbox, backlinks, backups, diagnostics, and storage before, during, and after the tour.
- Real content retains its order and emphasis when examples are present.
- **Use as a starting point** opens an editable normal composer; cancel writes nothing and Remember creates exactly one canonical note without example metadata.
- Optional Foyer contribution creates one canonical note and is never duplicated on replay.
- Current Season ritual does not auto-open.
- Guide does not trap focus and remains usable with direct room navigation.

**Implementation**

- Add `FirstVisitWelcome` and `FirstVisitGuide`.
- Add immutable `TourExample` fixtures and explicit room presentation props that cannot enter canonical projections.
- Add the furnished-preview treatment and the guarded **Use as a starting point** adapter.
- Connect optional contributions through existing capture APIs.
- Persist progress after step transitions.
- Add Settings replay action and legacy Foyer invitation.

**Verification**

- Real Playwright tour at desktop, compact, mobile, keyboard-only, reduced motion, forced colors, and 200% zoom.
- Axe at each guide step.
- Visual inspection of guide placement and example composition in Foyer, Landscape, Season, Uncharted, and Reflection, both empty and alongside real content.

**Commit:** `feat: add gentle first-visit tour`

### Task 6 — Copy, accessibility, and release regression pass

**Failing gates first**

- Repository scan test for forbidden user-visible `vault` language in application UI sources and snapshots, with explicit internal-code exclusions.
- Existing shell, capture, room, offline, portability, and native creation journeys continue to pass.
- No first-load room bundle is requested before entry in a production browser test.

**Implementation**

- Final copy edit.
- Resolve visual/accessibility issues discovered through screenshots and VoiceOver.
- Update the product bible, release checklist, development log, and release evidence manifest.

**Verification**

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build:pwa
pnpm test:e2e
pnpm test:visual
pnpm tauri:test
pnpm tauri:bundle
```

**Commit:** `docs: record Studio onboarding release evidence`

## 14. Acceptance criteria

### P0 — must ship

- [ ] Given no Studio Space is active, when Ateliera launches, then no active room shell or room content is mounted.
- [ ] Given no Studio Space is active, then Create and Open are the only primary actions.
- [ ] Given native Ateliera relaunches, then it asks the user to select a Studio Space again without implying their Studio was lost.
- [ ] Given a new Studio Space is created, then the user sees a First Visit welcome before the normal Foyer.
- [ ] Given the user chooses Enter my Studio, then the Foyer opens immediately and the tour remains replayable from Settings.
- [ ] Given the user starts the tour, then all five room explanations are available without requiring personal input.
- [ ] Given the user visits a room during the tour, then realistic, clearly labelled example content shows the potential of that room in its authentic layout.
- [ ] Given examples are visible, then they never appear in Markdown, Studio settings, Search, Inbox, backlinks, chronology, backups, diagnostics, or revision history.
- [ ] Given a room already has real content, then tour examples neither displace nor reorder it and remain visually secondary.
- [ ] Given the user chooses Use as a starting point, then the normal composer opens with editable copied text and nothing is saved until Remember is chosen.
- [ ] Given the user cancels a copied example, then no canonical or derived record is created.
- [ ] Given the user adds content during the tour, then it is saved as ordinary canonical Markdown through existing services.
- [ ] Given the app closes during the tour, then reopening offers to continue at the last recorded step.
- [ ] Given an existing populated Studio lacks onboarding metadata, then it opens normally and is never blocked by the new walkthrough.
- [ ] Given create/open work takes longer than expected, then the UI explains the current phase and offers recovery after failure; no indefinite unexplained spinner remains.
- [ ] All entry and guide screens meet WCAG 2.2 AA, keyboard, focus, touch-target, reduced-motion, forced-color, and 200% zoom requirements.
- [ ] No user-visible surface uses the word `vault`.

### P1 — fast follow

- [ ] Studio cards show a reliable last-opened label in the browser.
- [ ] The guide can collapse and be reopened without leaving the current room.
- [ ] A user can choose which optional first contribution to make rather than defaulting to Becoming.
- [ ] Settings shows when the tour was completed or dismissed without performance language.

### P2 — future considerations

- Cross-device onboarding-state sync once encrypted Studio Sync exists.
- A visual map of rooms after evidence shows it improves comprehension.
- Context-sensitive help cards for advanced features, separate from first visit.
- Optional voice-guided orientation with transcript and low-sensory mode.

## 15. Qualitative success checks

Because Ateliera currently has no telemetry, the first release should be evaluated with observed journeys and Anna's own experience:

1. On a clean launch, can Anna explain what Create and Open will do without entering a room?
2. Does the entry screen feel like Ateliera rather than a generic login/setup screen?
3. After creation, is it clear that the Studio can remain sparse and unfinished?
4. Can Anna leave and resume the tour without anxiety about losing work?
5. Do the furnished examples make each room's potential immediately imaginable without feeling like content Ateliera has claimed on Anna's behalf?
6. Does the guide explain the relationship between the Foyer, Landscape, Season, Uncharted, and Reflection without becoming a lesson to complete?
7. Does a returning Studio open as directly as it does today?

The feature is successful when the threshold feels clear, creation feels trustworthy, and the first empty Studio feels inviting rather than demanding.

## 16. Decisions made for implementation

- Use a dedicated entry gate outside `AppShell`.
- Use one top-level discriminated state machine rather than independent booleans.
- Offer an optional walkthrough after successful creation only.
- Use a non-modal guide in the real rooms rather than spotlight overlays.
- Include five conceptual stops: Foyer, Life Landscape, Current Season, Uncharted, and Reflection Garden.
- Furnish every tour stop with sparse, realistic, clearly labelled examples that exist only in the presentation layer.
- Allow selected examples to become editable drafts only through an explicit **Use as a starting point** action.
- Invite but never require one real contribution.
- Persist walkthrough state in `.studio/settings.json`.
- Treat legacy Studio Spaces gently and never block them.
- Keep the walkthrough replayable from Settings.
- Keep all functionality local and available without AI.

## 17. Open design refinements that do not block engineering

- Whether the Entry Gate's visual counterweight is an image, the semantic-heart legend, or pure negative space.
- Whether the desktop First Visit Guide sits on the right or follows each room's natural secondary column.
- The final handwritten accent phrase on the Entry Gate.
- Whether the guide's progress label reads `1 of 5` or uses named chapters only. Accessibility supports either; named chapters are emotionally preferable if the layout remains clear.

These choices should be resolved through the first Playwright screenshots, not by expanding the data or interaction model.
