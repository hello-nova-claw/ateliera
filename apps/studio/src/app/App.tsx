import {
  createCaptureService,
  type CaptureEntry,
  type CaptureService,
} from '@studio/application';
import {
  AppShell,
  CommandPalette,
  Dialog,
  type StudioCommand,
} from '@studio/ui';
import {
  createBrowserVault,
  ensureBrowserPersistence,
  type BrowserPersistenceStatus,
} from '@studio/storage/browser';
import { useEffect, useRef, useState } from 'react';
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
import { useStudioRouter } from './router';
import { themes, type ThemeId } from './themes';
import './app.css';

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
  const cacheNames = (await caches.keys()).filter((key) =>
    key.startsWith('studio-app-shell-'),
  );
  if (cacheNames.length === 0) return false;
  const urls = [
    '/',
    '/manifest.webmanifest',
    '/apple-touch-icon.png',
    '/studio-icon.svg',
    '/studio-maskable.svg',
    ...performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name))
      .filter(
        (url) =>
          url.origin === location.origin &&
          /\.(?:css|js|woff2?)(?:$|\?)/.test(url.pathname),
      )
      .map((url) => `${url.pathname}${url.search}`),
  ];
  await Promise.all(
    cacheNames.map(async (cacheName) =>
      (await caches.open(cacheName)).addAll([...new Set(urls)]),
    ),
  );
  return true;
}

export interface AppProps {
  captureService?: CaptureService;
  requestPersistence?: () => Promise<BrowserPersistenceStatus>;
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
  requestPersistence = ensureBrowserPersistence,
}: AppProps) {
  const [service, setService] = useState<CaptureService | null>(
    () => captureService ?? null,
  );
  const { navigate, path, title } = useStudioRouter();
  const { announce: themeAnnouncement, setTheme, theme } = useTheme();
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [opened, setOpened] = useState(() => captureService !== undefined);
  const [browserStudios, setBrowserStudios] = useState<BrowserStudioRecord[]>(
    () => (isNativeShell() ? [] : readBrowserStudios(localStorage)),
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [name, setName] = useState('The Studio');
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState(() =>
    captureService === undefined
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
  const themeButton = useRef<HTMLButtonElement>(null);
  const offlineReady = useRef(
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  );

  useEffect(() => {
    if (service === null) return;
    let active = true;
    void service
      .list()
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
  }, [service]);

  useEffect(() => {
    document.title = `${title} — The Studio`;
  }, [title]);

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

  function go(next: string): void {
    navigate(next);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#studio-main')?.focus(),
    );
  }

  function finishOnboarding(): void {
    setOpened(true);
    go('/foyer');
  }

  async function selectNativeService(): Promise<boolean> {
    if (captureService !== undefined || !isNativeShell()) return true;
    const { selectTauriVault } = await import('@studio/storage/tauri');
    const vault = await selectTauriVault();
    if (vault === null) return false;
    setService(createCaptureService(vault));
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
      activateBrowserStudio(localStorage, record.vaultId);
      setService(createCaptureService(createBrowserVault(record.vaultId)));
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
      setService(createCaptureService(vault));
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

  async function remember(): Promise<void> {
    if (service === null) {
      setError('Choose a Studio folder before remembering a thought.');
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      const saved = await service.capture(text);
      setCaptures((current) => [...current, saved]);
      setText('');
      closeCapture();
      const persistence = await requestPersistence();
      setStatus(
        offlineReady.current
          ? 'Ready offline'
          : persistence === 'persistent'
            ? 'Stored locally with persistent browser storage.'
            : 'Stored locally; this browser may clear it if space is needed.',
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This thought could not be saved.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function closeCapture(): void {
    setCaptureOpen(false);
    queueMicrotask(() => captureButton.current?.focus());
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
        <RoomRoute captures={captures} path={path} title={title} />
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
        <section className="studio-form">
          <p className="studio-form__eyebrow">Quick capture</p>
          <h2>Hold this thought</h2>
          <label htmlFor="capture-text">What would you like remembered?</label>
          <textarea
            autoFocus
            id="capture-text"
            onChange={(event) => setText(event.target.value)}
            rows={6}
            value={text}
          />
          <div className="studio-form__actions">
            <button
              className="studio-form__button studio-form__button--secondary"
              onClick={closeCapture}
              type="button"
            >
              Not now
            </button>
            <button
              aria-busy={isSaving}
              className="studio-form__button"
              disabled={isSaving}
              onClick={() => void remember()}
              type="button"
            >
              {isSaving ? 'Remembering…' : 'Remember'}
            </button>
          </div>
        </section>
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
