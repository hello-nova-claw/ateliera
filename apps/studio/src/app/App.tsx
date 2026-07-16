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
  useCallback,
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
import { FirstVisitGuide } from '../features/onboarding/FirstVisitGuide';
import { FirstVisitWelcome } from '../features/onboarding/FirstVisitWelcome';
import { StudioTourInvitation } from '../features/onboarding/StudioTourInvitation';
import {
  tourExamples,
  type TourExample,
} from '../features/onboarding/tour-examples';
import { preloadTourRoom } from '../features/onboarding/tour-prefetch';
import {
  initialStudioEntryState,
  studioEntryReducer,
  type TourStep,
} from '../features/onboarding/onboarding-state';
import './app.css';

const NoteEditorSession = lazy(() =>
  import('../features/capture/NoteEditorSession').then((module) => ({
    default: module.NoteEditorSession,
  })),
);

const tourOrder: readonly TourStep[] = [
  'foyer',
  'landscape',
  'season',
  'uncharted',
  'reflection',
];

const tourHeading = {
  foyer: 'Ateliera',
  landscape: 'Life Landscape',
  reflection: 'Reflection Garden',
  season: 'Current Season',
  uncharted: 'What if…?',
} satisfies Record<TourStep, string>;

function pathForTourStep(step: TourStep): StudioPath {
  return `/${step}` as StudioPath;
}

