import { useRef, useState } from 'react';

import './PortabilitySettings.css';

export type PortabilityAction = 'create' | 'overwrite' | 'conflict' | 'skip';

export interface PortabilityPreviewItem {
  action: PortabilityAction;
  path: string;
  reason?: string;
  size: number;
}

export interface PortabilityPreview {
  archiveName: string;
  exportedAt: string;
  items: readonly PortabilityPreviewItem[];
}

export interface PortabilitySettingsProps {
  onExport?: () => Promise<void>;
  onPrepareRestore?: (file: File) => Promise<PortabilityPreview>;
  onRestore?: (
    preview: PortabilityPreview,
    conflicts: Readonly<Record<string, 'overwrite' | 'skip'>>,
  ) => Promise<void>;
}

type BusyState = 'export' | 'prepare' | 'restore' | undefined;

function count(preview: PortabilityPreview, action: PortabilityAction): number {
  return preview.items.filter((item) => item.action === action).length;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Unknown export date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function PortabilitySettings({
  onExport,
  onPrepareRestore,
  onRestore,
}: PortabilitySettingsProps) {
  const [busy, setBusy] = useState<BusyState>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [preview, setPreview] = useState<PortabilityPreview>();
  const [confirmed, setConfirmed] = useState(false);
  const [conflicts, setConflicts] = useState<
    Readonly<Record<string, 'overwrite' | 'skip'>>
  >({});
  const selectedFile = useRef<File | undefined>(undefined);
  const restoreButton = useRef<HTMLButtonElement>(null);

  async function exportBackup(): Promise<void> {
    if (busy !== undefined || onExport === undefined) return;
    setBusy('export');
    setError(undefined);
    setMessage(undefined);
    try {
      await onExport();
      setMessage('Your portable backup is ready. Keep it somewhere you trust.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'A portable backup could not be created just now.',
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function prepare(file: File): Promise<void> {
    if (busy !== undefined || onPrepareRestore === undefined) return;
    selectedFile.current = file;
    setBusy('prepare');
    setError(undefined);
    setMessage(undefined);
    setPreview(undefined);
    setConfirmed(false);
    setConflicts({});
    try {
      setPreview(await onPrepareRestore(file));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'This backup could not be checked safely.',
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function restore(): Promise<void> {
    if (
      busy !== undefined ||
      preview === undefined ||
      !confirmed ||
      preview.items.some(
        (item) => item.action === 'conflict' && conflicts[item.path] === undefined,
      ) ||
      onRestore === undefined
    )
      return;
    setBusy('restore');
    setError(undefined);
    setMessage(undefined);
    try {
      await onRestore(preview, conflicts);
      setMessage('Restore complete. Your Studio is ready to reopen.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The restore could not be completed. Your earlier files remain available.',
      );
    } finally {
      setBusy(undefined);
      requestAnimationFrame(() => restoreButton.current?.focus());
    }
  }

  const overwriteCount = preview === undefined ? 0 : count(preview, 'overwrite');
  const conflictCount = preview === undefined ? 0 : count(preview, 'conflict');
  const unresolvedConflictCount =
    preview === undefined
      ? 0
      : preview.items.filter(
          (item) =>
            item.action === 'conflict' && conflicts[item.path] === undefined,
        ).length;
  const filesToOverwrite =
    overwriteCount +
    Object.values(conflicts).filter((resolution) => resolution === 'overwrite').length;

  return (
    <div className="portability-settings">
      <header className="portability-settings__header">
        <p className="portability-settings__eyebrow">Your archive</p>
        <h1>Backup &amp; restore</h1>
        <p className="portability-settings__intro">
          Your writing belongs to you. Keep a complete ZIP of the Markdown,
          media, and Studio settings that make this place yours.
        </p>
      </header>

      <section
        aria-labelledby="portable-backup-heading"
        className="portability-settings__section"
      >
        <div>
          <p className="portability-settings__kicker">Take it with you</p>
          <h2 id="portable-backup-heading">Portable backup</h2>
          <p className="portability-settings__description">
            The search index is left out because the Studio can quietly rebuild
            it from your files.
          </p>
        </div>
        <button
          aria-busy={busy === 'export'}
          className="portability-settings__primary"
          disabled={busy !== undefined || onExport === undefined}
          onClick={() => void exportBackup()}
          type="button"
        >
          {busy === 'export' ? 'Preparing backup…' : 'Download portable backup'}
        </button>
      </section>

      <section
        aria-labelledby="restore-backup-heading"
        className="portability-settings__section portability-settings__section--restore"
      >
        <div>
          <p className="portability-settings__kicker">Return from a copy</p>
          <h2 id="restore-backup-heading">Restore a Studio</h2>
          <p className="portability-settings__description">
            Nothing changes while the ZIP is being checked. You will see an
            exact preview before choosing to continue.
          </p>
        </div>
        <label className="portability-settings__file">
          <span>Choose a Studio backup</span>
          <input
            accept=".zip,application/zip"
            className="portability-settings__file-input"
            disabled={busy !== undefined || onPrepareRestore === undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) void prepare(file);
            }}
            type="file"
          />
        </label>
        {busy === 'prepare' && (
          <p className="portability-settings__notice" role="status">
            Checking every file and checksum…
          </p>
        )}
      </section>

      {error !== undefined && (
        <section className="portability-settings__error" role="alert">
          <p className="portability-settings__error-message">{error}</p>
          {selectedFile.current !== undefined && onPrepareRestore !== undefined && (
            <button
              disabled={busy !== undefined}
              onClick={() => void prepare(selectedFile.current as File)}
              type="button"
            >
              Check this backup again
            </button>
          )}
        </section>
      )}
      {message !== undefined && (
        <p className="portability-settings__success" role="status">
          {message}
        </p>
      )}

      {preview !== undefined && (
        <section
          aria-labelledby="restore-preview-heading"
          className="portability-preview"
        >
          <div className="portability-preview__heading">
            <div>
              <p className="portability-settings__kicker">Checked locally</p>
              <h2 id="restore-preview-heading">Review this restore</h2>
            </div>
            <p className="portability-preview__archive">
              {preview.archiveName}<br />
              <small>Created {formatDate(preview.exportedAt)}</small>
            </p>
          </div>
          <ul aria-label="Restore summary" className="portability-preview__summary">
            <li><strong>{count(preview, 'create')}</strong> to create</li>
            <li><strong>{overwriteCount}</strong> to overwrite</li>
            <li><strong>{count(preview, 'skip')}</strong> unchanged</li>
            <li><strong>{conflictCount}</strong> conflict{conflictCount === 1 ? '' : 's'}</li>
          </ul>

          {conflictCount > 0 && (
            <div
              className="portability-preview__conflicts"
              role={unresolvedConflictCount > 0 ? 'alert' : 'status'}
            >
              <h3>Resolve before restoring</h3>
              <p>
                These files do not have a safe automatic destination. Nothing
                has been changed.
              </p>
              <ul>
                {preview.items
                  .filter((item) => item.action === 'conflict')
                  .map((item) => (
                    <li key={item.path}>
                      <strong>{item.path}</strong>
                      {item.reason !== undefined && <span>{item.reason}</span>}
                      <fieldset className="portability-preview__resolution">
                        <legend className="studio-visually-hidden">
                          Resolve {item.path}
                        </legend>
                        <label>
                          <input
                            checked={conflicts[item.path] === 'skip'}
                            name={`conflict-${item.path}`}
                            onChange={() => {
                              setConflicts((current) => ({
                                ...current,
                                [item.path]: 'skip',
                              }));
                              setConfirmed(false);
                            }}
                            type="radio"
                          />
                          Keep the current file for {item.path}
                        </label>
                        <label>
                          <input
                            checked={conflicts[item.path] === 'overwrite'}
                            name={`conflict-${item.path}`}
                            onChange={() => {
                              setConflicts((current) => ({
                                ...current,
                                [item.path]: 'overwrite',
                              }));
                              setConfirmed(false);
                            }}
                            type="radio"
                          />
                          Use the file from this backup for {item.path}
                        </label>
                      </fieldset>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <details className="portability-preview__details">
            <summary>See every file</summary>
            <ul>
              {preview.items.map((item) => (
                <li key={`${item.action}:${item.path}`}>
                  <span>{item.path}</span>
                  <span>{item.action}</span>
                </li>
              ))}
            </ul>
          </details>

          <label className="portability-preview__confirmation">
            <input
              checked={confirmed}
              className="portability-preview__checkbox"
              disabled={busy !== undefined || unresolvedConflictCount > 0}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>
              I understand that {filesToOverwrite} existing file
              {filesToOverwrite === 1 ? '' : 's'} will be overwritten
            </span>
          </label>
          <div className="portability-preview__actions">
            <button
              className="portability-settings__secondary"
              disabled={busy !== undefined}
              onClick={() => {
                setPreview(undefined);
                setConfirmed(false);
                setConflicts({});
                setMessage('Restore cancelled. Nothing was changed.');
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              aria-busy={busy === 'restore'}
              className="portability-settings__primary"
              disabled={
                busy !== undefined ||
                unresolvedConflictCount > 0 ||
                !confirmed ||
                onRestore === undefined
              }
              onClick={() => void restore()}
              ref={restoreButton}
              type="button"
            >
              {busy === 'restore' ? 'Restoring safely…' : 'Restore this backup'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
