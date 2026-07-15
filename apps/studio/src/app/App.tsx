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
import { VaultConflictError, type VaultPort } from '@studio/storage/portable';
import {
  type ComponentProps,
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
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
import { useStudioRouter, type StudioPath } from './router';
import { themes, type ThemeId } from './themes';
import { QuickCapture } from '../features/capture/QuickCapture';
import type { QuickCaptureInput } from '../features/capture/QuickCapture';
import type { FoyerSlot } from '../features/foyer/FoyerPage';
import { StudioEntryGate } from '../features/onboarding/StudioEntryGate';
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

async function createAppStudioService(
  vault: VaultPort,
): Promise<StudioService> {
  const factory = await import('./studio-service-factory');
  return factory.createAppStudioService(vault);
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
  vault?: VaultPort;
}

type StudioEntryState = { kind: 'entry' } | { kind: 'active' };

type StudioEntryAction = { type: 'activate' } | { type: 'deactivate' };

function studioEntryReducer(
  state: StudioEntryState,
  action: StudioEntryAction,
): StudioEntryState {
  if (action.type === 'activate') return { kind: 'active' };
  if (state.kind === 'entry') return state;
  return { kind: 'entry' };
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
  vault,
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
  const [activeVault, setActiveVault] = useState<VaultPort | null>(
    () => vault ?? null,
  );
  const [entryState, dispatchEntry] = useReducer(
    studioEntryReducer,
    captureService !== undefined || studioService !== undefined
      ? { kind: 'active' }
      : { kind: 'entry' },
  );
  const opened = entryState.kind === 'active';
  const { navigate, path, title } = useStudioRouter(
    (next) => navigationGuard.current?.(next) ?? false,
    opened,
  );
  const { announce: themeAnnouncement, setTheme, theme } = useTheme();
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [projectionRevision, setProjectionRevision] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [browserStudios, setBrowserStudios] = useState<BrowserStudioRecord[]>(
    () => (isNativeShell() ? [] : readBrowserStudios(localStorage)),
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editor, setEditor] = useState<SavedNote>();
  const [editorCloseRequest, setEditorCloseRequest] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [name, setName] = useState('Ateliera');
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
  const [studioAction, setStudioAction] = useState<'create' | 'open' | null>(
    null,
  );
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
  const studioActionRef = useRef<'create' | 'open' | null>(null);

  function beginStudioAction(action: 'create' | 'open'): boolean {
    if (studioActionRef.current !== null) return false;
    studioActionRef.current = action;
    setStudioAction(action);
    return true;
  }

  function finishStudioAction(action: 'create' | 'open'): void {
    if (studioActionRef.current !== action) return;
    studioActionRef.current = null;
    setStudioAction(null);
  }

  navigationGuard.current = (next) => {
    if (editor === undefined) return false;
    pendingNavigation.current = next;
    setEditorCloseRequest((request) => request + 1);
    return true;
  };

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  useEffect(() => {
    if (studioService !== undefined) {
      setEditor(undefined);
      setService(studioService);
      setActiveVault(vault ?? null);
      setActiveStudioId(studioId ?? injectedStudioId.current);
      dispatchEntry({ type: 'activate' });
    } else if (captureService !== undefined) {
      setEditor(undefined);
      setService(captureService);
      setActiveVault(vault ?? null);
      setActiveStudioId(studioId ?? injectedStudioId.current);
      dispatchEntry({ type: 'activate' });
    }
  }, [captureService, studioId, studioService, vault]);

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
            : 'Ateliera could not watch this folder.',
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
              : 'Ateliera could not open.',
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
    document.title = opened ? `${title} — Ateliera` : 'Welcome — Ateliera';
  }, [opened, title]);

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
    dispatchEntry({ type: 'activate' });
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#studio-main')?.focus(),
    );
  }

  async function activateNativeStudio(
    vault: {
      recoveryIdentity: string;
    } & VaultPort,
  ): Promise<void> {
    setEditor(undefined);
    setActiveVault(vault);
    setActiveStudioId(`native:${vault.recoveryIdentity}`);
    setService(await createAppStudioService(vault));
    setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
  }

  async function openStudio(record?: BrowserStudioRecord): Promise<void> {
    if (!isNativeShell() && record === undefined) return;
    if (!beginStudioAction('open')) return;
    setError(undefined);
    try {
      if (isNativeShell()) {
        const { selectTauriVault } = await import('@studio/storage/tauri');
        const selected = await selectTauriVault();
        if (selected !== null) {
          await activateNativeStudio(selected);
          finishOnboarding();
        }
        return;
      }
      if (record === undefined) return;
      const { createBrowserVault } = await import('@studio/storage/browser');
      const vault = createBrowserVault(record.vaultId);
      activateBrowserStudio(localStorage, record.vaultId);
      setEditor(undefined);
      setActiveVault(vault);
      setActiveStudioId(record.vaultId);
      setService(await createAppStudioService(vault));
      setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
      finishOnboarding();
    } catch (reason) {
      setError(
        isNativeShell()
          ? 'This Studio couldn’t be opened. Choose its folder and try again.'
          : reason instanceof Error
            ? reason.message
            : 'This Studio couldn’t be opened.',
      );
    } finally {
      finishStudioAction('open');
    }
  }

  async function createStudio(): Promise<void> {
    if (!beginStudioAction('create')) return;
    setCreateError(undefined);
    setDuplicateStudio(undefined);
    try {
      if (isNativeShell()) {
        const studioName = name.trim();
        if (studioName === '') {
          setCreateError('Give your Studio a name before creating it.');
          return;
        }
        const { createTauriStudio } = await import('@studio/storage/tauri');
        const created = await createTauriStudio(studioName);
        if (created !== null) {
          await activateNativeStudio(created);
          setCreateOpen(false);
          finishOnboarding();
        }
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
      setActiveVault(vault);
      setActiveStudioId(record.vaultId);
      setService(await createAppStudioService(vault));
      setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
      localStorage.setItem('studio:name', record.name);
      setCreateOpen(false);
      finishOnboarding();
    } catch (reason) {
      if (isNativeShell() && reason instanceof VaultConflictError) {
        setCreateError(
          `A Studio named “${name.trim()}” already exists there. Choose another location or name, or open the existing Studio.`,
        );
        return;
      }
      setCreateError(
        isNativeShell()
          ? 'Your Studio couldn’t be created. Choose another location or try again.'
          : reason instanceof Error
            ? reason.message
            : 'Your Studio couldn’t be created. Try again.',
      );
    } finally {
      finishStudioAction('create');
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

  const themePicker = (
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
  );

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
        {themePicker}
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

  const createStudioDialog = (
    <Dialog
      isOpen={createOpen}
      label="Create a Studio"
      onClose={() => {
        if (studioAction === null) setCreateOpen(false);
      }}
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
          disabled={studioAction !== null}
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
            disabled={studioAction !== null}
            onClick={() => setCreateOpen(false)}
            type="button"
          >
            Not now
          </button>
          <button
            className="studio-form__button"
            disabled={studioAction !== null}
            type="submit"
          >
            {studioAction === 'create' ? 'Creating your Studio…' : 'Create'}
          </button>
          {duplicateStudio && (
            <button
              className="studio-form__button studio-form__button--secondary"
              disabled={studioAction !== null}
              onClick={() => {
                setCreateOpen(false);
                void openStudio(duplicateStudio);
              }}
              type="button"
            >
              Open {duplicateStudio.name}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );

  if (!opened) {
    return (
      <>
        <StudioEntryGate
          browserStudios={browserStudios}
          error={error}
          isNative={isNativeShell()}
          onCreate={() => setCreateOpen(true)}
          onOpen={(record) => void openStudio(record)}
          studioAction={studioAction}
          themePicker={themePicker}
        />
        {createStudioDialog}
      </>
    );
  }

  return (
    <ActiveStudioApplication
      activePath={path}
      captureEnabled={opened && service !== null}
      localStatus={opened ? 'Stored locally' : 'No Studio open'}
      onCapture={(trigger) => {
        if (!opened || service === null) return;
        captureButton.current = trigger;
        setCaptureOpen(true);
      }}
      onNavigate={go}
      roomTitle={path === '/foyer' ? 'Ateliera' : title}
      topbar={topbar}
    >
      <span aria-live="polite" className="studio-visually-hidden">
        {title} opened. {themeAnnouncement}
      </span>
      <section className="studio-room">
        <RoomRoute
          captures={captures}
          online={online}
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
          {...(activeVault === null ? {} : { vault: activeVault })}
        />
      </section>
      {error && (
        <p className="studio-room__error" role="alert">
          {error}
        </p>
      )}
      <span aria-live="polite" className="studio-toast" role="status">
        {toast}
      </span>
      {createStudioDialog}
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
    </ActiveStudioApplication>
  );
}

function ActiveStudioApplication(props: ComponentProps<typeof AppShell>) {
  return <AppShell {...props} />;
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
