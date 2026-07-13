import {
  noteStatuses,
  semanticTypes,
  type StudioNote,
} from '@studio/domain';
import { MarkdownEditor } from './MarkdownEditor';
import './CardEditor.css';

export type EditorSaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error';

export interface RecoveryDraftView {
  body: string;
  title?: string;
}

export interface ConflictView {
  local: StudioNote;
  remote: StudioNote;
}

export interface CardEditorProps {
  conflict?: ConflictView;
  conflictActionError?: string;
  conflictActionState?: 'idle' | 'busy' | 'error';
  note: StudioNote;
  onChange: (note: StudioNote) => void;
  onDiscardDraft?: () => void;
  onFlush: () => unknown | Promise<unknown>;
  onKeepMine?: () => void;
  onKeepOther?: () => void;
  onManualMerge?: () => void;
  onRestoreDraft?: () => void;
  onRetrySave?: () => void;
  recoveryDraft?: RecoveryDraftView;
  recoveryUnavailable?: boolean;
  saveError?: string;
  saveState: EditorSaveState;
}

const saveLabels: Record<EditorSaveState, string> = {
  idle: 'Ready',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  conflict: 'Another version exists',
  error: 'Not saved yet',
};

function withTitle(note: StudioNote, title: string): StudioNote {
  if (title !== '') return { ...note, title };
  const copy = { ...note };
  delete copy.title;
  return copy;
}

export function CardEditor({
  conflict,
  conflictActionError,
  conflictActionState = 'idle',
  note,
  onChange,
  onDiscardDraft,
  onFlush,
  onKeepMine,
  onKeepOther,
  onManualMerge,
  onRestoreDraft,
  onRetrySave,
  recoveryDraft,
  recoveryUnavailable = false,
  saveError,
  saveState,
}: CardEditorProps) {
  return (
    <article className="card-editor" aria-label="Note editor">
      <header className="card-editor__header">
        <p className="card-editor__eyebrow">Markdown focus mode</p>
        <p
          aria-atomic="true"
          className={`card-editor__save-state card-editor__save-state--${saveState}`}
          role="status"
        >
          {saveLabels[saveState]}
        </p>
      </header>

      {recoveryDraft !== undefined && (
        <section className="card-editor__notice" aria-labelledby="recovery-title">
          <h2 id="recovery-title">Unsaved words are waiting.</h2>
          <p>Choose whether to restore them. Your saved note has not changed.</p>
          <div className="card-editor__actions">
            <button onClick={onRestoreDraft} type="button">Restore draft</button>
            <button onClick={onDiscardDraft} type="button">Discard draft</button>
          </div>
        </section>
      )}

      {recoveryUnavailable && (
        <p
          aria-label="Recovery unavailable"
          className="card-editor__notice"
          role="status"
        >
          Browser draft recovery is unavailable. Durable saves still work; keep this
          editor open until the saved confirmation appears.
        </p>
      )}

      {saveError !== undefined && (
        <section className="card-editor__notice" role="alert">
          <h2>Your changes are still waiting.</h2>
          <p>{saveError}</p>
          <button onClick={onRetrySave} type="button">Try saving again</button>
        </section>
      )}

      <label className="card-editor__title-field">
        <span>Title</span>
        <input
          disabled={conflict !== undefined}
          onBlur={() => void onFlush()}
          onChange={(event) => onChange(withTitle(note, event.target.value))}
          value={note.title ?? ''}
        />
      </label>

      <MarkdownEditor
        label="Markdown body"
        onBlur={() => void onFlush()}
        onChange={(body) => onChange({ ...note, body })}
        readOnly={conflict !== undefined}
        value={note.body}
      />

      <details className="card-editor__details">
        <summary>Note details</summary>
        <div className="card-editor__metadata">
          <label>
            <span>Semantic meaning</span>
            <select
              disabled={conflict !== undefined}
              onChange={(event) =>
                onChange({
                  ...note,
                  semanticType: event.target.value as StudioNote['semanticType'],
                })
              }
              value={note.semanticType}
            >
              {semanticTypes.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              disabled={conflict !== undefined}
              onChange={(event) =>
                onChange({
                  ...note,
                  status: event.target.value as StudioNote['status'],
                })
              }
              value={note.status}
            >
              {noteStatuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </details>

      {conflict !== undefined && (
        <section className="card-editor__conflict" role="alert">
          <h2>Another version exists</h2>
          <p>Nothing has been overwritten. Choose how these words should continue.</p>
          <div className="card-editor__versions">
            <section aria-label="Your version">
              <h3>Mine</h3>
              <p>{conflict.local.title ?? 'Untitled'}</p>
              <p>{conflict.local.body}</p>
            </section>
            <section aria-label="Other version">
              <h3>Other</h3>
              <p>{conflict.remote.title ?? 'Untitled'}</p>
              <p>{conflict.remote.body}</p>
            </section>
          </div>
          {conflictActionError !== undefined && (
            <p className="card-editor__action-error" role="alert">
              {conflictActionError}
            </p>
          )}
          <div className="card-editor__actions">
            <button
              aria-busy={conflictActionState === 'busy'}
              disabled={conflictActionState === 'busy'}
              onClick={onKeepMine}
              type="button"
            >
              {conflictActionState === 'busy' ? 'Keeping mine…' : 'Keep mine as a sibling'}
            </button>
            <button disabled={conflictActionState === 'busy'} onClick={onKeepOther} type="button">
              Keep other
            </button>
            <button disabled={conflictActionState === 'busy'} onClick={onManualMerge} type="button">
              Merge manually
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
