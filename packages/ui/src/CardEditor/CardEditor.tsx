import {
  landscapeAnchorDefinitions,
  noteStatuses,
  semanticTypeForLandscapeAnchor,
  semanticTypes,
  type StudioNote,
} from '@studio/domain';
import { useEffect, useRef, useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import './CardEditor.css';

export type EditorSaveState =
  'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

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

function withSource(
  note: StudioNote,
  field: 'creator' | 'title' | 'url',
  value: string,
): StudioNote {
  const source = { ...note.source, [field]: value };
  if (source.creator === '') delete source.creator;
  if (source.title === '') delete source.title;
  if (source.url === '') delete source.url;
  if (Object.keys(source).length > 0) return { ...note, source };
  const copy = { ...note };
  delete copy.source;
  return copy;
}

const resurfaceKinds = ['evidence', 'reframe', 'wish', 'dream'] as const;

// Mirrors @studio/rhythm's SM2_FIRST_PASS_DAYS (packages/rhythm/src/resurfacing.ts),
// the SM-2 first successful interval. Hardcoded rather than imported so this UI
// package doesn't take on @studio/rhythm's dependency graph for one constant.
const DEFAULT_RESURFACE_INTERVAL_DAYS = 6;

function noteWantsResurfacing(note: StudioNote): boolean {
  return (
    note.rooms.includes('reflection-garden') || note.rooms.includes('uncharted')
  );
}

function withResurfaceKind(note: StudioNote, value: string): StudioNote {
  if (value === '') {
    const copy = { ...note };
    delete copy.resurfaceKind;
    delete copy.resurfaceDue;
    delete copy.resurfaceIntervalDays;
    return copy;
  }
  return {
    ...note,
    resurfaceKind: value as (typeof resurfaceKinds)[number],
    resurfaceIntervalDays:
      note.resurfaceIntervalDays ?? DEFAULT_RESURFACE_INTERVAL_DAYS,
  };
}

function withTags(note: StudioNote, value: string): StudioNote {
  return {
    ...note,
    tags: [
      ...new Set(
        value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ],
  };
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
  const [tagsDraft, setTagsDraft] = useState(note.tags.join(', '));
  const landscapeAnchor =
    note.landscapeAnchor === undefined
      ? undefined
      : landscapeAnchorDefinitions.find(
          (anchor) => anchor.id === note.landscapeAnchor,
        );
  const displayedSemanticType =
    note.landscapeAnchor === undefined
      ? note.semanticType
      : semanticTypeForLandscapeAnchor(note.landscapeAnchor);
  const conflictSummary = useRef<HTMLElement>(null);
  const errorSummary = useRef<HTMLElement>(null);
  const conflictWasVisible = useRef(false);
  const errorWasVisible = useRef(false);

  useEffect(() => {
    const visible = conflict !== undefined;
    if (visible && !conflictWasVisible.current)
      conflictSummary.current?.focus();
    conflictWasVisible.current = visible;
  }, [conflict]);

  useEffect(() => {
    const visible = saveError !== undefined;
    if (visible && !errorWasVisible.current) errorSummary.current?.focus();
    errorWasVisible.current = visible;
  }, [saveError]);

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
        <section
          className="card-editor__notice"
          aria-labelledby="recovery-title"
        >
          <h2 id="recovery-title">Unsaved words are waiting.</h2>
          <p>
            Choose whether to restore them. Your saved note has not changed.
          </p>
          <div className="card-editor__actions">
            <button onClick={onRestoreDraft} type="button">
              Restore draft
            </button>
            <button onClick={onDiscardDraft} type="button">
              Discard draft
            </button>
          </div>
        </section>
      )}

      {recoveryUnavailable && (
        <p
          aria-label="Recovery unavailable"
          className="card-editor__notice"
          role="status"
        >
          Browser draft recovery is unavailable. Durable saves still work; keep
          this editor open until the saved confirmation appears.
        </p>
      )}

      {saveError !== undefined && (
        <section
          className="card-editor__notice"
          ref={errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <h2>Your changes are still waiting.</h2>
          <p>{saveError}</p>
          <button onClick={onRetrySave} type="button">
            Try saving again
          </button>
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
              aria-describedby={
                landscapeAnchor === undefined
                  ? undefined
                  : 'card-editor-landscape-meaning'
              }
              disabled={conflict !== undefined || landscapeAnchor !== undefined}
              onChange={(event) =>
                onChange({
                  ...note,
                  semanticType: event.target
                    .value as StudioNote['semanticType'],
                })
              }
              value={displayedSemanticType}
            >
              {semanticTypes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            {landscapeAnchor !== undefined && (
              <small id="card-editor-landscape-meaning">
                The {landscapeAnchor.label} anchor gives this card its{' '}
                {displayedSemanticType} meaning. Moving the card to another
                anchor updates both.
              </small>
            )}
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
              {noteStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Source title</span>
            <input
              disabled={conflict !== undefined}
              onChange={(event) =>
                onChange(withSource(note, 'title', event.target.value))
              }
              value={note.source?.title ?? ''}
            />
          </label>
          <label>
            <span>Source creator</span>
            <input
              disabled={conflict !== undefined}
              onChange={(event) =>
                onChange(withSource(note, 'creator', event.target.value))
              }
              value={note.source?.creator ?? ''}
            />
          </label>
          <label>
            <span>Source URL</span>
            <input
              disabled={conflict !== undefined}
              inputMode="url"
              onChange={(event) =>
                onChange(withSource(note, 'url', event.target.value))
              }
              type="url"
              value={note.source?.url ?? ''}
            />
          </label>
          <label>
            <span>Themes</span>
            <input
              disabled={conflict !== undefined}
              onBlur={() => {
                onChange(withTags(note, tagsDraft));
                void onFlush();
              }}
              onChange={(event) => setTagsDraft(event.target.value)}
              value={tagsDraft}
            />
          </label>
          {noteWantsResurfacing(note) && (
            <>
              <label>
                <span>Mark for resurfacing</span>
                <select
                  disabled={conflict !== undefined}
                  onChange={(event) =>
                    onChange(withResurfaceKind(note, event.target.value))
                  }
                  value={note.resurfaceKind ?? ''}
                >
                  <option value="">Not marked</option>
                  {resurfaceKinds.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {note.resurfaceKind !== undefined && (
                <>
                  <label>
                    <span>Resurface due</span>
                    <input
                      disabled={conflict !== undefined}
                      onChange={(event) =>
                        onChange({ ...note, resurfaceDue: event.target.value })
                      }
                      type="date"
                      value={note.resurfaceDue ?? ''}
                    />
                  </label>
                  <label>
                    <span>Resurface interval (days)</span>
                    <input
                      disabled={conflict !== undefined}
                      min={1}
                      onChange={(event) =>
                        onChange({
                          ...note,
                          resurfaceIntervalDays: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={
                        note.resurfaceIntervalDays ??
                        DEFAULT_RESURFACE_INTERVAL_DAYS
                      }
                    />
                  </label>
                </>
              )}
            </>
          )}
          {note.sourceNoteIds !== undefined &&
            note.sourceNoteIds.length > 0 && (
              <p className="card-editor__source-links">
                {note.sourceNoteIds.length}{' '}
                {note.sourceNoteIds.length === 1
                  ? 'linked source note'
                  : 'linked source notes'}
              </p>
            )}
        </div>
      </details>

      {conflict !== undefined && (
        <section
          className="card-editor__conflict"
          ref={conflictSummary}
          role="alert"
          tabIndex={-1}
        >
          <h2>Another version exists</h2>
          <p>
            Nothing has been overwritten. Choose how these words should
            continue.
          </p>
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
              {conflictActionState === 'busy'
                ? 'Keeping mine…'
                : 'Keep mine as a sibling'}
            </button>
            <button
              disabled={conflictActionState === 'busy'}
              onClick={onKeepOther}
              type="button"
            >
              Keep other
            </button>
            <button
              disabled={conflictActionState === 'busy'}
              onClick={onManualMerge}
              type="button"
            >
              Merge manually
            </button>
          </div>
        </section>
      )}
    </article>
  );
}
