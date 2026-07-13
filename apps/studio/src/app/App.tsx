import {
  type CaptureEntry,
  type CapturePlacement,
  type CaptureService,
  type FoyerImageProjection,
  type SavedNote,
  type StudioService,
} from '@studio/application';
import type { LandscapeAnchor, StudioNote } from '@studio/domain';
import {
  AppShell,
  CommandPalette,
  Dialog,
  type StudioCommand,
} from '@studio/ui';
import type { BrowserPersistenceStatus } from '@studio/storage/browser';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { StudioProviders } from './providers';
import {
  activateBrowserStudio,
  createBrowserStudioRecord,
  readBrowserStudios,
  registerBrowserStudio,
  type BrowserStudioRecord,
} from './browser-studios';
import { useTheme } from './theme-context';
import { RoomRoute } from './RoomRoute';
import { createAppStudioService } from './studio-service-factory';
import { useStudioRouter, type StudioPath } from './router';
import { themes, type ThemeId } from './themes';
import { QuickCapture } from '../features/capture/QuickCapture';
import type { QuickCaptureInput } from '../features/capture/QuickCapture';
import type { FoyerSlot } from '../features/foyer/FoyerPage';
import './app.css';

const NoteEditorSession = lazy(() =>
  import('../features/capture/NoteEditorSession').then((module) => ({
    default: module.NoteEditorSession,
  })),
);

async function requestBrowserPersistence(): Promise<BrowserPersistenceStatus> {
  const { ensureBrowserPersistence } = await import('@studio/storage/browser');
  return ensureBrowserPersistence();
}

function isNativeShell(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

async function prepareOfflineShell(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.register(
    '/service-worker.js',
    { type: 'module', scope: '/' },
  );
  const worker =
    registration.active ?? registration.waiting ?? registration.installing;
  if (worker !== null && worker.state !== 'activated') {
    await new Promise<void>((resolve) =>
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve();
      }),
    );
  }
  if (navigator.serviceWorker.controller === null) {
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        { once: true },
      ),
    );
  }
  const manifestUrl = '/studio-precache-manifest.json';
  let response: Response | undefined;
  try {
    response = await fetch(`${manifestUrl}?ready=${Date.now()}`, {
      cache: 'no-store',
    });
  } catch {
    response = await caches.match(manifestUrl);
  }
  if (response === undefined || !response.ok) return false;
  const manifest = (await response.json()) as {
    version?: unknown;
    entries?: unknown;
  };
  if (
    typeof manifest.version !== 'string' ||
    !Array.isArray(manifest.entries) ||
    !manifest.entries.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { url?: unknown }).url === 'string' &&
        typeof (entry as { revision?: unknown }).revision === 'string',
    )
  )
    return false;
  const cache = await caches.open(`studio-app-shell-${manifest.version}`);
  const expected = [
    ...manifest.entries.map((entry) => (entry as { url: string }).url),
    manifestUrl,
  ];
  const cached = await Promise.all(expected.map((url) => cache.match(url)));
  return cached.every((item) => item !== undefined);
}

export interface AppProps {
  captureService?: CaptureService;
  requestPersistence?: () => Promise<BrowserPersistenceStatus>;
  studioId?: string;
  studioService?: StudioService;
}

export function App(props: AppProps = {}) {
  return (
    <StudioProviders>
      <StudioApplication {...props} />
    </StudioProviders>
  );
}