function tourStepForPath(path: string): TourStep | undefined {
  if (path.startsWith('/landscape')) return 'landscape';
  const candidate = path.slice(1) as TourStep;
  return tourOrder.includes(candidate) ? candidate : undefined;
}

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
      : initialStudioEntryState,
  );
  const opened = entryState.kind === 'active';
  const tourStep =
    entryState.kind === 'active' ? entryState.tourStep : undefined;
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
  const [captureInitialBody, setCaptureInitialBody] = useState('');
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [rememberedTourExamples, setRememberedTourExamples] = useState(
    () => new Set<string>(),
  );
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
  const [entryTakingLonger, setEntryTakingLonger] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const createStudioButton = useRef<HTMLButtonElement>(null);
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
  const pendingTourExampleKey = useRef<string | undefined>(undefined);
  const onboardingAction = useRef(false);
  const tourNavigationRevision = useRef(0);
  const tourNavigationQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingLandscapePlacement = useRef<
    { lifeArea: string; anchor: LandscapeAnchor } | undefined
  >(undefined);
  const lastOpenRecord = useRef<BrowserStudioRecord | undefined>(undefined);
  const studioActionRef = useRef<{
    action: 'create' | 'open';
    attemptId: string;
  } | null>(null);

  function beginStudioAction(action: 'create' | 'open'): string | null {
    if (studioActionRef.current !== null) return null;
    const attemptId = crypto.randomUUID();
    studioActionRef.current = { action, attemptId };
    setStudioAction(action);
    dispatchEntry(
      action === 'create'
        ? { type: 'begin-create', attemptId, name: name.trim() }
        : { type: 'begin-open', attemptId },
    );
    return attemptId;
  }

  function finishStudioAction(
    action: 'create' | 'open',
    attemptId: string,
  ): void {
    if (
      studioActionRef.current?.action !== action ||
      studioActionRef.current.attemptId !== attemptId
    )
      return;
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
    if (studioAction === null) {
      setEntryTakingLonger(false);
      return undefined;
    }
    const timer = setTimeout(() => setEntryTakingLonger(true), 10_000);
    return () => clearTimeout(timer);
  }, [studioAction]);

  const queueTourVisit = useCallback(
    async (step: TourStep): Promise<boolean> => {
      if (!isStudioService(service)) return false;
      const revision = tourNavigationRevision.current + 1;
      tourNavigationRevision.current = revision;
      let applied = false;
      const visit = tourNavigationQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (revision !== tourNavigationRevision.current) return;
          await service.onboarding.transition({
            type: 'visit',
            step,
            at: new Date().toISOString(),
          });
          if (revision !== tourNavigationRevision.current) return;
          setError(undefined);
          dispatchEntry({ type: 'tour-step', step });
          applied = true;
        });
      tourNavigationQueue.current = visit.catch(() => undefined);
      try {
        await visit;
        return applied;
      } catch (reason) {
        if (revision === tourNavigationRevision.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Ateliera could not remember your place in the tour.',
          );
        }
        throw reason;
      }
    },
    [service],
  );

  const queueTourEnd = useCallback(
    async (type: 'complete' | 'dismiss'): Promise<boolean> => {
      if (!isStudioService(service)) return false;
      const revision = tourNavigationRevision.current + 1;
      tourNavigationRevision.current = revision;
      let applied = false;
      const transition = tourNavigationQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (revision !== tourNavigationRevision.current) return;
          await service.onboarding.transition({
            type,
            at: new Date().toISOString(),
          });
          if (revision === tourNavigationRevision.current) applied = true;
        });
      tourNavigationQueue.current = transition.catch(() => undefined);
      await transition;
      return applied;
    },
    [service],
  );

  useEffect(() => {
    if (!isStudioService(service) || tourStep === undefined) return;
    const selected = tourStepForPath(path);
    if (selected === undefined || selected === tourStep) return;
    void queueTourVisit(selected).catch(() => undefined);
  }, [path, queueTourVisit, service, tourStep]);

  const visibleTourStep =
    tourStep === undefined ? undefined : tourStepForPath(path);

  useEffect(() => {
    if (visibleTourStep === undefined) return undefined;
    let active = true;
    const main = document.querySelector<HTMLElement>('#studio-main');
    if (main === null) return undefined;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>(
        '#first-visit-guide-title',
      );
      if (heading === null) return false;
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus();
      return true;
    };
    if (focusHeading()) return undefined;
    const observer = new MutationObserver(() => {
      if (active && focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [path, visibleTourStep]);

  useEffect(() => {
    if (tourStep === undefined) return;
    const current = tourOrder.indexOf(tourStep);
    const next = tourOrder[current + 1];
    if (next !== undefined) void preloadTourRoom(next).catch(() => undefined);
  }, [tourStep]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        visibleTourStep === undefined &&
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
  }, [visibleTourStep]);

  useEffect(() => {
    if (visibleTourStep === undefined) return;
    setCommandOpen(false);
    setThemeOpen(false);
  }, [visibleTourStep]);

  function go(
    next: string,
    options?: { replace?: boolean; focusMain?: boolean },
  ): void {
    navigate(next, false, options?.replace ?? false);
    if (
      options?.focusMain === false ||
      (tourStep !== undefined && tourStepForPath(next) !== undefined)
    )
      return;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#studio-main')?.focus(),
    );
  }

  function focusStudio(): void {
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#studio-main')?.focus(),
    );
  }

  function focusRoomHeading(expectedText?: string): void {
    requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>('#studio-main');
      if (main === null) return;
      const focus = () => {
        const heading = [...main.querySelectorAll<HTMLElement>('h1')].find(
          (candidate) =>
            expectedText === undefined ||
            candidate.textContent?.trim() === expectedText,
        );
        if (heading === undefined) return false;
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus();
        return true;
      };
      if (focus()) return;
      const observer = new MutationObserver(() => {
        if (focus()) observer.disconnect();
      });
      observer.observe(main, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5_000);
    });
  }

  async function runOnboardingAction(
    action: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<void> {
    if (onboardingAction.current) return;
    onboardingAction.current = true;
    setOnboardingBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallbackMessage);
    } finally {
      onboardingAction.current = false;
      setOnboardingBusy(false);
    }
  }

  async function finishStudioEntry(
    lifecycle: StudioService,
    attemptId: string,
    origin: 'create' | 'open',
  ): Promise<void> {
    if (origin === 'create') {
      dispatchEntry({ type: 'first-visit', attemptId, mode: 'new' });
      return;
    }
    const settings = await lifecycle.onboarding.load();
    const step = settings.onboarding.currentStep;
    if (
      settings.onboarding.status === 'in-progress' &&
      step !== 'welcome' &&
      step !== 'complete'
    ) {
      dispatchEntry({
        type: 'first-visit',
        attemptId,
        mode: 'resume',
        step,
      });
      return;
    }
    dispatchEntry({
      type: 'activate',
      attemptId,
      tourInvitation:
        settings.onboarding.status === 'not-started' &&
        settings.onboarding.invitationDismissedAt === undefined,
    });
    focusStudio();
  }

  function commitStudioSession(
    lifecycle: StudioService,
    vault: VaultPort,
    id: string,
  ): void {
    setEditor(undefined);
    setActiveVault(vault);
    setActiveStudioId(id);
    setService(lifecycle);
    setStatus(offlineReady.current ? 'Ready offline' : 'Stored locally');
  }

  async function openStudio(record?: BrowserStudioRecord): Promise<void> {
    if (!isNativeShell() && record === undefined) return;
    lastOpenRecord.current = record;
    const attemptId = beginStudioAction('open');
    if (attemptId === null) return;
    let preparedLifecycle: StudioService | undefined;
    setError(undefined);
    try {
      if (isNativeShell()) {
        const { selectTauriVault } = await import('@studio/storage/tauri');
        const selected = await selectTauriVault();
        if (selected !== null) {
          dispatchEntry({
            type: 'progress',
            attemptId,
            phase: 'preparing-rooms',
          });
          preparedLifecycle = await createAppStudioService(selected);
          await finishStudioEntry(preparedLifecycle, attemptId, 'open');
          commitStudioSession(
            preparedLifecycle,
            selected,
            `native:${selected.recoveryIdentity}`,
          );
          preparedLifecycle = undefined;
        } else {
          dispatchEntry({ type: 'cancel', attemptId });
        }
        return;
      }
      if (record === undefined) return;
      const { createBrowserVault } = await import('@studio/storage/browser');
      const vault = createBrowserVault(record.vaultId);
      dispatchEntry({
        type: 'progress',
        attemptId,
        phase: 'preparing-rooms',
      });
      preparedLifecycle = await createAppStudioService(vault);
      await finishStudioEntry(preparedLifecycle, attemptId, 'open');
      activateBrowserStudio(localStorage, record.vaultId);
      commitStudioSession(preparedLifecycle, vault, record.vaultId);
      preparedLifecycle = undefined;
    } catch (reason) {
      if (preparedLifecycle !== undefined) {
        await preparedLifecycle.dispose().catch(() => undefined);
        preparedLifecycle = undefined;
      }
      const message = isNativeShell()
        ? 'This Studio couldn’t be opened. Choose its folder and try again.'
        : reason instanceof Error
          ? reason.message
          : 'This Studio couldn’t be opened.';
      setError(message);
      dispatchEntry({ type: 'fail', attemptId, message });
    } finally {
      finishStudioAction('open', attemptId);
    }
  }

  async function createStudio(): Promise<void> {
    const attemptId = beginStudioAction('create');
    if (attemptId === null) return;
    setCreateError(undefined);
    setDuplicateStudio(undefined);
    try {
      if (isNativeShell()) {
        const studioName = name.trim();
        if (studioName === '') {
          setCreateError('Give your Studio a name before creating it.');
          dispatchEntry({
            type: 'fail',
            attemptId,
            message: 'Give your Studio Space a name before creating it.',
          });
          return;
        }
        const { createTauriStudio } = await import('@studio/storage/tauri');
        const created = await createTauriStudio(studioName);
        if (created !== null) {
          dispatchEntry({
            type: 'progress',
            attemptId,
            phase: 'preparing-rooms',
          });
          const lifecycle = await createAppStudioService(created);
          setCreateOpen(false);
          await finishStudioEntry(lifecycle, attemptId, 'create');
          commitStudioSession(
            lifecycle,
            created,
            `native:${created.recoveryIdentity}`,
          );
        } else {
          dispatchEntry({ type: 'cancel', attemptId });
        }
        return;
      }

      const record = createBrowserStudioRecord(name);
      dispatchEntry({
        type: 'progress',
        attemptId,
        phase: 'creating-space',
      });
      const known = browserStudios.find(
        (studio) =>
          studio.name.localeCompare(record.name, undefined, {
            sensitivity: 'accent',
          }) === 0,
      );
      if (known !== undefined) {
        setDuplicateStudio(known);
        setCreateError(`A local Studio named “${record.name}” already exists.`);
        dispatchEntry({
          type: 'fail',
          attemptId,
          message: `A Studio Space named “${record.name}” already exists.`,
        });
        return;
      }

      const { createBrowserVault } = await import('@studio/storage/browser');
      const vault = createBrowserVault(record.vaultId);
      if ((await vault.list()).length > 0) {
        registerBrowserStudio(localStorage, record);
        setBrowserStudios(readBrowserStudios(localStorage));
        setDuplicateStudio(record);
        setCreateError(`A local Studio named “${record.name}” already exists.`);
        dispatchEntry({
          type: 'fail',
          attemptId,
          message: `A Studio Space named “${record.name}” already exists.`,
        });
        return;
      }

      registerBrowserStudio(localStorage, record);
      activateBrowserStudio(localStorage, record.vaultId);
      setBrowserStudios(readBrowserStudios(localStorage));
      dispatchEntry({
        type: 'progress',
        attemptId,
        phase: 'preparing-rooms',
      });
      const lifecycle = await createAppStudioService(vault);
      localStorage.setItem('studio:name', record.name);
      setCreateOpen(false);
      await finishStudioEntry(lifecycle, attemptId, 'create');
      commitStudioSession(lifecycle, vault, record.vaultId);
    } catch (reason) {
      if (isNativeShell() && reason instanceof VaultConflictError) {
        const message = `A Studio named “${name.trim()}” already exists there. Choose another location or name, or open the existing Studio.`;
        setCreateError(message);
        dispatchEntry({ type: 'fail', attemptId, message });
        return;
      }
      const message = isNativeShell()
        ? 'Your Studio couldn’t be created. Choose another location or try again.'
        : reason instanceof Error
          ? reason.message
          : 'Your Studio couldn’t be created. Try again.';
      setCreateError(message);
      dispatchEntry({ type: 'fail', attemptId, message });
    } finally {
      finishStudioAction('create', attemptId);
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

  function closeCapture(restoreFocus = true): void {
    setCaptureOpen(false);
    setCaptureInitialBody('');
    pendingCapturePlacement.current = undefined;
    pendingLandscapePlacement.current = undefined;
    pendingTourExampleKey.current = undefined;
    if (restoreFocus) queueMicrotask(() => captureButton.current?.focus());
  }

  function useTourStartingPoint(
    example: TourExample,
    trigger: HTMLButtonElement,
    context?: { lifeArea: string },
  ): void {
    const startingPoint = example.startingPoint;
    if (startingPoint === undefined) return;
    captureButton.current = trigger;
    pendingTourExampleKey.current = example.previewKey;
    setCaptureInitialBody(startingPoint.body);
    if (startingPoint.kind === 'foyer') {
      pendingCapturePlacement.current = startingPoint.placement;
    } else if (startingPoint.kind === 'landscape') {
      const selectedLifeArea =
        context?.lifeArea ??
        (path.startsWith('/landscape/')
          ? path.slice('/landscape/'.length)
          : 'family');
      pendingLandscapePlacement.current = {
        lifeArea: selectedLifeArea,
        anchor: startingPoint.anchor,
      };
    } else {
      pendingCapturePlacement.current = 'uncharted';
    }
    setCaptureOpen(true);
  }

  async function enterStudioFromWelcome(): Promise<void> {
    if (!isStudioService(service)) return;
    await runOnboardingAction(async () => {
      await service.onboarding.transition({
        type: 'dismiss',
        at: new Date().toISOString(),
      });
      dispatchEntry({ type: 'activate' });
      go('/foyer', { replace: true });
    }, 'Ateliera could not remember this choice.');
  }

  async function startOrResumeTour(): Promise<void> {
    if (!isStudioService(service) || entryState.kind !== 'first-visit') return;
    const step = entryState.step ?? 'foyer';
    await runOnboardingAction(async () => {
      await preloadTourRoom(step).catch(() => undefined);
      await service.onboarding.transition({
        type: 'visit',
        step,
        at: new Date().toISOString(),
      });
      dispatchEntry({ type: 'start-tour', step });
      go(pathForTourStep(step), { replace: true, focusMain: false });
    }, 'Ateliera could not remember your place in the tour.');
  }

  async function moveTour(direction: -1 | 1): Promise<void> {
    if (!isStudioService(service) || tourStep === undefined) return;
    await runOnboardingAction(async () => {
      const current = tourOrder.indexOf(visibleTourStep ?? tourStep);
      const next = tourOrder[current + direction];
      if (next === undefined && direction === 1) {
        if (!(await queueTourEnd('complete'))) return;
        dispatchEntry({ type: 'end-tour' });
        setRememberedTourExamples(new Set());
        go('/foyer', { replace: true });
        focusRoomHeading('Ateliera');
        setToast('The first visit has ended. The Studio is yours.');
        return;
      }
      if (next === undefined) return;
      if (!(await queueTourVisit(next))) return;
      go(pathForTourStep(next), { focusMain: false });
    }, 'Ateliera could not remember your place in the tour.');
  }

  async function leaveTour(): Promise<void> {
    if (!isStudioService(service)) return;
    await runOnboardingAction(async () => {
      if (!(await queueTourEnd('dismiss'))) return;
      dispatchEntry({ type: 'end-tour' });
      setRememberedTourExamples(new Set());
      setToast('The tour has ended. You can take it again from Settings.');
      focusRoomHeading(
        visibleTourStep === undefined
          ? undefined
          : tourHeading[visibleTourStep],
      );
    }, 'Ateliera could not end the tour.');
  }

  async function replayTour(): Promise<void> {
    if (!isStudioService(service)) return;
    await runOnboardingAction(async () => {
      await preloadTourRoom('foyer').catch(() => undefined);
      await service.onboarding.transition({
        type: 'replay',
        at: new Date().toISOString(),
      });
      await service.onboarding.transition({
        type: 'visit',
        step: 'foyer',
        at: new Date().toISOString(),
      });
      dispatchEntry({ type: 'replay-tour' });
      go('/foyer', { focusMain: false });
    }, 'Ateliera could not begin the tour.');
  }

  async function openTourFromSettings(): Promise<void> {
    if (tourStep === undefined) {
      await replayTour();
      return;
    }
    await preloadTourRoom(tourStep).catch(() => undefined);
    go(pathForTourStep(tourStep), { focusMain: false });
  }

  async function dismissTourInvitation(): Promise<void> {
    if (!isStudioService(service)) return;
    await runOnboardingAction(async () => {
      await service.onboarding.transition({
        type: 'dismiss-invitation',
        at: new Date().toISOString(),
      });
      dispatchEntry({ type: 'dismiss-tour-invitation' });
    }, 'Ateliera could not remember this choice.');
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
        {studioAction === 'create' && (
          <p className="studio-form__progress" role="status">
            {entryTakingLonger
              ? 'This is taking longer than usual. Your Studio Space is still being prepared.'
              : 'Creating your Studio Space…'}
          </p>
        )}
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
            onClick={() => {
              setCreateOpen(false);
              requestAnimationFrame(() => createStudioButton.current?.focus());
            }}
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

  if (entryState.kind === 'first-visit') {
    return (
      <FirstVisitWelcome
        busy={onboardingBusy}
        {...(error === undefined ? {} : { error })}
        mode={entryState.mode}
        onEnter={() => void enterStudioFromWelcome()}
        onTour={() => void startOrResumeTour()}
      />
    );
  }

  if (!opened) {
    return (
      <>
        <StudioEntryGate
          browserStudios={browserStudios}
          createButtonRef={createStudioButton}
          error={error}
          isNative={isNativeShell()}
          onCreate={() => setCreateOpen(true)}
          onDismissError={() => {
            setError(undefined);
            dispatchEntry({ type: 'return-to-entry' });
          }}
          onOpen={(record) => void openStudio(record)}
          onRetry={() => void openStudio(lastOpenRecord.current)}
          {...(entryState.kind === 'opening' ||
          (entryState.kind === 'creating' && !createOpen)
            ? { progress: entryState.phase }
            : {})}
          studioAction={studioAction}
          takingLonger={entryTakingLonger}
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
      {...(visibleTourStep === undefined ? {} : { focusMode: 'tour' })}
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
        <div
          className={
            visibleTourStep === undefined ? undefined : 'studio-tour-layout'
          }
        >
          {visibleTourStep !== undefined && (
            <FirstVisitGuide
              busy={onboardingBusy}
              onLeave={() => void leaveTour()}
              onNext={() => void moveTour(1)}
              {...(visibleTourStep === 'foyer'
                ? {}
                : { onPrevious: () => void moveTour(-1) })}
              step={visibleTourStep}
            />
          )}
          <div
            className={
              visibleTourStep === undefined
                ? undefined
                : 'studio-tour-layout__room'
            }
          >
            {entryState.kind === 'active' &&
              entryState.tourInvitation &&
              path === '/foyer' && (
                <StudioTourInvitation
                  busy={onboardingBusy}
                  onDismiss={() => void dismissTourInvitation()}
                  onStart={() => void replayTour()}
                />
              )}
            <RoomRoute
              captures={captures}
              online={online}
              onCreateFoyer={beginFoyerCapture}
              onCreateLandscape={beginLandscapeCapture}
              onNavigate={go}
              onStartTour={() => void openTourFromSettings()}
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
              tourAction={tourStep === undefined ? 'restart' : 'continue'}
              {...(visibleTourStep === undefined
                ? {}
                : {
                    onUseTourExample: useTourStartingPoint,
                    tourExamples: tourExamples[visibleTourStep].filter(
                      (example) =>
                        !rememberedTourExamples.has(example.previewKey),
                    ),
                  })}
              {...(isStudioService(service) ? { service } : {})}
              title={title}
              {...(activeVault === null ? {} : { vault: activeVault })}
            />
          </div>
        </div>
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
          initialBody={captureInitialBody}
          onCancel={closeCapture}
          onRemembered={(saved) => {
            const tourExampleKey = pendingTourExampleKey.current;
            capturePaths.current.set(saved.note.id, saved.path);
            if (!isStudioService(service)) {
              setCaptures((current) => [
                ...current,
                { id: saved.note.id, text: saved.note.body },
              ]);
            }
            if (tourExampleKey !== undefined) {
              setRememberedTourExamples((current) => {
                const next = new Set(current);
                next.add(tourExampleKey);
                return next;
              });
            }
            closeCapture(tourExampleKey === undefined);
            if (tourExampleKey !== undefined) {
              focusRoomHeading(
                visibleTourStep === undefined
                  ? undefined
                  : tourHeading[visibleTourStep],
              );
            }
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
