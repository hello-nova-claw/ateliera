import type { ReactNode } from 'react';
import type { BrowserStudioRecord } from '../../app/browser-studios';

export interface StudioEntryGateProps {
  browserStudios: BrowserStudioRecord[];
  error: string | undefined;
  isNative: boolean;
  onCreate: () => void;
  onOpen: (record?: BrowserStudioRecord) => void;
  studioAction: 'create' | 'open' | null;
  themePicker: ReactNode;
}

export function StudioEntryGate({
  browserStudios,
  error,
  isNative,
  onCreate,
  onOpen,
  studioAction,
  themePicker,
}: StudioEntryGateProps) {
  const hasKnownStudios = browserStudios.length > 0;

  return (
    <main
      aria-label="Ateliera welcome"
      className="studio-entry"
      id="studio-entry"
      tabIndex={-1}
    >
      <div className="studio-entry__theme">{themePicker}</div>
      <section className="studio-entry__panel" aria-labelledby="entry-title">
        <p className="studio-entry__script" aria-hidden="true">
          begin where you are
        </p>
        <h1 id="entry-title">Ateliera</h1>
        <p className="studio-entry__tagline">
          A private studio for designing a life from the inside out.
        </p>
        <p className="studio-entry__introduction">
          Your Studio Space holds the notes, images, reflections, and
          possibilities that make Ateliera yours.
        </p>
        {error && (
          <p className="studio-room__error" role="alert">
            {error}
          </p>
        )}
        {hasKnownStudios && (
          <p className="studio-entry__welcome">Welcome back.</p>
        )}
        {hasKnownStudios && (
          <ul aria-label="Your Studio Spaces" className="studio-entry__spaces">
            {browserStudios.map((studio) => (
              <li className="studio-entry__space" key={studio.vaultId}>
                <span>{studio.name}</span>
                <button
                  className="studio-entry__open"
                  disabled={studioAction !== null}
                  onClick={() => onOpen(studio)}
                  type="button"
                >
                  Open{' '}
                  <span className="studio-visually-hidden">{studio.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="studio-entry__actions">
          <button
            className="studio-entry__button"
            disabled={studioAction !== null}
            onClick={onCreate}
            type="button"
          >
            Create a new Studio Space
          </button>
          {isNative && (
            <button
              className="studio-entry__button studio-entry__button--secondary"
              disabled={studioAction !== null}
              onClick={() => onOpen()}
              type="button"
            >
              {studioAction === 'open'
                ? 'Opening your Studio Space…'
                : 'Open an existing Studio Space'}
            </button>
          )}
        </div>
        <p className="studio-entry__storage-note">
          {isNative
            ? 'Your Studio Space lives in a private folder you choose on this Mac.'
            : 'Your Studio Space stays in this browser on this device.'}
        </p>
      </section>
    </main>
  );
}
