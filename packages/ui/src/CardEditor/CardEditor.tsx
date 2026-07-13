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
  remoteBody: string;
}

export interface CardEditorProps {
  conflict?: ConflictView;
  note: StudioNote;
  onChange: (note: StudioNote) => void;
  onDiscardDraft?: () => void;
  onFlush: () => void | Promise<void>;
  onKeepMine?: () => void;
  onKeepOther?: () => void;
  onManualMerge?: () => void;
  onRestoreDraft?: () => void;
  recoveryDraft?: RecoveryDraftView;
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
  note,
  onChange,
  onDiscardDraft,
  onFlush,
  onKeepMine,
  onKeepOther,
  onManualMerge,
  onRestoreDraft,
  recoveryDraft,
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

      <label className="card-editor__title-field">
        <span>Title</span>
        <input
          onBlur={() => void onFlush()}
          onChange={(event) => onChange(withTitle(note, event.target.value))}
          value={note.title ?? ''}
        />
      </label>

      <MarkdownEditor
        label="Markdown body"
        onBlur={() => void onFlush()}
        onChange={(body) => onChange({ ...note, body })}
        value={note.body}
      />

      <details className="card-editor__details">
        <summary>Note details</summary>
        <div className="card-editor__metadata">
          <label>
            <span>Semantic meaning</span>
            <select
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
              <p>{conflict.local.body}</p>
            </section>
            <section aria-label="Other version">
              <h3>Other</h3>
              <p>{conflict.remoteBody}</p>
            </section>
          </div>
          <div className="card-editor__actions">
            <button onClick={onKeepMine} type="button">Keep mine as a sibling</button>
            <button onClick={onKeepOther} type="button">Keep other</button>
            <button onClick={onManualMerge} type="button">Merge manually</button>
          </div>
        </section>
      )}
    </article>
  );
}