function StudioApplication({
  captureService,
  requestPersistence = requestBrowserPersistence,
  studioId,
  studioService,
}: AppProps) {
  const navigationGuard = useRef<((next: StudioPath) => boolean) | undefined>(
    undefined,
  );
  const injectedStudioId = useRef(studioId ?? `session:${crypto.randomUUID()}`);
  const [service, setService] = useState<CaptureService | StudioService | null>(
    () => studioService ?? captureService ?? null,
  );
  const [activeStudioId, setActiveStudioId] = useState(
    () => studioId ?? injectedStudioId.current,
  );
  const { navigate, path, title } = useStudioRouter(
    (next) => navigationGuard.current?.(next) ?? false,
  );
  const { announce: themeAnnouncement, setTheme, theme } = useTheme();
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [opened, setOpened] = useState(
    () => captureService !== undefined || studioService !== undefined,
  );
  const [projectionRevision, setProjectionRevision] = useState(0);
  const [browserStudios, setBrowserStudios] = useState<BrowserStudioRecord[]>(
    () => (isNativeShell() ? [] : readBrowserStudios(localStorage)),
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editor, setEditor] = useState<SavedNote>();
  const [editorCloseRequest, setEditorCloseRequest] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [name, setName] = useState('The Studio');
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState(() =>
    captureService === undefined && studioService === undefined
      ? 'Choose a Studio'
      : 'serviceWorker' in navigator &&
          navigator.serviceWorker.controller !== null
        ? 'Ready offline'
        : 'Stored locally',
  );
  const [error, setError] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [duplicateStudio, setDuplicateStudio] = useState<BrowserStudioRecord>();
  const searchButton = useRef<HTMLButtonElement>(null);
  const captureButton = useRef<HTMLButtonElement>(null);
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const themeButton = useRef<HTMLButtonElement>(null);
  const offlineReady = useRef(
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  );
  const capturePaths = useRef(new Map<string, string>());
  const activeLifecycleService = useRef<StudioService | undefined>(undefined);
  const pendingNavigation = useRef<StudioPath | undefined>(undefined);
  const pendingCapturePlacement = useRef<CapturePlacement | undefined>(
    undefined,
  );
  const pendingLandscapePlacement = useRef<
    { lifeArea: string; anchor: LandscapeAnchor } | undefined
  >(undefined);

  navigationGuard.current = (next) => {
    if (editor === undefined) return false;
    pendingNavigation.current = next;
    setEditorCloseRequest((request) => request + 1);
    return true;
  };

  useEffect(() => {
    if (studioService !== undefined) {
      setEditor(undefined);
      setService(studioService);
      setActiveStudioId(studioId ?? injectedStudioId.current);
      setOpened(true);
    } else if (captureService !== undefined) {
      setEditor(undefined);
      setService(captureService);
      setActiveStudioId(studioId ?? injectedStudioId.current);
      setOpened(true);
    }
  }, [captureService, studioId, studioService]);

  useEffect(() => {
    if (!isStudioService(service)) return undefined;
    activeLifecycleService.current = service;
    let active = true;
    const unsubscribe = service.subscribe((event) => {
      if (
        active &&
        (event.kind === 'note-saved' || event.kind === 'index-rebuilt')
      ) {
        setProjectionRevision((revision) => revision + 1);
      }
    });
    void service.start().catch((reason: unknown) => {
      if (active) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'The Studio could not watch this folder.',
        );
      }
    });
    return () => {
      active = false;
      if (activeLifecycleService.current === service) {
        activeLifecycleService.current = undefined;
      }
      unsubscribe();
      queueMicrotask(() => {
        if (activeLifecycleService.current !== service) void service.dispose();
      });
    };
  }, [service]);

  useEffect(() => {
    if (service === null) return;
    let active = true;
    const listing = isStudioService(service)
      ? service.projectRoom('inbox').then((items) => {
          const paths = new Map<string, string>();
          for (const item of items) paths.set(item.noteId, item.path);
          if (active) capturePaths.current = paths;
          return items.map((item) => ({ id: item.noteId, text: item.excerpt }));
        })
      : service.list();
    void listing
      .then((items) => active && setCaptures(items))
      .catch(
        (reason: unknown) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : 'The Studio could not open.',
          ),
      );
    void prepareOfflineShell()
      .then((ready) => {
        if (ready) offlineReady.current = true;
        if (ready && active) setStatus('Ready offline');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectionRevision, service]);

  useEffect(() => {
    document.title = `${title} — The Studio`;
  }, [title]);

  useEffect(() => {
    if (toast === '') return undefined;
    const timer = setTimeout(() => setToast(''), 2_500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !target.matches('input, textarea, [contenteditable="true"]')
      ) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    addEventListener('keydown', handler);
    return () => removeEventListener('keydown', handler);
  }, []);

  function go(next: string, options?: { replace?: boolean }): void {
    navigate(next, false, options?.replace ?? false);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#studio-main')?.focus(),
    );
  }

  function finishOnboarding(): void {
    setOpened(true);
    go(path);
  }

  async function selectNativeService(): Promise<boolean> {
    if (captureService !== undefined || !isNativeShell()) return true;
    const { selectTauriVault } = await import('@studio/storage/tauri');
    const vault = await selectTauriVault();
    if (vault === null) return false;
    setEditor(undefined);
    setActiveStudioId(`native:${vault.recoveryIdentity}`);
    setService(createAppStudioService(vault));
    setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
    return true;
  }

  async function openStudio(record?: BrowserStudioRecord): Promise<void> {
    setError(undefined);
    try {
      if (isNativeShell()) {
        if (await selectNativeService()) finishOnboarding();
        return;
      }
      if (record === undefined) return;
      const { createBrowserVault } = await import('@studio/storage/browser');
      activateBrowserStudio(localStorage, record.vaultId);
      setEditor(undefined);
      setActiveStudioId(record.vaultId);
      setService(createAppStudioService(createBrowserVault(record.vaultId)));
      setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
      finishOnboarding();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The Studio could not open this folder.',
      );
    }
  }

  async function createStudio(): Promise<void> {
    setCreateError(undefined);
    setDuplicateStudio(undefined);
    try {
      if (isNativeShell()) {
        if (!(await selectNativeService())) return;
        setCreateOpen(false);
        finishOnboarding();
        return;
      }

      const record = createBrowserStudioRecord(name);
      const known = browserStudios.find(
        (studio) =>
          studio.name.localeCompare(record.name, undefined, {
            sensitivity: 'accent',
          }) === 0,
      );
      if (known !== undefined) {
        setDuplicateStudio(known);
        setCreateError(`A local Studio named “${record.name}” already exists.`);
        return;
      }

      const { createBrowserVault } = await import('@studio/storage/browser');
      const vault = createBrowserVault(record.vaultId);
      if ((await vault.list()).length > 0) {
        registerBrowserStudio(localStorage, record);
        setBrowserStudios(readBrowserStudios(localStorage));
        setDuplicateStudio(record);
        setCreateError(`A local Studio named “${record.name}” already exists.`);
        return;
      }

      registerBrowserStudio(localStorage, record);
      activateBrowserStudio(localStorage, record.vaultId);
      setBrowserStudios(readBrowserStudios(localStorage));
      setEditor(undefined);
      setActiveStudioId(record.vaultId);
      setService(createAppStudioService(vault));
      setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
      localStorage.setItem('studio:name', record.name);
      setCreateOpen(false);
      finishOnboarding();
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : 'The Studio could not create this space.',
      );
    }
  }

  async function captureThought(input: QuickCaptureInput): Promise<SavedNote> {
    if (service === null)
      throw new Error('Choose a Studio before remembering a thought.');
    if (isStudioService(service)) {
      return service.capture({
        body: input.body,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.semanticType === undefined
          ? {}
          : { semanticType: input.semanticType }),
        ...(input.decisionHorizon === undefined
          ? {}
          : { decisionHorizon: input.decisionHorizon }),
        ...(pendingCapturePlacement.current === undefined
          ? {}
          : { placement: pendingCapturePlacement.current }),
        ...(pendingLandscapePlacement.current === undefined
          ? {}
          : { landscape: pendingLandscapePlacement.current }),
      });
    }
    const captured = await service.capture(input.body);
    return legacySavedNote(captured);
  }

  function closeCapture(): void {
    setCaptureOpen(false);
    pendingCapturePlacement.current = undefined;
    pendingLandscapePlacement.current = undefined;
    queueMicrotask(() => captureButton.current?.focus());
  }

  function beginFoyerCapture(
    slot: FoyerSlot,
    trigger: HTMLButtonElement,
  ): void {
    const placements: Record<FoyerSlot, CapturePlacement> = {
      becoming: 'foyer-becoming',
      feeling: 'foyer-feeling',
      principle: 'foyer-principle',
    };
    pendingCapturePlacement.current = placements[slot];
    captureButton.current = trigger;
    setCaptureOpen(true);
  }

  function beginLandscapeCapture(
    lifeArea: string,
    anchor: LandscapeAnchor,
    trigger: HTMLButtonElement,
  ): void {
    pendingLandscapePlacement.current = { lifeArea, anchor };
    captureButton.current = trigger;
    setCaptureOpen(true);
  }

  function openProjectedCard(
    card: { path: string },
    trigger: HTMLButtonElement,
  ): void {
    if (!isStudioService(service)) return;
    editorTrigger.current = trigger;
    setToast('');
    void service
      .load(card.path)
      .then((saved) => {
        setEditorCloseRequest(0);
        setEditor(saved);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : 'This note could not be opened.',
        );
      });
  }

  function removeFoyerImage(image: FoyerImageProjection): void {
    if (!isStudioService(service)) return;
    void service
      .clearCover(image.path, image.hash)
      .then(() => {
        setProjectionRevision((revision) => revision + 1);
        setToast('Image removed.');
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('#studio-main')?.focus(),
        );
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : 'This image could not be removed.',
        );
      });
  }

  function closeEditor(): void {
    const destination = pendingNavigation.current;
    pendingNavigation.current = undefined;
    setEditor(undefined);
    setProjectionRevision((revision) => revision + 1);
    if (destination !== undefined) {
      navigate(destination, true);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('#studio-main')?.focus(),
      );
      return;
    }
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => editorTrigger.current?.focus());
      });
    });
  }

  const commands: StudioCommand[] = [
    { id: 'foyer', label: 'Open Foyer', onSelect: () => go('/foyer') },
    {
      id: 'landscape',
      label: 'Open Life Landscape',
      onSelect: () => go('/landscape'),
    },
    {
      id: 'season',
      label: 'Open Current Season',
      onSelect: () => go('/season'),
    },
    {
      id: 'uncharted',
      label: 'Open Uncharted',
      onSelect: () => go('/uncharted'),
    },
    {
      id: 'reflection',
      label: 'Open Reflection Garden',
      onSelect: () => go('/reflection'),
    },
    ...(opened && service !== null
      ? [
          {
            id: 'capture',
            label: 'Capture a thought',
            onSelect: () => setCaptureOpen(true),
            shortcut: 'C',
          } satisfies StudioCommand,
        ]
      : []),
    { id: 'search', label: 'Search the Studio', onSelect: () => go('/search') },
    { id: 'settings', label: 'Open Settings', onSelect: () => go('/settings') },
  ];

  const topbar = (
    <div className="studio-topbar">
      <button
        aria-label="Search"
        className="studio-topbar__search"
        onClick={() => setCommandOpen(true)}
        ref={searchButton}
        type="button"
      >
        <span aria-hidden="true">⌕</span>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="studio-topbar__actions">
        <span className="studio-topbar__save" role="status">
          <span aria-hidden="true">●</span>
          {status}
        </span>
        <div className="studio-theme-picker">
          <button
            aria-expanded={themeOpen}
            aria-haspopup="menu"
            className="studio-topbar__button"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && themeOpen) {
                event.preventDefault();
                setThemeOpen(false);
                requestAnimationFrame(() => themeButton.current?.focus());
              }
            }}
            onClick={() => setThemeOpen((open) => !open)}
            ref={themeButton}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`studio-theme-picker__chip studio-theme-picker__chip--${theme}`}
            />{' '}
            Theme
          </button>
          {themeOpen && (
            <ThemeMenu
              current={theme}
              onChange={setTheme}
              onClose={() => {
                setThemeOpen(false);
                requestAnimationFrame(() => themeButton.current?.focus());
              }}
              onCommit={(next) => {
                setTheme(next);
                setThemeOpen(false);
                requestAnimationFrame(() => themeButton.current?.focus());
              }}
            />
          )}
        </div>
        <button
          className="studio-topbar__button studio-topbar__button--quiet"
          onClick={() => go('/inbox')}
          type="button"
        >
          Inbox
        </button>
        <button
          aria-label="Capture"
          className="studio-topbar__new"
          disabled={!opened || service === null}
          onClick={() => {
            if (opened && service !== null) setCaptureOpen(true);
          }}
          ref={captureButton}
          type="button"
        >
          ＋ New
        </button>
      </div>
    </div>
  );

  return (
    <AppShell
      activePath={path}
      captureEnabled={opened && service !== null}
      localStatus={opened ? 'Stored locally' : 'No Studio selected'}
      onCapture={(trigger) => {
        if (!opened || service === null) return;
        captureButton.current = trigger;
        setCaptureOpen(true);
      }}
      onNavigate={go}
      roomTitle={path === '/foyer' ? 'The Studio' : title}
      topbar={topbar}
    >
      <span aria-live="polite" className="studio-visually-hidden">
        {title} opened. {themeAnnouncement}
      </span>
      <section className="studio-room">
        <RoomRoute
          captures={captures}
          onCreateFoyer={beginFoyerCapture}
          onCreateLandscape={beginLandscapeCapture}
          onNavigate={go}
          onOpenCard={openProjectedCard}
          onRemoveFoyerImage={removeFoyerImage}
          onOpenCapture={(id, trigger) => {
            if (!isStudioService(service)) return;
            const notePath = capturePaths.current.get(id);
            if (notePath === undefined) return;
            editorTrigger.current = trigger;
            setToast('');
            void service
              .load(notePath)
              .then((saved) => {
                setEditorCloseRequest(0);
                setEditor(saved);
              })
              .catch((reason: unknown) => {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : 'This note could not be opened.',
                );
              });
          }}
          path={path}
          projectionRevision={projectionRevision}
          {...(isStudioService(service) ? { service } : {})}
          title={title}
        />
        {!opened && (
          <Onboarding
            browserStudios={browserStudios}
            isNative={isNativeShell()}
            onCreate={() => setCreateOpen(true)}
            onOpen={(record) => void openStudio(record)}
          />
        )}
      </section>
      {error && (
        <p className="studio-room__error" role="alert">
          {error}
        </p>
      )}
      <span aria-live="polite" className="studio-toast" role="status">
        {toast}
      </span>
      <Dialog
        isOpen={createOpen}
        label="Create a Studio"
        onClose={() => setCreateOpen(false)}
      >
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createStudio();
          }}
        >
          <p className="studio-form__eyebrow">A place of your own</p>
          <h2>Create a Studio</h2>
          <label htmlFor="studio-name">Studio name</label>
          <input
            id="studio-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          {createError && (
            <p className="studio-form__error" role="alert">
              {createError}
            </p>
          )}
          <div className="studio-form__actions">
            <button
              className="studio-form__button studio-form__button--secondary"
              onClick={() => setCreateOpen(false)}
              type="button"
            >
              Not now
            </button>
            <button className="studio-form__button" type="submit">
              Create
            </button>
            {duplicateStudio && (
              <button
                className="studio-form__button studio-form__button--secondary"
                onClick={() => {
                  setCreateOpen(false);
                  void openStudio(duplicateStudio);
                }}
                type="button"
              >
                Open existing Studio
              </button>
            )}
          </div>
        </form>
      </Dialog>
      <Dialog
        isOpen={captureOpen}
        label="Hold this thought"
        onClose={closeCapture}
      >
        <QuickCapture
          capture={captureThought}
          decisionHorizon={
            pendingLandscapePlacement.current?.anchor === 'decisions'
          }
          onCancel={closeCapture}
          onRemembered={(saved) => {
            capturePaths.current.set(saved.note.id, saved.path);
            if (!isStudioService(service)) {
              setCaptures((current) => [
                ...current,
                { id: saved.note.id, text: saved.note.body },
              ]);
            }
            closeCapture();
            setToast('Remembered.');
            void requestPersistence()
              .then((persistence) => {
                setStatus(
                  offlineReady.current
                    ? 'Ready offline'
                    : persistence === 'persistent'
                      ? 'Stored locally with persistent browser storage.'
                      : 'Stored locally; this browser may clear it if space is needed.',
                );
              })
              .catch(() => setStatus('Stored locally'));
          }}
        />
      </Dialog>
      <Dialog
        isOpen={editor !== undefined}
        label="Edit note"
        onClose={() => setEditorCloseRequest((request) => request + 1)}
        variant="inspector"
      >
        {editor !== undefined && isStudioService(service) && (
          <Suspense fallback={<p role="status">Opening editor…</p>}>
            <NoteEditorSession
              initial={editor}
              onClose={closeEditor}
              requestClose={editorCloseRequest}
              service={service}
              studioId={activeStudioId}
            />
          </Suspense>
        )}
      </Dialog>
      <CommandPalette
        commands={commands}
        isOpen={commandOpen}
        onClose={() => {
          setCommandOpen(false);
          requestAnimationFrame(() => searchButton.current?.focus());
        }}
      />
    </AppShell>
  );
}

