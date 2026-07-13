import {
  createBrowserCaptureService,
  type CaptureEntry,
  type CaptureService,
} from '@studio/application';
import {
  ensureBrowserPersistence,
  type BrowserPersistenceStatus,
} from '@studio/storage/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import './app.css';

async function prepareOfflineShell(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  if (
    navigator.serviceWorker.controller !== null &&
    (await caches.match('/')) !== undefined
  ) {
    return true;
  }
  const registration = await navigator.serviceWorker.register('/service-worker.js', {
    type: 'module',
    scope: '/',
  });
  const worker =
    registration.active ?? registration.waiting ?? registration.installing;
  if (worker !== null && worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Offline preparation timed out.')),
        10_000,
      );
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          window.clearTimeout(timer);
          resolve();
        }
        if (worker.state === 'redundant') {
          window.clearTimeout(timer);
          reject(new Error('The offline shell could not be installed.'));
        }
      });
    });
  }
  if (navigator.serviceWorker.controller === null) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Offline control timed out.')),
        10_000,
      );
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
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
          (/\.(?:css|js|mjs|ts|tsx|woff2?)(?:$|\?)/.test(url.pathname) ||
            url.pathname.startsWith('/@vite/') ||
            url.pathname === '/@react-refresh'),
      )
      .map((url) => `${url.pathname}${url.search}`),
  ];
  const cacheName = (await caches.keys()).find((key) =>
    key.startsWith('studio-app-shell-'),
  );
  if (cacheName === undefined) {
    throw new Error('The offline shell cache is unavailable.');
  }
  const cache = await caches.open(cacheName);
  await cache.addAll([...new Set(urls)]);
  return true;
}

export interface AppProps {
  captureService?: CaptureService;
  requestPersistence?: () => Promise<BrowserPersistenceStatus>;
}

export function App({
  captureService,
  requestPersistence = ensureBrowserPersistence,
}: AppProps = {}) {
  const service = useMemo(
    () => captureService ?? createBrowserCaptureService(),
    [captureService],
  );
  const [captures, setCaptures] = useState<CaptureEntry[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineUnavailable, setOfflineUnavailable] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<BrowserPersistenceStatus>();
  const [error, setError] = useState<string>();
  const captureButton = useRef<HTMLButtonElement>(null);
  const shouldRestoreCaptureFocus = useRef(false);

  useEffect(() => {
    let active = true;
    void service
      .list()
      .then((saved) => {
        if (!active) return;
        setCaptures((current) => {
          const byId = new Map(saved.map((capture) => [capture.id, capture]));
          for (const capture of current) byId.set(capture.id, capture);
          return [...byId.values()];
        });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'The Studio could not open.');
      });
    void prepareOfflineShell()
      .then((ready) => {
        if (active) setOfflineReady(ready);
      })
      .catch(() => {
        if (active) setOfflineUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    if (!isCapturing && shouldRestoreCaptureFocus.current) {
      shouldRestoreCaptureFocus.current = false;
      captureButton.current?.focus();
    }
  }, [isCapturing]);

  function closeCapture(): void {
    shouldRestoreCaptureFocus.current = true;
    setIsCapturing(false);
  }

  async function remember(): Promise<void> {
    setIsSaving(true);
    setError(undefined);
    const persistence = requestPersistence();
    try {
      const capture = await service.capture(text);
      setCaptures((current) => [...current, capture]);
      setText('');
      closeCapture();
      setPersistenceStatus(await persistence);
      requestAnimationFrame(() => captureButton.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This thought could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main aria-label="The Studio" className="studio-shell">
      <header className="studio-shell__header">
        <div>
          <p className="studio-shell__eyebrow">A quiet place to remember</p>
          <h1 className="studio-shell__title">The Studio</h1>
        </div>
        <button
          className="studio-shell__capture-button"
          onClick={() => setIsCapturing(true)}
          ref={captureButton}
          type="button"
        >
          Capture
        </button>
      </header>

      {offlineReady && (
        <p className="studio-shell__offline-status" role="status">
          Ready offline
        </p>
      )}

      {offlineUnavailable && (
        <p className="studio-shell__offline-status" role="status">
          Offline preparation is unavailable for now.
        </p>
      )}

      {persistenceStatus !== undefined && (
        <p className="studio-shell__offline-status" role="status">
          {persistenceStatus === 'persistent'
            ? 'Stored locally with persistent browser storage.'
            : 'Stored locally; this browser may clear it if space is needed.'}
        </p>
      )}

      {isCapturing && (
        <section aria-labelledby="capture-heading" className="studio-shell__capture">
          <h2 className="studio-shell__capture-title" id="capture-heading">
            Hold this thought
          </h2>
          <label className="studio-shell__label" htmlFor="capture-text">
            What would you like remembered?
          </label>
          <textarea
            autoFocus
            className="studio-shell__textarea"
            id="capture-text"
            onChange={(event) => setText(event.target.value)}
            rows={5}
            value={text}
          />
          <div className="studio-shell__capture-actions">
            <button
              className="studio-shell__secondary-button"
              onClick={closeCapture}
              type="button"
            >
              Not now
            </button>
            <button
              aria-busy={isSaving}
              className="studio-shell__remember-button"
              disabled={isSaving}
              onClick={() => void remember()}
              type="button"
            >
              {isSaving ? 'Remembering…' : 'Remember'}
            </button>
          </div>
        </section>
      )}

      {error !== undefined && (
        <p className="studio-shell__error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="remembered-heading" className="studio-shell__remembered">
        <h2 className="studio-shell__section-title" id="remembered-heading">
          Remembered
        </h2>
        {captures.length === 0 ? (
          <p className="studio-shell__empty">There is room for whatever arrives.</p>
        ) : (
          <ul className="studio-shell__capture-list">
            {captures.map((capture) => (
              <li className="studio-shell__capture-card" key={capture.id}>
                {capture.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
