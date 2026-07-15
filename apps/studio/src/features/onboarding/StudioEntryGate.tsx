import type { ReactNode, Ref } from 'react';
import type { BrowserStudioRecord } from '../../app/browser-studios';
import type { EntryProgressPhase } from './onboarding-state';

export interface StudioEntryGateProps {
  browserStudios: BrowserStudioRecord[];
  createButtonRef?: Ref<HTMLButtonElement>;
  error: string | undefined;
  isNative: boolean;
  onCreate: () => void;
  onDismissError?: () => void;
  onOpen: (record?: BrowserStudioRecord) => void;
  onRetry?: () => void;
  progress?: EntryProgressPhase;
  studioAction: 'create' | 'open' | null;
  takingLonger?: boolean;
  themePicker: ReactNode;
}

export function StudioEntryGate({
  browserStudios,
  createButtonRef,
  error,
  isNative,
  onCreate,
  onDismissError,
  onOpen,
  onRetry,
  progress,
  studioAction,
  takingLonger = false,
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
        {progress !== undefined && (
          <div aria-live="polite" className="studio-entry__progress">
            <p>{progressCopy[progress]}</p>
            {takingLonger && (
              <p>
                This is taking longer than usual. Your Studio Space is still
                being prepared.
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="studio-entry__error">
            <p className="studio-room__error" role="alert">
              {error}
            </p>
            <div className="studio-entry__actions">
              <button
                className="studio-entry__button"
                onClick={onRetry}
                type="button"
              >
                Try again
              </button>
              <button
                className="studio-entry__button studio-entry__button--secondary"
                onClick={onDismissError}
                type="button"
              >
                Return to the beginning
              </button>
            </div>
          </div>
        )}
        {!error && hasKnownStudios && (
          <p className="studio-entry__welcome">Welcome back.</p>
        )}
        {!error && hasKnownStudios && (
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
        {!error && (
          <div className="studio-entry__actions">
            <button
              className="studio-entry__button"
              disabled={studioAction !== null}
              onClick={onCreate}
              ref={createButtonRef}
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
        )}
        <p className="studio-entry__storage-note">
          {isNative
            ? 'Your Studio Space lives in a private folder you choose on this Mac.'
            : 'Your Studio Space stays in this browser on this device.'}
        </p>
      </section>
    </main>
  );
}

const progressCopy: Record<EntryProgressPhase, string> = {
  'choosing-location': 'Choose where to create your Studio Space…',
  'creating-space': 'Creating your Studio Space…',
  'opening-space': 'Opening your Studio Space…',
  'preparing-rooms': 'Preparing your rooms…',
  ready: 'Your Studio Space is ready.',
};