function isStudioService(
  service: CaptureService | StudioService | null,
): service is StudioService {
  return service !== null && 'load' in service && 'save' in service;
}

function legacySavedNote(captured: CaptureEntry): SavedNote {
  const created = new Date().toISOString();
  const note: StudioNote = {
    schemaVersion: 1,
    id: captured.id,
    body: captured.text,
    cardType: 'capture',
    semanticType: 'reflection',
    status: 'draft',
    rooms: ['inbox'],
    lifeAreas: [],
    seasons: [],
    tags: [],
    created,
    updated: created,
    attachments: [],
    display: { featured: false },
    privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: {},
  };
  return { note, path: `Inbox/${captured.id}.md`, hash: '' };
}

function Onboarding({
  browserStudios,
  isNative,
  onCreate,
  onOpen,
}: {
  browserStudios: BrowserStudioRecord[];
  isNative: boolean;
  onCreate: () => void;
  onOpen: (record?: BrowserStudioRecord) => void;
}) {
  const [selectedVault, setSelectedVault] = useState(
    browserStudios[0]?.vaultId ?? '',
  );
  const selected = browserStudios.find(
    (studio) => studio.vaultId === selectedVault,
  );

  return (
    <section className="studio-onboarding" aria-labelledby="onboarding-title">
      <p className="studio-onboarding__script" aria-hidden="true">
        begin where you are
      </p>
      <h2 id="onboarding-title">Make this space yours.</h2>
      <p>
        Your Studio stays on this device. Begin a new one, or return to the
        local space already waiting here.
      </p>
      <div className="studio-onboarding__actions">
        <button
          className="studio-onboarding__button"
          onClick={onCreate}
          type="button"
        >
          Create a Studio
        </button>
        {!isNative && browserStudios.length > 1 && (
          <label className="studio-onboarding__picker">
            Local Studio
            <select
              onChange={(event) => setSelectedVault(event.target.value)}
              value={selectedVault}
            >
              {browserStudios.map((studio) => (
                <option key={studio.vaultId} value={studio.vaultId}>
                  {studio.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="studio-onboarding__button studio-onboarding__button--secondary"
          disabled={!isNative && selected === undefined}
          onClick={() => onOpen(selected)}
          type="button"
        >
          {isNative
            ? 'Open this Studio'
            : selected
              ? `Open ${selected.name}`
              : 'No local Studio to open'}
        </button>
      </div>
    </section>
  );
}

function ThemeMenu({
  current,
  onChange,
  onClose,
  onCommit,
}: {
  current: ThemeId;
  onChange: (theme: ThemeId) => void;
  onClose: () => void;
  onCommit: (theme: ThemeId) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.studio-theme-picker')) onClose();
    };
    addEventListener('pointerdown', outside);
    return () => removeEventListener('pointerdown', outside);
  }, [onClose]);
  return (
    <div
      className="studio-theme-picker__menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }

        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;

        event.preventDefault();
        const choices = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitemradio"]',
          ) ?? [],
        );
        const focused = choices.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? choices.length - 1
              : event.key === 'ArrowDown'
                ? (focused + 1) % choices.length
                : (focused - 1 + choices.length) % choices.length;
        const next = choices[nextIndex];
        if (next === undefined) return;
        const id = next.dataset.theme as ThemeId | undefined;
        if (id === undefined) return;
        onChange(id);
        next.focus();
      }}
      ref={menu}
      role="menu"
    >
      <p>Light</p>
      {themes
        .filter((item) => item.mode === 'light')
        .map((item) => (
          <ThemeChoice
            current={current}
            item={item}
            key={item.id}
            onSelect={onCommit}
          />
        ))}
      <p>Dark</p>
      {themes
        .filter((item) => item.mode === 'dark')
        .map((item) => (
          <ThemeChoice
            current={current}
            item={item}
            key={item.id}
            onSelect={onCommit}
          />
        ))}
    </div>
  );
}

function ThemeChoice({
  current,
  item,
  onSelect,
}: {
  current: ThemeId;
  item: (typeof themes)[number];
  onSelect: (theme: ThemeId) => void;
}) {
  return (
    <button
      aria-checked={current === item.id}
      data-theme={item.id}
      onClick={() => onSelect(item.id)}
      role="menuitemradio"
      tabIndex={current === item.id ? 0 : -1}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`studio-theme-picker__swatch studio-theme-picker__swatch--${item.id}`}
      />
      <span>
        {item.name} <small>· {item.mode}</small>
      </span>
      {current === item.id && <span aria-hidden="true">✓</span>}
    </button>
  );
}
